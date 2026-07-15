import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  errorReports,
  jobReworks,
  MISTAKE_CATEGORIES,
  type JobRow,
  type MistakeCategory,
  type UserRow,
} from "@workspace/db";

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

async function nextCycleNumber(jobId: string, userId: string): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(MAX(cycle_number), 0)::int AS max_cycle
    FROM job_reworks
    WHERE job_id = ${jobId} AND user_id = ${userId}
  `);
  const raw = ((rows as any).rows ?? [])[0]?.max_cycle;
  const max = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(max) ? max + 1 : 1;
}

export async function createReworkWithErrorReport(opts: {
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
}) {
  const userId = opts.userId ?? opts.job.assigneeId;
  if (!userId) {
    throw new Error("Cannot create rework without an assigned user.");
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
      dueAt,
      updatedAt: new Date(),
    })
    .returning();

  const description = comments ? `${reason}\n\nInstructions: ${comments}` : reason;
  const [report] = await db
    .insert(errorReports)
    .values({
      jobId: opts.job.id,
      userId,
      createdById: opts.actor.id,
      reworkId: rework.id,
      title: opts.title?.trim() || `Rework #${cycleNumber}: ${opts.job.title}`,
      description,
      category,
      checklistItemId: opts.checklistItemId ?? null,
      source: opts.source,
      severity,
      status: "open",
      updatedAt: new Date(),
    })
    .returning();

  return { rework, report };
}

export async function markOpenReworksAwaitingReview(jobId: string, userId?: string | null) {
  const conditions = [
    eq(jobReworks.jobId, jobId),
    inArray(jobReworks.status, ["open", "needs_correction"]),
  ];
  if (userId) conditions.push(eq(jobReworks.userId, userId));

  await db
    .update(jobReworks)
    .set({
      status: "awaiting_review",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(...conditions));
}

export async function resolveJobReworks(jobId: string) {
  const rows = await db
    .update(jobReworks)
    .set({
      status: "approved",
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(jobReworks.jobId, jobId), inArray(jobReworks.status, ["open", "awaiting_review", "needs_correction"])))
    .returning({ id: jobReworks.id });

  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db
      .update(errorReports)
      .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
      .where(inArray(errorReports.reworkId, ids));
  }
}
