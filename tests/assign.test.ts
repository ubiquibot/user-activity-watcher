import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { watchUserActivity } from "../src/handlers/watch-user-activity";
import { ContextPlugin } from "../src/types/plugin-input";

describe("watchUserActivity", () => {
  const mockContextTemplate = {
    logger: new Logs("debug"),
    eventName: "issues.assigned",
    payload: {
      repository: { id: 123, owner: { id: 123, login: "ubiquity-os" } },
      issue: {
        assignees: [{ login: "ubiquity-os" }],
        title: "Test Issue",
        state: "open",
      },
    },
    config: {
      followUpInterval: 3600000, // 1 hour
      negligenceThreshold: 7200000, // 2 hours
      pullRequestRequired: true,
    },
    octokit: {
      paginate: mock(() => []),
      rest: {
        issues: {
          listForRepo: mock(() => []),
        },
        actions: {
          disableWorkflow: mock(() => {}),
        },
      },
    },
    commentHandler: {
      postComment: mock(() => {}),
    },
    adapters: {
      issueStore: {
        addIssue: mock(() => {}),
        removeIssue: mock(() => {}),
        hasData: mock(() => false),
      },
    },
  } as unknown as ContextPlugin;

  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("should post comment for matching repository issue", async () => {
    const warnSpy = spyOn(console, "warn");
    const mockContext = { ...mockContextTemplate };
    mockContext.payload = {
      ...mockContextTemplate.payload,
      issue: {
        assignees: [{ login: "ubiquity-os" }],
        title: "Test Issue",
        state: "open",
        labels: ["Price: 1 USD"],
      },
    } as unknown as ContextPlugin["payload"];

    await watchUserActivity(mockContext);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockReset();
    mockContext.eventName = "issues.reopened";
    await watchUserActivity(mockContext);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("should ignore an un-priced task", async () => {
    const infoSpy = spyOn(console, "info");
    await watchUserActivity(mockContextTemplate);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("should not post a reminder when a priced issue is reopened without assignees", async () => {
    const postComment = mock(() => {});
    const removeIssue = mock(() => {});
    const mockContext = {
      ...mockContextTemplate,
      eventName: "issues.reopened",
      payload: {
        ...mockContextTemplate.payload,
        issue: {
          assignees: [],
          assignee: null,
          html_url: "https://github.com/ubiquity-os-marketplace/daemon-disqualifier/issues/135",
          title: "Test Issue",
          state: "open",
          labels: ["Price: 75 USD"],
        },
      },
      commentHandler: {
        postComment,
      },
      adapters: {
        issueStore: {
          addIssue: mock(() => {}),
          removeIssue,
          hasData: mock(() => false),
        },
      },
    } as unknown as ContextPlugin;

    await watchUserActivity(mockContext);

    expect(postComment).not.toHaveBeenCalled();
    expect(removeIssue).toHaveBeenCalledWith("https://github.com/ubiquity-os-marketplace/daemon-disqualifier/issues/135");
  });
});
