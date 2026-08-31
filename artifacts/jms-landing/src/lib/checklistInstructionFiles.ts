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

export type LinkableChecklistFile = ChecklistInstructionOnServer;

function normalizeFileName(name: string): string {
  return name.trim().toLowerCase();
}

export function checklistFileNameMatchesTask(taskLabel: string, fileName: string): boolean {
  const task = normalizeFileName(taskLabel);
  const file = normalizeFileName(fileName);
  if (!task || !file) return false;
  if (task === file) return true;
  const taskBase = task.replace(/\.(docx?|pdf)$/, "");
  const fileBase = file.replace(/\.(docx?|pdf)$/, "");
  if (taskBase && fileBase && (fileBase === taskBase || fileBase.startsWith(`${taskBase} `) || fileBase.startsWith(taskBase))) {
    return true;
  }
  return false;
}

export function isChecklistDocFileName(fileName: string): boolean {
  return /\.(docx?|pdf)$/i.test(fileName.trim());
}

export function parseJobAttachmentRows(attData: unknown): JobAttachmentRow[] {
  if (!Array.isArray(attData)) return [];
  const rows: JobAttachmentRow[] = [];
  for (const a of attData) {
    if (!a || typeof a !== "object") continue;
    const row = parseJobAttachmentRow(a as Record<string, unknown>);
    if (row) rows.push(row);
  }
  return rows;
}

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

export function isLinkableChecklistInstructionCandidate(row: JobAttachmentRow): boolean {
  if (!isChecklistDocFileName(row.fileName)) return false;
  if (
    isCompletedAttachment({
      fileCategory: row.fileCategory,
      uploadedBy: row.uploadedBy,
    })
  ) {
    return false;
  }
  if (row.checklistItemId != null && row.checklistItemId > 0) {
    return isChecklistInstructionAttachment(row);
  }
  return true;
}

export function findLinkableChecklistFilesForItem(
  rows: JobAttachmentRow[],
  itemId: number,
  taskLabel: string,
): LinkableChecklistFile[] {
  const matches: LinkableChecklistFile[] = [];
  for (const row of rows) {
    if (!isLinkableChecklistInstructionCandidate(row)) continue;
    if (row.checklistItemId != null && row.checklistItemId > 0 && row.checklistItemId !== itemId) {
      continue;
    }
    if (!checklistFileNameMatchesTask(taskLabel, row.fileName)) continue;
    matches.push({ id: row.id, fileName: row.fileName });
  }
  return matches;
}

export function findLinkableChecklistFilesByItem(
  rows: JobAttachmentRow[],
  template: Array<{ text: string }>,
): Record<number, LinkableChecklistFile[]> {
  const map: Record<number, LinkableChecklistFile[]> = {};
  for (let idx = 0; idx < template.length; idx++) {
    const itemId = idx + 1;
    map[itemId] = findLinkableChecklistFilesForItem(rows, itemId, template[idx]?.text ?? "");
  }
  return map;
}

export async function linkAttachmentAsChecklistInstruction(
  jobId: string,
  attachmentId: string,
  itemId: number,
): Promise<void> {
  const res = await fetch(`/api/jobs/${jobId}/attachments/${attachmentId}/link-checklist`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(data.message || data.error || "Failed to link checklist file");
  }
}

export async function autoLinkChecklistInstructionsFromJobFiles(
  jobId: string,
  rows: JobAttachmentRow[],
  template: Array<{ text: string }>,
): Promise<Record<number, ChecklistInstructionOnServer>> {
  let map = mapChecklistInstructionsFromRows(rows);
  for (let idx = 0; idx < template.length; idx++) {
    const itemId = idx + 1;
    if (map[itemId]) continue;
    const candidates = findLinkableChecklistFilesForItem(rows, itemId, template[idx]?.text ?? "");
    const best = candidates[0];
    if (!best) continue;
    await linkAttachmentAsChecklistInstruction(jobId, best.id, itemId);
    map[itemId] = best;
  }
  return map;
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
