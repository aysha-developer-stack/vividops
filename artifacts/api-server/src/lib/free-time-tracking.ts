import { and, eq, isNull } from "drizzle-orm";
import {
  activeTimerSessions,
  db,
  freeTimeReports,
  jobs,
  jobMembers,
  users,
  type FreeTimeReportRow,
} from "@workspace/db";
import { getPresenceStatus } from "./presence";
import {
  formatFreeDuration,
  isOnJobTimer,
  liveFreeDurationSeconds,
  pktDateString,
  pktDayStart,
  shouldKeepClosedPeriod,
} from "./detect-free-time";
import { ensureFreeTimeSchema } from "./schema-init";
import { createNotification, previewText } from "./notifications";
import { logger } from "./logger";

async function loadOpenReport(userId: string): Promise<FreeTimeReportRow | null> {
  const [row] = await db
    .select()
    .from(freeTimeReports)
    .where(and(eq(freeTimeReports.userId, userId), isNull(freeTimeReports.endedAt)))
    .limit(1);
  return row ?? null;
}

async function notifyPersonSupervisors(opts: {
  userId: string;
  actorId: string;
  title: string;
  description: string;
}) {
  const supervisorIds = new Set<string>();
  const assigned = await db
    .select({ supervisorId: jobs.supervisorId })
    .from(jobs)
    .where(eq(jobs.assigneeId, opts.userId));
  for (const row of assigned) {
    if (row.supervisorId) supervisorIds.add(row.supervisorId);
  }
  const memberJobs = await db
    .select({ supervisorId: jobs.supervisorId })
    .from(jobMembers)
    .innerJoin(jobs, eq(jobs.id, jobMembers.jobId))
    .where(eq(jobMembers.userId, opts.userId));
  for (const row of memberJobs) {
    if (row.supervisorId) supervisorIds.add(row.supervisorId);
  }
  supervisorIds.delete(opts.actorId);
  for (const supervisorId of supervisorIds) {
    await createNotification({
      userId: supervisorId,
      title: opts.title,
      description: opts.description,
      type: "free_time",
    });
  }
}

function isOutsideKind(row: Pick<FreeTimeReportRow, "kind">): boolean {
  return row.kind === "outside_work";
}

function closedStatusFor(row: Pick<FreeTimeReportRow, "kind" | "workerNotes">): string {
  if (isOutsideKind(row)) return "outside";
  return (row.workerNotes ?? "").trim() ? "submitted" : "detected";
}

async function closeOpenFreeTimeAt(open: FreeTimeReportRow, endedAt: Date): Promise<void> {
  const startedAt = open.startedAt ?? open.createdAt;
  const duration = liveFreeDurationSeconds(startedAt, endedAt, endedAt);
  if (!isOutsideKind(open) && !shouldKeepClosedPeriod(duration)) {
    await db.delete(freeTimeReports).where(eq(freeTimeReports.id, open.id));
    return;
  }
  await db
    .update(freeTimeReports)
    .set({
      endedAt,
      durationSeconds: duration,
      status: closedStatusFor(open),
      updatedAt: endedAt,
    })
    .where(and(eq(freeTimeReports.id, open.id), isNull(freeTimeReports.endedAt)));
}

export async function closeOpenFreeTime(
  userId: string,
  now = new Date(),
): Promise<FreeTimeReportRow | null> {
  await ensureFreeTimeSchema();
  const open = await loadOpenReport(userId);
  if (!open) return null;

  const startedAt = open.startedAt ?? open.createdAt;
  const duration = liveFreeDurationSeconds(startedAt, now, now);
  const outside = isOutsideKind(open);
  if (!outside && !shouldKeepClosedPeriod(duration)) {
    await db.delete(freeTimeReports).where(eq(freeTimeReports.id, open.id));
    return null;
  }

  const notes = (open.workerNotes ?? "").trim();
  const [updated] = await db
    .update(freeTimeReports)
    .set({
      endedAt: now,
      durationSeconds: duration,
      status: closedStatusFor(open),
      updatedAt: now,
    })
    .where(and(eq(freeTimeReports.id, open.id), isNull(freeTimeReports.endedAt)))
    .returning();
  if (!updated) return null;

  if (outside) return updated;

  const [person] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const label = person?.name ?? "Worker";
  const when = formatFreeDuration(duration);
  try {
    await createNotification({
      userId,
      title: "Free time detected",
      description: `You were not on a job timer for ${when}. Add what you did or learned.`,
      type: "free_time",
    });
    await notifyPersonSupervisors({
      userId,
      actorId: userId,
      title: `Free time detected — ${label}`,
      description: `${label} was free for ${when} on ${String(updated.reportDate).slice(0, 10)}: ${
        notes ? previewText(notes) : "waiting for notes"
      }`,
    });
  } catch (err) {
    logger.warn({ err, userId }, "Failed to notify free time close");
  }
  return updated;
}

