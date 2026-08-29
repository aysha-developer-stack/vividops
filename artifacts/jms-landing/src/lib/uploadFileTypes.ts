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

/** Checklist instruction uploads remain Word/PDF only. */
export const CHECKLIST_FILE_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

/** Empty = accept all file types in the browse dialog (folder-like). */
export const JOB_FILE_ACCEPT = "";

export const CHECKLIST_FILE_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const REVIEW_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp", ".tif", ".tiff"] as const;

export const REVIEW_PHOTO_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,image/bmp,image/tiff,.heic,.heif";

export const MAX_REVIEW_PHOTOS = 5;
export const MAX_REVIEW_PHOTO_BYTES = 10 * 1024 * 1024;

/** Must match multer limit in api-server storage.ts (200 MB). Supabase project limit must be >= this. */
export const MAX_JOB_ATTACHMENT_BYTES = 200 * 1024 * 1024;

export function formatJobAttachmentSizeLimit(): string {
  return `${Math.round(MAX_JOB_ATTACHMENT_BYTES / (1024 * 1024))} MB`;
}

export const ARCHIVE_FILE_EXTENSIONS = [".zip", ".rar", ".7z"] as const;

export function fileExtension(name: string): string {
  const base = (name ?? "").trim().toLowerCase();
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return "";
  return base.slice(idx);
}

export function isArchiveFileName(name: string): boolean {
  const ext = fileExtension(name);
  return ext !== "" && (ARCHIVE_FILE_EXTENSIONS as readonly string[]).includes(ext);
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

export function isReviewPhotoFileAllowed(name: string): boolean {
  const ext = fileExtension(name);
  return ext !== "" && (REVIEW_PHOTO_EXTENSIONS as readonly string[]).includes(ext);
}

export function filterReviewPhotoFiles(files: File[]): File[] {
  return files.filter((f) => isReviewPhotoFileAllowed(f.name) && f.size <= MAX_REVIEW_PHOTO_BYTES);
}

export const REVIEW_PHOTO_REJECTED_MESSAGE =
  "Photos must be JPG, PNG, GIF, WebP, or HEIC and under 10MB each.";

export function filterJobFiles(files: File[]): File[] {
  return files.filter((f) => isJobFileAllowed(f.name) && f.size <= MAX_JOB_ATTACHMENT_BYTES);
}

export function jobFilesOverSizeLimit(files: File[]): File[] {
  return files.filter((f) => isJobFileAllowed(f.name) && f.size > MAX_JOB_ATTACHMENT_BYTES);
}

export function filterChecklistInstructionFiles(files: File[]): File[] {
  return files.filter((f) => isChecklistInstructionFileAllowed(f.name));
}

export const JOB_FILE_REJECTED_MESSAGE =
  "Could not add one or more files — invalid file name or file exceeds the 200 MB limit.";

export const JOB_FILE_SUPABASE_SIZE_HINT =
  "This file is larger than Supabase's default 50 MB storage limit. Ask your admin to raise the global file size limit under Supabase Dashboard → Storage → Settings (Pro plan required for files over 50 MB).";

export const CHECKLIST_FILE_REJECTED_MESSAGE =
  "Checklist instruction files must be Word (.doc, .docx) or PDF only.";
