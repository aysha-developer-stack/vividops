import { and, eq, ne } from "drizzle-orm";
import { db, jobs } from "@workspace/db";

/** First job number issued when no higher number exists in the system. */
export const JOB_NUMBER_START = 154764;

export function normalizeJobNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.replace(/^job[\s-]*/i, "");
  const normalized = withoutPrefix.trim().toUpperCase();
  return normalized || null;
}

function parseNumericJobNumber(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const digits = value.trim().replace(/^job[\s-]*/i, "").replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

export async function isJobNumberTaken(jobNumber: string, excludeJobId?: string): Promise<boolean> {
  const conditions = [eq(jobs.jobNumber, jobNumber)];
  if (excludeJobId) {
    conditions.push(ne(jobs.id, excludeJobId));
  }
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

/** Preview the next job number without reserving it. */
export async function peekNextJobNumber(): Promise<string> {
  const rows = await db.select({ jobNumber: jobs.jobNumber, serial: jobs.serial }).from(jobs);
  let max = JOB_NUMBER_START - 1;
  for (const row of rows) {
    const fromField = parseNumericJobNumber(row.jobNumber);
    if (fromField != null) max = Math.max(max, fromField);
    max = Math.max(max, row.serial);
  }
  return String(Math.max(max + 1, JOB_NUMBER_START));
}

/** Allocate a unique job number for a new job. */
export async function allocateNextJobNumber(): Promise<string> {
  let candidate = Number.parseInt(await peekNextJobNumber(), 10);
  if (!Number.isFinite(candidate)) candidate = JOB_NUMBER_START;

  for (let attempt = 0; attempt < 20; attempt++) {
    const value = String(candidate);
    if (!(await isJobNumberTaken(value))) return value;
    candidate += 1;
  }

  throw new Error("Unable to allocate a unique job number");
}
