export type ChecklistTemplateItem = {
  text: string;
  desc?: string;
  attachmentRequired?: boolean;
};

function checklistItemFromUnknown(x: unknown): ChecklistTemplateItem | null {
  if (!x || typeof x !== "object") return null;
  const i = x as Record<string, unknown>;
  const text =
    (typeof i.text === "string" ? i.text : "") ||
    (typeof i.title === "string" ? i.title : "") ||
    (typeof i.name === "string" ? i.name : "") ||
    (typeof i.label === "string" ? i.label : "");
  const trimmed = text.trim();
  if (!trimmed) return null;
  const desc =
    (typeof i.desc === "string" && i.desc.trim() ? i.desc.trim() : undefined) ||
    (typeof i.description === "string" && i.description.trim() ? i.description.trim() : undefined);
  const attachmentRequired = Boolean(i.attachmentRequired ?? i.fileRequired ?? i.requiresFile);
  return {
    text: trimmed,
    ...(desc ? { desc } : {}),
    ...(attachmentRequired ? { attachmentRequired: true } : {}),
  };
}

export function parseJobMeta(raw: unknown): { descriptionText: string; checklist: ChecklistTemplateItem[] } {
  if (raw == null) return { descriptionText: "", checklist: [] };
  if (typeof raw !== "string") return { descriptionText: "", checklist: [] };
  const trimmed = raw.trim();
  if (!trimmed) return { descriptionText: "", checklist: [] };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { descriptionText: trimmed, checklist: [] };
    }
    const obj = parsed as Record<string, unknown>;
    const descriptionText =
      typeof obj.descriptionText === "string"
        ? obj.descriptionText
        : typeof obj.description === "string" && !Array.isArray(obj.checklist)
          ? obj.description
          : trimmed;

    const checklistRaw = Array.isArray(obj.checklist)
      ? obj.checklist
      : Array.isArray(obj.items)
        ? obj.items
        : Array.isArray(obj.tasks)
          ? obj.tasks
          : [];

    const checklist = checklistRaw
      .map(checklistItemFromUnknown)
      .filter((x): x is ChecklistTemplateItem => x != null);

    return { descriptionText, checklist };
  } catch {
    return { descriptionText: trimmed, checklist: [] };
  }
}

export function serializeJobMeta(descriptionText: string, checklist: ChecklistTemplateItem[]): string {
  return JSON.stringify({
    descriptionText: descriptionText.trim(),
    checklist,
  });
}
