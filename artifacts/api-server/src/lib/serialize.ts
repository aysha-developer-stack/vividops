import type { JobRow, UserRow } from "@workspace/db";

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    phone: u.phone,
    bio: u.bio,
    role: u.role,
    status: u.status,
    mustResetPassword: u.mustResetPassword,
    lastSignInAt: u.lastSignInAt ? u.lastSignInAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

type RefUser = Pick<UserRow, "id" | "name" | "role"> | null | undefined;

function userRef(u: RefUser) {
  return u ? { id: u.id, name: u.name, role: u.role } : null;
}

export function publicJob(
  job: JobRow,
  assignee: RefUser,
  supervisor: RefUser,
) {
  const now = new Date();
  const isOverdue =
    !!job.dueDate &&
    job.status !== "completed" &&
    job.status !== "cancelled" &&
    job.dueDate < now;
  const displayNumber = job.jobNumber?.trim() ? `JOB-${job.jobNumber.trim()}` : `JOB-${job.serial}`;
  return {
    id: job.id,
    number: displayNumber,
    title: job.title,
    client: job.client,
    address: job.address,
    description: job.description,
    status: job.status,
    priority: job.priority,
    progress: job.progress,
    isOverdue,
    assignee: userRef(assignee),
    supervisor: userRef(supervisor),
    dueDate: job.dueDate ? job.dueDate.toISOString() : null,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
