import type { JobRow, UserRow } from "@workspace/db";

/** Supervisor assigned to this job who may also perform field work on it (when no assignee). */
export function isWorkingSupervisor(actor: UserRow, job: JobRow): boolean {
  return (
    actor.role === "supervisor" &&
    job.supervisorId === actor.id &&
    !job.assigneeId
  );
}

/** User or supervising supervisor doing hands-on work (timer, checklist, files). */
export function isFieldWorkerOnJob(actor: UserRow, job: JobRow): boolean {
  return actor.role === "user" || isWorkingSupervisor(actor, job);
}

export function resolveChecklistTargetUserId(
  actor: UserRow,
  job: JobRow,
  userIdParam: string | null,
): string {
  // Extra assignees share the primary worker's checklist so any assigned
  // worker can complete the same tasks.
  if (actor.role === "user") return job.assigneeId ?? actor.id;
  if (userIdParam === actor.id) return actor.id;
  if (userIdParam) return userIdParam;
  return job.assigneeId ?? actor.id;
}

/** Field worker or supervising supervisor who should receive and complete rework. */
export function resolveReworkUserId(job: JobRow, userId?: string | null): string | null {
  if (userId) return userId;
  if (job.assigneeId) return job.assigneeId;
  if (job.supervisorId) return job.supervisorId;
  return null;
}

/** Worker completing their own checklist (user or supervising supervisor). */
export function isOwnChecklistWork(actor: UserRow, job: JobRow, targetUserId: string): boolean {
  if (actor.role === "user") {
    const sharedId = job.assigneeId ?? actor.id;
    return targetUserId === actor.id || targetUserId === sharedId;
  }
  return isWorkingSupervisor(actor, job) && targetUserId === actor.id;
}
