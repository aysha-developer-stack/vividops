/** Allowed extensions for general job / completed file uploads (not checklist instruction docs). */
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
] as const;

/** Checklist instruction uploads remain Word/PDF only. */
export const CHECKLIST_FILE_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

export const JOB_FILE_ACCEPT = JOB_FILE_EXTENSIONS.join(",");

export const CHECKLIST_FILE_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function fileExtension(name: string): string {
  const base = (name ?? "").trim().toLowerCase();
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return "";
  return base.slice(idx);
}

export function isJobFileAllowed(name: string): boolean {
  const ext = fileExtension(name);
  return ext !== "" && (JOB_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isChecklistInstructionFileAllowed(name: string): boolean {
  const ext = fileExtension(name);
  return ext !== "" && (CHECKLIST_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

export function filterJobFiles(files: File[]): File[] {
  return files.filter((f) => isJobFileAllowed(f.name));
}

export function filterChecklistInstructionFiles(files: File[]): File[] {
  return files.filter((f) => isChecklistInstructionFileAllowed(f.name));
}

export const JOB_FILE_REJECTED_MESSAGE =
  "File type not allowed. Supported: PDF, CAD/BIM (DWG, DXF, RVT, CKW, IFC, etc.), archives (ZIP, RAR, 7Z), Office docs, CSV, and images (JPG, PNG).";

export const CHECKLIST_FILE_REJECTED_MESSAGE =
  "Checklist files must be Word (.doc, .docx) or PDF only.";
