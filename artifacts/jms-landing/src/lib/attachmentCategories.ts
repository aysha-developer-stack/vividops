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

export function fileCategoryFromUploadTag(tag: "input" | "output"): AttachmentFileCategory {
  return tag === "output" ? "completed" : "job";
}
