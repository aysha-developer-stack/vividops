import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  appreciations,
  jobs,
  jobMembers,
  users,
  APPRECIATION_CATEGORIES,
  APPRECIATION_LEVELS,
  type AppreciationRow,
  type AppreciationCategory,
  type AppreciationLevel,
  type JobRow,
  type UserRow,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { jobDisplayNumber } from "../lib/serialize";
import { createNotification, notifyJobManagers, previewText } from "../lib/notifications";
import { ensureAppreciationSchema } from "../lib/schema-init";

const router: IRouter = Router();

const targetUserAlias = alias(users, "appreciation_target");
const creatorAlias = alias(users, "appreciation_creator");

const appreciationJobColumns = {
  id: jobs.id,
  serial: jobs.serial,
  jobNumber: jobs.jobNumber,
  title: jobs.title,
  address: jobs.address,
} as const;

type AppreciationJobRef = Pick<JobRow, "id" | "serial" | "jobNumber" | "title" | "address">;

function isAppreciationCategory(value: unknown): value is AppreciationCategory {
  return typeof value === "string" && (APPRECIATION_CATEGORIES as readonly string[]).includes(value);
}

function isAppreciationLevel(value: unknown): value is AppreciationLevel {
  return typeof value === "string" && (APPRECIATION_LEVELS as readonly string[]).includes(value);
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
  if (from) conditions.push(gte(appreciations.createdAt, from));
  if (to) conditions.push(lte(appreciations.createdAt, to));
}

function isAdmin(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin";
}

function canLogAppreciation(actor: UserRow): boolean {
  return isAdmin(actor);
}

export type PublicAppreciation = {
  id: string;
  jobId: string | null;
  userId: string;
  createdById: string;
  title: string;
  description: string;
  category: string;
  level: string;
  createdAt: string;
  updatedAt: string;
  jobNumber: string | null;
  jobTitle: string | null;
  jobAddress: string | null;
  user: { id: string; name: string; role: UserRow["role"] } | null;
  createdBy: { id: string; name: string; role: UserRow["role"] } | null;
};

