import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  errorReports,
  jobs,
  jobMembers,
  users,
  type ErrorReportRow,
  type JobRow,
  type UserRow,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

const targetUserAlias = alias(users, "target_user");
const creatorAlias = alias(users, "creator_user");

const ensureSchema = async () => {};

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

router.get("/error-reports", requireAuth, async (req, res) => {
  await ensureSchema();
  const actor = req.session!.user;

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

  if (actor.role === "super-admin" || actor.role === "admin") {
    const rows = await q;
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

    const rows = await q.where(inArray(errorReports.jobId, jobIds));
    res.json(rows.map(toPublic));
    return;
  }

  const rows = await q.where(eq(errorReports.userId, actor.id));
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
  const body = req.body as Partial<{ status: "open" | "resolved" }>;

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

  const status = body.status;
  if (status !== "open" && status !== "resolved") {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const patch: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "resolved") patch.resolvedAt = new Date();
  if (status === "open") patch.resolvedAt = null;

  const [updated] = await db.update(errorReports).set(patch).where(eq(errorReports.id, id)).returning();

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

export default router;
