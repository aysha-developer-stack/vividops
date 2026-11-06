/** Cap matches other manual time-log entries — add another entry if more is needed. */
export const MAX_MISSING_TIME_SECONDS = 12 * 3600;

export function parseMissingTimeDuration(
  hoursRaw: unknown,
  minutesRaw: unknown,
): { ok: true; seconds: number } | { ok: false; error: string } {
  const hours = toNonNegativeInt(hoursRaw, 0);
  const minutes = toNonNegativeInt(minutesRaw, 0);
  if (hours === null) return { ok: false, error: "Hours must be a whole number" };
  if (minutes === null) return { ok: false, error: "Minutes must be a whole number" };
  if (hours > 12) return { ok: false, error: "Hours cannot be more than 12 per entry" };
  if (minutes > 59) return { ok: false, error: "Minutes must be 0–59" };
  const seconds = hours * 3600 + minutes * 60;
  if (seconds <= 0) return { ok: false, error: "Enter a time greater than zero" };
  if (seconds > MAX_MISSING_TIME_SECONDS) {
    return { ok: false, error: "Missing time cannot exceed 12 hours per entry" };
  }
  return { ok: true, seconds };
}

function toNonNegativeInt(value: unknown, emptyValue: number): number | null {
  if (value === undefined || value === null || value === "") return emptyValue;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return emptyValue;
    if (!/^\d+$/.test(trimmed)) return null;
    return Number(trimmed);
  }
  return null;
}