async function continueOpenReport(
  open: FreeTimeReportRow,
  today: string,
  now: Date,
): Promise<FreeTimeReportRow | null> {
  const openDate =
    typeof open.reportDate === "string"
      ? open.reportDate.slice(0, 10)
      : pktDateString(open.startedAt ?? open.createdAt);
  if (openDate !== today) {
    const splitAt = pktDayStart(today);
    const endAt = splitAt.getTime() < now.getTime() ? splitAt : now;
    await closeOpenFreeTimeAt(open, endAt);
    if (!isOutsideKind(open)) return null;
    try {
      const [created] = await db
        .insert(freeTimeReports)
        .values({
          userId: open.userId,
          createdById: open.createdById,
          reportDate: today,
          startedAt: now,
          durationSeconds: 0,
          workerNotes: open.workerNotes ?? "",
          source: "auto",
          kind: "outside_work",
          status: "open",
          updatedAt: now,
        })
        .returning();
      return created ?? null;
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code !== "23505") {
        logger.error({ err, userId: open.userId }, "Failed to roll outside work to a new day");
        return null;
      }
      return loadOpenReport(open.userId);
    }
  }
  const duration = liveFreeDurationSeconds(open.startedAt ?? open.createdAt, null, now);
  const [updated] = await db
    .update(freeTimeReports)
    .set({ durationSeconds: duration, updatedAt: now })
    .where(eq(freeTimeReports.id, open.id))
    .returning();
  return updated ?? open;
}

export async function ensureOpenFreeTime(
  userId: string,
  opts?: { now?: Date; requireOnline?: boolean },
): Promise<FreeTimeReportRow | null> {
  await ensureFreeTimeSchema();
  const now = opts?.now ?? new Date();
  const [person] = await db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      lastSeenAt: users.lastSeenAt,
      lastSignInAt: users.lastSignInAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!person || person.role !== "user" || person.status !== "active") return null;

  if (opts?.requireOnline !== false) {
    const presence = getPresenceStatus({
      accountStatus: person.status,
      lastSeenAt: person.lastSeenAt,
      lastSignInAt: person.lastSignInAt,
      now: now.getTime(),
    });
    if (presence !== "online") return null;
  }

  const [session] = await db
    .select()
    .from(activeTimerSessions)
    .where(eq(activeTimerSessions.userId, userId))
    .limit(1);
  if (isOnJobTimer(session, now.getTime())) return null;

  const today = pktDateString(now);
  const open = await loadOpenReport(userId);
  if (open) {
    if (isOutsideKind(open)) return continueOpenReport(open, today, now);
    const continued = await continueOpenReport(open, today, now);
    if (continued) return continued;
  }

  try {
    const [created] = await db
      .insert(freeTimeReports)
      .values({
        userId,
        createdById: userId,
        reportDate: today,
        startedAt: now,
        durationSeconds: 0,
        workerNotes: "",
        source: "auto",
        kind: "free",
        status: "open",
        updatedAt: now,
      })
      .returning();
    return created ?? null;
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code !== "23505") {
      logger.error({ err, userId }, "Failed to open free time");
      return null;
    }
    return loadOpenReport(userId);
  }
}

/** Close free time because a job timer started. */
export async function onJobTimerStarted(userId: string): Promise<void> {
  try {
    await closeOpenFreeTime(userId);
  } catch (err) {
    logger.warn({ err, userId }, "Failed to close free time on timer start");
  }
}

/** Open free time because the job timer stopped or paused. */
export async function onJobTimerStopped(userId: string): Promise<void> {
  try {
    await ensureOpenFreeTime(userId, { requireOnline: false });
  } catch (err) {
    logger.warn({ err, userId }, "Failed to open free time on timer stop");
  }
}

