import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, timeLogs, type TimeLogRow } from "@workspace/db";
import { CreateTimeLogBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

let schemaEnsured = false;
const ensureSchema = async () => {
  if (schemaEnsured) return;
  schemaEnsured = true;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS time_logs (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
      task text NOT NULL,
      duration integer NOT NULL,
      start_time timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS time_logs_user_idx ON time_logs (user_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS time_logs_job_idx ON time_logs (job_id);`);
};

router.get("/time-logs", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;

    let query = db.select().from(timeLogs);

    if (actor.role !== "super-admin" && actor.role !== "admin" && actor.role !== "supervisor") {
      (query as any) = query.where(eq(timeLogs.userId, actor.id));
    }

    const rows = await query.orderBy(desc(timeLogs.createdAt));
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to list time logs");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/time-logs", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const parsed = CreateTimeLogBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid time log data" });
    }
    const actor = req.session!.user;
    const body = parsed.data;

    const [newLog] = await db
      .insert(timeLogs)
      .values({
        id: randomUUID(),
        ...body,
        userId: actor.id,
      })
      .returning();

    return res.json(newLog);
  } catch (err) {
    logger.error({ err }, "Failed to create time log");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
