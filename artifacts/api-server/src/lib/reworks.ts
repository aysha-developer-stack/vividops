import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  db,
  jobAttachments,
  jobChecklistAttachments,
  jobChecklistState,
  jobNotes,
  jobReworks,
  jobs,
  timeLogs,
  users,
  MISTAKE_CATEGORIES,
  type JobRow,
  type JobReworkRow,
  type MistakeCategory,
  type UserRow,
} from "@workspace/db";
import { reworkOriginLabel, type ReworkOrigin } from "./rework-origin";
import { resolveReworkUserId } from "./working-supervisor";
import { announceCliqJobStatusChange } from "./cliq-job-status";
import { listJobAssignedWorkerIds } from "./job-access";
import { createNotification, notifyAllJobMembers, notifyJobManagers } from "./notifications";

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
  const previousJobState = JSON.stringify(await resolvePreviousJobState(opts.job));

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
      previousJobState,
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

const RESTORABLE_JOB_STATUSES = new Set([
  "pending",
  "in_progress",
  "awaiting_supervisor",
  "awaiting_admin",
  "awaiting_super_admin",
  "completed",
  "on_hold",
]);

type PreviousJobState = {
  status: string;
  progress: number;
  completedAt: string | null;
  checkedById: string | null;
  checkedByLabel: string | null;
  checkedAt: string | null;
  heldFromStatus: string | null;
  holdReason: string | null;
};

function emptyCheckerHold(): Pick<
  PreviousJobState,
  "checkedById" | "checkedByLabel" | "checkedAt" | "heldFromStatus" | "holdReason"
> {
  return {
    checkedById: null,
    checkedByLabel: null,
    checkedAt: null,
    heldFromStatus: null,
    holdReason: null,
  };
}

function snapshotFromJob(job: JobRow): PreviousJobState {
  return {
    status: job.status,
    progress: job.progress ?? 0,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    checkedById: job.checkedById ?? null,
    checkedByLabel: job.checkedByLabel ?? null,
    checkedAt: job.checkedAt ? job.checkedAt.toISOString() : null,
    heldFromStatus: job.heldFromStatus ?? null,
    holdReason: job.holdReason ?? null,
  };
}

function parsePreviousJobState(raw: string | null | undefined): PreviousJobState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PreviousJobState>;
    if (!parsed || typeof parsed.status !== "string" || !RESTORABLE_JOB_STATUSES.has(parsed.status)) {
      return null;
    }
    return {
      status: parsed.status,
      progress: typeof parsed.progress === "number" && Number.isFinite(parsed.progress) ? parsed.progress : 0,
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : null,
      checkedById: typeof parsed.checkedById === "string" ? parsed.checkedById : null,
      checkedByLabel: typeof parsed.checkedByLabel === "string" ? parsed.checkedByLabel : null,
      checkedAt: typeof parsed.checkedAt === "string" ? parsed.checkedAt : null,
      heldFromStatus: typeof parsed.heldFromStatus === "string" ? parsed.heldFromStatus : null,
      holdReason: typeof parsed.holdReason === "string" ? parsed.holdReason : null,
    };
  } catch {
    return null;
  }
}

async function inferPreviousStateFromNotes(
  jobId: string,
  before: Date,
  fallbackProgress: number,
): Promise<PreviousJobState | null> {
  const rows = await db
    .select({ text: jobNotes.text })
    .from(jobNotes)
    .where(
      and(
        eq(jobNotes.jobId, jobId),
        eq(jobNotes.noteType, "completion"),
        lt(jobNotes.createdAt, before),
      ),
    )
    .orderBy(desc(jobNotes.createdAt))
    .limit(12);

  for (const row of rows) {
    const text = row.text ?? "";
    if (text.startsWith("Rework requested:")) continue;
    if (text.startsWith("Admin final completion:")) {
      return {
        status: "completed",
        progress: 100,
        completedAt: before.toISOString(),
        ...emptyCheckerHold(),
      };
    }
    if (text.startsWith("Admin completion:")) {
      return {
        status: "awaiting_super_admin",
        progress: 100,
        completedAt: null,
        ...emptyCheckerHold(),
      };
    }
    if (text.startsWith("Supervisor review:")) {
      return {
        status: "awaiting_admin",
        progress: 100,
        completedAt: null,
        ...emptyCheckerHold(),
      };
    }
    if (text.startsWith("Worker submission:")) {
      return {
        status: "awaiting_supervisor",
        progress: fallbackProgress > 0 ? fallbackProgress : 100,
        completedAt: null,
        ...emptyCheckerHold(),
      };
    }
  }
  return null;
}

