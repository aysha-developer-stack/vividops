import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  freeTimeReports,
  jobs,
  jobMembers,
  users,
  type FreeTimeReportRow,
  type UserRow,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { createNotification, previewText } from "../lib/notifications";
import { ensureFreeTimeSchema } from "../lib/schema-init";
import { liveFreeDurationSeconds } from "../lib/detect-free-time";
import { REPORT_TIMEZONE, shiftDateString, todayInTimezone } from "../lib/report-dates";
import { reconcileFreeTime, startOutsideWork, stopOutsideWork } from "../lib/free-time-tracking";

const router: IRouter = Router();

const targetUserAlias = alias(users, "free_time_target");
const creatorAlias = alias(users, "free_time_creator");
const reviewerAlias = alias(users, "free_time_reviewer");

function isAdmin(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin";
}

function resolveDateRange(query: Record<string, unknown>): { from: string | null; to: string | null } {
  const fromRaw = typeof query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : null;
  const toRaw = typeof query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : null;
  if (fromRaw || toRaw) return { from: fromRaw, to: toRaw };
  const period = typeof query.period === "string" ? query.period : "30d";
  if (period === "all") return { from: null, to: null };
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const to = todayInTimezone(REPORT_TIMEZONE);
  return { from: shiftDateString(to, -(days - 1)), to };
}

async function supervisorTeamUserIds(supervisorId: string): Promise<string[]> {
  const jobIds = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.supervisorId, supervisorId))).map(
    (r) => r.id,
  );
  const ids = new Set<string>();
  if (jobIds.length === 0) return [];
  const supervised = await db.select({ assigneeId: jobs.assigneeId }).from(jobs).where(inArray(jobs.id, jobIds));
  for (const row of supervised) {
    if (row.assigneeId) ids.add(row.assigneeId);
  }
  const members = await db
    .select({ userId: jobMembers.userId })
    .from(jobMembers)
    .where(inArray(jobMembers.jobId, jobIds));
  for (const member of members) ids.add(member.userId);
  return [...ids];
}

