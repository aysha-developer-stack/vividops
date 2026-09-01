export type ActiveTimerSession = {
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
  billableSeconds?: number;
  isLive: boolean;
  trackingPaused?: boolean;
};

export function liveSessionElapsedSeconds(
  session: Pick<
    ActiveTimerSession,
    "accumulatedSeconds" | "segmentStartedAt" | "trackingPaused"
  > | null | undefined,
  nowMs = Date.now(),
): number {
  if (!session) return 0;
  const base = Math.max(0, session.accumulatedSeconds ?? 0);
  if (session.trackingPaused || !session.segmentStartedAt) return base;
  const segMs = new Date(session.segmentStartedAt).getTime();
  if (!Number.isFinite(segMs)) return base;
  return base + Math.max(0, Math.floor((nowMs - segMs) / 1000));
}

async function parseJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Active timer sessions for the signed-in user only (Timer page + job detail sync). */
export async function fetchMyActiveTimerSession(): Promise<ActiveTimerSession | null> {
  const res = await fetch("/api/timer-sessions/active?scope=mine", { credentials: "include" });
  const data = await parseJson<ActiveTimerSession[]>(res);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

/** Team worker timers for monitoring dashboards (supervisor/admin). */
export async function fetchActiveTimerSessions(): Promise<ActiveTimerSession[]> {
  const res = await fetch("/api/timer-sessions/active?scope=team", { credentials: "include" });
  const data = await parseJson<ActiveTimerSession[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function startTimerSession(opts: {
  jobId: string;
  task: string;
  accumulatedSeconds?: number;
}): Promise<ActiveTimerSession | null> {
  const res = await fetch("/api/timer-sessions/start", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return parseJson<ActiveTimerSession>(res);
}

export async function pauseTimerSession(): Promise<ActiveTimerSession | null> {
  const res = await fetch("/api/timer-sessions/pause", {
    method: "POST",
    credentials: "include",
  });
  return parseJson<ActiveTimerSession>(res);
}

export async function stopTimerSession(): Promise<{ duration: number } | null> {
  const res = await fetch("/api/timer-sessions/stop", {
    method: "POST",
    credentials: "include",
  });
  return parseJson<{ duration: number }>(res);
}

export async function heartbeatTimerSession(): Promise<
  (ActiveTimerSession & { autoPaused?: boolean; autoStopped?: boolean; duration?: number }) | null
> {
  const res = await fetch("/api/timer-sessions/heartbeat", {
    method: "POST",
    credentials: "include",
  });
  return parseJson<ActiveTimerSession & { autoPaused?: boolean; autoStopped?: boolean; duration?: number }>(res);
}

export const TIMER_HEARTBEAT_INTERVAL_MS = 30_000;
