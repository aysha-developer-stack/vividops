import type { JobRow, UserRow } from "@workspace/db";
import { isFieldWorkerOnJob } from "./working-supervisor";

export type AttachmentFileCategory = "job" | "completed" | "review";

export type ParsedAttachmentUpload = {
  checklistItemId: number;
  isChecklistCompletedUpload: boolean;
  isChecklistInstructionUpload: boolean;
  treatAsFieldWorker: boolean;
  fileCategory: AttachmentFileCategory;
  reviewNoteId: string | null;
  suppressNotifications: boolean;
};

export function buildJobAttachmentFolder(jobRow: JobRow, fileCategory: AttachmentFileCategory): string {
  const jobSlug = String(jobRow.title ?? "job")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 60) || "job";
  const jobFolder = `JOB-${jobRow.serial}-${jobSlug}`;
  const subfolder =
    fileCategory === "completed"
      ? "completed-files"
      : fileCategory === "review"
        ? "review-photos"
        : "job-files";
  return `jobs/${jobFolder}/${subfolder}`;
}

export function parseAttachmentUploadBody(
  actor: UserRow,
  jobRow: JobRow,
  body: Record<string, unknown>,
): ParsedAttachmentUpload {
  const checklistRaw = body.checklistItemId;
  const checklistItemId =
    typeof checklistRaw === "number"
      ? checklistRaw
      : typeof checklistRaw === "string"
        ? Number(checklistRaw)
        : NaN;

  const uploadKind =
    typeof body.uploadKind === "string" ? body.uploadKind.trim().toLowerCase() : "";
  const isChecklistCompletedUpload =
    Number.isFinite(checklistItemId) && checklistItemId > 0 && uploadKind === "checklist-completed";
  const isChecklistInstructionUpload =
    Number.isFinite(checklistItemId) &&
    checklistItemId > 0 &&
    actor.role !== "user" &&
    !isChecklistCompletedUpload;

  const categoryRaw =
    typeof body.fileCategory === "string" ? body.fileCategory.trim().toLowerCase() : "";
  const treatAsFieldWorker = isFieldWorkerOnJob(actor, jobRow);

  const fileCategory: AttachmentFileCategory =
    categoryRaw === "review"
      ? "review"
      : categoryRaw === "completed"
        ? "completed"
        : categoryRaw === "job"
          ? "job"
          : treatAsFieldWorker
            ? "completed"
            : "job";

  const reviewNoteRaw = body.reviewNoteId;
  const reviewNoteId =
    typeof reviewNoteRaw === "string" && reviewNoteRaw.trim().length > 0
      ? reviewNoteRaw.trim()
      : null;

  const suppressNotifications =
    String(body.suppressNotifications ?? "").toLowerCase() === "true" ||
    fileCategory === "review";

  return {
    checklistItemId: Number.isFinite(checklistItemId) ? checklistItemId : 0,
    isChecklistCompletedUpload,
    isChecklistInstructionUpload,
    treatAsFieldWorker,
    fileCategory,
    reviewNoteId,
    suppressNotifications,
  };
}

export function storageKeyMatchesJobFolder(storageKey: string, bucketFolder: string): boolean {
  const normalizedFolder = bucketFolder.replace(/\/+$/, "");
  return storageKey === normalizedFolder || storageKey.startsWith(`${normalizedFolder}/`);
}
