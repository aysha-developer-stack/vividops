export function pickActiveReworkIdForUpload(
  rows: Array<{ id: string; userId?: string | null; checklistItemId: number | null }>,
  opts: { userId?: string | null; checklistItemId?: number; allowUnrelatedItemFallback?: boolean },
): string | null {
  if (rows.length === 0) return null;

  const pick = (
    list: Array<{ id: string; checklistItemId: number | null }>,
    allowUnrelatedItemFallback: boolean,
  ): string | null => {
    if (list.length === 0) return null;
    if (opts.checklistItemId != null && opts.checklistItemId > 0) {
      const itemMatch = list.find((r) => r.checklistItemId === opts.checklistItemId);
      if (itemMatch) return itemMatch.id;
    }
    const jobLevel = list.find((r) => r.checklistItemId == null);
    if (jobLevel) return jobLevel.id;
    return allowUnrelatedItemFallback ? (list[0]?.id ?? null) : null;
  };

  const own = opts.userId ? rows.filter((r) => r.userId === opts.userId) : rows;
  const ownPick = pick(own, opts.allowUnrelatedItemFallback !== false);
  if (ownPick) return ownPick;

  // Extra assignees share the job-level cycle (and the same checklist item cycle).
  return pick(rows, false);
}
