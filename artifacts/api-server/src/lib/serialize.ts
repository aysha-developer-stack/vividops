import type { JobRow, UserRow } from "@workspace/db";
import { parseJobMeta } from "./jobMeta";

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
export type JobAssigneeRef = NonNullable<ReturnType<typeof userRef>>;

function userRef(u: RefUser) {
  return u ? { id: u.id, name: u.name, role: u.role } : null;
}

export function buildJobAssignees(
  assignee: Pick<UserRow, "id" | "name" | "role"> | null,
  extraMembers: Pick<UserRow, "id" | "name" | "role">[],
): JobAssigneeRef[] {
  const result: JobAssigneeRef[] = [];
  const seen = new Set<string>();
  if (assignee?.id && assignee.role === "user") {
    result.push({ id: assignee.id, name: assignee.name, role: assignee.role });
    seen.add(assignee.id);
  }
  for (const member of extraMembers) {
    if (member.role === "user" && !seen.has(member.id)) {
      result.push({ id: member.id, name: member.name, role: member.role });
      seen.add(member.id);
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function publicJob(
  job: JobRow,
  assignee: RefUser,
  supervisor: RefUser,
  assignees: JobAssigneeRef[] = [],
) {
  const now = new Date();
  const isOverdue =
    !!job.dueDate &&
    job.status !== "completed" &&
    job.status !== "cancelled" &&
    job.dueDate < now;
  const displayNumber = job.jobNumber?.trim() ? `JOB-${job.jobNumber.trim()}` : `JOB-${job.serial}`;
  const meta = parseJobMeta(job.description);
  return {
    id: job.id,
    number: displayNumber,
    title: job.title,
    client: job.client,
    address: job.address,
    description: job.description,
    checklist: meta.checklist,
    descriptionText: meta.descriptionText,
    status: job.status,
    priority: job.priority,
    progress: job.progress,
    isOverdue,
    assignee: userRef(assignee),
    assignees,
    supervisor: userRef(supervisor),
    dueDate: job.dueDate ? job.dueDate.toISOString() : null,
    reviewStartedAt: job.reviewStartedAt ? job.reviewStartedAt.toISOString() : null,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
