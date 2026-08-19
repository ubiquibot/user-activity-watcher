# Proof of Work: Skip Reminder Comments on Reopening When Unassigned (#135)

## 1. Issue Summary & Root Cause
- **Repository:** `ubiquity-os-marketplace/daemon-disqualifier`
- **Issue Reference:** [#135 (Reminder is sent on PR/issue reopening even with no assignee)](https://github.com/ubiquity-os-marketplace/daemon-disqualifier/issues/135)
- **Reward:** $75 USD (USDC DevPool Escrow)
- **Root Cause:** When `issues.reopened` or `issues.assigned` webhooks trigger `watchUserActivity`, the function checked `!shouldIgnoreIssue(issue)` but did not verify whether the issue has an active assignee (`issue.assignees?.length || issue.assignee`). As a result, reopening an unassigned task immediately posted an initial reminder comment and registered the unassigned issue into the database.

## 2. Solution Implementation
- Added assignee verification in `watchUserActivity`:
  ```typescript
  const issue = context.payload.issue as IssueType;
  if (!issue.assignees?.length && !issue.assignee) {
    return { message: logger.info(`Skipping issue ${issue.html_url || ""} because no user is assigned.`).logMessage.raw };
  }
  ```
- Added comprehensive unit test coverage in `tests/assign.test.ts`:
  - `should not post comment on issues.reopened when there is no assignee`
  - `should not post comment on issues.assigned when there is no assignee`
  - `should post comment for matching repository issue (with assignee)`

## 3. Test & Verification Logs
```text
$ bun test tests/assign.test.ts
bun test v1.3.14

tests/assign.test.ts:
(pass) watchUserActivity > should post comment for matching repository issue [6.40ms]
(pass) watchUserActivity > should ignore an un-priced task [0.29ms]
(pass) watchUserActivity > should not post comment on issues.reopened when there is no assignee [0.41ms]
(pass) watchUserActivity > should not post comment on issues.assigned when there is no assignee [0.42ms]

 4 pass
 0 fail
 7 expect() calls
Ran 4 tests across 1 file.

$ tsc --noEmit
# Exit code: 0 (Clean compilation, 0 type errors)
```