function toPublic(row: {
  report: AppreciationRow;
  job: AppreciationJobRef | null;
  user: Pick<UserRow, "id" | "name" | "role"> | null;
  createdBy: Pick<UserRow, "id" | "name" | "role"> | null;
}): PublicAppreciation {
  return {
    id: row.report.id,
    jobId: row.report.jobId,
    userId: row.report.userId,
    createdById: row.report.createdById,
    title: row.report.title,
    description: row.report.description,
    category: row.report.category,
    level: row.report.level,
    createdAt: row.report.createdAt.toISOString(),
    updatedAt: row.report.updatedAt.toISOString(),
    jobNumber: row.job ? jobDisplayNumber(row.job) : null,
    jobTitle: row.job?.title ?? null,
    jobAddress: row.job?.address?.trim() ? row.job.address.trim() : null,
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
  if (jobIds.length > 0) parts.push(inArray(appreciations.jobId, jobIds));
  if (teamUserIds.length > 0) {
    parts.push(and(isNull(appreciations.jobId), inArray(appreciations.userId, teamUserIds))!);
  }
  if (parts.length === 1) return parts[0]!;
  return or(...parts)!;
}

router.get("/appreciations/categories", requireAuth, (_req, res) => {
  res.json([...APPRECIATION_CATEGORIES]);
});

router.get("/appreciations/analytics", requireAuth, async (req, res) => {
  try {
    await ensureAppreciationSchema();
    const actor = req.session!.user;
    const query = req.query as Record<string, unknown>;
    const { from, to, period } = resolveDateRange(query);
    const focusUserId = typeof query.userId === "string" && query.userId ? query.userId : null;

    const conditions: SQL[] = [];
    pushDateConditions(conditions, from, to);

    if (actor.role === "user") {
      conditions.push(eq(appreciations.userId, actor.id));
    } else if (actor.role === "supervisor") {
      const { jobIds, teamUserIds } = await supervisorScope(actor.id);
      if (jobIds.length === 0 && teamUserIds.length === 0) {
        return res.json({
          period,
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
          byUser: [],
          byCategory: [],
          total: 0,
          outstanding: 0,
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
          total: 0,
          outstanding: 0,
          userProfile: null,
        });
      }
      conditions.push(supervisorVisibility(jobIds, teamUserIds));
    }

    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;

    const [byUser, byCategory, totals] = await Promise.all([
      db
        .select({
          userId: appreciations.userId,
          name: users.name,
          count: sql<number>`count(*)::int`,
          outstandingCount: sql<number>`count(*) filter (where ${appreciations.level} = 'outstanding')::int`,
        })
        .from(appreciations)
        .innerJoin(users, eq(users.id, appreciations.userId))
        .where(baseWhere)
        .groupBy(appreciations.userId, users.name)
        .orderBy(desc(sql`count(*)`))
        .limit(20),
      db
        .select({
          category: appreciations.category,
          count: sql<number>`count(*)::int`,
        })
        .from(appreciations)
        .where(baseWhere)
        .groupBy(appreciations.category)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({
          total: sql<number>`count(*)::int`,
          outstanding: sql<number>`count(*) filter (where ${appreciations.level} = 'outstanding')::int`,
        })
        .from(appreciations)
        .where(baseWhere),
    ]);

    let userProfile: {
      userId: string;
      name: string;
      total: number;
      outstanding: number;
      byCategory: Array<{ category: string; count: number }>;
      byLevel: Array<{ level: string; count: number }>;
    } | null = null;

    if (focusUserId) {
      const profileWhere = baseWhere
        ? and(baseWhere, eq(appreciations.userId, focusUserId))
        : eq(appreciations.userId, focusUserId);
      const [profileUser, profileTotals, profileCats, profileLevels] = await Promise.all([
        db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, focusUserId)).limit(1),
        db
          .select({
            total: sql<number>`count(*)::int`,
            outstanding: sql<number>`count(*) filter (where ${appreciations.level} = 'outstanding')::int`,
          })
          .from(appreciations)
          .where(profileWhere),
        db
          .select({
            category: appreciations.category,
            count: sql<number>`count(*)::int`,
          })
          .from(appreciations)
          .where(profileWhere)
          .groupBy(appreciations.category),
        db
          .select({
            level: appreciations.level,
            count: sql<number>`count(*)::int`,
          })
          .from(appreciations)
          .where(profileWhere)
          .groupBy(appreciations.level),
      ]);
      if (profileUser[0]) {
        userProfile = {
          userId: profileUser[0].id,
          name: profileUser[0].name,
          total: Number(profileTotals[0]?.total ?? 0),
          outstanding: Number(profileTotals[0]?.outstanding ?? 0),
          byCategory: profileCats,
          byLevel: profileLevels,
        };
      }
    }

    return res.json({
      period,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      byUser,
      byCategory,
      total: Number(totals[0]?.total ?? 0),
      outstanding: Number(totals[0]?.outstanding ?? 0),
      userProfile,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load appreciation analytics" });
  }
});

router.get("/appreciations", requireAuth, async (req, res) => {
  try {
    await ensureAppreciationSchema();
    const actor = req.session!.user;
    const query = req.query as Record<string, unknown>;
    const { from, to } = resolveDateRange(query, { defaultPeriod: "all" });
    const userIdFilter = typeof query.userId === "string" && query.userId ? query.userId : null;
    const jobIdFilter = typeof query.jobId === "string" && query.jobId ? query.jobId : null;
    const categoryFilter = typeof query.category === "string" ? query.category : null;

    const q = db
      .select({
        report: appreciations,
        job: appreciationJobColumns,
        user: { id: targetUserAlias.id, name: targetUserAlias.name, role: targetUserAlias.role },
        createdBy: { id: creatorAlias.id, name: creatorAlias.name, role: creatorAlias.role },
      })
      .from(appreciations)
      .leftJoin(jobs, eq(jobs.id, appreciations.jobId))
      .leftJoin(targetUserAlias, eq(targetUserAlias.id, appreciations.userId))
      .leftJoin(creatorAlias, eq(creatorAlias.id, appreciations.createdById))
      .orderBy(desc(appreciations.createdAt));

    const filters: SQL[] = [];
    if (userIdFilter) filters.push(eq(appreciations.userId, userIdFilter));
    if (jobIdFilter) filters.push(eq(appreciations.jobId, jobIdFilter));
    if (categoryFilter && isAppreciationCategory(categoryFilter)) {
      filters.push(eq(appreciations.category, categoryFilter));
    }
    pushDateConditions(filters, from, to);

    if (actor.role === "super-admin" || actor.role === "admin") {
      const rows = filters.length > 0 ? await q.where(and(...filters)) : await q;
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

    const rows = await q.where(and(eq(appreciations.userId, actor.id), ...filters));
    res.json(rows.map(toPublic));
  } catch (err) {
    res.status(500).json({ error: "Failed to load appreciations" });
  }
});

router.post("/appreciations", requireAuth, async (req, res) => {
  try {
    await ensureAppreciationSchema();
    const actor = req.session!.user;
    if (!canLogAppreciation(actor)) {
      res.status(403).json({ error: "Only admin or super-admin can log appreciation" });
      return;
    }

    const body = req.body as Partial<{
      jobId: string | null;
      userId: string;
      title: string;
      description: string;
      level: string;
      category: string;
    }>;

    if (!body.userId || !body.title?.trim() || !body.description?.trim()) {
      res.status(400).json({ error: "userId, title and description are required" });
      return;
    }

    const level: AppreciationLevel = isAppreciationLevel(body.level) ? body.level : "good";
    const category: AppreciationCategory = isAppreciationCategory(body.category) ? body.category : "other";

    let jobRow: JobRow | null = null;
    if (body.jobId) {
      const [j] = await db.select().from(jobs).where(eq(jobs.id, body.jobId)).limit(1);
      if (!j) {
        res.status(404).json({ error: "Job not found" });
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
      .insert(appreciations)
      .values({
        jobId: body.jobId ?? null,
        userId: body.userId,
        createdById: actor.id,
        title: body.title.trim(),
        description: body.description.trim(),
        category,
        level,
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
      title: `Appreciation received: ${created.title}`,
      description: `${actor.name} recognized you for ${category.replaceAll("_", " ")}: ${created.description}`,
      type: "appreciation",
    });

    if (created.jobId && jobRow) {
      await notifyJobManagers({
        jobId: created.jobId,
        supervisorId: jobRow.supervisorId,
        actorId: actor.id,
        title: `Appreciation logged: ${created.title}`,
        description: `${actor.name} logged appreciation for ${userRow?.name ?? "a user"} on ${jobDisplayNumber(jobRow)} · ${jobRow.title}: ${previewText(created.description)}`,
        type: "appreciation",
      });
    }

    res.status(201).json(
      toPublic({
        report: created,
        job: jobRow
          ? {
              id: jobRow.id,
              serial: jobRow.serial,
              jobNumber: jobRow.jobNumber,
              title: jobRow.title,
              address: jobRow.address,
            }
          : null,
        user: userRow,
        createdBy: { id: actor.id, name: actor.name, role: actor.role },
      }),
    );
  } catch (err) {
    res.status(500).json({ error: "Failed to log appreciation" });
  }
});

router.delete("/appreciations/:id", requireAuth, async (req, res) => {
  try {
    await ensureAppreciationSchema();
    const actor = req.session!.user;
    if (!isAdmin(actor)) {
      res.status(403).json({ error: "Only admin or super-admin can delete appreciation records" });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [existing] = await db.select().from(appreciations).where(eq(appreciations.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(appreciations).where(eq(appreciations.id, id));
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete appreciation" });
  }
});

router.post("/appreciations/:id/acknowledge", requireAuth, async (req, res) => {
  try {
    await ensureAppreciationSchema();
    const actor = req.session!.user;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const [existing] = await db.select().from(appreciations).where(eq(appreciations.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (existing.userId !== actor.id) {
      res.status(403).json({ error: "Only the target user can acknowledge" });
      return;
    }

    await createNotification({
      userId: existing.createdById,
      jobId: existing.jobId ?? undefined,
      title: `Appreciation acknowledged: ${existing.title}`,
      description: `${actor.name} has viewed the appreciation: ${existing.title}.`,
      type: "appreciation",
    });

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "Failed to acknowledge appreciation" });
  }
});

export default router;
