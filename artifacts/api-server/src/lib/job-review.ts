import { and, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  jobs,
  users,
  jobAttachments,
  jobChecklistState,
  jobChecklistAttachments,
  jobNotes,
  sql,
  type JobRow,
  type UserRow,
} from "@workspace/db";
import { createNotification, notifyJobManagers, notifyAllJobMembers, notifyAdminsOnly, notifySuperAdminsOnly, previewText, type NotificationType } from "./notifications";
import { reworkOriginLabel, resolveReworkOriginForActor, type ReworkOrigin } from "./rework-origin";
import {
  createRework,
  markOpenReworksAwaitingReview,
  resolveJobReworks,
} from "./reworks";
import { validateReworkUploadsBeforeJobSubmit } from "./rework-completion-validation";
import { finalizeReviewCheckForJob } from "./persist-review-check-session";
import { announceCliqJobStatusChange } from "./cliq-job-status";
import {
  shouldAutoStopWorkerTimersForJobStatus,
  stopAllActiveTimersOnJob,
  clearAllActiveTimersOnJob,
} from "./persist-timer-session";
import { resolveReworkUserId } from "./working-supervisor";

const COMPLETION_NOTE_LABELS: Record<JobReviewAction, string | null> = {
  submit_for_supervisor: "Worker submission",
  supervisor_approve: "Supervisor review",
  admin_complete: "Admin completion",
  rework: null,
  resume_from_hold: null,
};

async function ensureJobNotesTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text text NOT NULL,
      note_type text NOT NULL DEFAULT 'general',
      pinned boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function recordCompletionComment(opts: {
  jobId: string;
  actor: UserRow;
  comment: string | null | undefined;
  action: JobReviewAction;
  hasPhotos?: boolean;
}): Promise<{ noteId: string; text: string } | null> {
  const trimmed = opts.comment?.trim() ?? "";
  const label = COMPLETION_NOTE_LABELS[opts.action];
  if (!label) return trimmed ? { noteId: "", text: trimmed } : null;

  const body = trimmed || (opts.hasPhotos ? "(Photos attached)" : "");
  if (!body) return null;

  await ensureJobNotesTable();
  const noteId = randomUUID();
  await db.insert(jobNotes).values({
    id: noteId,
    jobId: opts.jobId,
    userId: opts.actor.id,
    text: `${label}: ${body}`,
    noteType: "completion",
  });
  return { noteId, text: body };
}

function commentNotificationSuffix(comments: string | null | undefined): string {
  const trimmed = comments?.trim();
  if (!trimmed) return "";
  return ` Note: ${previewText(trimmed, 220)}`;
}

export type JobReviewAction =
  | "submit_for_supervisor"
  | "supervisor_approve"
  | "admin_complete"
  | "rework"
  | "resume_from_hold";

export type ReviewableStatus =
  | "pending"
  | "in_progress"
  | "awaiting_supervisor"
  | "awaiting_admin"
  | "awaiting_super_admin"
  | "completed"
  | "cancelled"
  | "rework"
  | "on_hold";

const RESUMABLE_STATUSES = new Set<ReviewableStatus>([
  "pending",
  "in_progress",
  "awaiting_supervisor",
  "awaiting_admin",
  "awaiting_super_admin",
  "rework",
]);

