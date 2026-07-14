import { eq, inArray } from "drizzle-orm";
import { db, jobs, users, type JobRow, type UserRow } from "@workspace/db";
import { createNotification } from "./notifications";
import type { NotificationType } from "./notifications";

export type JobReviewAction =
  | "submit_for_supervisor"
  | "supervisor_approve"
  | "admin_complete"
  | "rework";

export type ReviewableStatus =
  | "pending"
  | "in_progress"
  | "awaiting_supervisor"
  | "awaiting_admin"
  | "completed"
  | "cancelled"
  | "rework";

/** Map a raw "completed" request into the correct stage for the actor's role. */
export function coerceCompletionStatus(
  actor: UserRow,
  isManager: boolean,
): ReviewableStatus {
  if (!isManager || actor.role === "user") return "awaiting_supervisor";
  if (actor.role === "supervisor") return "awaiting_admin";
  return "completed";
}

export async function notifyJobAdmins(opts: {
  jobId: string;
  title: string;
  description: string;
  type: NotificationType;
  excludeUserId?: string | null;
}) {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "super-admin"]));
  for (const admin of admins) {
    if (opts.excludeUserId && admin.id === opts.excludeUserId) continue;
    await createNotification({
      userId: admin.id,
      jobId: opts.jobId,
      title: opts.title,
      description: opts.description,
      type: opts.type,
    });
  }
}

export async function notifyStatusTransition(opts: {
  actor: UserRow;
  job: JobRow;
  previousStatus: string;
  nextStatus: ReviewableStatus;
  reason?: string | null;
}) {
  const { actor, job, previousStatus, nextStatus, reason } = opts;
  if (previousStatus === nextStatus) return;

  if (nextStatus === "awaiting_supervisor") {
    if (job.supervisorId) {
      await createNotification({
        userId: job.supervisorId,
        jobId: job.id,
        title: `Ready for Supervisor Review: ${job.title}`,
        description: `${actor.name} finished work on ${job.title}. Please review and approve or send for rework.`,
        type: "checklist",
      });
    }
    if (job.assigneeId && job.assigneeId !== actor.id) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: `Submitted for Review: ${job.title}`,
        description: `Your work on ${job.title} was submitted for supervisor review.`,
        type: "checklist",
      });
    }
  }

  if (nextStatus === "awaiting_admin") {
    await notifyJobAdmins({
      jobId: job.id,
      title: `Ready for Admin Review: ${job.title}`,
      description: `${actor.name} approved ${job.title}. Please complete the job or send for rework.`,
      type: "updated",
      excludeUserId: actor.id,
    });
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: `Supervisor Approved: ${job.title}`,
        description: `Your supervisor approved ${job.title}. It is now awaiting admin completion.`,
        type: "updated",
      });
    }
  }

  if (nextStatus === "completed") {
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: `Job Completed: ${job.title}`,
        description: `${job.title} has been marked completed by ${actor.name}.`,
        type: "completed",
      });
    }
    if (job.supervisorId && job.supervisorId !== actor.id) {
      await createNotification({
        userId: job.supervisorId,
        jobId: job.id,
        title: `Job Completed: ${job.title}`,
        description: `${job.title} was completed by ${actor.name}.`,
        type: "completed",
      });
    }
  }

  if (nextStatus === "rework") {
    const reasonText = reason?.trim() ? ` Reason: ${reason.trim()}` : "";
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: `Rework Required: ${job.title}`,
        description: `${actor.name} sent ${job.title} back for rework.${reasonText}`,
        type: "rework",
      });
    }
    if (job.supervisorId && job.supervisorId !== actor.id && actor.role !== "supervisor") {
      await createNotification({
        userId: job.supervisorId,
        jobId: job.id,
        title: `Rework Flagged: ${job.title}`,
        description: `${actor.name} sent ${job.title} back for rework.${reasonText}`,
        type: "rework",
      });
    }
  }
}

export async function applyJobReview(opts: {
  actor: UserRow;
  job: JobRow;
  action: JobReviewAction;
  reason?: string | null;
  canManage: boolean;
}): Promise<{ ok: true; nextStatus: ReviewableStatus } | { ok: false; status: number; error: string }> {
  const { actor, job, action, reason, canManage } = opts;
  const isAssignee = job.assigneeId === actor.id;
  let nextStatus: ReviewableStatus;

  if (action === "submit_for_supervisor") {
    if (!isAssignee && !canManage) {
      return { ok: false, status: 403, error: "Only the assigned worker can submit for supervisor review" };
    }
    if (job.status === "completed" || job.status === "cancelled") {
      return { ok: false, status: 400, error: "This job cannot be submitted for review" };
    }
    nextStatus = "awaiting_supervisor";
  } else if (action === "supervisor_approve") {
    if (actor.role !== "supervisor" || !canManage) {
      return { ok: false, status: 403, error: "Only the job supervisor can approve for admin review" };
    }
    if (job.status !== "awaiting_supervisor" && job.status !== "in_progress" && job.status !== "rework") {
      return { ok: false, status: 400, error: "Job is not awaiting supervisor approval" };
    }
    nextStatus = "awaiting_admin";
  } else if (action === "admin_complete") {
    if (actor.role !== "admin" && actor.role !== "super-admin") {
      return { ok: false, status: 403, error: "Only admin or super-admin can complete the job" };
    }
    nextStatus = "completed";
  } else if (action === "rework") {
    if (!canManage) {
      return { ok: false, status: 403, error: "You cannot mark this job for rework" };
    }
    nextStatus = "rework";
  } else {
    return { ok: false, status: 400, error: "Invalid review action" };
  }

  const previousStatus = job.status;
  await db
    .update(jobs)
    .set({
      status: nextStatus as any,
      completedAt: nextStatus === "completed" ? new Date() : null,
      progress: nextStatus === "completed" ? 100 : job.progress,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));

  await notifyStatusTransition({
    actor,
    job,
    previousStatus,
    nextStatus,
    reason,
  });

  return { ok: true, nextStatus };
}
