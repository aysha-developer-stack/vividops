export type AttachmentFileCategory = "job" | "completed" | "review" | "rework";

export function isReviewAttachment(a: { fileCategory?: string | null }): boolean {
  return a.fileCategory === "review";
}

export function isReworkAttachment(a: { fileCategory?: string | null }): boolean {
  return a.fileCategory === "rework";
}

export function isCompletedAttachment(a: {
  fileCategory?: string | null;
  uploadedBy?: { role?: string | null } | null;
}): boolean {
  if (isReworkAttachment(a)) return false;
  if (a.fileCategory === "completed") return true;
  if (a.fileCategory === "job") return false;
  return (a.uploadedBy?.role ?? "supervisor") === "user";
}

export function isJobAttachment(a: {
  fileCategory?: string | null;
  uploadedBy?: { role?: string | null } | null;
}): boolean {
  if (isReviewAttachment(a)) return false;
  if (isReworkAttachment(a)) return false;
  return !isCompletedAttachment(a);
}

export function isReworkCompletedAttachment(a: {
  fileCategory?: string | null;
  reworkId?: string | null;
  uploadedBy?: { role?: string | null } | null;
}): boolean {
  return isCompletedAttachment(a) && Boolean(a.reworkId);
}

export function completedAttachmentStatusLabel(a: {
  fileCategory?: string | null;
  reworkId?: string | null;
  uploadedBy?: { role?: string | null } | null;
}, cycleNumber?: number | null): { label: string; tone: "submitted" | "rework" } {
  if (isReworkCompletedAttachment(a)) {
    const cycle = cycleNumber != null ? ` #${cycleNumber}` : "";
    return { label: `Rework completed${cycle}`, tone: "rework" };
  }
  return { label: "Submitted", tone: "submitted" };
}

export function checklistItemHasCompletedUpload(
  files:
    | Array<{
        fileCategory?: string | null;
        reworkId?: string | null;
        uploadedBy?: { role?: string | null } | null;
      }>
    | undefined,
  opts?: { activeReworkId?: string | null },
): boolean {
  const completed = (files ?? []).filter((f) =>
    isCompletedAttachment({ fileCategory: f.fileCategory, uploadedBy: f.uploadedBy }),
  );
  if (opts?.activeReworkId) {
    return completed.some((f) => f.reworkId === opts.activeReworkId);
  }
  return completed.length > 0;
}

export function jobLevelHasCompletedDeliverables(
  attachments: Array<{
    checklistItemId?: number | null;
    fileCategory?: string | null;
    reworkId?: string | null;
    uploadedBy?: { role?: string | null } | null;
  }>,
  opts?: { activeJobReworkId?: string | null },
): boolean {
  const jobLevel = attachments.filter(
    (a) => a.checklistItemId == null && isCompletedAttachment(a),
  );
  if (opts?.activeJobReworkId) {
    return jobLevel.some((a) => a.reworkId === opts.activeJobReworkId);
  }
  return jobLevel.length > 0;
}

export function fileCategoryFromUploadTag(tag: "input" | "output"): AttachmentFileCategory {
  return tag === "output" ? "completed" : "job";
}
