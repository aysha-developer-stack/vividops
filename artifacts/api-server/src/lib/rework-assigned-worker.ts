/** Extra assignees share the first assignee's rework cycle (`userId`). This is who actually received/did it. */

export function pickLatestExtraAssigneeId(
  assigneeId: string | null | undefined,
  extraMemberIdsNewestFirst: string[],
): string | null {
  const extra = extraMemberIdsNewestFirst.find((id) => id && id !== assigneeId);
  return extra ?? assigneeId ?? null;
}

export function reworkDisplayUserId(row: {
  userId: string;
  assignedWorkerId?: string | null;
}): string {
  return row.assignedWorkerId || row.userId;
}

/**
 * Prefer an extra assignee who submitted, uploaded, timed, or was added during the cycle.
 * Falls back to the cycle owner if only they appear.
 */
export function pickInferredReworkWorkerId(opts: {
  cycleOwnerId: string;
  workerIds: string[];
  events: Array<{ userId: string; at: number }>;
}): string | null {
  const allowed = new Set(opts.workerIds);
  const sorted = opts.events
    .filter((event) => event.userId && allowed.has(event.userId))
    .sort((a, b) => b.at - a.at);
  const extra = sorted.find((event) => event.userId !== opts.cycleOwnerId);
  if (extra) return extra.userId;
  return sorted[0]?.userId ?? null;
}
