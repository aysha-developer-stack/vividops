import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  jobs,
  users,
  jobChecklistState,
  jobChecklistAttachments,
  type JobRow,
  type UserRow,
} from "@workspace/db";
import { createNotification } from "./notifications";
import type { NotificationType } from "./notifications";
import {
  createReworkWithErrorReport,
  markOpenReworksAwaitingReview,
  resolveJobReworks,
} from "./reworks";

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

type ChecklistTemplateItem = {
  text?: string;
  attachmentRequired?: boolean;
  fileRequired?: boolean;
  requiresFile?: boolean;
};

function parseJobChecklist(job: JobRow): ChecklistTemplateItem[] {
  try {
    const parsed = JSON.parse(typeof job.description === "string" ? job.description : "{}") as any;
    return Array.isArray(parsed?.checklist) ? parsed.checklist : [];
  } catch {
    return [];
  }
}

/** Workers must finish every checklist item (and required file uploads) before review. */
export async function assertWorkerChecklistReady(
  job: JobRow,
  workerUserId: string,
): Promise<string | null> {
  const list = parseJobChecklist(job);
  if (list.length === 0) {
    return "Checklist items are required before submitting this job.";
  }

  const rows = await db
    .select({ itemId: jobChecklistState.itemId, status: jobChecklistState.status })
    .from(jobChecklistState)
    .where(and(eq(jobChecklistState.jobId, job.id), eq(jobChecklistState.userId, workerUserId)));

  const byItem = new Map(rows.map((r) => [r.itemId, r.status]));
  const incomplete: number[] = [];
  const missingFiles: number[] = [];

  for (let i = 0; i < list.length; i++) {
    const itemId = i + 1;
    if (byItem.get(itemId) !== "completed") {
      incomplete.push(itemId);
    }
  }

  if (incomplete.length > 0) {
    return `Complete all checklist items before submitting (${incomplete.length} remaining).`;
  }

  const requiredIds = list
    .map((item, idx) => ({
      id: idx + 1,
      required: Boolean(item.attachmentRequired ?? item.fileRequired ?? item.requiresFile),
    }))
    .filter((x) => x.required)
    .map((x) => x.id);

  if (requiredIds.length > 0) {
    const uploaded = await db
      .select({ itemId: jobChecklistAttachments.itemId })
      .from(jobChecklistAttachments)
      .where(
        and(
          eq(jobChecklistAttachments.jobId, job.id),
          eq(jobChecklistAttachments.userId, workerUserId),
          inArray(jobChecklistAttachments.itemId, requiredIds),
        ),
      );
    const uploadedSet = new Set(uploaded.map((u) => u.itemId));
    for (const id of requiredIds) {
      if (!uploadedSet.has(id)) missingFiles.push(id);
    }
  }

  if (missingFiles.length > 0) {
    return "Upload the required checklist file(s) before submitting this job.";
  }

  return null;
}

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
  category?: string | null;
  comments?: string | null;
  dueAt?: string | null;
  severity?: string | null;
  canManage: boolean;
}): Promise<{ ok: true; nextStatus: ReviewableStatus } | { ok: false; status: number; error: string }> {
  const { actor, job, action, reason, category, comments, dueAt, severity, canManage } = opts;
  const isAssignee = job.assigneeId === actor.id;
  let nextStatus: ReviewableStatus;

  if (action === "submit_for_supervisor") {
    if (!isAssignee && !canManage) {
      return { ok: false, status: 403, error: "Only the assigned worker can submit for supervisor review" };
    }
    if (job.status === "completed" || job.status === "cancelled") {
      return { ok: false, status: 400, error: "This job cannot be submitted for review" };
    }
    const workerId = job.assigneeId ?? actor.id;
    const checklistError = await assertWorkerChecklistReady(job, workerId);
    if (checklistError) {
      return { ok: false, status: 400, error: checklistError };
    }
    await markOpenReworksAwaitingReview(job.id, workerId);
    nextStatus = "awaiting_supervisor";
  } else if (action === "supervisor_approve") {
    if (actor.role !== "supervisor" || !canManage) {
      return { ok: false, status: 403, error: "Only the job supervisor can approve for admin review" };
    }
    if (job.status === "rework") {
      return { ok: false, status: 400, error: "The worker must complete and resubmit the rework before approval" };
    }
    if (job.status !== "awaiting_supervisor" && job.status !== "in_progress") {
      return { ok: false, status: 400, error: "Job is not awaiting supervisor approval" };
    }
    await resolveJobReworks(job.id);
    nextStatus = "awaiting_admin";
  } else if (action === "admin_complete") {
    if (actor.role !== "admin" && actor.role !== "super-admin") {
      return { ok: false, status: 403, error: "Only admin or super-admin can complete the job" };
    }
    await resolveJobReworks(job.id);
    nextStatus = "completed";
  } else if (action === "rework") {
    if (!canManage) {
      return { ok: false, status: 403, error: "You cannot mark this job for rework" };
    }
    if (!reason?.trim()) {
      return { ok: false, status: 400, error: "Rework reason is required" };
    }
    try {
      await createReworkWithErrorReport({
        actor,
        job,
        reason,
        category,
        comments,
        dueAt,
        severity,
        source: "job_rework",
      });
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: err instanceof Error ? err.message : "Failed to create rework",
      };
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
