import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  jobAttachments,
  jobChecklistAttachments,
  jobReworks,
  users,
} from "@workspace/db";
import {
  ACTIVE_REWORK_STATUSES,
  findActiveReworkForCompletedUpload,
} from "./reworks";

type LinkedChecklistRow = {
  linkUserId: string;
  reworkId: string | null;
  fileCategory: string | null;
  uploaderRole: string | null;
};

function isCompletedAttachmentRow(r: {
  fileCategory: string | null;
  uploaderRole: string | null;
}): boolean {
  return (
    r.fileCategory === "completed" ||
    (!r.fileCategory && (r.uploaderRole === "user" || r.uploaderRole === "supervisor"))
  );
}

export async function findActiveJobLevelReworkId(
  jobId: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: jobReworks.id })
    .from(jobReworks)
    .where(
      and(
        eq(jobReworks.jobId, jobId),
        eq(jobReworks.userId, userId),
        isNull(jobReworks.checklistItemId),
        inArray(jobReworks.status, [...ACTIVE_REWORK_STATUSES]),
      ),
    )
    .orderBy(desc(jobReworks.cycleNumber))
    .limit(1);

  return row?.id ?? null;
}

export async function jobHasReworkCycleDeliverable(
  jobId: string,
  reworkId: string,
): Promise<boolean> {
  const rows = await db
    .select({
      reworkId: jobAttachments.reworkId,
      fileCategory: jobAttachments.fileCategory,
      uploaderRole: users.role,
      checklistLinkId: jobChecklistAttachments.id,
    })
    .from(jobAttachments)
    .innerJoin(users, eq(users.id, jobAttachments.uploadedById))
    .leftJoin(
      jobChecklistAttachments,
      eq(jobChecklistAttachments.attachmentId, jobAttachments.id),
    )
    .where(
      and(eq(jobAttachments.jobId, jobId), isNull(jobChecklistAttachments.id)),
    );

  return rows.some(
    (r) => isCompletedAttachmentRow(r) && r.reworkId === reworkId,
  );
}

function hasReworkChecklistUpload(
  linked: LinkedChecklistRow[],
  targetUserId: string,
  reworkId: string,
): boolean {
  return linked.some(
    (r) =>
      r.linkUserId === targetUserId &&
      isCompletedAttachmentRow(r) &&
      r.reworkId === reworkId,
  );
}

/** Enforces a fresh completed upload for the active rework cycle before mark-complete. */
export async function validateReworkUploadsBeforeChecklistComplete(opts: {
  jobId: string;
  targetUserId: string;
  itemId: number;
  currentItemStatus: string | null;
  linked: LinkedChecklistRow[];
}): Promise<string | null> {
  const { jobId, targetUserId, itemId, currentItemStatus, linked } = opts;

  const activeReworkId = await findActiveReworkForCompletedUpload({
    jobId,
    userId: targetUserId,
    checklistItemId: itemId,
  });

  const requiresReworkUpload =
    currentItemStatus === "rework" || activeReworkId != null;
  if (!requiresReworkUpload) return null;

  if (!activeReworkId) {
    return "This task is in rework but no active rework cycle was found. Ask your supervisor to resend rework.";
  }

  if (!hasReworkChecklistUpload(linked, targetUserId, activeReworkId)) {
    return "Upload a new completed checklist file for this rework cycle before marking this task complete.";
  }

  const jobLevelReworkId = await findActiveJobLevelReworkId(jobId, targetUserId);
  if (jobLevelReworkId) {
    const hasJobDeliverable = await jobHasReworkCycleDeliverable(jobId, jobLevelReworkId);
    if (!hasJobDeliverable) {
      return "Upload new completed files on the Files tab for this rework cycle before marking tasks complete.";
    }
  }

  return null;
}

/** Used when submitting the job for review after a rework cycle. */
export async function validateReworkUploadsBeforeJobSubmit(
  jobId: string,
  workerUserId: string,
  checklistItemIds: number[],
): Promise<string | null> {
  const jobLevelReworkId = await findActiveJobLevelReworkId(jobId, workerUserId);
  if (jobLevelReworkId) {
    const hasJobDeliverable = await jobHasReworkCycleDeliverable(jobId, jobLevelReworkId);
    if (!hasJobDeliverable) {
      return "Upload new completed files on the Files tab for this rework cycle before submitting.";
    }
  }

  for (const itemId of checklistItemIds) {
    const activeReworkId = await findActiveReworkForCompletedUpload({
      jobId,
      userId: workerUserId,
      checklistItemId: itemId,
    });
    if (!activeReworkId) continue;

    const linked = await db
      .select({
        linkUserId: jobChecklistAttachments.userId,
        reworkId: jobAttachments.reworkId,
        fileCategory: jobAttachments.fileCategory,
        uploaderRole: users.role,
      })
      .from(jobChecklistAttachments)
      .innerJoin(jobAttachments, eq(jobAttachments.id, jobChecklistAttachments.attachmentId))
      .leftJoin(users, eq(users.id, jobAttachments.uploadedById))
      .where(
        and(
          eq(jobChecklistAttachments.jobId, jobId),
          eq(jobChecklistAttachments.itemId, itemId),
        ),
      );

    if (!hasReworkChecklistUpload(linked, workerUserId, activeReworkId)) {
      return `Upload a new completed checklist for task #${itemId} (rework cycle) before submitting.`;
    }
  }

  return null;
}
