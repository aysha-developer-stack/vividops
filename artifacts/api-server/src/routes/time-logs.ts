import { Router, type IRouter } from "express";
import { eq, desc, inArray, ilike } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, jobs, timeLogs, users, activeTimerSessions } from "@workspace/db";
import { CreateTimeLogBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { ensureJobWriteSchema } from "../lib/schema-init";
import { publicTimeLog, resolveReworkCycleForTimeLog } from "../lib/time-log-cycles";
import { workerMayStartTimerOnJobStatus } from "../lib/persist-timer-session";

const MAX_MANUAL_LOG_SECONDS = 12 * 3600;

const router: IRouter = Router();

const ensureSchema = async () => {
  await ensureJobWriteSchema();
};

router.get("/time-logs", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;

    const baseQuery = db
      .select({
        log: timeLogs,
        userName: users.name,
      })
      .from(timeLogs)
      .innerJoin(users, eq(users.id, timeLogs.userId));

    let rows: Array<{ log: typeof timeLogs.$inferSelect; userName: string }>;

    if (actor.role === "supervisor") {
      const visibleJobs = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.supervisorId, actor.id));
      const visibleJobIds = visibleJobs.map((job) => job.id);
      if (visibleJobIds.length === 0) {
        return res.json([]);
      }

      rows = await baseQuery
        .where(inArray(timeLogs.jobId, visibleJobIds))
        .orderBy(desc(timeLogs.createdAt));
    } else if (actor.role !== "super-admin" && actor.role !== "admin") {
      rows = await baseQuery
        .where(eq(timeLogs.userId, actor.id))
        .orderBy(desc(timeLogs.createdAt));
    } else {
      rows = await baseQuery.orderBy(desc(timeLogs.createdAt));
    }

    return res.json(
      rows.map(({ log, userName }) => publicTimeLog({ ...log, userName })),
    );
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

    const duration = Math.min(
      Math.max(0, Math.floor(body.duration)),
      MAX_MANUAL_LOG_SECONDS,
    );
    if (duration <= 0) {
      return res.status(400).json({ error: "Duration must be greater than zero" });
    }

    if (body.jobId) {
      const [job] = await db
        .select({ status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, body.jobId))
        .limit(1);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      if (!workerMayStartTimerOnJobStatus(job.status)) {
        return res.status(400).json({
          error: "Cannot log time on a job that is completed, cancelled, or awaiting review",
        });
      }
    }

    const reworkCycleNumber =
      body.reworkCycleNumber !== undefined
        ? body.reworkCycleNumber
        : await resolveReworkCycleForTimeLog(body.jobId ?? null, actor.id);

    const [newLog] = await db
      .insert(timeLogs)
      .values({
        id: randomUUID(),
        task: body.task,
        duration,
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

/** Super-admin: delete all time logs (and active timers) for one user. */
router.delete(
  "/time-logs/user/:userId",
  requireAuth,
  requireRole("super-admin"),
  async (req, res) => {
    try {
      await ensureSchema();
      const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      const [userRow] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      const deletedLogs = await db
        .delete(timeLogs)
        .where(eq(timeLogs.userId, userId))
        .returning({ id: timeLogs.id });
      const deletedSessions = await db
        .delete(activeTimerSessions)
        .where(eq(activeTimerSessions.userId, userId))
        .returning({ id: activeTimerSessions.id });

      return res.json({
        user: userRow,
        deleted: {
          timeLogs: deletedLogs.length,
          activeTimerSessions: deletedSessions.length,
        },
      });
    } catch (err) {
      logger.error({ err }, "Failed to reset user time logs");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

/** Super-admin: reset time logs by exact user name (case-insensitive). */
router.post(
  "/time-logs/reset-by-name",
  requireAuth,
  requireRole("super-admin"),
  async (req, res) => {
    try {
      await ensureSchema();
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }

      const matches = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(ilike(users.name, name));
      if (matches.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      if (matches.length > 1) {
        return res.status(409).json({
          error: "Multiple users match this name",
          users: matches,
        });
      }

      const userId = matches[0]!.id;
      const deletedLogs = await db
        .delete(timeLogs)
        .where(eq(timeLogs.userId, userId))
        .returning({ id: timeLogs.id });
      const deletedSessions = await db
        .delete(activeTimerSessions)
        .where(eq(activeTimerSessions.userId, userId))
        .returning({ id: activeTimerSessions.id });

      return res.json({
        user: matches[0],
        deleted: {
          timeLogs: deletedLogs.length,
          activeTimerSessions: deletedSessions.length,
        },
      });
    } catch (err) {
      logger.error({ err }, "Failed to reset user time logs by name");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
