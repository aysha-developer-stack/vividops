import type { JobRow, UserRow, ActiveReviewCheckSessionRow } from "@workspace/db";

export const SUPERVISOR_REVIEW_CHECK_TASK = "Supervisor review check";

export const REVIEW_CHECK_HEARTBEAT_LIVE_MS = 5 * 60 * 1000;

export function reviewCheckElapsedSeconds(
  session: Pick<ActiveReviewCheckSessionRow, "accumulatedSeconds" | "segmentStartedAt">,
  nowMs = Date.now(),
): number {
  const base = Math.max(0, session.accumulatedSeconds ?? 0);
  if (!session.segmentStartedAt) return base;
  const segMs = session.segmentStartedAt.getTime();
  if (!Number.isFinite(segMs)) return base;
  return base + Math.max(0, Math.floor((nowMs - segMs) / 1000));
}

export function isReviewCheckSessionLive(
  session: Pick<ActiveReviewCheckSessionRow, "segmentStartedAt" | "lastHeartbeatAt">,
  nowMs = Date.now(),
): boolean {
  if (!session.segmentStartedAt) return false;
  const hbMs = session.lastHeartbeatAt?.getTime?.() ?? new Date(session.lastHeartbeatAt as any).getTime();
  if (!Number.isFinite(hbMs)) return false;
  return nowMs - hbMs <= REVIEW_CHECK_HEARTBEAT_LIVE_MS;
}

export type PublicReviewCheckSession = {
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

export function publicReviewCheckSession(
  session: ActiveReviewCheckSessionRow,
  extras: {
    supervisorName?: string | null;
    job?: Pick<JobRow, "jobNumber" | "title"> | null;
  } = {},
  nowMs = Date.now(),
): PublicReviewCheckSession {
  return {
    id: session.id,
    supervisorId: session.supervisorId,
    supervisorName: extras.supervisorName ?? null,
    jobId: session.jobId,
    jobNumber: extras.job?.jobNumber ?? null,
    jobTitle: extras.job?.title ?? null,
    accumulatedSeconds: session.accumulatedSeconds,
    segmentStartedAt: session.segmentStartedAt?.toISOString() ?? null,
    lastHeartbeatAt: session.lastHeartbeatAt.toISOString(),
    elapsedSeconds: reviewCheckElapsedSeconds(session, nowMs),
    isLive: isReviewCheckSessionLive(session, nowMs),
  };
}

export function canListAllReviewCheckSessions(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin";
}
