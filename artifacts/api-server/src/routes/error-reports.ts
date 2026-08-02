import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
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
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

const targetUserAlias = alias(users, "target_user");
const creatorAlias = alias(users, "creator_user");

const ensureSchema = async () => {};

function isMistakeCategory(value: unknown): value is MistakeCategory {
  return typeof value === "string" && (MISTAKE_CATEGORIES as readonly string[]).includes(value);
}

function parseDateBound(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Resolve analytics/list window from ?period=7d|30d|90d|all or ?from=&to= */
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

function pushDateConditions(conditions: unknown[], from: Date | null, to: Date | null) {
  if (from) conditions.push(gte(errorReports.createdAt, from));
  if (to) conditions.push(lte(errorReports.createdAt, to));
}

function canViewJob(actor: UserRow, job: JobRow): boolean {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  return job.assigneeId === actor.id;
}

function canManageJob(actor: UserRow, job: JobRow): boolean {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  return false;
}

type PublicErrorReport = ErrorReportRow & {
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
}): PublicErrorReport {
  return {
    ...row.report,
    jobNumber: row.job ? `JOB-${row.job.serial}` : null,
    jobTitle: row.job?.title ?? null,
    user: row.user?.id ? row.user : null,
    createdBy: row.createdBy?.id ? row.createdBy : null,
  };
}

router.get("/error-reports/categories", requireAuth, (_req, res) => {
  res.json(MISTAKE_CATEGORIES);
  return;
});

