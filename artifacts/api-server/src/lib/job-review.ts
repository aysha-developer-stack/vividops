import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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

export function jobStatusPatchFields(opts: {
  nextStatus: ReviewableStatus;
  previousStatus?: string;
  currentProgress?: number;
  checker?: { id: string; name: string; role: string } | null;
}) {
  const { nextStatus, previousStatus, currentProgress = 0, checker } = opts;
  const now = new Date();
  const patch: {
    status: ReviewableStatus;
    updatedAt: Date;
    completedAt?: Date | null;
    reviewStartedAt?: Date | null;
    checkedById?: string | null;
    checkedByLabel?: string | null;
    checkedAt?: Date | null;
    progress?: number;
  } = {
    status: nextStatus,
    updatedAt: now,
  };

  const applyChecker = () => {
    if (!checker) return;
    patch.checkedById = checker.id;
    patch.checkedByLabel = `${checker.name} · ${checker.role}`;
    patch.checkedAt = now;
  };

  if (nextStatus === "completed") {
    patch.completedAt = now;
    patch.reviewStartedAt = null;
    patch.progress = 100;
    applyChecker();
    return patch;
  }

  if (nextStatus === "awaiting_supervisor") {
    patch.completedAt = null;
    if (previousStatus !== "awaiting_supervisor") {
      patch.reviewStartedAt = now;
    }
    return patch;
  }

  if (nextStatus === "awaiting_admin") {
    patch.completedAt = null;
    patch.reviewStartedAt = null;
    applyChecker();
    return patch;
  }

  if (nextStatus === "rework") {
    patch.completedAt = null;
    patch.reviewStartedAt = null;
    patch.checkedById = null;
    patch.checkedByLabel = null;
    patch.checkedAt = null;
    patch.progress = 0;
    return patch;
  }

  patch.completedAt = null;
  if (nextStatus === "in_progress" || nextStatus === "pending") {
    patch.progress = currentProgress;
  }
  return patch;
}

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

  const requiredIds = list.map((_item, idx) => idx + 1);

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

async function reopenChecklistForRework(job: JobRow, workerUserId: string, reason: string) {
  const list = parseJobChecklist(job);
  if (list.length === 0) return;

  for (let i = 0; i < list.length; i++) {
    const itemId = i + 1;
    await db
      .insert(jobChecklistState)
      .values({
        id: randomUUID(),
        jobId: job.id,
        userId: workerUserId,
        itemId,
        status: "rework",
        reworkReason: reason,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [jobChecklistState.jobId, jobChecklistState.userId, jobChecklistState.itemId],
        set: {
          status: "rework",
          reworkReason: reason,
          updatedAt: new Date(),
        },
      });
  }
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
    const approvedBySupervisor = actor.role === "supervisor";
    await notifyJobAdmins({
      jobId: job.id,
      title: `Ready for Admin Review: ${job.title}`,
      description: approvedBySupervisor
        ? `${actor.name} approved ${job.title}. Please complete the job or send for rework.`
        : `${actor.name} forwarded ${job.title} for admin completion.`,
      type: "updated",
      excludeUserId: actor.id,
    });
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: approvedBySupervisor ? `Supervisor Approved: ${job.title}` : `Approved for Admin: ${job.title}`,
        description: approvedBySupervisor
          ? `Your supervisor approved ${job.title}. It is now awaiting admin completion.`
          : `${actor.name} approved ${job.title}. It is now awaiting admin completion.`,
        type: "updated",
      });
    }
  }

  if (nextStatus === "completed") {
    const coveredSupervisor =
      (actor.role === "admin" || actor.role === "super-admin") &&
      (previousStatus === "awaiting_supervisor" || previousStatus === "in_progress");
    const completeMsg = coveredSupervisor
      ? `${job.title} was checked and completed by ${actor.name} (covering supervisor review).`
      : `${job.title} has been marked completed by ${actor.name}.`;
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: coveredSupervisor ? `Checked & Completed: ${job.title}` : `Job Completed: ${job.title}`,
        description: completeMsg,
        type: "completed",
      });
    }
    if (job.supervisorId && job.supervisorId !== actor.id) {
      await createNotification({
        userId: job.supervisorId,
        jobId: job.id,
        title: coveredSupervisor ? `Cover Check Completed: ${job.title}` : `Job Completed: ${job.title}`,
        description: coveredSupervisor
          ? `${actor.name} checked and completed ${job.title} while covering supervisor review.`
          : `${job.title} was completed by ${actor.name}.`,
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
    const canApprove =
      (actor.role === "supervisor" && canManage) ||
      actor.role === "admin" ||
      actor.role === "super-admin";
    if (!canApprove) {
      return { ok: false, status: 403, error: "Only the job supervisor, admin, or super-admin can approve this review" };
    }
    if (job.status === "rework") {
      return { ok: false, status: 400, error: "The worker must complete and resubmit the rework before approval" };
    }
    if (job.status !== "awaiting_supervisor" && job.status !== "in_progress") {
      return { ok: false, status: 400, error: "Job is not awaiting supervisor approval" };
    }
    // Admin/super-admin covering supervisor: complete directly (no second approval hop).
    if (actor.role === "admin" || actor.role === "super-admin") {
      await resolveJobReworks(job.id);
      nextStatus = "completed";
    } else {
      await resolveJobReworks(job.id);
      nextStatus = "awaiting_admin";
    }
  } else if (action === "admin_complete") {
    if (actor.role !== "admin" && actor.role !== "super-admin") {
      return { ok: false, status: 403, error: "Only admin or super-admin can complete the job" };
    }
    if (job.status === "rework") {
      return { ok: false, status: 400, error: "The worker must complete and resubmit the rework before completion" };
    }
    if (job.status === "cancelled") {
      return { ok: false, status: 400, error: "Cancelled jobs cannot be completed" };
    }
    await resolveJobReworks(job.id);
    nextStatus = "completed";
  } else if (action === "rework") {
    const canRework =
      actor.role === "admin" ||
      actor.role === "super-admin" ||
      (actor.role === "supervisor" && canManage);
    if (!canRework) {
      return { ok: false, status: 403, error: "Only supervisor, admin, or super-admin can mark this job for rework" };
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
      if (job.assigneeId) {
        await reopenChecklistForRework(job, job.assigneeId, reason.trim());
      }
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
  const shouldRecordChecker =
    nextStatus === "awaiting_admin" || nextStatus === "completed";
  await db
    .update(jobs)
    .set(
      jobStatusPatchFields({
        nextStatus,
        previousStatus,
        currentProgress: job.progress,
        checker: shouldRecordChecker
          ? { id: actor.id, name: actor.name, role: actor.role }
          : null,
      }),
    )
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
