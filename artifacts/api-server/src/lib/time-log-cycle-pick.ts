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

export type UntaggedTimeLogRework = {
  id: string;
  userId: string;
  assignedWorkerId?: string | null;
  cycleNumber: number;
  assignedAtMs: number;
  status?: string | null;
};

/** Untagged extra-assignee time belongs to the rework that was open when they logged it, not Original work. */
export function pickReworkForUntaggedTimeLog(
  log: { userId: string; at: number },
  reworks: UntaggedTimeLogRework[],
): UntaggedTimeLogRework | null {
  if (!log.at) return null;
  const started = reworks
    .filter((row) => row.status !== "cancelled" && row.assignedAtMs > 0 && row.assignedAtMs <= log.at)
    .sort((a, b) => b.assignedAtMs - a.assignedAtMs);
  if (started.length === 0) return null;
  const assignedToUser = started.filter((row) => row.assignedWorkerId === log.userId);
  if (assignedToUser[0]) return assignedToUser[0];
  const ownedByUser = started.filter((row) => row.userId === log.userId);
  if (ownedByUser[0]) return ownedByUser[0];
  return started[0];
}
