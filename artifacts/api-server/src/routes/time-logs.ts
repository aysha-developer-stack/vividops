import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, jobs, timeLogs } from "@workspace/db";
import { CreateTimeLogBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { ensureJobWriteSchema } from "../lib/schema-init";
import { publicTimeLog, resolveReworkCycleForTimeLog } from "../lib/time-log-cycles";

const router: IRouter = Router();

const ensureSchema = async () => {
  await ensureJobWriteSchema();
};

router.get("/time-logs", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;

    let query = db.select().from(timeLogs);

    if (actor.role === "supervisor") {
      const visibleJobs = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.supervisorId, actor.id));
      const visibleJobIds = visibleJobs.map((job) => job.id);
      if (visibleJobIds.length === 0) {
        return res.json([]);
      }

      (query as any) = query.where(inArray(timeLogs.jobId, visibleJobIds));
    } else if (actor.role !== "super-admin" && actor.role !== "admin") {
      (query as any) = query.where(eq(timeLogs.userId, actor.id));
    }

    const rows = await query.orderBy(desc(timeLogs.createdAt));
    return res.json(rows.map(publicTimeLog));
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

    const reworkCycleNumber =
      body.reworkCycleNumber !== undefined
        ? body.reworkCycleNumber
        : await resolveReworkCycleForTimeLog(body.jobId ?? null, actor.id);

    const [newLog] = await db
      .insert(timeLogs)
      .values({
        id: randomUUID(),
        task: body.task,
        duration: body.duration,
        jobId: body.jobId ?? null,
        userId: actor.id,
        reworkCycleNumber,
      })
      .returning();

    return res.json(publicTimeLog(newLog));
  } catch (err) {
    logger.error({ err }, "Failed to create time log");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