async function resolvePreviousJobState(job: JobRow): Promise<PreviousJobState> {
  if (job.status !== "rework") {
    return snapshotFromJob(job);
  }

  const rows = await db
    .select({
      previousJobState: jobReworks.previousJobState,
      status: jobReworks.status,
    })
    .from(jobReworks)
    .where(eq(jobReworks.jobId, job.id))
    .orderBy(asc(jobReworks.assignedAt), asc(jobReworks.createdAt));

  for (const row of rows) {
    if (!(ACTIVE_REWORK_STATUSES as readonly string[]).includes(row.status)) continue;
    const parsed = parsePreviousJobState(row.previousJobState);
    if (parsed) return parsed;
  }
  for (const row of [...rows].reverse()) {
    const parsed = parsePreviousJobState(row.previousJobState);
    if (parsed) return parsed;
  }

  const inferred = await inferPreviousStateFromNotes(job.id, new Date(), job.progress ?? 0);
  if (inferred) return inferred;

  return snapshotFromJob(job);
}

function parseChecklistLength(job: JobRow): number {
  try {
    const parsed = JSON.parse(typeof job.description === "string" ? job.description : "{}") as { checklist?: unknown };
    return Array.isArray(parsed.checklist) ? parsed.checklist.length : 0;
  } catch {
    return 0;
  }
}

function isCompletedFileRow(row: { fileCategory: string | null; uploaderRole: string | null }): boolean {
  return row.fileCategory === "completed" || (!row.fileCategory && (row.uploaderRole === "user" || row.uploaderRole === "supervisor"));
}

async function workerHasOriginalCompletedFiles(
  jobId: string,
  userId: string,
  cancelledReworkId: string,
): Promise<boolean> {
  const rows = await db
    .select({
      fileCategory: jobAttachments.fileCategory,
      reworkId: jobAttachments.reworkId,
      uploaderRole: users.role,
      checklistLink: jobChecklistAttachments.attachmentId,
    })
    .from(jobAttachments)
    .innerJoin(users, eq(users.id, jobAttachments.uploadedById))
    .leftJoin(jobChecklistAttachments, eq(jobChecklistAttachments.attachmentId, jobAttachments.id))
    .where(
      and(
        eq(jobAttachments.jobId, jobId),
        eq(jobAttachments.uploadedById, userId),
        isNull(jobAttachments.deletedAt),
      ),
    );

  return rows.some(
    (row) =>
      row.reworkId !== cancelledReworkId &&
      !row.checklistLink &&
      isCompletedFileRow(row),
  );
}

async function restoreChecklistAfterCancel(job: JobRow, rework: JobReworkRow) {
  const remaining = await db
    .select({ id: jobReworks.id, checklistItemId: jobReworks.checklistItemId })
    .from(jobReworks)
    .where(
      and(
        eq(jobReworks.jobId, job.id),
        eq(jobReworks.userId, rework.userId),
        inArray(jobReworks.status, [...ACTIVE_REWORK_STATUSES]),
      ),
    );

  const otherJobLevel = remaining.some((row) => row.checklistItemId == null);
  const protectedItems = new Set(
    remaining.map((row) => row.checklistItemId).filter((id): id is number => id != null),
  );

  const stateRows = await db
    .select({ itemId: jobChecklistState.itemId, status: jobChecklistState.status })
    .from(jobChecklistState)
    .where(and(eq(jobChecklistState.jobId, job.id), eq(jobChecklistState.userId, rework.userId)));

  const targetIds = new Set<number>();
  if (rework.checklistItemId != null) {
    if (otherJobLevel) return;
    if (protectedItems.has(rework.checklistItemId)) return;
    targetIds.add(rework.checklistItemId);
  } else {
    if (otherJobLevel) return;
    for (const row of stateRows) {
      if (row.status === "rework" && !protectedItems.has(row.itemId)) targetIds.add(row.itemId);
    }
  }

  if (targetIds.size === 0) return;

  const restoreToCompleted = await workerHasOriginalCompletedFiles(job.id, rework.userId, rework.id);
  const nextItemStatus = restoreToCompleted ? "completed" : "in_progress";

  for (const itemId of targetIds) {
    const current = stateRows.find((row) => row.itemId === itemId);
    if (current && current.status !== "rework") continue;
    await db
      .update(jobChecklistState)
      .set({
        status: nextItemStatus,
        reworkReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobChecklistState.jobId, job.id),
          eq(jobChecklistState.userId, rework.userId),
          eq(jobChecklistState.itemId, itemId),
        ),
      );
  }
}

