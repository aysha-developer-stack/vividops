import type { JobRow, UserRow } from "@workspace/db";

export function canEditCompletedJob(actor: Pick<UserRow, "role">): boolean {
  return actor.role === "admin" || actor.role === "super-admin";
}

export function canMutateCompletedJob(
  actor: Pick<UserRow, "role">,
  job: Pick<JobRow, "status">,
): boolean {
  if (job.status !== "completed") return true;
  return canEditCompletedJob(actor);
}
