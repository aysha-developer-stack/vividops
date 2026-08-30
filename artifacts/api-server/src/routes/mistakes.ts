import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  errorReports,
  jobs,
  jobMembers,
  users,
  MISTAKE_CATEGORIES,
  type ErrorReportRow,
  type JobRow,
  type MistakeCategory,
  type UserRow,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { jobDisplayNumber } from "../lib/serialize";
import { createNotification, notifyJobManagers, previewText } from "../lib/notifications";

const router: IRouter = Router();

const targetUserAlias = alias(users, "target_user");
const creatorAlias = alias(users, "creator_user");

/** Only manually logged mistakes — never rework-linked or auto-generated records. */
const manualMistakeOnly = and(
  eq(errorReports.source, "manual"),
  isNull(errorReports.reworkId),
);

function isMistakeCategory(value: unknown): value is MistakeCategory {
  return typeof value === "string" && (MISTAKE_CATEGORIES as readonly string[]).includes(value);
}

function parseDateBound(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function resolveDateRange(
  query: Record<string, unknown>,
  opts?: { defaultPeriod?: string },
): { from: Date | null; to: Date | null; period: string } {
  const fromQ = parseDateBound(query.from);
  const toQ = parseDateBound(query.to);
  if (fromQ || toQ) {
    return { from: fromQ, to: toQ, period: "custom" };
  }
  const period =
    typeof query.period === "string" && query.period
      ? query.period
      : (opts?.defaultPeriod ?? "30d");
  if (period === "all") return { from: null, to: null, period: "all" };
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  return { from, to: null, period: period === "7d" || period === "90d" ? period : "30d" };
}

function pushDateConditions(conditions: SQL[], from: Date | null, to: Date | null) {
  if (from) conditions.push(gte(errorReports.createdAt, from));
  if (to) conditions.push(lte(errorReports.createdAt, to));
}

function isAdmin(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin";
}

function canLogMistakes(actor: UserRow): boolean {
  return isAdmin(actor);
}

function canManageJob(actor: UserRow, job: JobRow): boolean {
  return isAdmin(actor);
}

export type PublicMistake = {
  id: string;
  jobId: string | null;
  userId: string;
  createdById: string;
  title: string;
  description: string;
  category: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  jobNumber: string | null;
  jobTitle: string | null;
  user: { id: string; name: string; role: UserRow["role"] } | null;
  createdBy: { id: string; name: string; role: UserRow["role"] } | null;
};

function toPublic(row: {
  report: ErrorReportRow;
  job: Pick<JobRow, "id" | "serial" | "title"> | null;
  user: Pick<UserRow, "id" | "name" | "role"> | null;
  createdBy: Pick<UserRow, "id" | "name" | "role"> | null;
}): PublicMistake {
  return {
    id: row.report.id,
    jobId: row.report.jobId,
    userId: row.report.userId,
    createdById: row.report.createdById,
    title: row.report.title,
    description: row.report.description,
    category: row.report.category,
    severity: row.report.severity,
    status: row.report.status,
    resolvedAt: row.report.resolvedAt?.toISOString() ?? null,
    createdAt: row.report.createdAt.toISOString(),
    updatedAt: row.report.updatedAt.toISOString(),
    jobNumber: row.job ? jobDisplayNumber(row.job) : null,
    jobTitle: row.job?.title ?? null,
    user: row.user?.id ? row.user : null,
    createdBy: row.createdBy?.id ? row.createdBy : null,
  };
}

async function coordinatorJobIds(coordinatorId: string): Promise<string[]> {
  const rows = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.coordinatorId, coordinatorId));
  return rows.map((r) => r.id);
}

async function coordinatorScope(coordinatorId: string): Promise<{ jobIds: string[]; teamUserIds: string[] }> {
  const jobIds = await coordinatorJobIds(coordinatorId);
  const teamUserIds = new Set<string>();
  if (jobIds.length > 0) {
    const coordinated = await db
      .select({ assigneeId: jobs.assigneeId })
      .from(jobs)
      .where(inArray(jobs.id, jobIds));
    for (const row of coordinated) {
      if (row.assigneeId) teamUserIds.add(row.assigneeId);
    }
    const members = await db
      .select({ userId: jobMembers.userId })
      .from(jobMembers)
      .where(inArray(jobMembers.jobId, jobIds));
    for (const member of members) teamUserIds.add(member.userId);
  }
  return { jobIds, teamUserIds: [...teamUserIds] };
}

async function supervisorJobIds(supervisorId: string): Promise<string[]> {
  const rows = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.supervisorId, supervisorId));
  return rows.map((r) => r.id);
}

