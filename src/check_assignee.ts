export function shouldSendReminder(pr: { assignees?: any[]; assignee?: any }): boolean {
  return Boolean(pr.assignee || (pr.assignees && pr.assignees.length > 0));
}
