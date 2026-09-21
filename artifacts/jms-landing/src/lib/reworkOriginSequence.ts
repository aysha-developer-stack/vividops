export type ReworkOriginSequenceKey = "internal" | "external" | "supervisor";

export function reworkOriginSequenceKey(origin: string | null | undefined): ReworkOriginSequenceKey {
  if (origin === "internal" || origin === "external") return origin;
  return "supervisor";
}

type ReworkSequenceRow = {
  id: string;
  reworkOrigin?: string | null;
  assignedAt?: string | null;
  createdAt?: string | null;
  cycleNumber?: number | null;
};

function rowTimeMs(row: ReworkSequenceRow): number {
  const raw = Date.parse(row.assignedAt || row.createdAt || "");
  return Number.isFinite(raw) ? raw : 0;
}

/** 1-based cycle number within internal, external, and supervisor rework separately. */
export function originSequenceByReworkId(reworks: ReworkSequenceRow[]): Map<string, number> {
  const buckets = new Map<ReworkOriginSequenceKey, ReworkSequenceRow[]>();
  for (const row of reworks) {
    const key = reworkOriginSequenceKey(row.reworkOrigin);
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  const out = new Map<string, number>();
  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const time = rowTimeMs(a) - rowTimeMs(b);
      if (time !== 0) return time;
      return (a.cycleNumber ?? 0) - (b.cycleNumber ?? 0) || a.id.localeCompare(b.id);
    });
    list.forEach((row, index) => out.set(row.id, index + 1));
  }
  return out;
}

export function reworkSequenceLabel(
  origin: string | null | undefined,
  sequence: number | null | undefined,
  kind: "instruction" | "completed" = "instruction",
): string {
  if (sequence == null) return kind === "completed" ? "Rework completed" : "—";
  const key = reworkOriginSequenceKey(origin);
  if (kind === "completed") {
    if (key === "internal") return `Internal completed #${sequence}`;
    if (key === "external") return `External completed #${sequence}`;
    return `Rework completed #${sequence}`;
  }
  if (key === "internal") return `Internal #${sequence}`;
  if (key === "external") return `External #${sequence}`;
  return `Rework #${sequence}`;
}
