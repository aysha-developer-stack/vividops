import type { JobRow, UserRow, ActiveTimerSessionRow } from "@workspace/db";

export const TIMER_HEARTBEAT_LIVE_MS = 5 * 60 * 1000;
/** Pause only after a real sleep/offline gap — not a background CAD tab (Chrome can freeze JS for minutes). */
export const TIMER_HEARTBEAT_GAP_PAUSE_MS = 2 * 60 * 60 * 1000;
/** Safety cap — a single session cannot be real work beyond one day. */
export const MAX_TIMER_SEGMENT_SECONDS = 24 * 3600;

/** Paused leftover larger than one day is display junk, not billable work. */
export function isInflatedPausedTimer(session: {
  accumulatedSeconds?: number | null;
  segmentStartedAt?: Date | string | null;
}): boolean {
  return !session.segmentStartedAt && (session.accumulatedSeconds ?? 0) > MAX_TIMER_SEGMENT_SECONDS;
}

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
  /**
   * Wall-clock only — do not use for billed hours.
   * Pause, sleep, and job on-hold idle must stay on the default (billable) path.
   */
  useElapsed?: boolean;
};

/** Seconds to persist. Default is heartbeat-capped so paused/idle time is not billed. */
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
  const trackingPaused = !session.segmentStartedAt;
  const inflatedPause = isInflatedPausedTimer(session);
  const elapsed = inflatedPause ? 0 : timerSessionElapsedSeconds(session, nowMs);
  const billable = inflatedPause ? 0 : timerSessionBillableSeconds(session, nowMs);
  return {
    id: session.id,
    userId: session.userId,
    jobId: session.jobId,
    jobNumber: job?.jobNumber ?? null,
    jobTitle: job?.title ?? null,
    task: session.task,
    accumulatedSeconds: inflatedPause ? 0 : session.accumulatedSeconds,
    segmentStartedAt: session.segmentStartedAt?.toISOString() ?? null,
    lastHeartbeatAt: session.lastHeartbeatAt.toISOString(),
    elapsedSeconds: elapsed,
    billableSeconds: billable,
    isLive: isTimerSessionLive(session, nowMs) && !stale,
    trackingPaused,
  };
}

export function canListTeamTimerSessions(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin" || actor.role === "supervisor";
}
