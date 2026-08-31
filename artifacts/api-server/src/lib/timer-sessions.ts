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

export type TimerSaveDurationOptions = {
  /** Explicit stop (user action, job switch, reassign) — save full segment time. */
  useElapsed?: boolean;
};

/** Pure duration math for saves — covered by regression tests. */
export function resolveTimerSaveDuration(
  session: Pick<
    ActiveTimerSessionRow,
    "accumulatedSeconds" | "segmentStartedAt" | "lastHeartbeatAt"
  >,
  nowMs = Date.now(),
  opts?: TimerSaveDurationOptions,
): number {
  return opts?.useElapsed
    ? timerSessionElapsedSeconds(session, nowMs)
    : timerSessionBillableSeconds(session, nowMs);
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

/** True when a running segment missed heartbeats beyond the grace window. */
export function isTimerSessionStale(
  session: Pick<ActiveTimerSessionRow, "segmentStartedAt" | "lastHeartbeatAt">,
  nowMs = Date.now(),
): boolean {
  if (!session.segmentStartedAt) return false;
  const hbMs = session.lastHeartbeatAt?.getTime?.() ?? new Date(session.lastHeartbeatAt as Date).getTime();
  if (!Number.isFinite(hbMs)) return false;
  return nowMs - hbMs > TIMER_HEARTBEAT_GAP_PAUSE_MS;
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
  /** Seconds that would be saved if the timer stopped now (heartbeat-capped while running). */
  billableSeconds: number;
  isLive: boolean;
  /** Server auto-paused or stale — client must not show a running timer. */
  trackingPaused: boolean;
};

export function publicTimerSession(
  session: ActiveTimerSessionRow,
  job?: Pick<JobRow, "jobNumber" | "title"> | null,
  nowMs = Date.now(),
): PublicTimerSession {
  const stale = isTimerSessionStale(session, nowMs);
  const trackingPaused = !session.segmentStartedAt || stale;
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
    billableSeconds: timerSessionBillableSeconds(session, nowMs),
    isLive: isTimerSessionLive(session, nowMs) && !stale,
    trackingPaused,
  };
}

export function canListTeamTimerSessions(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin" || actor.role === "supervisor";
}
