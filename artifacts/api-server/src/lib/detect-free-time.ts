import type { ActiveTimerSessionRow } from "@workspace/db";
import { REPORT_TIMEZONE, todayInTimezone } from "./report-dates";
import { isTimerSessionStale } from "./timer-sessions";

/** Ignore tiny gaps between stopping one job and starting the next. */
export const MIN_FREE_TIME_SECONDS = 5 * 60;
/** One detected stretch cannot run past a normal work day. */
export const MAX_FREE_TIME_SECONDS = 12 * 3600;

export function pktDateString(now = new Date()): string {
  return todayInTimezone(REPORT_TIMEZONE, now);
}

/** Pakistan has no DST — midnight PKT is UTC+5. */
export function pktDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+05:00`);
}

export function liveFreeDurationSeconds(
  startedAt: Date | string,
  endedAt: Date | string | null | undefined,
  now = new Date(),
): number {
  const startMs = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const endMs = endedAt
    ? endedAt instanceof Date
      ? endedAt.getTime()
      : new Date(endedAt).getTime()
    : now.getTime();
  if (!Number.isFinite(endMs)) return 0;
  return Math.min(MAX_FREE_TIME_SECONDS, Math.max(0, Math.floor((endMs - startMs) / 1000)));
}

export function shouldKeepClosedPeriod(durationSeconds: number): boolean {
  return durationSeconds >= MIN_FREE_TIME_SECONDS;
}

/** Running job timer (including a brief heartbeat miss) counts as working — not free. */
export function isOnJobTimer(
  session: Pick<ActiveTimerSessionRow, "segmentStartedAt" | "lastHeartbeatAt"> | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!session?.segmentStartedAt) return false;
  return !isTimerSessionStale(session, nowMs);
}

export function formatFreeDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return `${safe}s`;
}
