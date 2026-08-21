export function calculateTurnaroundHours(
	assignedAt: number,
	completedAt: number,
): number {
	return Math.max(0, (completedAt - assignedAt) / (1000 * 60 * 60));
}
