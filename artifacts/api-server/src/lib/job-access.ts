import { and, eq } from "drizzle-orm";
import { db, jobMembers, type JobRow, type UserRow } from "@workspace/db";

export function actorIsAdmin(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin";
}

/** Primary assignee plus extra workers on `job_members`. */
export async function listJobAssignedWorkerIds(
  job: Pick<JobRow, "id" | "assigneeId">,
): Promise<string[]> {
  const ids = new Set<string>();
  if (job.assigneeId) ids.add(job.assigneeId);
  const rows = await db
    .select({ userId: jobMembers.userId })
    .from(jobMembers)
    .where(eq(jobMembers.jobId, job.id));
  for (const row of rows) ids.add(row.userId);
  return Array.from(ids);
}

/** True if this user is the primary assignee or an extra assigned worker. */
export async function actorIsAssignedJobWorker(
  actor: Pick<UserRow, "id" | "role">,
  job: Pick<JobRow, "id" | "assigneeId">,
): Promise<boolean> {
  if (job.assigneeId === actor.id) return true;
  if (actor.role !== "user") return false;
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, job.id), eq(jobMembers.userId, actor.id)))
    .limit(1);
  return !!row;
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
