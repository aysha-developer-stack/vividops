import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  activeReviewCheckSessions,
  activeTimerSessions,
  db,
  timeLogs,
  type ActiveReviewCheckSessionRow,
} from "@workspace/db";
import { stopTimerSessionAndSaveLog } from "./persist-timer-session";
import { reviewCheckElapsedSeconds, SUPERVISOR_REVIEW_CHECK_TASK } from "./review-check-sessions";

/** Save elapsed review-check time to time_logs and remove the active session row. */
export async function stopReviewCheckSessionAndSaveLog(
  session: ActiveReviewCheckSessionRow,
): Promise<number> {
  const duration = reviewCheckElapsedSeconds(session);
  if (duration > 0 && session.jobId) {
    await db.insert(timeLogs).values({
      id: randomUUID(),
      task: SUPERVISOR_REVIEW_CHECK_TASK,
      duration,
      jobId: session.jobId,
      userId: session.supervisorId,
      reworkCycleNumber: null,
    });
  }
  await db.delete(activeReviewCheckSessions).where(eq(activeReviewCheckSessions.id, session.id));
  return duration;
}

/** Persist the running segment to time_logs but keep the session row (for job switches). */
export async function flushReviewCheckSegment(
  session: ActiveReviewCheckSessionRow,
): Promise<number> {
  const duration = reviewCheckElapsedSeconds(session);
  if (duration > 0 && session.jobId) {
    await db.insert(timeLogs).values({
      id: randomUUID(),
      task: SUPERVISOR_REVIEW_CHECK_TASK,
      duration,
      jobId: session.jobId,
      userId: session.supervisorId,
      reworkCycleNumber: null,
    });
  }
  return duration;
}

export async function pauseWorkTimerForSupervisor(supervisorId: string): Promise<void> {
  const [workSession] = await db
    .select()
    .from(activeTimerSessions)
    .where(eq(activeTimerSessions.userId, supervisorId))
    .limit(1);
  if (!workSession) return;
  if (workSession.segmentStartedAt) {
    await stopTimerSessionAndSaveLog(workSession, supervisorId);
    return;
  }
  await db.delete(activeTimerSessions).where(eq(activeTimerSessions.id, workSession.id));
}

export async function finalizeReviewCheckForJob(jobId: string, supervisorId?: string): Promise<void> {
  let query = db.select().from(activeReviewCheckSessions).where(eq(activeReviewCheckSessions.jobId, jobId));
  const rows = await query;
  for (const session of rows) {
    if (supervisorId && session.supervisorId !== supervisorId) continue;
    await stopReviewCheckSessionAndSaveLog(session);
  }
}
