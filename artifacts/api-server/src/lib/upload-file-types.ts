/** Common job file extensions (informational — uploads accept any valid file name). */
export const JOB_FILE_EXTENSIONS = [
  ".pdf",
  ".dwg",
  ".dxf",
  ".rvt",
  ".rfa",
  ".rte",
  ".rft",
  ".db1",
  ".db2",
  ".tekla",
  ".ifc",
  ".nc1",
  ".ckw",
  ".rtd",
  ".rts",
  ".zip",
  ".rar",
  ".7z",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".txt",
  ".ppt",
  ".pptx",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".m4v",
  ".wmv",
  ".mp3",
  ".wav",
  ".aac",
  ".m4a",
] as const;

export const CHECKLIST_FILE_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

export function fileExtension(name: string): string {
  const base = (name ?? "").trim().toLowerCase();
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return "";
  return base.slice(idx);
}

function baseFileName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] ?? trimmed;
}

/** Accept any file like a folder — only reject empty or invalid names. */
export function isJobFileAllowed(name: string): boolean {
  const base = baseFileName(name);
  return base.length > 0 && base !== "." && base !== "..";
}

export function isChecklistInstructionFileAllowed(name: string): boolean {
  const ext = fileExtension(name);
  return ext !== "" && (CHECKLIST_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

export const REVIEW_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp", ".tif", ".tiff"] as const;

export function isReviewPhotoFileAllowed(name: string): boolean {
  const ext = fileExtension(name);
  return ext !== "" && (REVIEW_PHOTO_EXTENSIONS as readonly string[]).includes(ext);
}

export function validateUploadFileName(
  fileName: string,
  opts: { checklistInstruction: boolean; reviewPhoto?: boolean },
): string | null {
  if (opts.reviewPhoto) {
    if (isReviewPhotoFileAllowed(fileName)) return null;
    return "Review photos must be JPG, PNG, GIF, WebP, or HEIC only.";
  }
  if (opts.checklistInstruction) {
    if (isChecklistInstructionFileAllowed(fileName)) return null;
    return "Checklist instruction files must be Word (.doc, .docx) or PDF only.";
  }
  if (isJobFileAllowed(fileName)) return null;
  return "Invalid file name.";
}