export type OutsideWorkResult =
  | { ok: true; report: FreeTimeReportRow }
  | { ok: false; status: number; error: string };

/** Worker is on a job that is not in Vivid OPS — do not count as idle. */
export async function startOutsideWork(
  userId: string,
  note: string,
  now = new Date(),
): Promise<OutsideWorkResult> {
  await ensureFreeTimeSchema();
  const [person] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!person || person.status !== "active") return { ok: false, status: 404, error: "Person not found" };

  const [session] = await db
    .select()
    .from(activeTimerSessions)
    .where(eq(activeTimerSessions.userId, userId))
    .limit(1);
  if (isOnJobTimer(session, now.getTime())) {
    return { ok: false, status: 400, error: "Stop the Vivid OPS job timer first" };
  }

  const today = pktDateString(now);
  const open = await loadOpenReport(userId);
  if (open && isOutsideKind(open)) {
    const [updated] = await db
      .update(freeTimeReports)
      .set({
        workerNotes: note || open.workerNotes,
        updatedAt: now,
      })
      .where(eq(freeTimeReports.id, open.id))
      .returning();
    return { ok: true, report: updated ?? open };
  }

  if (open) {
    const [updated] = await db
      .update(freeTimeReports)
      .set({
        kind: "outside_work",
        workerNotes: note || open.workerNotes,
        status: "open",
        updatedAt: now,
      })
      .where(eq(freeTimeReports.id, open.id))
      .returning();
    if (updated) return { ok: true, report: updated };
  }

  try {
    const [created] = await db
      .insert(freeTimeReports)
      .values({
        userId,
        createdById: userId,
        reportDate: today,
        startedAt: now,
        durationSeconds: 0,
        workerNotes: note,
        source: "auto",
        kind: "outside_work",
        status: "open",
        updatedAt: now,
      })
      .returning();
    if (!created) return { ok: false, status: 500, error: "Could not start outside work" };
    return { ok: true, report: created };
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code !== "23505") {
      logger.error({ err, userId }, "Failed to start outside work");
      return { ok: false, status: 500, error: "Could not start outside work" };
    }
    const raced = await loadOpenReport(userId);
    if (raced) return { ok: true, report: raced };
    return { ok: false, status: 500, error: "Could not start outside work" };
  }
}

export async function stopOutsideWork(userId: string, now = new Date()): Promise<FreeTimeReportRow | null> {
  const open = await loadOpenReport(userId);
  if (!open || !isOutsideKind(open)) return null;
  return closeOpenFreeTime(userId, now);
}

export async function reconcileFreeTime(now = new Date()): Promise<void> {
  await ensureFreeTimeSchema();
  const workers = await db
    .select({
      id: users.id,
      status: users.status,
      lastSeenAt: users.lastSeenAt,
      lastSignInAt: users.lastSignInAt,
    })
    .from(users)
    .where(and(eq(users.role, "user"), eq(users.status, "active")));
  const sessions = await db.select().from(activeTimerSessions);
  const sessionByUser = new Map(sessions.map((s) => [s.userId, s]));
  const nowMs = now.getTime();
  const today = pktDateString(now);

  for (const worker of workers) {
    const working = isOnJobTimer(sessionByUser.get(worker.id), nowMs);
    if (working) {
      await closeOpenFreeTime(worker.id, now);
      continue;
    }
    const open = await loadOpenReport(worker.id);
    if (open && isOutsideKind(open)) {
      await continueOpenReport(open, today, now);
      continue;
    }
    const presence = getPresenceStatus({
      accountStatus: worker.status,
      lastSeenAt: worker.lastSeenAt,
      lastSignInAt: worker.lastSignInAt,
      now: nowMs,
    });
    if (presence !== "online") {
      await closeOpenFreeTime(worker.id, now);
    } else {
      await ensureOpenFreeTime(worker.id, { now, requireOnline: false });
    }
  }

  const leftoverOpen = await db.select().from(freeTimeReports).where(isNull(freeTimeReports.endedAt));
  const workerIds = new Set(workers.map((w) => w.id));
  for (const open of leftoverOpen) {
    if (!workerIds.has(open.userId)) await closeOpenFreeTime(open.userId, now);
  }
}
