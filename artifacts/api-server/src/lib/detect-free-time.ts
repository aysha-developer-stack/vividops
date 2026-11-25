import type { ActiveTimerSessionRow } from "@workspace/db";
import { REPORT_TIMEZONE, todayInTimezone } from "./report-dates";
import { isTimerSessionStale } from "./timer-sessions";

/** Ignore tiny gaps between stopping one job and starting the next. */
export const MIN_FREE_TIME_SECONDS = 5 * 60;
/** One detected stretch cannot run past a normal work day. */
export const MAX_FREE_TIME_SECONDS = 12 * 3600;
export const BREAK_HOUR_SECONDS = 60 * 60;
export const BREAK_SHORT_SECONDS = 15 * 60;
export const BREAK_HOUR_LIMIT_PER_DAY = 1;
export const BREAK_SHORT_LIMIT_PER_DAY = 2;

export type BreakKind = "break_hour" | "break_short";

export function isBreakKind(kind: string | null | undefined): kind is BreakKind {
  return kind === "break_hour" || kind === "break_short";
}

export function breakAllowanceSeconds(kind: BreakKind): number {
  return kind === "break_hour" ? BREAK_HOUR_SECONDS : BREAK_SHORT_SECONDS;
}

export function breakLimitPerDay(kind: BreakKind): number {
  return kind === "break_hour" ? BREAK_HOUR_LIMIT_PER_DAY : BREAK_SHORT_LIMIT_PER_DAY;
}

export function breakLabel(kind: BreakKind): string {
  return kind === "break_hour" ? "1 hour break" : "15 min break";
}

export function secondsUntilBreakExpiry(
  startedAt: Date | string,
  kind: BreakKind,
  now = new Date(),
): number {
  const startMs = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const expiry = startMs + breakAllowanceSeconds(kind) * 1000;
  return Math.max(0, Math.floor((expiry - now.getTime()) / 1000));
}

export function countBreaksUsed(
  rows: Array<{ kind?: string | null; reportDate: string }>,
  kind: BreakKind,
  date: string,
): number {
  return rows.filter((r) => r.kind === kind && String(r.reportDate).slice(0, 10) === date).length;
}

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
