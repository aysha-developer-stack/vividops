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
  if (actor.role === "user") return actor.id;
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
  if (actor.role === "user") return targetUserId === actor.id;
  return isWorkingSupervisor(actor, job) && targetUserId === actor.id;
}
