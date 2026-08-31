import type { JobRow, UserRow, ActiveTimerSessionRow } from "@workspace/db";

export const TIMER_HEARTBEAT_LIVE_MS = 5 * 60 * 1000;
/** If no heartbeat within this window, treat the segment as paused (sleep / lid closed / throttled tab). */
export const TIMER_HEARTBEAT_GAP_PAUSE_MS = 3 * 60 * 1000;

export function timerSessionElapsedSeconds(
  session: Pick<ActiveTimerSessionRow, "accumulatedSeconds" | "segmentStartedAt">,
  nowMs = Date.now(),
): number {
  const base = Math.max(0, session.accumulatedSeconds ?? 0);
  if (!session.segmentStartedAt) return base;
  const segMs = session.segmentStartedAt.getTime();
  if (!Number.isFinite(segMs)) return base;
  return base + Math.max(0, Math.floor((nowMs - segMs) / 1000));
}

/** Billable seconds — only counts live segments up to the last heartbeat (+ grace). */
export function timerSessionBillableSeconds(
  session: Pick<
    ActiveTimerSessionRow,
    "accumulatedSeconds" | "segmentStartedAt" | "lastHeartbeatAt"
  >,
  nowMs = Date.now(),
): number {
  const base = Math.max(0, session.accumulatedSeconds ?? 0);
  if (!session.segmentStartedAt) return base;
  const segMs = session.segmentStartedAt.getTime();
  if (!Number.isFinite(segMs)) return base;
  const hbMs = session.lastHeartbeatAt?.getTime?.() ?? new Date(session.lastHeartbeatAt as Date).getTime();
  const graceEndMs = Number.isFinite(hbMs) ? hbMs + TIMER_HEARTBEAT_GAP_PAUSE_MS : nowMs;
  const effectiveEndMs = Math.min(nowMs, graceEndMs);
  return base + Math.max(0, Math.floor((effectiveEndMs - segMs) / 1000));
}

export function isTimerSessionLive(
  session: Pick<ActiveTimerSessionRow, "segmentStartedAt" | "lastHeartbeatAt">,
  nowMs = Date.now(),
): boolean {
  if (!session.segmentStartedAt) return false;
  const hbMs = session.lastHeartbeatAt?.getTime?.() ?? new Date(session.lastHeartbeatAt as any).getTime();
  if (!Number.isFinite(hbMs)) return false;
  return nowMs - hbMs <= TIMER_HEARTBEAT_LIVE_MS;
}

export type PublicTimerSession = {
  id: string;
  userId: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  task: string;
  accumulatedSeconds: number;
  segmentStartedAt: string | null;
  lastHeartbeatAt: string;
  elapsedSeconds: number;
  isLive: boolean;
};

export function publicTimerSession(
  session: ActiveTimerSessionRow,
  job?: Pick<JobRow, "jobNumber" | "title"> | null,
  nowMs = Date.now(),
): PublicTimerSession {
  return {
    id: session.id,
    userId: session.userId,
    jobId: session.jobId,
    jobNumber: job?.jobNumber ?? null,
    jobTitle: job?.title ?? null,
    task: session.task,
    accumulatedSeconds: session.accumulatedSeconds,
    segmentStartedAt: session.segmentStartedAt?.toISOString() ?? null,
    lastHeartbeatAt: session.lastHeartbeatAt.toISOString(),
    elapsedSeconds: timerSessionElapsedSeconds(session, nowMs),
    isLive: isTimerSessionLive(session, nowMs),
  };
}

export function canListTeamTimerSessions(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin" || actor.role === "supervisor";
}