router.get("/error-reports/analytics", requireAuth, async (req, res) => {
  await ensureSchema();
  const actor = req.session!.user;
  const query = req.query as Record<string, unknown>;
  const { from, to, period } = resolveDateRange(query);
  const focusUserId = typeof query.userId === "string" && query.userId ? query.userId : null;

  let scopedUserFilter: { userId?: string; jobIds?: string[] } = {};
  if (actor.role === "user") {
    scopedUserFilter = { userId: actor.id };
  } else if (actor.role === "supervisor") {
    const managedJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.supervisorId, actor.id));
    scopedUserFilter = { jobIds: managedJobs.map((j) => j.id) };
    if (scopedUserFilter.jobIds!.length === 0) {
      return res.json({
        period,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        byUser: [],
        byCategory: [],
        byMonth: [],
        total: 0,
        open: 0,
        reworkCount: 0,
        highSeverity: 0,
        userProfile: null,
      });
    }
  }

  const conditions: any[] = [];
  if (scopedUserFilter.userId) conditions.push(eq(errorReports.userId, scopedUserFilter.userId));
  if (scopedUserFilter.jobIds) conditions.push(inArray(errorReports.jobId, scopedUserFilter.jobIds));
  pushDateConditions(conditions, from, to);

  const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;

  const byUserQuery = db
    .select({
      userId: errorReports.userId,
      name: users.name,
      count: sql<number>`count(*)::int`,
      openCount: sql<number>`count(*) filter (where ${errorReports.status} = 'open')::int`,
      reworkCount: sql<number>`count(*) filter (where ${errorReports.reworkId} is not null or ${errorReports.category} = 'rework')::int`,
      highSeverity: sql<number>`count(*) filter (where ${errorReports.severity} = 'high')::int`,
    })
    .from(errorReports)
    .innerJoin(users, eq(users.id, errorReports.userId))
    .groupBy(errorReports.userId, users.name)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const byCategoryQuery = db
    .select({
      category: errorReports.category,
      count: sql<number>`count(*)::int`,
    })
    .from(errorReports)
    .groupBy(errorReports.category)
    .orderBy(desc(sql`count(*)`));

  const byMonthQuery = db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${errorReports.createdAt}), 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
      openCount: sql<number>`count(*) filter (where ${errorReports.status} = 'open')::int`,
    })
    .from(errorReports)
    .groupBy(sql`date_trunc('month', ${errorReports.createdAt})`)
    .orderBy(sql`date_trunc('month', ${errorReports.createdAt})`);

  const totalsQuery = db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${errorReports.status} = 'open')::int`,
      reworkCount: sql<number>`count(*) filter (where ${errorReports.reworkId} is not null or ${errorReports.category} = 'rework')::int`,
      highSeverity: sql<number>`count(*) filter (where ${errorReports.severity} = 'high')::int`,
    })
    .from(errorReports);

  const [byUser, byCategory, byMonth, totals] = await Promise.all([
    baseWhere ? byUserQuery.where(baseWhere) : byUserQuery,
    baseWhere ? byCategoryQuery.where(baseWhere) : byCategoryQuery,
    baseWhere ? byMonthQuery.where(baseWhere) : byMonthQuery,
    baseWhere ? totalsQuery.where(baseWhere) : totalsQuery,
  ]);

  let userProfile: {
    userId: string;
    name: string;
    total: number;
    open: number;
    highSeverity: number;
    reworkCount: number;
    byCategory: Array<{ category: string; count: number }>;
    bySeverity: Array<{ severity: string; count: number }>;
  } | null = null;

  if (focusUserId && actor.role !== "user") {
    const profileConditions: any[] = [...conditions, eq(errorReports.userId, focusUserId)];
    const profileWhere = and(...profileConditions);

    const [profileUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, focusUserId))
      .limit(1);

    if (profileUser) {
      const [pTotals, pCategories, pSeverity] = await Promise.all([
        db
          .select({
            total: sql<number>`count(*)::int`,
            open: sql<number>`count(*) filter (where ${errorReports.status} = 'open')::int`,
            reworkCount: sql<number>`count(*) filter (where ${errorReports.reworkId} is not null or ${errorReports.category} = 'rework')::int`,
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
        reworkCount: pTotals[0]?.reworkCount ?? 0,
        byCategory: pCategories,
        bySeverity: pSeverity.map((r) => ({ severity: String(r.severity), count: r.count })),
      };
    }
  } else if (actor.role === "user") {
    // Self profile for field users
    const selfId = actor.id;
    const [profileUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, selfId))
      .limit(1);
    if (profileUser) {
      const selfRow = byUser.find((u) => u.userId === selfId);
      userProfile = {
        userId: profileUser.id,
        name: profileUser.name,
        total: selfRow?.count ?? totals[0]?.total ?? 0,
        open: selfRow?.openCount ?? totals[0]?.open ?? 0,
        highSeverity: selfRow?.highSeverity ?? totals[0]?.highSeverity ?? 0,
        reworkCount: selfRow?.reworkCount ?? totals[0]?.reworkCount ?? 0,
        byCategory,
        bySeverity: [],
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
    reworkCount: totals[0]?.reworkCount ?? 0,
    highSeverity: totals[0]?.highSeverity ?? 0,
    userProfile,
  });
  return;
});

router.get("/error-reports", requireAuth, async (req, res) => {
  await ensureSchema();
  const actor = req.session!.user;
  const query = req.query as Record<string, unknown>;
  const userIdFilter = typeof query.userId === "string" ? query.userId : null;
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

  const filters: any[] = [];
  if (userIdFilter) filters.push(eq(errorReports.userId, userIdFilter));
  if (categoryFilter && isMistakeCategory(categoryFilter)) filters.push(eq(errorReports.category, categoryFilter));
  pushDateConditions(filters, from, to);

  if (actor.role === "super-admin" || actor.role === "admin") {
    const rows = filters.length ? await q.where(and(...filters)) : await q;
    res.json(rows.map(toPublic));
    return;
  }

  if (actor.role === "supervisor") {
    const managedJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.supervisorId, actor.id));
    const jobIds = managedJobs.map((j) => j.id);

    if (jobIds.length === 0) {
      res.json([]);
      return;
    }

    const rows = await q.where(and(inArray(errorReports.jobId, jobIds), ...filters));
    res.json(rows.map(toPublic));
    return;
  }

  const rows = await q.where(and(eq(errorReports.userId, actor.id), ...filters));
  res.json(rows.map(toPublic));
});

const creatorOnly = requireRole("super-admin", "admin", "supervisor");

router.post("/error-reports", creatorOnly, async (req, res) => {
  await ensureSchema();
  const actor = req.session!.user;
  const body = req.body as Partial<{
    jobId: string | null;
    userId: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    category: string;
    checklistItemId: number | null;
    source: string;
  }>;

  if (!body.userId || !body.title || !body.description) {
    res.status(400).json({ error: "userId, title and description are required" });
    return;
  }
  const severity = body.severity ?? "medium";
  if (severity !== "low" && severity !== "medium" && severity !== "high") {
    res.status(400).json({ error: "Invalid severity" });
    return;
  }

  const category: MistakeCategory = isMistakeCategory(body.category) ? body.category : "other";
  const checklistItemId =
    typeof body.checklistItemId === "number" && Number.isFinite(body.checklistItemId)
      ? body.checklistItemId
      : null;
  const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "manual";

  let jobRow: JobRow | null = null;
  const jobId = body.jobId ?? null;
  if (jobId) {
    const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!j) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    if (!canViewJob(actor, j)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (actor.role === "supervisor") {
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
    jobRow = j;
  } else if (actor.role === "supervisor") {
    res.status(400).json({ error: "jobId is required for supervisors" });
    return;
  }

  const [created] = await db
    .insert(errorReports)
    .values({
      jobId,
      userId: body.userId,
      createdById: actor.id,
      title: body.title,
      description: body.description,
      category,
      checklistItemId,
      source,
      severity,
      status: "open",
      updatedAt: new Date(),
    })
    .returning();

  await createNotification({
    userId: created.userId,
    jobId: created.jobId ?? undefined,
    title: `New Mistake Record: ${created.title}`,
    description: `A mistake record (${category.replaceAll("_", " ")}) has been added for you: ${created.title}. ${created.description}`,
    type: "error",
  });

  const userRow = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, created.userId))
    .then((r) => r[0] ?? null);

  const pub = toPublic({
    report: created,
    job: jobRow ? { id: jobRow.id, serial: jobRow.serial, title: jobRow.title } : null,
    user: userRow,
    createdBy: { id: actor.id, name: actor.name, role: actor.role },
  });

  res.status(201).json(pub);
});

router.patch("/error-reports/:id", requireAuth, async (req, res) => {
  await ensureSchema();
  const actor = req.session!.user;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body as Partial<{ status: "open" | "resolved"; category: string }>;

  const [existing] = await db.select().from(errorReports).where(eq(errorReports.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (actor.role === "user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (actor.role === "supervisor") {
    if (!existing.jobId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [j] = await db.select().from(jobs).where(eq(jobs.id, existing.jobId)).limit(1);
    if (!j || !canManageJob(actor, j)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status === "open" || body.status === "resolved") {
    patch.status = body.status;
    patch.resolvedAt = body.status === "resolved" ? new Date() : null;
  }
  if (isMistakeCategory(body.category)) {
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
      title: `Mistake Record Resolved: ${updated.title}`,
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

router.post("/error-reports/:id/acknowledge", requireAuth, async (req, res) => {
  await ensureSchema();
  const actor = req.session!.user;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existing] = await db.select().from(errorReports).where(eq(errorReports.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (existing.userId !== actor.id) {
    return res.status(403).json({ error: "Only the target user can acknowledge" });
  }

  await createNotification({
    userId: existing.createdById,
    jobId: existing.jobId ?? undefined,
    title: `Mistake Record Acknowledged: ${existing.title}`,
    description: `${actor.name} has viewed the mistake record: ${existing.title}.`,
    type: "error",
  });

  return res.status(204).end();
});

export default router;
