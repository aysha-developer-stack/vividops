import {
  originSequenceByReworkId,
  reworkRowTimeMs,
  reworkSequenceLabel,
} from "./reworkOriginSequence";

export type ReworkCycleKey = "original" | number;

export type TimeLogLike = {
  duration?: number | null;
  reworkCycleNumber?: number | null;
  createdAt?: string | Date | null;
  startTime?: string | Date | null;
  userId?: string | null;
};

export type ReworkLike = {
  id: string;
  userId?: string | null;
  assignedWorkerId?: string | null;
  cycleNumber?: number | null;
  reworkOrigin?: string | null;
  assignedAt?: string | null;
  createdAt?: string | null;
  status?: string | null;
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

function logTimeMs(log: TimeLogLike): number {
  const raw = log.createdAt || log.startTime;
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const parsed = Date.parse(raw || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function reworkMatchesWorker(row: ReworkLike, userId: string): boolean {
  return row.assignedWorkerId === userId || row.userId === userId;
}

function usableReworks(reworks: ReworkLike[]): ReworkLike[] {
  return reworks.filter((row) => row.status !== "cancelled");
}

/** Current rework at this time: extra's assigned cycle if any, else the latest cycle that had already started. */
export function pickCurrentReworkAt(
  logMs: number,
  reworks: ReworkLike[],
  userId?: string | null,
): ReworkLike | null {
  if (!logMs) return null;
  const started = usableReworks(reworks)
    .filter((row) => reworkRowTimeMs(row) <= logMs)
    .sort((a, b) => reworkRowTimeMs(b) - reworkRowTimeMs(a));
  if (started.length === 0) return null;
  if (userId) {
    const assignedToUser = started.filter((row) => row.assignedWorkerId === userId);
    if (assignedToUser[0]) return assignedToUser[0];
    const ownedByUser = started.filter((row) => row.userId === userId);
    if (ownedByUser[0]) return ownedByUser[0];
  }
  return started[0];
}

/** Attach a time log to the rework it actually belongs to, even if cycle numbers collide. */
export function matchReworkForTimeLog(log: TimeLogLike, reworks: ReworkLike[]): ReworkLike | null {
  const logMs = logTimeMs(log);
  const cycle = log.reworkCycleNumber;
  if (cycle == null) {
    return pickCurrentReworkAt(logMs, reworks, log.userId);
  }

  const byCycle = usableReworks(reworks).filter((row) => row.cycleNumber === cycle);
  const forUser =
    log.userId && byCycle.some((row) => reworkMatchesWorker(row, log.userId as string))
      ? byCycle.filter((row) => reworkMatchesWorker(row, log.userId as string))
      : byCycle;
  if (forUser.length === 0) return null;
  if (forUser.length === 1) return forUser[0];

  const started = forUser
    .filter((row) => reworkRowTimeMs(row) <= logMs)
    .sort((a, b) => reworkRowTimeMs(b) - reworkRowTimeMs(a));
  if (started.length > 0) return started[0];
  return [...forUser].sort((a, b) => reworkRowTimeMs(a) - reworkRowTimeMs(b))[0];
}

export function timeLogReworkLabel(
  log: TimeLogLike,
  reworks: ReworkLike[] = [],
  sequenceById?: Map<string, number>,
): string {
  const matched = matchReworkForTimeLog(log, reworks);
  if (matched) {
    const sequence = (sequenceById ?? originSequenceByReworkId(reworks)).get(matched.id) ?? matched.cycleNumber;
    return reworkSequenceLabel(matched.reworkOrigin, sequence);
  }
  return reworkCycleLabel(reworkCycleKey(log.reworkCycleNumber));
}

export type TimeLogCycleBreakdown = {
  key: string;
  label: string;
  seconds: number;
};

export function buildTimeLogCycleBreakdown(
  logs: TimeLogLike[],
  reworks: ReworkLike[] = [],
): TimeLogCycleBreakdown[] {
  const sequenceById = originSequenceByReworkId(reworks);
  const totals = new Map<string, { label: string; seconds: number; sort: number }>();

  for (const log of logs) {
    const seconds = typeof log.duration === "number" ? log.duration : 0;
    const matched = matchReworkForTimeLog(log, reworks);
    let groupId: string;
    let label: string;
    let sort: number;

    if (matched) {
      groupId = matched.id;
      const sequence = sequenceById.get(matched.id) ?? matched.cycleNumber ?? 0;
      label = reworkSequenceLabel(matched.reworkOrigin, sequence);
      sort = reworkRowTimeMs(matched);
    } else {
      const key = reworkCycleKey(log.reworkCycleNumber);
      groupId = key === "original" ? "original" : `cycle:${key}`;
      label = reworkCycleLabel(key);
      sort = key === "original" ? -1 : key;
    }

    const prev = totals.get(groupId);
    totals.set(groupId, {
      label,
      seconds: (prev?.seconds ?? 0) + seconds,
      sort: prev?.sort ?? sort,
    });
  }

  return [...totals.entries()]
    .sort((a, b) => {
      if (a[0] === "original") return -1;
      if (b[0] === "original") return 1;
      return a[1].sort - b[1].sort;
    })
    .map(([key, row]) => ({
      key,
      label: row.label,
      seconds: row.seconds,
    }));
}
