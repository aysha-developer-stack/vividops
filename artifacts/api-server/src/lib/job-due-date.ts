/** Overdue only after the due calendar day — not on the due date itself. */
export function isJobOverdueByDueDate(
  dueDate: Date | null | undefined,
  status: string,
  now: Date = new Date(),
): boolean {
  if (!dueDate || status === "completed" || status === "cancelled") return false;
  const dueDay = dueDate.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return today > dueDay;
}

export function calendarDaysOverdue(dueDate: Date, now = new Date()): number {
  const dueDay = new Date(`${dueDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const diffDays = Math.floor((today.getTime() - dueDay.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diffDays);
}