async function syncJobAfterReworkCancel(job: JobRow, cancelled: JobReworkRow): Promise<string> {
  if (job.status === "cancelled") {
    return job.status;
  }

  const remaining = await db
    .select({ id: jobReworks.id })
    .from(jobReworks)
    .where(and(eq(jobReworks.jobId, job.id), inArray(jobReworks.status, [...ACTIVE_REWORK_STATUSES])))
    .limit(1);

  if (remaining.length > 0) {
    if (job.status !== "rework") {
      await db
        .update(jobs)
        .set({
          status: "rework" as JobRow["status"],
          completedAt: null,
          reviewStartedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      return "rework";
    }
    return "rework";
  }

  const listLen = parseChecklistLength(job);
  const workerIds = await listJobAssignedWorkerIds(job);
  const stateRows =
    workerIds.length > 0
      ? await db
          .select({
            userId: jobChecklistState.userId,
            itemId: jobChecklistState.itemId,
            status: jobChecklistState.status,
          })
          .from(jobChecklistState)
          .where(and(eq(jobChecklistState.jobId, job.id), inArray(jobChecklistState.userId, workerIds)))
      : [];

  let progress = job.progress ?? 0;
  let allComplete = false;
  if (listLen > 0 && workerIds.length > 0) {
    const done = workerIds.reduce((sum, id) => {
      const completed = new Set(
        stateRows.filter((row) => row.userId === id && row.status === "completed").map((row) => row.itemId),
      );
      return sum + completed.size;
    }, 0);
    const total = listLen * workerIds.length;
    progress = total > 0 ? Math.round((done / total) * 100) : 0;
    allComplete = workerIds.every((id) => {
      const completed = new Set(
        stateRows.filter((row) => row.userId === id && row.status === "completed").map((row) => row.itemId),
      );
      return completed.size >= listLen;
    });
  }

  const snapshot =
    parsePreviousJobState(cancelled.previousJobState) ??
    (await inferPreviousStateFromNotes(job.id, cancelled.assignedAt, progress));

  const heuristicStatus = allComplete ? "awaiting_supervisor" : progress > 0 ? "in_progress" : "pending";
  const nextStatus =
    snapshot?.status && RESTORABLE_JOB_STATUSES.has(snapshot.status) ? snapshot.status : heuristicStatus;

  const restoredProgress =
    nextStatus === "completed" || nextStatus === "awaiting_admin" || nextStatus === "awaiting_super_admin"
      ? 100
      : snapshot
        ? snapshot.progress
        : progress;

  const completedAt = snapshot?.completedAt
    ? new Date(snapshot.completedAt)
    : nextStatus === "completed"
      ? cancelled.assignedAt
      : null;

  const restoringHold = nextStatus === "on_hold";

  await db
    .update(jobs)
    .set({
      status: nextStatus as JobRow["status"],
      progress: restoredProgress,
      completedAt,
      checkedById: snapshot?.checkedById ?? null,
      checkedByLabel: snapshot?.checkedByLabel ?? null,
      checkedAt: snapshot?.checkedAt ? new Date(snapshot.checkedAt) : null,
      reviewStartedAt: null,
      heldFromStatus: restoringHold ? (snapshot?.heldFromStatus ?? job.heldFromStatus ?? null) : null,
      holdReason: restoringHold ? (snapshot?.holdReason ?? job.holdReason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));

  return nextStatus;
}

export async function cancelRework(opts: {
  actor: UserRow;
  job: JobRow;
  reworkId: string;
}) {
  const [existing] = await db
    .select()
    .from(jobReworks)
    .where(and(eq(jobReworks.id, opts.reworkId), eq(jobReworks.jobId, opts.job.id)))
    .limit(1);
  if (!existing) {
    throw new Error("Rework not found.");
  }
  if (!(ACTIVE_REWORK_STATUSES as readonly string[]).includes(existing.status)) {
    throw new Error("Only an active rework can be cancelled.");
  }

  const [rework] = await db
    .update(jobReworks)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(eq(jobReworks.id, existing.id))
    .returning();
  if (!rework) {
    throw new Error("Rework not found.");
  }

  await restoreChecklistAfterCancel(opts.job, existing);
  const jobStatus = await syncJobAfterReworkCancel(opts.job, existing);

  const originLabel = reworkOriginLabel(existing.reworkOrigin);
  const title = originLabel ? `${originLabel} cancelled: ${opts.job.title}` : `Rework cancelled: ${opts.job.title}`;
  const description = `${opts.actor.name} cancelled a rework on ${opts.job.title} that was added in error.`;

  if (existing.reworkOrigin) {
    await notifyAllJobMembers({
      jobId: opts.job.id,
      assigneeId: opts.job.assigneeId,
      supervisorId: opts.job.supervisorId,
      coordinatorId: opts.job.coordinatorId,
      actorId: opts.actor.id,
      title,
      description,
      type: "rework",
    });
  } else {
    await createNotification({
      userId: existing.userId,
      jobId: opts.job.id,
      title,
      description,
      type: "rework",
    });
    await notifyJobManagers({
      jobId: opts.job.id,
      supervisorId: opts.job.supervisorId,
      actorId: opts.actor.id,
      title,
      description,
      type: "rework",
    });
  }

  void announceCliqJobStatusChange({
    job: opts.job,
    actor: opts.actor,
    event: "rework_cancelled",
    previousStatus: opts.job.status,
    reason: existing.reason,
    reworkOrigin: existing.reworkOrigin === "internal" || existing.reworkOrigin === "external" ? existing.reworkOrigin : null,
    checklistItemId: existing.checklistItemId,
  });

  return { rework, jobStatus };
}
