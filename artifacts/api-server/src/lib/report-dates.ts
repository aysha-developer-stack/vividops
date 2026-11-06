export const REPORT_TIMEZONE = process.env.REPORT_DISPLAY_TIMEZONE || "Asia/Karachi";

export function parseDateParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export function todayInTimezone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function shiftDateString(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Calendar YYYY-MM-DD from a DATE / ISO value without shifting the day. */
export function formatWorkDate(value: unknown): string {
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

export function resolveReportRange(
  query: { from?: unknown; to?: unknown },
  timeZone: string,
): { from: string; to: string } {
  const today = todayInTimezone(timeZone);
  const from = parseDateParam(query.from) ?? shiftDateString(today, -30);
  const to = parseDateParam(query.to) ?? today;
  return { from, to };
}
