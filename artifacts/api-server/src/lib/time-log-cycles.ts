import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, jobReworks, timeLogs } from "@workspace/db";
import { healDuplicateReworkCyclesForJob } from "./reworks";
import { pickReworkCycleForTimeLog, pickReworkForUntaggedTimeLog } from "./time-log-cycle-pick";

export { pickReworkCycleForTimeLog };

const ACTIVE_REWORK_STATUSES = ["open", "needs_correction", "awaiting_review"] as const;

/** Pick the rework cycle to stamp on a new time log for this job + worker. */
export async function resolveReworkCycleForTimeLog(
  jobId: string | null | undefined,
  userId: string,
): Promise<number | null> {
  if (!jobId) return null;

  await healDuplicateReworkCyclesForJob(jobId);

  const rows = await db
    .select({ cycleNumber: jobReworks.cycleNumber, userId: jobReworks.userId })
    .from(jobReworks)
    .where(and(eq(jobReworks.jobId, jobId), inArray(jobReworks.status, [...ACTIVE_REWORK_STATUSES])))
    .orderBy(desc(jobReworks.assignedAt), desc(jobReworks.createdAt), desc(jobReworks.cycleNumber));

  return pickReworkCycleForTimeLog(rows, userId);
}

/** Stamp extra-assignee logs that were saved as Original because they had no cycle number. */
export async function healUntaggedTimeLogsForJob(jobId: string): Promise<number> {
  const logs = await db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.jobId, jobId), isNull(timeLogs.reworkCycleNumber)));
  if (logs.length === 0) return 0;

  const reworkRows = await db.select().from(jobReworks).where(eq(jobReworks.jobId, jobId));
  if (reworkRows.length === 0) return 0;

  const reworks = reworkRows.map((row) => ({
    id: row.id,
    userId: row.userId,
    assignedWorkerId: row.assignedWorkerId ?? null,
    cycleNumber: row.cycleNumber,
    assignedAtMs: row.assignedAt?.getTime() ?? row.createdAt?.getTime() ?? 0,
    status: row.status,
  }));

  let healed = 0;
  for (const log of logs) {
    const at = log.createdAt?.getTime() ?? log.startTime?.getTime() ?? 0;
    const matched = pickReworkForUntaggedTimeLog({ userId: log.userId, at }, reworks);
    if (!matched) continue;
    await db.update(timeLogs).set({ reworkCycleNumber: matched.cycleNumber }).where(eq(timeLogs.id, log.id));
    healed += 1;
  }
  return healed;
}

export function publicTimeLog(row: {
  id: string;
  userId: string;
  jobId: string | null;
  task: string;
  duration: number;
  reworkCycleNumber: number | null;
  startTime: Date;
  createdAt: Date;
  userName?: string | null;
}) {
  return {
    id: row.id,
    userId: row.userId,
    jobId: row.jobId,
    task: row.task,
    duration: row.duration,
    reworkCycleNumber: row.reworkCycleNumber,
    startTime: row.startTime.toISOString(),
    createdAt: row.createdAt.toISOString(),
    ...(row.userName ? { userName: row.userName } : {}),
  };
}
