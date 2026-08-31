import type { ChecklistTemplateItem } from "@/lib/jobMeta";

/** When re-uploading a checklist file, target an existing row if the task name matches. */
export function resolveChecklistUploadTarget(
  template: ChecklistTemplateItem[],
  fileName: string,
): { index: number; append: boolean } {
  const normalized = fileName.trim().toLowerCase();
  if (!normalized) return { index: template.length, append: true };

  const existingIdx = template.findIndex(
    (item) => item.text.trim().toLowerCase() === normalized,
  );
  if (existingIdx >= 0) return { index: existingIdx, append: false };

  return { index: template.length, append: true };
}

export function appendChecklistFileToMap(
  prev: Record<number, File[]>,
  index: number,
  file: File,
): Record<number, File[]> {
  return { ...prev, [index]: [...(prev[index] ?? []), file] };
}