async function supervisorScope(supervisorId: string): Promise<{ jobIds: string[]; teamUserIds: string[] }> {
  const jobIds = await supervisorJobIds(supervisorId);
  const teamUserIds = new Set<string>();
  if (jobIds.length > 0) {
    const supervised = await db
      .select({ assigneeId: jobs.assigneeId })
      .from(jobs)
      .where(inArray(jobs.id, jobIds));
    for (const row of supervised) {
      if (row.assigneeId) teamUserIds.add(row.assigneeId);
    }
    const members = await db
      .select({ userId: jobMembers.userId })
      .from(jobMembers)
      .where(inArray(jobMembers.jobId, jobIds));
    for (const member of members) teamUserIds.add(member.userId);
  }
  return { jobIds, teamUserIds: [...teamUserIds] };
}

function supervisorVisibility(jobIds: string[], teamUserIds: string[]): SQL {
  if (jobIds.length === 0 && teamUserIds.length === 0) return sql`false`;
  const parts: SQL[] = [];
  if (jobIds.length > 0) parts.push(inArray(errorReports.jobId, jobIds));
  if (teamUserIds.length > 0) {
    parts.push(and(isNull(errorReports.jobId), inArray(errorReports.userId, teamUserIds))!);
  }
  if (parts.length === 1) return parts[0]!;
  return or(...parts)!;
}

router.get("/mistakes/categories", requireAuth, (_req, res) => {
  res.json(MISTAKE_CATEGORIES.filter((c) => c !== "rework"));
  return;
});

