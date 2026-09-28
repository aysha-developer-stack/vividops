import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  jobChecklistState,
  jobReworks,
  jobs,
  timeLogs,
  MISTAKE_CATEGORIES,
  type JobRow,
  type MistakeCategory,
  type UserRow,
} from "@workspace/db";
import type { ReworkOrigin } from "./rework-origin";
import { resolveReworkUserId } from "./working-supervisor";
import { announceCliqJobStatusChange } from "./cliq-job-status";

type ErrorSeverity = "low" | "medium" | "high";

function isCategory(value: unknown): value is MistakeCategory {
  return typeof value === "string" && (MISTAKE_CATEGORIES as readonly string[]).includes(value);
}

function normalizeSeverity(value: unknown): ErrorSeverity {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function parseDueAt(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Unique job+worker cycle. Origin (internal/external) is display-only and must not reuse numbers. */
async function nextCycleNumber(jobId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({
      maxCycle: sql<number>`coalesce(max(${jobReworks.cycleNumber}), 0)::int`,
    })
    .from(jobReworks)
    .where(and(eq(jobReworks.jobId, jobId), eq(jobReworks.userId, userId)));
  const max = Number(row?.maxCycle ?? 0);
  return Number.isFinite(max) ? max + 1 : 1;
}

/**
 * If two reworks for the same worker share a cycle number, bump the later one
 * and move time logs saved after it was assigned onto that unique cycle.
 */
export async function healDuplicateReworkCyclesForJob(jobId: string): Promise<number> {
  const rows = await db
    .select()
    .from(jobReworks)
    .where(eq(jobReworks.jobId, jobId))
    .orderBy(asc(jobReworks.assignedAt), asc(jobReworks.createdAt), asc(jobReworks.id));

  const usedByUser = new Map<string, Set<number>>();
  const maxByUser = new Map<string, number>();
  let healed = 0;

  for (const row of rows) {
    maxByUser.set(row.userId, Math.max(maxByUser.get(row.userId) ?? 0, row.cycleNumber));
  }

  for (const row of rows) {
    const used = usedByUser.get(row.userId) ?? new Set<number>();
    usedByUser.set(row.userId, used);

    if (!used.has(row.cycleNumber)) {
      used.add(row.cycleNumber);
      continue;
    }

    const next = (maxByUser.get(row.userId) ?? row.cycleNumber) + 1;
    maxByUser.set(row.userId, next);
    used.add(next);

    await db
      .update(jobReworks)
      .set({ cycleNumber: next, updatedAt: new Date() })
      .where(eq(jobReworks.id, row.id));

    await db
      .update(timeLogs)
      .set({ reworkCycleNumber: next })
      .where(
        and(
          eq(timeLogs.jobId, jobId),
          eq(timeLogs.userId, row.userId),
          eq(timeLogs.reworkCycleNumber, row.cycleNumber),
          gte(timeLogs.createdAt, row.assignedAt),
        ),
      );
    healed += 1;
  }

  return healed;
}

export async function createRework(opts: {
  actor: UserRow;
  job: JobRow;
  userId?: string | null;
  checklistItemId?: number | null;
  reason: string;
  category?: string | null;
  comments?: string | null;
  dueAt?: string | null;
  severity?: string | null;
  source: string;
  title?: string | null;
  reworkOrigin?: ReworkOrigin | null;
}) {
  const userId = resolveReworkUserId(opts.job, opts.userId);
  if (!userId) {
    throw new Error("Cannot create rework without an assigned worker or supervisor.");
  }

  const reason = opts.reason.trim();
  if (!reason) {
    throw new Error("Rework reason is required.");
  }

  const category = isCategory(opts.category) ? opts.category : "rework";
  const severity = normalizeSeverity(opts.severity);
  const comments = opts.comments?.trim() ? opts.comments.trim() : null;
  const dueAt = parseDueAt(opts.dueAt);
  const cycleNumber = await nextCycleNumber(opts.job.id, userId);

  const [rework] = await db
    .insert(jobReworks)
    .values({
      jobId: opts.job.id,
      userId,
      createdById: opts.actor.id,
      checklistItemId: opts.checklistItemId ?? null,
      cycleNumber,
      reason,
      category,
      comments,
      severity,
      status: "open",
      reworkOrigin: opts.reworkOrigin ?? null,
      dueAt,
      updatedAt: new Date(),
    })
    .returning();

  return { rework };
}

export const ACTIVE_REWORK_STATUSES = ["open", "needs_correction", "awaiting_review"] as const;

export async function updateRework(opts: {
  reworkId: string;
  jobId: string;
  reason: string;
  category?: string | null;
  comments?: string | null;
  dueAt?: string | null;
  severity?: string | null;
  reworkOrigin?: ReworkOrigin | null;
}) {
  const [existing] = await db
    .select()
    .from(jobReworks)
    .where(and(eq(jobReworks.id, opts.reworkId), eq(jobReworks.jobId, opts.jobId)))
    .limit(1);
  if (!existing) {
    throw new Error("Rework not found.");
  }
  if (!(ACTIVE_REWORK_STATUSES as readonly string[]).includes(existing.status)) {
    throw new Error("Only active rework can be edited.");
  }

  const reason = opts.reason.trim();
  if (!reason) {
    throw new Error("Rework reason is required.");
  }

  const category = isCategory(opts.category) ? opts.category : existing.category;
  const severity = opts.severity != null ? normalizeSeverity(opts.severity) : existing.severity;
  const comments =
    opts.comments !== undefined ? (opts.comments?.trim() ? opts.comments.trim() : null) : existing.comments;
  const dueAt = opts.dueAt !== undefined ? parseDueAt(opts.dueAt) : existing.dueAt;
  const reworkOrigin =
    opts.reworkOrigin !== undefined ? opts.reworkOrigin : existing.reworkOrigin;

  const [rework] = await db
    .update(jobReworks)
    .set({
      reason,
      category,
      comments,
      severity,
      dueAt,
      reworkOrigin,
      updatedAt: new Date(),
    })
    .where(eq(jobReworks.id, opts.reworkId))
    .returning();

  if (existing.checklistItemId != null) {
    await db
      .update(jobChecklistState)
      .set({ reworkReason: reason, updatedAt: new Date() })
      .where(
        and(
          eq(jobChecklistState.jobId, opts.jobId),
          eq(jobChecklistState.userId, existing.userId),
          eq(jobChecklistState.itemId, existing.checklistItemId),
        ),
      );
  }

  return { rework };
}

export async function findActiveReworkForCompletedUpload(opts: {
  jobId: string;
  userId: string;
  checklistItemId?: number;
}): Promise<string | null> {
  const rows = await db
    .select({ id: jobReworks.id, checklistItemId: jobReworks.checklistItemId, cycleNumber: jobReworks.cycleNumber })
    .from(jobReworks)
    .where(
      and(
        eq(jobReworks.jobId, opts.jobId),
        eq(jobReworks.userId, opts.userId),
        inArray(jobReworks.status, [...ACTIVE_REWORK_STATUSES]),
      ),
    )
    .orderBy(desc(jobReworks.assignedAt), desc(jobReworks.createdAt), desc(jobReworks.cycleNumber));

  if (rows.length === 0) return null;

  if (opts.checklistItemId != null && opts.checklistItemId > 0) {
    const itemMatch = rows.find((r) => r.checklistItemId === opts.checklistItemId);
    if (itemMatch) return itemMatch.id;
  }

  const jobLevel = rows.find((r) => r.checklistItemId == null);
  if (jobLevel) return jobLevel.id;

  return rows[0]?.id ?? null;
}

export async function markOpenReworksAwaitingReview(
  jobId: string,
  userId?: string | null,
  opts?: { actor?: Pick<UserRow, "id" | "name" | "role">; announceCliq?: boolean },
): Promise<number> {
  const conditions = [
    eq(jobReworks.jobId, jobId),
    inArray(jobReworks.status, ["open", "needs_correction"]),
  ];
  if (userId) conditions.push(eq(jobReworks.userId, userId));

  const updated = await db
    .update(jobReworks)
    .set({
      status: "awaiting_review",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning({ id: jobReworks.id });

  const actor = opts?.actor;
  if (updated.length > 0 && actor && opts?.announceCliq !== false) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (job) {
      void announceCliqJobStatusChange({
        job,
        actor: actor as UserRow,
        event: "rework_completed",
        previousStatus: "rework",
      });
    }
  }

  return updated.length;
}

export async function resolveJobReworks(jobId: string) {
  await db
    .update(jobReworks)
    .set({
      status: "approved",
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(jobReworks.jobId, jobId), inArray(jobReworks.status, ["open", "awaiting_review", "needs_correction"])));
}
