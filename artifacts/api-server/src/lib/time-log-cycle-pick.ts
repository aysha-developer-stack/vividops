/** Extra assignees share the job's active rework cycle when they have no row of their own. */
export function pickReworkCycleForTimeLog(
  rows: Array<{ cycleNumber: number; userId: string }>,
  userId: string,
): number | null {
  if (rows.length === 0) return null;
  const own = rows.find((row) => row.userId === userId);
  if (own) return own.cycleNumber;
  return rows[0]?.cycleNumber ?? null;
}
