import type { JobRow, UserRow } from "@workspace/db";

export function actorIsAdmin(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin";
}

export function actorIsAssignedSupervisor(actor: UserRow, job: JobRow): boolean {
  return actor.role === "supervisor" && job.supervisorId === actor.id;
}

export function actorIsAssignedCoordinator(actor: UserRow, job: JobRow): boolean {
  return actor.role === "coordinator" && job.coordinatorId === actor.id;
}

/** View access for job pages, files, chat, checklist read, etc. */
export function actorCanViewJobStakeholder(
  actor: UserRow,
  job: JobRow,
  isExtraMember = false,
): boolean {
  if (actorIsAdmin(actor)) return true;
  if (actorIsAssignedSupervisor(actor, job)) return true;
  if (actorIsAssignedCoordinator(actor, job)) return true;
  if (job.assigneeId === actor.id) return true;
  return isExtraMember;
}

/** Edit / approve / rework — supervisors and admins only (not coordinators). */
export function actorCanManageJob(actor: UserRow, job: JobRow): boolean {
  if (actorIsAdmin(actor)) return true;
  return actorIsAssignedSupervisor(actor, job);
}
