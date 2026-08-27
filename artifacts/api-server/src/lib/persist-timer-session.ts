import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  activeTimerSessions,
  db,
  jobs,
  timeLogs,
  type ActiveTimerSessionRow,
  type JobRow,
} from "@workspace/db";
import { resolveReworkCycleForTimeLog } from "./time-log-cycles";
import {
  timerSessionBillableSeconds,
  TIMER_HEARTBEAT_GAP_PAUSE_MS,
} from "./timer-sessions";
import { logger } from "./logger";

/** Safety cap — prevents runaway sessions if auto-stop is missed (24h). */
const MAX_TIMER_SEGMENT_SECONDS = 24 * 3600;

export function shouldAutoStopWorkerTimersForJobStatus(status: string): boolean {
  return (
    status === "awaiting_supervisor" ||
    status === "awaiting_admin" ||
    status === "awaiting_super_admin" ||
    status === "completed" ||
    status === "cancelled" ||
    status === "on_hold"
  );
}

export function workerMayStartTimerOnJobStatus(status: string): boolean {
  return status === "pending" || status === "in_progress" || status === "rework";
}

export function formatTimerDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

function capDurationForClosedJob(
  session: ActiveTimerSessionRow,
  job: Pick<JobRow, "status" | "completedAt">,
  duration: number,
): number {
  if (workerMayStartTimerOnJobStatus(job.status)) return duration;

  if (job.completedAt) {
    const completedMs = job.completedAt.getTime();
    const lastHbMs = session.lastHeartbeatAt.getTime();
    if (lastHbMs > completedMs + 60_000) {
      return Math.min(duration, Math.max(0, session.accumulatedSeconds ?? 0));
    }
    const atCompletion = timerSessionBillableSeconds(session, completedMs);
    return Math.min(duration, atCompletion);
  }

  return duration;
}

/** Save elapsed time from a session to time_logs and remove the active session row. */
export async function stopTimerSessionAndSaveLog(
  session: ActiveTimerSessionRow,
  workerUserId: string,
): Promise<number> {
  let rawDuration = timerSessionBillableSeconds(session);
  if (session.jobId) {
    const [job] = await db
      .select({ status: jobs.status, completedAt: jobs.completedAt })
      .from(jobs)
      .where(eq(jobs.id, session.jobId))
      .limit(1);
    if (job) {
      rawDuration = capDurationForClosedJob(session, job, rawDuration);
    }
  }

  const duration = Math.min(Math.max(0, rawDuration), MAX_TIMER_SEGMENT_SECONDS);
  if (rawDuration > MAX_TIMER_SEGMENT_SECONDS) {
    logger.warn(
      {
        sessionId: session.id,
        jobId: session.jobId,
        userId: workerUserId,
        rawDuration,
        cappedDuration: duration,
      },
      "Capped inflated timer segment before saving time log",
    );
  }
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

/** Stop every active timer on a job and persist elapsed time (assignee + members). */
export async function stopAllActiveTimersOnJob(jobId: string): Promise<number> {
  const sessions = await db
    .select()
    .from(activeTimerSessions)
    .where(eq(activeTimerSessions.jobId, jobId));

  let saved = 0;
  for (const session of sessions) {
    saved += await stopTimerSessionAndSaveLog(session, session.userId);
  }
  return saved;
}

/** Stop timers without writing a time log (e.g. admin assigned rework — worker starts fresh). */
export async function clearAllActiveTimersOnJob(jobId: string): Promise<number> {
  const sessions = await db
    .select()
    .from(activeTimerSessions)
    .where(eq(activeTimerSessions.jobId, jobId));

  for (const session of sessions) {
    await db.delete(activeTimerSessions).where(eq(activeTimerSessions.id, session.id));
  }
  return sessions.length;
}

/** Pause a running segment after sleep/offline — accumulate billable time only. */
export async function pauseTimerSessionAfterGap(
  session: ActiveTimerSessionRow,
): Promise<ActiveTimerSessionRow> {
  const now = new Date();
  const billable = timerSessionBillableSeconds(session, now.getTime());
  const [updated] = await db
    .update(activeTimerSessions)
    .set({
      accumulatedSeconds: billable,
      segmentStartedAt: null,
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(activeTimerSessions.id, session.id))
    .returning();
  logger.info(
    {
      sessionId: session.id,
      jobId: session.jobId,
      userId: session.userId,
      gapMs: now.getTime() - session.lastHeartbeatAt.getTime(),
      billable,
    },
    "Auto-paused timer after heartbeat gap (sleep/offline)",
  );
  return updated;
}

export { TIMER_HEARTBEAT_GAP_PAUSE_MS };

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