export function resolveResumeStatus(job: Pick<JobRow, "heldFromStatus" | "progress">): ReviewableStatus {
  const held = job.heldFromStatus as ReviewableStatus | null | undefined;
  if (held && RESUMABLE_STATUSES.has(held)) return held;
  return (job.progress ?? 0) > 0 ? "in_progress" : "pending";
}

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
    heldFromStatus?: string | null;
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
    patch.reviewStartedAt = null;
    return patch;
  }

  if (nextStatus === "awaiting_admin") {
    patch.completedAt = null;
    patch.reviewStartedAt = null;
    applyChecker();
    return patch;
  }

  if (nextStatus === "awaiting_super_admin") {
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

  if (nextStatus === "on_hold") {
    patch.completedAt = null;
    if (previousStatus && previousStatus !== "on_hold") {
      patch.heldFromStatus = previousStatus;
    }
    return patch;
  }

  if (previousStatus === "on_hold") {
    patch.heldFromStatus = null;
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

/** Job-level completed deliverables (Files tab, not checklist-linked). */
export async function jobHasCompletedDeliverables(jobId: string): Promise<boolean> {
  const rows = await db
    .select({
      id: jobAttachments.id,
      fileCategory: jobAttachments.fileCategory,
      uploaderRole: users.role,
    })
    .from(jobAttachments)
    .innerJoin(users, eq(users.id, jobAttachments.uploadedById))
    .leftJoin(jobChecklistAttachments, eq(jobChecklistAttachments.attachmentId, jobAttachments.id))
    .where(
      and(
        eq(jobAttachments.jobId, jobId),
        isNull(jobChecklistAttachments.attachmentId),
      ),
    );

  return rows.some(
    (r) =>
      r.fileCategory === "completed" ||
      (!r.fileCategory && (r.uploaderRole === "user" || r.uploaderRole === "supervisor")),
  );
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
  const missingChecklist: number[] = [];
  const missingCompletedChecklist: number[] = [];

  if (requiredIds.length > 0) {
    const linked = await db
      .select({
        itemId: jobChecklistAttachments.itemId,
        linkUserId: jobChecklistAttachments.userId,
        uploaderId: jobAttachments.uploadedById,
        uploaderRole: users.role,
        fileCategory: jobAttachments.fileCategory,
      })
      .from(jobChecklistAttachments)
      .innerJoin(jobAttachments, eq(jobAttachments.id, jobChecklistAttachments.attachmentId))
      .leftJoin(users, eq(users.id, jobAttachments.uploadedById))
      .where(
        and(
          eq(jobChecklistAttachments.jobId, job.id),
          eq(jobChecklistAttachments.userId, workerUserId),
          inArray(jobChecklistAttachments.itemId, requiredIds),
        ),
      );

    for (const id of requiredIds) {
      const itemLinked = linked.filter((r) => r.itemId === id);
      const instructionLinked = await db
        .select({
          uploaderRole: users.role,
          fileCategory: jobAttachments.fileCategory,
        })
        .from(jobChecklistAttachments)
        .innerJoin(jobAttachments, eq(jobAttachments.id, jobChecklistAttachments.attachmentId))
        .leftJoin(users, eq(users.id, jobAttachments.uploadedById))
        .where(
          and(eq(jobChecklistAttachments.jobId, job.id), eq(jobChecklistAttachments.itemId, id)),
        );
      const hasChecklist = instructionLinked.some((r) => r.uploaderRole != null && r.uploaderRole !== "user");
      if (!hasChecklist) missingChecklist.push(id);
      const hasCompletedUpload = itemLinked.some(
        (r) =>
          r.fileCategory === "completed" ||
          (!r.fileCategory && (r.uploaderRole === "user" || r.uploaderRole === "supervisor")),
      );
      if (!hasCompletedUpload) missingCompletedChecklist.push(id);
    }
  }

  if (missingChecklist.length > 0) {
    return `Checklist file not uploaded for ${missingChecklist.length} item(s). Word/PDF checklist files are required.`;
  }
  if (missingCompletedChecklist.length > 0) {
    return `Completed checklist not uploaded for ${missingCompletedChecklist.length} item(s). Upload Word/PDF completed checklists before submitting.`;
  }

  const reworkSubmitError = await validateReworkUploadsBeforeJobSubmit(
    job.id,
    workerUserId,
    requiredIds,
  );
  if (reworkSubmitError) {
    return reworkSubmitError;
  }

  const hasJobCompletedFiles = await jobHasCompletedDeliverables(job.id);
  if (!hasJobCompletedFiles) {
    return "Completed files not uploaded. Upload completed deliverables on the Files tab before submitting.";
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
  if (actor.role === "admin") return "awaiting_super_admin";
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
  comments?: string | null;
  reworkOrigin?: ReworkOrigin | null;
}) {
  const { actor, job, previousStatus, nextStatus, reason, comments, reworkOrigin } = opts;
  if (previousStatus === nextStatus) return;

  const commentSuffix = commentNotificationSuffix(comments);

  if (nextStatus === "awaiting_supervisor") {
    if (job.assigneeId && job.assigneeId !== actor.id) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: `Submitted for Review: ${job.title}`,
        description: `Your work on ${job.title} was submitted for supervisor review.${commentSuffix}`,
        type: "checklist",
      });
    }
    await notifyJobManagers({
      jobId: job.id,
      supervisorId: job.supervisorId,
      actorId: actor.id,
      title: `Ready for Supervisor Review: ${job.title}`,
      description: `${actor.name} finished work on ${job.title}. Please review and approve or send for rework.${commentSuffix}`,
      type: "checklist",
    });
    void announceCliqJobStatusChange({
      job,
      actor,
      event: "awaiting_supervisor",
      previousStatus,
      comments,
    });
  }

  if (nextStatus === "awaiting_admin") {
    const approvedBySupervisor = actor.role === "supervisor";
    await notifyAdminsOnly({
      jobId: job.id,
      actorId: actor.id,
      title: `Ready for Admin Review: ${job.title}`,
      description: approvedBySupervisor
        ? `${actor.name} approved ${job.title}. Please review and forward to super admin or send for rework.${commentSuffix}`
        : `${actor.name} forwarded ${job.title} for admin review.${commentSuffix}`,
      type: "updated",
    });
    if (job.supervisorId && job.supervisorId !== actor.id) {
      await createNotification({
        userId: job.supervisorId,
        jobId: job.id,
        title: `Ready for Admin Review: ${job.title}`,
        description: approvedBySupervisor
          ? `You approved ${job.title}. It is now with admin for review.${commentSuffix}`
          : `${actor.name} forwarded ${job.title} for admin review.${commentSuffix}`,
        type: "updated",
      });
    }
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: approvedBySupervisor ? `Supervisor Approved: ${job.title}` : `Approved for Admin: ${job.title}`,
        description: approvedBySupervisor
          ? `Your supervisor approved ${job.title}. It is now awaiting admin review.${commentSuffix}`
          : `${actor.name} approved ${job.title}. It is now awaiting admin review.${commentSuffix}`,
        type: "updated",
      });
    }
    void announceCliqJobStatusChange({
      job,
      actor,
      event: "awaiting_admin",
      previousStatus,
      comments,
    });
  }

  if (nextStatus === "awaiting_super_admin") {
    await notifySuperAdminsOnly({
      jobId: job.id,
      actorId: actor.id,
      title: `Ready for Super Admin: ${job.title}`,
      description: `${actor.name} reviewed ${job.title}. Please complete the job or send for rework.${commentSuffix}`,
      type: "updated",
    });
    if (job.supervisorId && job.supervisorId !== actor.id) {
      await createNotification({
        userId: job.supervisorId,
        jobId: job.id,
        title: `Admin Reviewed: ${job.title}`,
        description: `${actor.name} sent ${job.title} to super admin for final completion.${commentSuffix}`,
        type: "updated",
      });
    }
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: `Admin Reviewed: ${job.title}`,
        description: `Admin reviewed ${job.title}. It is now awaiting super admin final completion.${commentSuffix}`,
        type: "updated",
      });
    }
    void announceCliqJobStatusChange({
      job,
      actor,
      event: "awaiting_super_admin",
      previousStatus,
      comments,
    });
  }

  if (nextStatus === "completed") {
    const completeMsg = `${job.title} has been marked completed by ${actor.name}.` + commentSuffix;
    const completeTitle = `Job Completed: ${job.title}`;

    await notifyAllJobMembers({
      jobId: job.id,
      assigneeId: job.assigneeId,
      supervisorId: job.supervisorId,
      actorId: actor.id,
      title: completeTitle,
      description: completeMsg,
      type: "completed",
    });
    await notifyJobManagers({
      jobId: job.id,
      supervisorId: job.supervisorId,
      actorId: actor.id,
      title: completeTitle,
      description: completeMsg,
      type: "completed",
    });
    if (actor.role === "super-admin") {
      void announceCliqJobStatusChange({
        job,
        actor,
        event: "completed",
        previousStatus,
        comments,
      });
    }
  }

  if (nextStatus === "rework") {
    const reasonText = reason?.trim() ? ` Reason: ${reason.trim()}` : "";
    const commentText = comments?.trim() ? ` Comments: ${comments.trim()}` : "";
    const originLabel = reworkOriginLabel(reworkOrigin ?? null);
    const originPrefix = originLabel ? `${originLabel}: ` : "";
    const notifyTitle = `${originPrefix}Rework Required: ${job.title}`;
    const notifyDesc = (name: string) =>
      `${name} marked ${job.title} for rework.${reasonText}${commentText}`;

    if (reworkOrigin) {
      await notifyAllJobMembers({
        jobId: job.id,
        assigneeId: job.assigneeId,
        supervisorId: job.supervisorId,
        actorId: actor.id,
        title: notifyTitle,
        description: notifyDesc(actor.name),
        type: "rework",
      });
    } else {
      const reworkUserId = resolveReworkUserId(job);
      if (reworkUserId) {
        await createNotification({
          userId: reworkUserId,
          jobId: job.id,
          title: `Rework Required: ${job.title}`,
          description: `${actor.name} sent ${job.title} back for rework.${reasonText}${commentText}`,
          type: "rework",
        });
      }
      await notifyJobManagers({
        jobId: job.id,
        supervisorId: job.supervisorId,
        actorId: actor.id,
        title: `Rework on ${job.title}`,
        description: `${actor.name} marked ${job.title} for rework.${reasonText}${commentText}`,
        type: "rework",
      });
    }
    void announceCliqJobStatusChange({
      job,
      actor,
      event: "rework",
      previousStatus,
      reason,
      comments,
      reworkOrigin: reworkOrigin ?? null,
    });
  }

  if (nextStatus === "on_hold") {
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: `Job On Hold: ${job.title}`,
        description: `${actor.name} put ${job.title} on hold.`,
        type: "updated",
      });
    }
    await notifyJobManagers({
      jobId: job.id,
      supervisorId: job.supervisorId,
      actorId: actor.id,
      title: `Job On Hold: ${job.title}`,
      description: `${actor.name} put ${job.title} on hold.`,
      type: "updated",
    });
  }

  if (previousStatus === "on_hold" && nextStatus !== "on_hold") {
    if (job.assigneeId) {
      await createNotification({
        userId: job.assigneeId,
        jobId: job.id,
        title: `Job Resumed: ${job.title}`,
        description: `${actor.name} resumed work on ${job.title}.`,
        type: "updated",
      });
    }
    await notifyJobManagers({
      jobId: job.id,
      supervisorId: job.supervisorId,
      actorId: actor.id,
      title: `Job Resumed: ${job.title}`,
      description: `${actor.name} resumed work on ${job.title}.`,
      type: "updated",
    });
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
  hasPhotos?: boolean;
  reworkOrigin?: ReworkOrigin | null;
}): Promise<
  | { ok: true; nextStatus: ReviewableStatus; completionNoteId: string | null; reworkId: string | null }
  | { ok: false; status: number; error: string }
