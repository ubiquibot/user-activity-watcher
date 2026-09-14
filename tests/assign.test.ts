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

  it("should skip reminder and not post comment when an issue is reopened without assignees", async () => {
    const postCommentMock = mock(() => Promise.resolve({}));
    const removeIssueMock = mock(() => Promise.resolve());
    const addIssueMock = mock(() => Promise.resolve());

    const mockContext = {
      ...mockContextTemplate,
      eventName: "issues.reopened",
      payload: {
        ...mockContextTemplate.payload,
        issue: {
          html_url: "https://github.com/ubiquity-os/daemon-disqualifier/issues/135",
          assignees: [],
          assignee: null,
          title: "Unassigned Issue",
          state: "open",
          labels: ["Price: 75 USD"],
        },
      },
      commentHandler: {
        postComment: postCommentMock,
      },
      adapters: {
        issueStore: {
          removeIssue: removeIssueMock,
          addIssue: addIssueMock,
        },
      },
    } as unknown as ContextPlugin;

    const result = await watchUserActivity(mockContext);
    expect(result).toEqual({ message: "OK" });
    expect(postCommentMock).not.toHaveBeenCalled();
    expect(addIssueMock).not.toHaveBeenCalled();
    expect(removeIssueMock).toHaveBeenCalledWith("https://github.com/ubiquity-os/daemon-disqualifier/issues/135");
  });

  it("should post reminder when an issue is reopened with assignees", async () => {
    const postCommentMock = mock(() => Promise.resolve({ id: 1 }));
    const addIssueMock = mock(() => Promise.resolve());

    const mockContext = {
      ...mockContextTemplate,
      eventName: "issues.reopened",
      payload: {
        ...mockContextTemplate.payload,
        issue: {
          html_url: "https://github.com/ubiquity-os/daemon-disqualifier/issues/135",
          assignees: [{ login: "ubiquity-os" }],
          assignee: { login: "ubiquity-os" },
          title: "Assigned Issue",
          state: "open",
          labels: ["Price: 75 USD"],
        },
      },
      commentHandler: {
        postComment: postCommentMock,
      },
      adapters: {
        issueStore: {
          addIssue: addIssueMock,
        },
      },
    } as unknown as ContextPlugin;

    const result = await watchUserActivity(mockContext);
    expect(result).toEqual({ message: "OK" });
    expect(postCommentMock).toHaveBeenCalledTimes(1);
    expect(addIssueMock).toHaveBeenCalledWith("https://github.com/ubiquity-os/daemon-disqualifier/issues/135");
  });
});
