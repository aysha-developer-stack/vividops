import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, jobs, jobMembers, users, type UserRow } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

let schemaEnsured = false;
const ensureSchema = async () => {
  if (schemaEnsured) return;
  schemaEnsured = true;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_members (
      id uuid PRIMARY KEY,
      job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT job_members_job_user_uniq UNIQUE (job_id, user_id)
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_members_job_idx ON job_members (job_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_members_user_idx ON job_members (user_id);`);
};

async function canViewJob(actor: UserRow, job: typeof jobs.$inferSelect): Promise<boolean> {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  if (job.assigneeId === actor.id) return true;
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, job.id), eq(jobMembers.userId, actor.id)))
    .limit(1);
  return !!row;
}

function canManageJob(actor: UserRow, job: typeof jobs.$inferSelect): boolean {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  return false;
}

router.get("/jobs/:jobId/members", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(actor, job))) return res.status(403).json({ error: "Forbidden" });

    const memberIds = new Set<string>();
    if (job.assigneeId) memberIds.add(job.assigneeId);
    if (job.supervisorId) memberIds.add(job.supervisorId);

    const rows = await db.select().from(jobMembers).where(eq(jobMembers.jobId, jobId));
    for (const r of rows) memberIds.add(r.userId);

    if (memberIds.size === 0) return res.json([]);

    const people = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(inArray(users.id, Array.from(memberIds)));

    people.sort((a, b) => a.name.localeCompare(b.name));
    return res.json(people);
  } catch (err) {
    logger.error({ err }, "Failed to list job members");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/jobs/:jobId/members", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!canManageJob(actor, job)) return res.status(403).json({ error: "Forbidden" });

    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return res.status(400).json({ error: "User not found" });
    if (u.role !== "user") return res.status(400).json({ error: "Only workers can be added to jobs" });

    const inserted = await db
      .insert(jobMembers)
      .values({ id: randomUUID(), jobId, userId })
      .onConflictDoNothing()
      .returning({ id: jobMembers.id });

    if (inserted.length > 0 && userId !== job.assigneeId) {
      await createNotification({
        userId,
        jobId,
        title: `New Job Assigned: ${job.title}`,
        description: `You have been added to job ${job.title} for ${job.client}.`,
        type: "assigned",
      });
    }

    return res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to add job member");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/jobs/:jobId/members/:userId", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const userId = String(req.params.userId);

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!canManageJob(actor, job)) return res.status(403).json({ error: "Forbidden" });

    await db.delete(jobMembers).where(and(eq(jobMembers.jobId, jobId), eq(jobMembers.userId, userId)));
    return res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to remove job member");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