> {
  const { actor, job, action, reason, category, comments, dueAt, severity, canManage, hasPhotos, reworkOrigin: reworkOriginRaw } = opts;
  const isAssignee = job.assigneeId === actor.id;
  let nextStatus: ReviewableStatus;
  let createdReworkId: string | null = null;
  let appliedReworkOrigin: ReworkOrigin | null = null;

  if (action === "submit_for_supervisor") {
    if (!isAssignee && !canManage) {
      return { ok: false, status: 403, error: "Only the assigned worker can submit for supervisor review" };
    }
    if (job.status === "on_hold") {
      return { ok: false, status: 400, error: "Job is on hold — resume work before submitting for review" };
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
    await resolveJobReworks(job.id);
    nextStatus = "awaiting_admin";
  } else if (action === "admin_complete") {
    if (job.status === "rework") {
      return { ok: false, status: 400, error: "The worker must complete and resubmit the rework before completion" };
    }
    if (job.status === "cancelled") {
      return { ok: false, status: 400, error: "Cancelled jobs cannot be completed" };
    }
    if (actor.role === "admin") {
      if (job.status !== "awaiting_admin") {
        return { ok: false, status: 400, error: "Job must be awaiting admin review before sending to super admin" };
      }
      await resolveJobReworks(job.id);
      nextStatus = "awaiting_super_admin";
    } else if (actor.role === "super-admin") {
      if (job.status !== "awaiting_super_admin") {
        return { ok: false, status: 400, error: "Job must be awaiting super admin approval before final completion" };
      }
      await resolveJobReworks(job.id);
      nextStatus = "completed";
    } else {
      return { ok: false, status: 403, error: "Only admin or super-admin can complete the job" };
    }
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
    const { origin: reworkOrigin, error: originError } = resolveReworkOriginForActor(actor, reworkOriginRaw);
    if (originError) {
      return { ok: false, status: 400, error: originError };
    }
    appliedReworkOrigin = reworkOrigin;
    await clearAllActiveTimersOnJob(job.id);
    try {
      const { rework } = await createRework({
        actor,
        job,
        reason,
        category,
        comments,
        dueAt,
        severity,
        source: "job_rework",
        reworkOrigin,
      });
      createdReworkId = rework.id;
      const reworkUserId = resolveReworkUserId(job);
      if (reworkUserId) {
        await reopenChecklistForRework(job, reworkUserId, reason.trim());
      }
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: err instanceof Error ? err.message : "Failed to create rework",
      };
    }
    nextStatus = "rework";
  } else if (action === "resume_from_hold") {
    if (!canManage && actor.role !== "admin" && actor.role !== "super-admin") {
      return { ok: false, status: 403, error: "Only supervisor, admin, or super-admin can resume a job on hold" };
    }
    if (job.status !== "on_hold") {
      return { ok: false, status: 400, error: "Job is not on hold" };
    }
    nextStatus = resolveResumeStatus(job);
  } else {
    return { ok: false, status: 400, error: "Invalid review action" };
  }

  const previousStatus = job.status;
  const shouldRecordChecker =
    nextStatus === "awaiting_admin" ||
    nextStatus === "awaiting_super_admin" ||
    (nextStatus === "completed" && !job.checkedById);

  const savedComment = await recordCompletionComment({
    jobId: job.id,
    actor,
    comment: comments,
    action,
    hasPhotos,
  });

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

  if (previousStatus === "awaiting_supervisor" && nextStatus !== "awaiting_supervisor") {
    await finalizeReviewCheckForJob(job.id, job.supervisorId ?? undefined);
  }

  if (shouldAutoStopWorkerTimersForJobStatus(nextStatus)) {
    await stopAllActiveTimersOnJob(job.id);
  }

  await notifyStatusTransition({
    actor,
    job,
    previousStatus,
    nextStatus,
    reason,
    comments: savedComment?.text ?? comments,
    reworkOrigin: appliedReworkOrigin,
  });

  return { ok: true, nextStatus, completionNoteId: savedComment?.noteId ?? null, reworkId: createdReworkId };
}
