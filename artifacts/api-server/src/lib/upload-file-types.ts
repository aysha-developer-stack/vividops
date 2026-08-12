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

export const CHECKLIST_FILE_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

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

export function validateUploadFileName(
  fileName: string,
  opts: { checklistInstruction: boolean },
): string | null {
  const allowed = opts.checklistInstruction
    ? isChecklistInstructionFileAllowed(fileName)
    : isJobFileAllowed(fileName);
  if (allowed) return null;
  return opts.checklistInstruction
    ? "Checklist files must be Word (.doc, .docx) or PDF only."
    : "File type not allowed. Supported: PDF, CAD/BIM (incl. CKW), archives, Office docs, CSV, and JPG/PNG.";
}
