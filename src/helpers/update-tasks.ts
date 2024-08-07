import { DateTime } from "luxon";
import { collectLinkedPullRequests } from "../handlers/collect-linked-pulls";
import { Context } from "../types/context";
import { Database } from "../types/database";
import { getGithubIssue } from "./get-env";
import { parseGitHubUrl } from "./github-url";

async function unassignUserFromIssue(context: Context, issue: Database["public"]["Tables"]["issues"]["Row"]) {
  const {
    adapters: { supabase },
    logger,
    config,
  } = context;

  if (config.disqualification <= 0) {
    logger.info("The unassign threshold is <= 0, won't unassign users.");
  } else {
    logger.info(`Passed the deadline on ${issue.url} and no activity is detected, removing assignees.`);
    if (await removeAllAssignees(context, issue)) {
      await supabase.issues.delete(issue.url);
    }
  }
}

async function remindAssigneesForIssue(context: Context, issue: Database["public"]["Tables"]["issues"]["Row"]) {
  const {
    adapters: { supabase },
    logger,
    config,
  } = context;
  const now = DateTime.now();
  const deadline = DateTime.fromISO(issue.deadline);

  if (config.warning <= 0) {
    logger.info("The reminder threshold is <= 0, won't send any reminder.");
  } else {
    const lastReminder = issue.last_reminder;
    logger.info(`We are passed the deadline on ${issue.url}, should we send a reminder? ${!lastReminder}`);
    if (!lastReminder && (await remindAssignees(context, issue))) {
      await supabase.issues.upsert({
        url: issue.url,
        deadline: deadline.toJSDate(),
        lastReminder: now.toJSDate(),
        lastCheck: now.toJSDate(),
      });
    }
  }
}

async function updateReminders(context: Context, issue: Database["public"]["Tables"]["issues"]["Row"]) {
  const {
    adapters: { supabase },
    logger,
    config,
    payload,
  } = context;
  const now = DateTime.now();
  const activity = (await getAssigneesActivityForIssue(context, issue)).filter(
    (o) =>
      payload.issue?.assignees?.find((assignee) => assignee?.login === o.actor.login) && DateTime.fromISO(o.created_at) >= DateTime.fromISO(issue.last_check)
  );
  const deadline = DateTime.fromISO(issue.deadline);
  const deadlineWithThreshold = deadline.plus({ milliseconds: config.disqualification });
  const reminderWithThreshold = deadline.plus({ milliseconds: config.warning });

  if (activity?.length) {
    const lastCheck = DateTime.fromISO(issue.last_check);
    const timeDiff = now.diff(lastCheck);
    const newDeadline = deadline.plus(timeDiff);
    logger.info(
      `Activity found on ${issue.url}, will move the deadline forward from ${deadline.toLocaleString(DateTime.DATETIME_MED)} to ${newDeadline.toLocaleString(DateTime.DATETIME_MED)}`
    );
    await supabase.issues.upsert({ url: issue.url, deadline: newDeadline.toJSDate(), lastCheck: now.toJSDate() });
  } else {
    if (now >= deadlineWithThreshold) {
      await unassignUserFromIssue(context, issue);
    } else if (now >= reminderWithThreshold) {
      await remindAssigneesForIssue(context, issue);
    } else {
      logger.info(
        `Nothing to do for ${issue.url}, still within due-time (now: ${now.toLocaleString(DateTime.DATETIME_MED)}, reminder ${reminderWithThreshold.toLocaleString(DateTime.DATETIME_MED)}, deadline: ${deadlineWithThreshold.toLocaleString(DateTime.DATETIME_MED)})`
      );
    }
  }
}

export async function updateTasks(context: Context) {
  const {
    adapters: { supabase },
    logger,
  } = context;
  const watchedRepoList = await supabase.issues.get();

  if (!watchedRepoList?.length) {
    logger.info("No watched repos have been found, no work to do.");
    return false;
  }
  for (const watchedIssue of watchedRepoList) {
    await updateReminders(context, watchedIssue);
  }
  return true;
}

/**
 * Retrieves all the activity for users that are assigned to the issue. Also takes into account linked pull requests.
 */
async function getAssigneesActivityForIssue(context: Context, issue: Database["public"]["Tables"]["issues"]["Row"]) {
  const gitHubUrl = parseGitHubUrl(issue.url);
  const issueEvents = await context.octokit.paginate(context.octokit.rest.issues.listEvents, {
    owner: gitHubUrl.owner,
    repo: gitHubUrl.repo,
    issue_number: gitHubUrl.issue_number,
    per_page: 100,
  });
  const linkedPullRequests = await collectLinkedPullRequests(context, gitHubUrl);
  for (const linkedPullRequest of linkedPullRequests) {
    const { owner, repo, issue_number } = parseGitHubUrl(linkedPullRequest.source.issue.html_url);
    const events = await context.octokit.paginate(context.octokit.rest.issues.listEvents, {
      owner,
      repo,
      issue_number,
      per_page: 100,
    });
    issueEvents.push(...events);
  }
  return issueEvents;
}

async function remindAssignees(context: Context, issue: Database["public"]["Tables"]["issues"]["Row"]) {
  const { octokit, logger } = context;
  const githubIssue = await getGithubIssue(context, issue);
  const { repo, owner, issue_number } = parseGitHubUrl(issue.url);

  if (!githubIssue?.assignees?.length) {
    logger.warn(`Missing Assignees from ${issue.url}`);
    return false;
  }
  const logins = githubIssue.assignees
    .map((o) => o?.login)
    .filter((o) => !!o)
    .join(", @");
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number,
    body: `@${logins}, this task has been idle for a while. Please provide an update.`,
  });
  return true;
}

async function removeAllAssignees(context: Context, issue: Database["public"]["Tables"]["issues"]["Row"]) {
  const { octokit, logger } = context;
  const githubIssue = await getGithubIssue(context, issue);
  const { repo, owner, issue_number } = parseGitHubUrl(issue.url);

  if (!githubIssue?.assignees?.length) {
    logger.warn(`Missing Assignees from ${issue.url}`);
    return false;
  }
  const logins = githubIssue.assignees.map((o) => o?.login).filter((o) => !!o) as string[];
  await octokit.rest.issues.removeAssignees({
    owner,
    repo,
    issue_number,
    assignees: logins,
  });
  return true;
}
