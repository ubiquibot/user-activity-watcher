    // Fix: Don't post reminders on reopened if there is no assignee
    if (context.eventName === "issues.reopened") {
      const issue = context.payload.issue as IssueType;
      if (!issue.assignees || issue.assignees.length === 0) {
        return { message: logger.debug("Skipping reminder on reopened issue with no assignee.").logMessage.raw };
      }
    }
import { RestEndpointMethodTypes } from "@oct