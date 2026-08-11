import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  activeTimerSessions,
  db,
  timeLogs,
  type ActiveTimerSessionRow,
} from "@workspace/db";
import { resolveReworkCycleForTimeLog } from "./time-log-cycles";
import { timerSessionElapsedSeconds } from "./timer-sessions";

export function formatTimerDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

/** Save elapsed time from a session to time_logs and remove the active session row. */
export async function stopTimerSessionAndSaveLog(
  session: ActiveTimerSessionRow,
  workerUserId: string,
): Promise<number> {
  const duration = timerSessionElapsedSeconds(session);
  if (duration > 0) {
    const reworkCycleNumber = await resolveReworkCycleForTimeLog(session.jobId ?? null, workerUserId);
    await db.insert(timeLogs).values({
      id: randomUUID(),
      task: session.task,
      duration,
      jobId: session.jobId ?? null,
      userId: workerUserId,
      reworkCycleNumber,
    });
  }
  await db.delete(activeTimerSessions).where(eq(activeTimerSessions.id, session.id));
  return duration;
}

/**
 * When a worker is removed from a job, stop their server-side timer on that job
 * and persist the elapsed time under their user id.
 */
export async function stopActiveTimerForUserOnJob(
  userId: string,
  jobId: string,
): Promise<number> {
  const [session] = await db
    .select()
    .from(activeTimerSessions)
    .where(and(eq(activeTimerSessions.userId, userId), eq(activeTimerSessions.jobId, jobId)))
    .limit(1);
  if (!session) return 0;
  return stopTimerSessionAndSaveLog(session, userId);
}