async function canReviewUser(actor: UserRow, userId: string): Promise<boolean> {
  if (isAdmin(actor)) return true;
  if (actor.role !== "supervisor") return false;
  const team = await supervisorTeamUserIds(actor.id);
  return team.includes(userId);
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

function publicReport(
  row: FreeTimeReportRow,
  user: { id: string; name: string } | null,
  createdBy: { id: string; name: string } | null,
  reviewedBy: { id: string; name: string } | null,
  now = new Date(),
) {
  const reportDate =
    typeof row.reportDate === "string"
      ? row.reportDate.slice(0, 10)
      : row.reportDate instanceof Date
        ? row.reportDate.toISOString().slice(0, 10)
        : String(row.reportDate ?? "").slice(0, 10);
  const startedAt = row.startedAt ?? row.createdAt;
  const durationSeconds = liveFreeDurationSeconds(startedAt, row.endedAt, now);
  return {
    id: row.id,
    userId: row.userId,
    createdById: row.createdById,
    reportDate,
    startedAt: startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds,
    workerNotes: row.workerNotes ?? "",
    supervisorNotes: row.supervisorNotes,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    source: row.source ?? "auto",
    kind: row.kind === "outside_work" ? "outside_work" : "free",
    status: row.endedAt ? row.status : "open",
    isOpen: !row.endedAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    user,
    createdBy,
    reviewedBy,
  };
}

router.get("/free-time", requireAuth, async (req, res) => {
  try {
    await ensureFreeTimeSchema();
    try {
      await reconcileFreeTime();
    } catch (err) {
      logger.warn({ err }, "Free time reconcile on list failed");
    }
    const actor = req.session!.user;
    const { from, to } = resolveDateRange(req.query as Record<string, unknown>);
    const conditions: SQL[] = [];
    if (from) conditions.push(gte(freeTimeReports.reportDate, from));
    if (to) conditions.push(lte(freeTimeReports.reportDate, to));

    const userIdFilter =
      typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : null;
    if (userIdFilter) {
      if (actor.role === "user" && userIdFilter !== actor.id) {
        return res.status(403).json({ error: "You can only view your own free time" });
      }
      if (actor.role === "supervisor") {
        const allowed = await canReviewUser(actor, userIdFilter);
        if (!allowed && userIdFilter !== actor.id) {
          return res.status(403).json({ error: "That person is not on your team" });
        }
      }
      conditions.push(eq(freeTimeReports.userId, userIdFilter));
    } else if (actor.role === "user") {
      conditions.push(eq(freeTimeReports.userId, actor.id));
    } else if (actor.role === "supervisor") {
      const team = await supervisorTeamUserIds(actor.id);
      const visible = [...new Set([...team, actor.id])];
      conditions.push(inArray(freeTimeReports.userId, visible));
    } else if (actor.role === "coordinator") {
      conditions.push(sql`false`);
    }

    const rows = await db
      .select({
        report: freeTimeReports,
        user: { id: targetUserAlias.id, name: targetUserAlias.name },
        createdBy: { id: creatorAlias.id, name: creatorAlias.name },
        reviewedBy: { id: reviewerAlias.id, name: reviewerAlias.name },
      })
      .from(freeTimeReports)
      .leftJoin(targetUserAlias, eq(targetUserAlias.id, freeTimeReports.userId))
      .leftJoin(creatorAlias, eq(creatorAlias.id, freeTimeReports.createdById))
      .leftJoin(reviewerAlias, eq(reviewerAlias.id, freeTimeReports.reviewedById))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(freeTimeReports.reportDate), desc(freeTimeReports.startedAt), desc(freeTimeReports.createdAt));

    const now = new Date();
    return res.json(
      rows.map((r) =>
        publicReport(
          r.report,
          r.user?.id ? r.user : null,
          r.createdBy?.id ? r.createdBy : null,
          r.reviewedBy?.id ? r.reviewedBy : null,
          now,
        ),
      ),
    );
  } catch (err) {
    logger.error({ err }, "Failed to list free time reports");
    return res.status(500).json({ error: "Could not load free time reports" });
  }
});

router.post("/free-time", requireAuth, async (_req, res) => {
  return res.status(400).json({
    error: "Free time is detected automatically when a worker is online with no job timer. Add notes on the detected period instead.",
  });
});

router.post("/free-time/outside-work", requireAuth, async (req, res) => {
  try {
    await ensureFreeTimeSchema();
    const actor = req.session!.user;
    const body = req.body as { userId?: unknown; note?: unknown; active?: unknown };
    const targetUserId =
      typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : actor.id;
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const active = body.active !== false;

    if (actor.role === "coordinator") {
      return res.status(403).json({ error: "Coordinators cannot log outside work" });
    }
    if (actor.role === "user" && targetUserId !== actor.id) {
      return res.status(403).json({ error: "You can only mark your own outside work" });
    }
    if (actor.role === "supervisor" && targetUserId !== actor.id) {
      const allowed = await canReviewUser(actor, targetUserId);
      if (!allowed) return res.status(403).json({ error: "That person is not on your team" });
    }

    if (!active) {
      const stopped = await stopOutsideWork(targetUserId);
      const [target] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      return res.json({
        active: false,
        report: stopped
          ? publicReport(stopped, target ?? null, { id: actor.id, name: actor.name }, null)
          : null,
      });
    }

    const result = await startOutsideWork(targetUserId, note);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const [target] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    return res.json({
      active: true,
      report: publicReport(result.report, target ?? null, { id: actor.id, name: actor.name }, null),
    });
  } catch (err) {
    logger.error({ err }, "Failed to update outside work");
    return res.status(500).json({ error: "Could not update outside work" });
  }
});

