import { isCompletedAttachment } from "@/lib/attachmentCategories";

export type ChecklistInstructionOnServer = {
  id: string;
  fileName: string;
};

export type JobAttachmentRow = {
  id: string;
  fileName: string;
  checklistItemId?: number | null;
  fileCategory?: string | null;
  uploadedBy?: { role?: string | null } | null;
};

export function parseJobAttachmentRow(row: Record<string, unknown>): JobAttachmentRow | null {
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;
  const uploadedByRaw =
    row.uploadedBy && typeof row.uploadedBy === "object"
      ? (row.uploadedBy as { id?: string; role?: string })
      : null;
  const checklistItemId =
    typeof row.checklistItemId === "number"
      ? row.checklistItemId
      : typeof row.checklist_item_id === "number"
        ? row.checklist_item_id
        : null;
  return {
    id,
    fileName:
      (typeof row.fileName === "string" ? row.fileName : "") ||
      (typeof row.file_name === "string" ? row.file_name : "") ||
      "File",
    checklistItemId,
    fileCategory:
      typeof row.fileCategory === "string"
        ? row.fileCategory
        : typeof row.file_category === "string"
          ? row.file_category
          : null,
    uploadedBy: uploadedByRaw?.id
      ? { role: uploadedByRaw.role ?? null }
      : null,
  };
}

export function isChecklistInstructionAttachment(row: JobAttachmentRow): boolean {
  if (!row.checklistItemId || row.checklistItemId <= 0) return false;
  return !isCompletedAttachment({
    fileCategory: row.fileCategory,
    uploadedBy: row.uploadedBy,
  });
}

export function mapChecklistInstructionsFromRows(
  rows: JobAttachmentRow[],
): Record<number, ChecklistInstructionOnServer> {
  const map: Record<number, ChecklistInstructionOnServer> = {};
  for (const row of rows) {
    if (!isChecklistInstructionAttachment(row)) continue;
    const itemId = row.checklistItemId!;
    if (!map[itemId]) {
      map[itemId] = { id: row.id, fileName: row.fileName };
    }
  }
  return map;
}

export function checklistItemHasQueuedInstruction(
  pendingFiles: Record<number, File[]>,
  index: number,
): boolean {
  return (pendingFiles[index] ?? []).length > 0;
}

export function findMissingChecklistInstructions(opts: {
  templateLength: number;
  getTaskLabel: (index: number) => string;
  instructionsOnServer: Record<number, ChecklistInstructionOnServer>;
  pendingFiles: Record<number, File[]>;
}): string[] {
  const missing: string[] = [];
  for (let idx = 0; idx < opts.templateLength; idx++) {
    const itemId = idx + 1;
    if (opts.instructionsOnServer[itemId]) continue;
    if (checklistItemHasQueuedInstruction(opts.pendingFiles, idx)) continue;
    missing.push(opts.getTaskLabel(idx));
  }
  return missing;
}
