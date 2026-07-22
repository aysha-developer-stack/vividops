export type ReworkCycleKey = "original" | number;

export type TimeLogLike = {
  duration?: number | null;
  reworkCycleNumber?: number | null;
};

export function reworkCycleKey(cycle: number | null | undefined): ReworkCycleKey {
  return cycle == null ? "original" : cycle;
}

export function reworkCycleLabel(cycle: ReworkCycleKey): string {
  return cycle === "original" ? "Original work" : `Rework #${cycle}`;
}

export function sumDurationSeconds(logs: TimeLogLike[]): number {
  return logs.reduce((acc, log) => acc + (typeof log.duration === "number" ? log.duration : 0), 0);
}

export type TimeLogCycleBreakdown = {
  key: ReworkCycleKey;
  label: string;
  seconds: number;
};

export function buildTimeLogCycleBreakdown(logs: TimeLogLike[]): TimeLogCycleBreakdown[] {
  const totals = new Map<ReworkCycleKey, number>();

  for (const log of logs) {
    const key = reworkCycleKey(log.reworkCycleNumber);
    totals.set(key, (totals.get(key) ?? 0) + (typeof log.duration === "number" ? log.duration : 0));
  }

  const keys = [...totals.keys()].sort((a, b) => {
    if (a === "original") return -1;
    if (b === "original") return 1;
    return a - b;
  });

  return keys.map((key) => ({
    key,
    label: reworkCycleLabel(key),
    seconds: totals.get(key) ?? 0,
  }));
}
