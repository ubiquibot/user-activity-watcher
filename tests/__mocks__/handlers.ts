import { http, HttpResponse } from "msw";
import { db } from "./db";
import issueEventsGet from "./routes/get-events.json";
import issuesLabelsGet from "./routes/get-labels.json";
import issueTimeline from "./routes/get-timeline.json";

/**
 * Intercepts the routes and returns a custom payload
 */
export const handlers = [
  http.get("https://api.github.com/repos/:owner/:repo/issues/:id/events", () => {
    return HttpResponse.json(issueEventsGet);
  }),
  http.get("https://api.github.com/repos/:owner/:repo/issues/:id/labels", () => {
    return HttpResponse.json(issuesLabelsGet);
  }),
  http.get("https://api.github.com/repos/:owner/:repo/issues/:id/timeline", () => {
    return HttpResponse.json(issueTimeline);
  }),

  http.get("https://api.github.com/:org/repos", ({ params: { org } }) => {
    return HttpResponse.json(db.repo.findMany({ where: { owner: { login: { equals: org as string } } } }));
  }),

  http.get("https://api.github.com/repos/:owner/:repo/issues", ({ params: { owner, repo } }) => {
    return HttpResponse.json(db.issue.findMany({ where: { owner: { login: { equals: owner as string } }, repo: { equals: repo as string } } }));
  }),

  http.get("https://api.github.com/orgs/:org/repos", ({ params: { org } }) => {
    return HttpResponse.json(db.repo.findMany({ where: { owner: { login: { equals: org as string } } } }));
  }),
  http.get("https://api.github.com/repos/:owner/:repo/issues/:id/comments", ({ params: { owner, repo } }) => {
    return HttpResponse.json(db.issueComments.getAll());
  }),
  http.post("https://api.github.com/repos/:owner/:repo/issues/:id/comments", async ({ params: { owner, repo, id }, request: { body } }) => {
    const comment = await body?.getReader().read().then((r) => new TextDecoder().decode(r.value));
    if (!comment) {
      return HttpResponse.json({ message: "No body" });
    }

    db.issueComments.create({ issueId: Number(id), body: comment, created_at: new Date().toISOString(), id: db.issueComments.count() + 1, owner: { login: owner as string }, repo: { name: repo as string } });
    return HttpResponse.json({ message: "Comment created" });
  }),
  http.delete("https://api.github.com/repos/:owner/:repo/issues/:id/assignees", ({ params: { owner, repo, id } }) => {
    db.issue.update({ where: { owner: { login: { equals: owner as string } }, repo: { equals: repo as string }, id: { equals: Number(id) } }, data: { assignees: [] } });
    return HttpResponse.json({ message: "Assignees removed" });
  }),
];
