import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, jobs, jobJuniors, jobMembers, users, type JobRow, type UserRow } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { ensureJobWriteSchema } from "../lib/schema-init";
import { canMutateCompletedJob } from "../lib/job-edit-permissions";
import { actorCanViewJobStakeholder } from "../lib/job-access";

const router: IRouter = Router();

const STATUSES = new Set(["not_started", "in_progress"]);

async function isExtraMember(jobId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, jobId), eq(jobMembers.userId, userId)))
    .limit(1);
  return !!row;
}

async function canView(actor: UserRow, job: JobRow): Promise<boolean> {
  return actorCanViewJobStakeholder(actor, job, await isExtraMember(job.id, actor.id));
}

async function canEdit(actor: UserRow, job: JobRow): Promise<boolean> {
  if (!canMutateCompletedJob(actor, job)) return false;
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") return job.supervisorId === actor.id;
  if (job.assigneeId === actor.id) return true;
  return isExtraMember(job.id, actor.id);
}

function liveSeconds(
  row: { loggedSeconds: number; segmentStartedAt: Date | null },
  nowMs = Date.now(),
): number {
  const base = Math.max(0, row.loggedSeconds ?? 0);
  if (!row.segmentStartedAt) return base;
  const extra = Math.max(0, Math.floor((nowMs - row.segmentStartedAt.getTime()) / 1000));
  return base + extra;
}

function publicJunior(
  row: typeof jobJuniors.$inferSelect,
  addedByName: string | null,
  nowMs = Date.now(),
) {
  return {
    id: row.id,
    jobId: row.jobId,
    name: row.name,
    status: row.status === "in_progress" ? "in_progress" : "not_started",
    loggedSeconds: row.loggedSeconds,
    elapsedSeconds: liveSeconds(row, nowMs),
    running: !!row.segmentStartedAt,
    segmentStartedAt: row.segmentStartedAt?.toISOString() ?? null,
    addedById: row.addedById,
    addedByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function enrich(rows: (typeof jobJuniors.$inferSelect)[]) {
  const nowMs = Date.now();
  const ids = [...new Set(rows.map((r) => r.addedById).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const people = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
    for (const p of people) names.set(p.id, p.name);
  }
  return rows.map((r) => publicJunior(r, r.addedById ? names.get(r.addedById) ?? null : null, nowMs));
}

router.get("/jobs/:jobId/juniors", requireAuth, async (req, res) => {
  try {
    await ensureJobWriteSchema();
    const jobId = String(req.params.jobId);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canView(req.session!.user, job))) return res.status(403).json({ error: "Forbidden" });

    const rows = await db
      .select()
      .from(jobJuniors)
      .where(eq(jobJuniors.jobId, jobId))
      .orderBy(asc(jobJuniors.createdAt));
    return res.json(await enrich(rows));
  } catch (err) {
    logger.error({ err }, "Failed to list job juniors");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/jobs/:jobId/juniors", requireAuth, async (req, res) => {
  try {
    await ensureJobWriteSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const status = req.body?.status === "in_progress" ? "in_progress" : "not_started";
    if (!name) return res.status(400).json({ error: "Junior name is required" });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canEdit(actor, job))) return res.status(403).json({ error: "You cannot add juniors on this job" });

    const [created] = await db
      .insert(jobJuniors)
      .values({
        jobId,
        name,
        status,
        addedById: actor.id,
      })
      .returning();
    return res.status(201).json((await enrich([created]))[0]);
  } catch (err) {
    logger.error({ err }, "Failed to add job junior");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/jobs/:jobId/juniors/:id", requireAuth, async (req, res) => {
  try {
    await ensureJobWriteSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const id = String(req.params.id);

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canEdit(actor, job))) return res.status(403).json({ error: "Forbidden" });

    const [row] = await db
      .select()
      .from(jobJuniors)
      .where(and(eq(jobJuniors.id, id), eq(jobJuniors.jobId, jobId)))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Junior not found" });

    const patch: Partial<typeof jobJuniors.$inferInsert> = { updatedAt: new Date() };
    if (typeof req.body?.name === "string" && req.body.name.trim()) patch.name = req.body.name.trim();
    if (typeof req.body?.status === "string" && STATUSES.has(req.body.status)) patch.status = req.body.status;

    const addSeconds = Number(req.body?.addSeconds);
    if (Number.isFinite(addSeconds) && addSeconds > 0) {
      const live = liveSeconds(row);
      patch.loggedSeconds = live + Math.floor(addSeconds);
      patch.segmentStartedAt = null;
      if (row.status === "not_started" && patch.status !== "not_started") patch.status = "in_progress";
    } else if (patch.status === "not_started" && row.segmentStartedAt) {
      patch.loggedSeconds = liveSeconds(row);
      patch.segmentStartedAt = null;
    }

    const [updated] = await db.update(jobJuniors).set(patch).where(eq(jobJuniors.id, id)).returning();
    return res.json((await enrich([updated]))[0]);
  } catch (err) {
    logger.error({ err }, "Failed to update job junior");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/jobs/:jobId/juniors/:id/timer", requireAuth, async (req, res) => {
  try {
    await ensureJobWriteSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const id = String(req.params.id);
    const action = req.body?.action === "pause" ? "pause" : "start";

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canEdit(actor, job))) return res.status(403).json({ error: "Forbidden" });

    const [row] = await db
      .select()
      .from(jobJuniors)
      .where(and(eq(jobJuniors.id, id), eq(jobJuniors.jobId, jobId)))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Junior not found" });

    const now = new Date();
    if (action === "start") {
      if (row.segmentStartedAt) {
        return res.json((await enrich([row]))[0]);
      }
      const others = await db.select().from(jobJuniors).where(eq(jobJuniors.jobId, jobId));
      for (const other of others) {
        if (other.id === id || !other.segmentStartedAt) continue;
        await db
          .update(jobJuniors)
          .set({
            loggedSeconds: liveSeconds(other),
            segmentStartedAt: null,
            updatedAt: now,
          })
          .where(eq(jobJuniors.id, other.id));
      }
      const [updated] = await db
        .update(jobJuniors)
        .set({
          status: "in_progress",
          loggedSeconds: liveSeconds(row),
          segmentStartedAt: now,
          updatedAt: now,
        })
        .where(eq(jobJuniors.id, id))
        .returning();
      return res.json((await enrich([updated]))[0]);
    }

    const [updated] = await db
      .update(jobJuniors)
      .set({
        loggedSeconds: liveSeconds(row),
        segmentStartedAt: null,
        updatedAt: now,
      })
      .where(eq(jobJuniors.id, id))
      .returning();
    return res.json((await enrich([updated]))[0]);
  } catch (err) {
    logger.error({ err }, "Failed to toggle junior timer");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/jobs/:jobId/juniors/:id", requireAuth, async (req, res) => {
  try {
    await ensureJobWriteSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const id = String(req.params.id);

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canEdit(actor, job))) return res.status(403).json({ error: "Forbidden" });

    await db.delete(jobJuniors).where(and(eq(jobJuniors.id, id), eq(jobJuniors.jobId, jobId)));
    return res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete job junior");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