router.get("/mistakes/analytics", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  const query = req.query as Record<string, unknown>;
  const { from, to, period } = resolveDateRange(query);
  const focusUserId = typeof query.userId === "string" && query.userId ? query.userId : null;

  const conditions: SQL[] = [manualMistakeOnly!];
  pushDateConditions(conditions, from, to);

  if (actor.role === "user") {
    conditions.push(eq(errorReports.userId, actor.id));
  } else if (actor.role === "supervisor") {
    const { jobIds, teamUserIds } = await supervisorScope(actor.id);
    if (jobIds.length === 0 && teamUserIds.length === 0) {
      return res.json({
        period,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        byUser: [],
        byCategory: [],
        byMonth: [],
        total: 0,
        open: 0,
        highSeverity: 0,
        userProfile: null,
      });
    }
    conditions.push(supervisorVisibility(jobIds, teamUserIds));
  } else if (actor.role === "coordinator") {
    const { jobIds, teamUserIds } = await coordinatorScope(actor.id);
    if (jobIds.length === 0 && teamUserIds.length === 0) {
      return res.json({
        period,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        byUser: [],
        byCategory: [],
        byMonth: [],
        total: 0,
        open: 0,
        highSeverity: 0,
        userProfile: null,
      });
    }
    conditions.push(supervisorVisibility(jobIds, teamUserIds));
  }

  const baseWhere = and(...conditions);

  const [byUser, byCategory, byMonth, totals] = await Promise.all([
    db
      .select({
        userId: errorReports.userId,
        name: users.name,
        count: sql<number>`count(*)::int`,
        openCount: sql<number>`count(*) filter (where ${errorReports.status} = 'open')::int`,
        highSeverity: sql<number>`count(*) filter (where ${errorReports.severity} = 'high')::int`,
      })
      .from(errorReports)
      .innerJoin(users, eq(users.id, errorReports.userId))
      .where(baseWhere)
      .groupBy(errorReports.userId, users.name)
      .orderBy(desc(sql`count(*)`))
      .limit(20),
    db
      .select({
        category: errorReports.category,
        count: sql<number>`count(*)::int`,
      })
      .from(errorReports)
      .where(baseWhere)
      .groupBy(errorReports.category)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${errorReports.createdAt}), 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
        openCount: sql<number>`count(*) filter (where ${errorReports.status} = 'open')::int`,
      })
      .from(errorReports)
      .where(baseWhere)
      .groupBy(sql`date_trunc('month', ${errorReports.createdAt})`)
      .orderBy(sql`date_trunc('month', ${errorReports.createdAt})`),
    db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${errorReports.status} = 'open')::int`,
        highSeverity: sql<number>`count(*) filter (where ${errorReports.severity} = 'high')::int`,
      })
      .from(errorReports)
      .where(baseWhere),
  ]);

  let userProfile: {
    userId: string;
    name: string;
    total: number;
    open: number;
    highSeverity: number;
    byCategory: Array<{ category: string; count: number }>;
    bySeverity: Array<{ severity: string; count: number }>;
  } | null = null;

  const profileUserId = focusUserId ?? (actor.role === "user" ? actor.id : null);
  if (profileUserId) {
    const profileWhere = and(...conditions, eq(errorReports.userId, profileUserId));
    const [profileUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, profileUserId))
      .limit(1);

    if (profileUser) {
      const [pTotals, pCategories, pSeverity] = await Promise.all([
        db
          .select({
            total: sql<number>`count(*)::int`,
            open: sql<number>`count(*) filter (where ${errorReports.status} = 'open')::int`,
            highSeverity: sql<number>`count(*) filter (where ${errorReports.severity} = 'high')::int`,
          })
          .from(errorReports)
          .where(profileWhere),
        db
          .select({
            category: errorReports.category,
            count: sql<number>`count(*)::int`,
          })
          .from(errorReports)
          .where(profileWhere)
          .groupBy(errorReports.category)
          .orderBy(desc(sql`count(*)`)),
        db
          .select({
            severity: errorReports.severity,
            count: sql<number>`count(*)::int`,
          })
          .from(errorReports)
          .where(profileWhere)
          .groupBy(errorReports.severity)
          .orderBy(desc(sql`count(*)`)),
      ]);

      userProfile = {
        userId: profileUser.id,
        name: profileUser.name,
        total: pTotals[0]?.total ?? 0,
        open: pTotals[0]?.open ?? 0,
        highSeverity: pTotals[0]?.highSeverity ?? 0,
        byCategory: pCategories,
        bySeverity: pSeverity.map((r) => ({ severity: String(r.severity), count: r.count })),
      };
    }
  }

  res.json({
    period,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    byUser,
    byCategory,
    byMonth,
    total: totals[0]?.total ?? 0,
    open: totals[0]?.open ?? 0,
    highSeverity: totals[0]?.highSeverity ?? 0,
    userProfile,
  });
  return;
});

router.get("/mistakes", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  const query = req.query as Record<string, unknown>;
  const userIdFilter = typeof query.userId === "string" ? query.userId : null;
  const jobIdFilter = typeof query.jobId === "string" ? query.jobId : null;
  const categoryFilter = typeof query.category === "string" ? query.category : null;
  const { from, to } = resolveDateRange(query, { defaultPeriod: "all" });

  const q = db
    .select({
      report: errorReports,
      job: { id: jobs.id, serial: jobs.serial, title: jobs.title },
      user: { id: targetUserAlias.id, name: targetUserAlias.name, role: targetUserAlias.role },
      createdBy: { id: creatorAlias.id, name: creatorAlias.name, role: creatorAlias.role },
    })
    .from(errorReports)
    .leftJoin(jobs, eq(jobs.id, errorReports.jobId))
    .leftJoin(targetUserAlias, eq(targetUserAlias.id, errorReports.userId))
    .leftJoin(creatorAlias, eq(creatorAlias.id, errorReports.createdById))
    .orderBy(desc(errorReports.createdAt));

  const filters: SQL[] = [manualMistakeOnly!];
  if (userIdFilter) filters.push(eq(errorReports.userId, userIdFilter));
  if (jobIdFilter) filters.push(eq(errorReports.jobId, jobIdFilter));
  if (categoryFilter && isMistakeCategory(categoryFilter) && categoryFilter !== "rework") {
    filters.push(eq(errorReports.category, categoryFilter));
  }
  pushDateConditions(filters, from, to);

  if (actor.role === "super-admin" || actor.role === "admin") {
    const rows = await q.where(and(...filters));
    res.json(rows.map(toPublic));
    return;
  }

  if (actor.role === "supervisor") {
    const { jobIds, teamUserIds } = await supervisorScope(actor.id);
    if (jobIds.length === 0 && teamUserIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await q.where(and(supervisorVisibility(jobIds, teamUserIds), ...filters));
    res.json(rows.map(toPublic));
    return;
  }

  if (actor.role === "coordinator") {
    const { jobIds, teamUserIds } = await coordinatorScope(actor.id);
    if (jobIds.length === 0 && teamUserIds.length === 0) {
      res.json([]);
      return;
    }
    const rows = await q.where(and(supervisorVisibility(jobIds, teamUserIds), ...filters));
    res.json(rows.map(toPublic));
    return;
  }

  const rows = await q.where(and(eq(errorReports.userId, actor.id), ...filters));
  res.json(rows.map(toPublic));
});

router.post("/mistakes", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  if (!canLogMistakes(actor)) {
    res.status(403).json({ error: "Only admin or super-admin can log mistakes" });
    return;
  }

  const body = req.body as Partial<{
    jobId: string | null;
    userId: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    category: string;
  }>;

  if (!body.userId || !body.title?.trim() || !body.description?.trim()) {
    res.status(400).json({ error: "userId, title and description are required" });
    return;
  }

  const severity = body.severity ?? "medium";
  if (severity !== "low" && severity !== "medium" && severity !== "high") {
    res.status(400).json({ error: "Invalid severity" });
    return;
  }

  let category: MistakeCategory = isMistakeCategory(body.category) && body.category !== "rework"
    ? body.category
    : "other";

  let jobRow: JobRow | null = null;
  if (body.jobId) {
    const [j] = await db.select().from(jobs).where(eq(jobs.id, body.jobId)).limit(1);
    if (!j) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    if (!canManageJob(actor, j)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    jobRow = j;

    const assignedIds = new Set<string>();
    if (j.assigneeId) assignedIds.add(j.assigneeId);
    const members = await db
      .select({ userId: jobMembers.userId })
      .from(jobMembers)
      .where(eq(jobMembers.jobId, j.id));
    for (const member of members) assignedIds.add(member.userId);
    if (!assignedIds.has(body.userId)) {
      res.status(400).json({ error: "userId must belong to the selected job" });
      return;
    }
  }

  const [created] = await db
    .insert(errorReports)
    .values({
      jobId: body.jobId ?? null,
      userId: body.userId,
      createdById: actor.id,
      title: body.title.trim(),
      description: body.description.trim(),
      category,
      source: "manual",
      severity,
      status: "open",
      updatedAt: new Date(),
    })
    .returning();

  const userRow = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, created.userId))
    .then((r) => r[0] ?? null);

  await createNotification({
    userId: created.userId,
    jobId: created.jobId ?? undefined,
    title: `Mistake logged: ${created.title}`,
    description: `A mistake (${category.replaceAll("_", " ")}) has been recorded: ${created.title}. ${created.description}`,
    type: "error",
  });

  if (created.jobId && jobRow) {
    await notifyJobManagers({
      jobId: created.jobId,
      supervisorId: jobRow.supervisorId,
      actorId: actor.id,
      title: `Mistake logged: ${created.title}`,
      description: `${actor.name} logged a mistake for ${userRow?.name ?? "a user"} on ${jobRow.title}: ${previewText(created.description)}`,
      type: "error",
    });
  }

  res.status(201).json(
    toPublic({
      report: created,
      job: jobRow ? { id: jobRow.id, serial: jobRow.serial, title: jobRow.title } : null,
      user: userRow,
      createdBy: { id: actor.id, name: actor.name, role: actor.role },
    }),
  );
});

router.patch("/mistakes/:id", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  if (actor.role !== "super-admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only admin or super-admin can update mistake records" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body as Partial<{ status: "open" | "resolved"; category: string }>;

  const [existing] = await db
    .select()
    .from(errorReports)
    .where(and(eq(errorReports.id, id), manualMistakeOnly))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status === "open" || body.status === "resolved") {
    patch.status = body.status;
    patch.resolvedAt = body.status === "resolved" ? new Date() : null;
  }
  if (isMistakeCategory(body.category) && body.category !== "rework") {
    patch.category = body.category;
  }

  if (patch.status == null && patch.category == null) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db.update(errorReports).set(patch).where(eq(errorReports.id, id)).returning();

  if (patch.status === "resolved" && updated.userId) {
    await createNotification({
      userId: updated.userId,
      jobId: updated.jobId ?? undefined,
      title: `Mistake resolved: ${updated.title}`,
      description: `Your mistake record "${updated.title}" has been marked resolved.`,
      type: "error",
    });
  }

  const [job] = updated.jobId
    ? await db
        .select({ id: jobs.id, serial: jobs.serial, title: jobs.title })
        .from(jobs)
        .where(eq(jobs.id, updated.jobId))
        .limit(1)
    : [null];
  const userRow = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, updated.userId))
    .then((r) => r[0] ?? null);
  const creatorRow = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, updated.createdById))
    .then((r) => r[0] ?? null);

  res.json(toPublic({ report: updated, job: job?.id ? job : null, user: userRow, createdBy: creatorRow }));
});

router.delete("/mistakes/:id", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  if (actor.role !== "super-admin" && actor.role !== "admin") {
    res.status(403).json({ error: "Only admin or super-admin can delete mistake records" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [existing] = await db
    .select()
    .from(errorReports)
    .where(and(eq(errorReports.id, id), manualMistakeOnly))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(errorReports).where(eq(errorReports.id, id));
  res.status(204).end();
});

router.post("/mistakes/:id/acknowledge", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existing] = await db
    .select()
    .from(errorReports)
    .where(and(eq(errorReports.id, id), manualMistakeOnly))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (existing.userId !== actor.id) {
    return res.status(403).json({ error: "Only the target user can acknowledge" });
  }

  await createNotification({
    userId: existing.createdById,
    jobId: existing.jobId ?? undefined,
    title: `Mistake acknowledged: ${existing.title}`,
    description: `${actor.name} has viewed the mistake record: ${existing.title}.`,
    type: "error",
  });

  return res.status(204).end();
});

export default router;
