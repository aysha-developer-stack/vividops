export type AttachmentFileCategory = "job" | "completed" | "review" | "rework" | "note";

export function isNoteAttachment(a: {
  fileCategory?: string | null;
  reviewNoteId?: string | null;
}): boolean {
  if (a.fileCategory === "note") return true;
  if (a.fileCategory === "review" || a.fileCategory === "rework") return false;
  // Legacy/mis-categorised note uploads (e.g. field worker defaulting to job/completed).
  return Boolean(a.reviewNoteId);
}

export function isReviewAttachment(a: { fileCategory?: string | null }): boolean {
  return a.fileCategory === "review";
}

export function isReworkAttachment(a: { fileCategory?: string | null }): boolean {
  return a.fileCategory === "rework";
}

export function isCompletedAttachment(a: {
  fileCategory?: string | null;
  reviewNoteId?: string | null;
  uploadedBy?: { role?: string | null } | null;
}): boolean {
  if (isNoteAttachment(a)) return false;
  if (isReworkAttachment(a)) return false;
  if (a.fileCategory === "completed") return true;
  if (a.fileCategory === "job") return false;
  return (a.uploadedBy?.role ?? "supervisor") === "user";
}

export function isJobAttachment(a: {
  fileCategory?: string | null;
  reviewNoteId?: string | null;
  uploadedBy?: { role?: string | null } | null;
}): boolean {
  if (isNoteAttachment(a)) return false;
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

export type ReworkOrigin = "internal" | "external";

const ACTIVE_REWORK_UI_STATUSES = ["open", "needs_correction", "awaiting_review"] as const;

export function reworkOriginDisplayLabel(origin: string | null | undefined): string | null {
  if (origin === "internal") return "Internal rework";
  if (origin === "external") return "External rework";
  return null;
}

export function reworkInstructionBadges(
  attachment: { reworkId?: string | null; fileCategory?: string | null },
  rework?: { reworkOrigin?: string | null; status?: string } | null,
): Array<{ label: string; tone: "internal" | "external" | "new" }> {
  if (!attachment.reworkId || !rework) return [];
  const badges: Array<{ label: string; tone: "internal" | "external" | "new" }> = [];
  if (rework.reworkOrigin === "internal" && attachment.fileCategory === "rework") {
    badges.push({ label: "Internal rework", tone: "internal" });
  }
  if (rework.reworkOrigin === "external" && attachment.fileCategory === "job") {
    badges.push({ label: "External rework", tone: "external" });
  }
  if (rework.status && (ACTIVE_REWORK_UI_STATUSES as readonly string[]).includes(rework.status)) {
    badges.push({ label: "New", tone: "new" });
  }
  return badges;
}

export function fileCategoryFromUploadTag(tag: "input" | "output"): AttachmentFileCategory {
  return tag === "output" ? "completed" : "job";
}
