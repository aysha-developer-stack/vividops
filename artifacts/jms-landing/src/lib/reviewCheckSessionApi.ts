export type ReviewCheckSession = {
  id: string;
  supervisorId: string;
  supervisorName: string | null;
  jobId: string;
  jobNumber: string | null;
  jobTitle: string | null;
  accumulatedSeconds: number;
  segmentStartedAt: string | null;
  lastHeartbeatAt: string;
  elapsedSeconds: number;
  isLive: boolean;
};

export type JobReviewCheckTime = {
  savedSeconds: number;
  activeSeconds: number;
  totalSeconds: number;
  isLive: boolean;
  reviewStartedAt: string | null;
};

export function liveReviewCheckElapsedSeconds(
  session: Pick<ReviewCheckSession, "accumulatedSeconds" | "segmentStartedAt"> | null | undefined,
  nowMs = Date.now(),
): number {
  if (!session) return 0;
  const base = Math.max(0, session.accumulatedSeconds ?? 0);
  if (!session.segmentStartedAt) return base;
  const segMs = new Date(session.segmentStartedAt).getTime();
  if (!Number.isFinite(segMs)) return base;
  return base + Math.max(0, Math.floor((nowMs - segMs) / 1000));
}

/** Banner timer: current open check session only — never include saved logs from past checks. */
export function reviewCheckBannerSeconds(
  session: Pick<ReviewCheckSession, "jobId" | "accumulatedSeconds" | "segmentStartedAt"> | null | undefined,
  jobId: string | undefined,
  nowMs = Date.now(),
): number {
  if (!jobId || !session?.jobId || session.jobId !== jobId) return 0;
  return liveReviewCheckElapsedSeconds(session, nowMs);
}

async function parseJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchActiveReviewCheckSessions(): Promise<ReviewCheckSession[]> {
  const res = await fetch("/api/review-check-sessions/active", { credentials: "include" });
  const data = await parseJson<ReviewCheckSession[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function fetchJobReviewCheckTime(jobId: string): Promise<JobReviewCheckTime | null> {
  const res = await fetch(`/api/jobs/${jobId}/review-check-time`, { credentials: "include" });
  return parseJson<JobReviewCheckTime>(res);
}

export async function startReviewCheckSession(jobId: string): Promise<ReviewCheckSession | null> {
  const res = await fetch("/api/review-check-sessions/start", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Failed to start review check");
  }
  return parseJson<ReviewCheckSession>(res);
}

export async function pauseReviewCheckSession(): Promise<ReviewCheckSession | null> {
  const res = await fetch("/api/review-check-sessions/pause", {
    method: "POST",
    credentials: "include",
  });
  return parseJson<ReviewCheckSession>(res);
}

export async function heartbeatReviewCheckSession(): Promise<ReviewCheckSession | null> {
  const res = await fetch("/api/review-check-sessions/heartbeat", {
    method: "POST",
    credentials: "include",
  });
  return parseJson<ReviewCheckSession>(res);
}

export const REVIEW_CHECK_HEARTBEAT_INTERVAL_MS = 60_000;
