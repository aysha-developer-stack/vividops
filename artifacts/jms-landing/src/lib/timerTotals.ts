/** Monday 00:00 local — Australia work week. */
export function startOfLocalWeek(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const daysFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysFromMonday);
  return d;
}

export function endOfLocalWeek(now = new Date()): Date {
  const end = new Date(startOfLocalWeek(now));
  end.setDate(end.getDate() + 7);
  return end;
}

export function isInLocalWeek(iso: string | Date | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= startOfLocalWeek(now).getTime() && t < endOfLocalWeek(now).getTime();
}

export function isLocalCalendarDay(iso: string | Date | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function sumDurationsInLocalWeek<T extends { duration: number; createdAt?: string | Date | null }>(
  entries: T[],
  now = new Date(),
): number {
  return entries.reduce((acc, e) => acc + (isInLocalWeek(e.createdAt, now) ? e.duration : 0), 0);
}

export function sumDurationsOnLocalDay<T extends { duration: number; createdAt?: string | Date | null }>(
  entries: T[],
  now = new Date(),
): number {
  return entries.reduce((acc, e) => acc + (isLocalCalendarDay(e.createdAt, now) ? e.duration : 0), 0);
}
