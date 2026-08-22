import {
  fetchActiveTimerSessions,
  liveSessionElapsedSeconds,
  type ActiveTimerSession,
} from "@/lib/timerSessionApi";

export type JobTimerLocalState = {
  running: boolean;
  startedAt: number | null;
  accumulated: number;
  task: string;
};

const STORAGE_PREFIX = "job_timer_v1:";

export function jobTimerStorageKey(jobId: string): string {
  return `${STORAGE_PREFIX}${jobId}`;
}

export function readJobTimerState(jobId: string): JobTimerLocalState | null {
  try {
    const raw = localStorage.getItem(jobTimerStorageKey(jobId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || data.v !== 1) return null;
    return {
      running: !!data.running,
      startedAt: typeof data.startedAt === "number" ? data.startedAt : null,
      accumulated: typeof data.accumulated === "number" ? data.accumulated : 0,
      task: typeof data.task === "string" ? data.task : "",
    };
  } catch {
    return null;
  }
}

export function writeJobTimerState(jobId: string, state: JobTimerLocalState): void {
  try {
    localStorage.setItem(jobTimerStorageKey(jobId), JSON.stringify({ v: 1, ...state }));
  } catch {
  }
}

export function clearJobTimerState(jobId: string): void {
  writeJobTimerState(jobId, { running: false, startedAt: null, accumulated: 0, task: "" });
}

export function computeJobTimerElapsed(state: JobTimerLocalState | null): number {
  if (!state) return 0;
  const base = Math.max(0, Math.floor(state.accumulated));
  if (!state.running || !state.startedAt) return base;
  const extra = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  return base + extra;
}

/** Clear stale per-job local timers. Server session is authoritative — do not create time logs here. */
export function clearOtherJobTimerLocalStates(currentJobId?: string): void {
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    const jobId = key.slice(STORAGE_PREFIX.length);
    if (!jobId || jobId === currentJobId) continue;
    clearJobTimerState(jobId);
  }
}

export function jobTimerStateFromServerSession(session: ActiveTimerSession): JobTimerLocalState {
  return {
    running: !!session.segmentStartedAt,
    startedAt: session.segmentStartedAt ? Date.parse(session.segmentStartedAt) : null,
    accumulated: session.accumulatedSeconds ?? 0,
    task: session.task,
  };
}

/** Prefer the server active timer session over stale browser localStorage. */
export async function syncJobTimerFromServer(jobId: string): Promise<JobTimerLocalState | null> {
  const sessions = await fetchActiveTimerSessions();
  const mine = sessions.find((s) => s.jobId === jobId);
  if (!mine) {
    const local = readJobTimerState(jobId);
    if (local?.running) {
      clearJobTimerState(jobId);
    }
    return readJobTimerState(jobId);
  }

  const synced = jobTimerStateFromServerSession(mine);
  writeJobTimerState(jobId, synced);
  return synced;
}

export function elapsedFromServerSession(session: ActiveTimerSession): number {
  return liveSessionElapsedSeconds(session);
}
