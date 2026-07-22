import { and, desc, eq, inArray } from "drizzle-orm";
import { db, jobReworks } from "@workspace/db";

const ACTIVE_REWORK_STATUSES = ["open", "needs_correction", "awaiting_review"] as const;

/** Pick the rework cycle to stamp on a new time log for this job + worker. */
export async function resolveReworkCycleForTimeLog(
  jobId: string | null | undefined,
  userId: string,
): Promise<number | null> {
  if (!jobId) return null;

  const rows = await db
    .select({ cycleNumber: jobReworks.cycleNumber })
    .from(jobReworks)
    .where(
      and(
        eq(jobReworks.jobId, jobId),
        eq(jobReworks.userId, userId),
        inArray(jobReworks.status, [...ACTIVE_REWORK_STATUSES]),
      ),
    )
    .orderBy(desc(jobReworks.cycleNumber))
    .limit(1);

  return rows[0]?.cycleNumber ?? null;
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
  };
}