router.patch("/free-time/:id", requireAuth, async (req, res) => {
  try {
    await ensureFreeTimeSchema();
    const actor = req.session!.user;
    const id = String(req.params.id);
    const [existing] = await db.select().from(freeTimeReports).where(eq(freeTimeReports.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Report not found" });

    const body = req.body as { workerNotes?: unknown; supervisorNotes?: unknown; kind?: unknown };
    const workerNotes =
      typeof body.workerNotes === "string" ? body.workerNotes.trim() : undefined;
    const supervisorNotes =
      typeof body.supervisorNotes === "string" ? body.supervisorNotes.trim() : undefined;
    const kind =
      body.kind === "outside_work" || body.kind === "free" ? (body.kind as "outside_work" | "free") : undefined;

    if (workerNotes === undefined && supervisorNotes === undefined && kind === undefined) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    let next = existing;

    if (workerNotes !== undefined) {
      const canWriteNotes = existing.userId === actor.id || isAdmin(actor) || (await canReviewUser(actor, existing.userId));
      if (!canWriteNotes) return res.status(403).json({ error: "You cannot edit these notes" });
      const now = new Date();
      const nextStatus =
        existing.status === "reviewed" || existing.status === "open"
          ? existing.status
          : workerNotes
            ? "submitted"
            : "detected";
      const [updated] = await db
        .update(freeTimeReports)
        .set({
          workerNotes,
          status: existing.endedAt ? nextStatus : "open",
          updatedAt: now,
        })
        .where(eq(freeTimeReports.id, id))
        .returning();
      next = updated ?? next;
      if (workerNotes && existing.userId === actor.id) {
        await notifyPersonSupervisors({
          userId: existing.userId,
          actorId: actor.id,
          title: `Free time notes from ${actor.name}`,
          description: previewText(workerNotes),
        });
      }
    }

    if (kind !== undefined) {
      const canReview = await canReviewUser(actor, existing.userId);
      if (!canReview && existing.userId !== actor.id) {
        return res.status(403).json({ error: "You cannot change this type" });
      }
      const now = new Date();
      const nextStatus =
        kind === "outside_work"
          ? existing.endedAt
            ? "outside"
            : "open"
          : existing.endedAt
            ? existing.status === "outside"
              ? "detected"
              : existing.status
            : "open";
      const [updated] = await db
        .update(freeTimeReports)
        .set({
          kind,
          status: nextStatus,
          updatedAt: now,
        })
        .where(eq(freeTimeReports.id, id))
        .returning();
      next = updated ?? next;
    }

    if (supervisorNotes !== undefined) {
      const canReview = await canReviewUser(actor, existing.userId);
      if (!canReview) return res.status(403).json({ error: "Only the supervisor can fill working notes" });
      if (!supervisorNotes) return res.status(400).json({ error: "Write what they did during this time" });
      const now = new Date();
      const startedAt = next.startedAt ?? next.createdAt;
      const duration = liveFreeDurationSeconds(startedAt, next.endedAt ?? now, now);
      const [updated] = await db
        .update(freeTimeReports)
        .set({
          supervisorNotes,
          reviewedById: actor.id,
          reviewedAt: now,
          status: "reviewed",
          endedAt: next.endedAt ?? now,
          durationSeconds: duration,
          updatedAt: now,
        })
        .where(eq(freeTimeReports.id, id))
        .returning();
      next = updated ?? next;
      if (existing.userId !== actor.id) {
        await createNotification({
          userId: existing.userId,
          title: "Supervisor filled your free time",
          description: `${actor.name} added what you did during free time: ${previewText(supervisorNotes)}`,
          type: "free_time",
        });
      }
    }

    const [target] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, next.userId)).limit(1);
    const [creator] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, next.createdById)).limit(1);
    const [reviewer] = next.reviewedById
      ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, next.reviewedById)).limit(1)
      : [null];
    return res.json(publicReport(next, target ?? null, creator ?? null, reviewer ?? null));
  } catch (err) {
    logger.error({ err }, "Failed to update free time report");
    return res.status(500).json({ error: "Could not save notes" });
  }
});

export default router;
