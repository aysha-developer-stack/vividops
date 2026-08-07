export type AttachmentFileCategory = "job" | "completed";

export function isCompletedAttachment(a: {
  fileCategory?: string | null;
  uploadedBy?: { role?: string | null } | null;
}): boolean {
  if (a.fileCategory === "completed") return true;
  if (a.fileCategory === "job") return false;
  return (a.uploadedBy?.role ?? "supervisor") === "user";
}

export function isJobAttachment(a: {
  fileCategory?: string | null;
  uploadedBy?: { role?: string | null } | null;
}): boolean {
  return !isCompletedAttachment(a);
}

export function fileCategoryFromUploadTag(tag: "input" | "output"): AttachmentFileCategory {
  return tag === "output" ? "completed" : "job";
}
