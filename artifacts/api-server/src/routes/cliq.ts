import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, jobs, jobMembers, type JobRow, type UserRow } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

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

async function canViewJob(actor: UserRow, job: JobRow): Promise<boolean> {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  if (job.assigneeId === actor.id) return true;
  await ensureSchema();
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, job.id), eq(jobMembers.userId, actor.id)))
    .limit(1);
  return !!row;
}

router.post("/jobs/:jobId/cliq/messages", requireAuth, async (req, res) => {
  try {
    const webhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;
    if (!webhookUrl) return res.status(501).json({ error: "Zoho Cliq webhook not configured" });

    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "text is required" });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(actor, job))) return res.status(403).json({ error: "Forbidden" });

    const prefix = `JOB-${job.jobNumber?.trim() || job.serial} - ${job.title}`;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${prefix}\nVivid OPS (${actor.name}): ${text}` }),
    });

    return res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to post Cliq message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
