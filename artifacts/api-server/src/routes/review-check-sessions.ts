import { Router, type IRouter } from "express";
import { eq, inArray, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  jobs,
  users,
  activeReviewCheckSessions,
  timeLogs,
  type JobRow,
  type UserRow,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { ensureJobWriteSchema } from "../lib/schema-init";
import { notifyJobManagers } from "../lib/notifications";
import {
  canListAllReviewCheckSessions,
  publicReviewCheckSession,
  reviewCheckElapsedSeconds,
  SUPERVISOR_REVIEW_CHECK_TASK,
} from "../lib/review-check-sessions";
import {
  flushReviewCheckSegment,
  pauseWorkTimerForSupervisor,
  stopReviewCheckSessionAndSaveLog,
} from "../lib/persist-review-check-session";

const router: IRouter = Router();

const ensureSchema = async () => {
  await ensureJobWriteSchema();
};

async function loadSessionForSupervisor(supervisorId: string) {
  const [row] = await db
    .select()
    .from(activeReviewCheckSessions)
    .where(eq(activeReviewCheckSessions.supervisorId, supervisorId))
    .limit(1);
  return row ?? null;
}

function canStartReviewCheck(actor: UserRow, job: JobRow): boolean {
  if (job.status !== "awaiting_supervisor") return false;
  if (actor.role === "supervisor") return job.supervisorId === actor.id;
  if (actor.role === "admin" || actor.role === "super-admin") return true;
  return false;
}

async function enrichSessions(
  sessions: (typeof activeReviewCheckSessions.$inferSelect)[],
  nowMs: number,
) {
  if (sessions.length === 0) return [];
  const supervisorIds = [...new Set(sessions.map((s) => s.supervisorId))];
  const jobIds = [...new Set(sessions.map((s) => s.jobId))];
  const [supervisorRows, jobRows] = await Promise.all([
    supervisorIds.length > 0
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, supervisorIds))
      : Promise.resolve([]),
    jobIds.length > 0
      ? db
          .select({ id: jobs.id, jobNumber: jobs.jobNumber, title: jobs.title })
          .from(jobs)
          .where(inArray(jobs.id, jobIds))
      : Promise.resolve([]),
  ]);
  const supervisorById = new Map(supervisorRows.map((r) => [r.id, r.name]));
  const jobById = new Map(jobRows.map((j) => [j.id, j]));
  return sessions.map((session) =>
    publicReviewCheckSession(
      session,
      {
        supervisorName: supervisorById.get(session.supervisorId) ?? null,
        job: jobById.get(session.jobId) ?? null,
      },
      nowMs,
    ),
  );
}

router.get("/review-check-sessions/active", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const nowMs = Date.now();

    if (canListAllReviewCheckSessions(actor)) {
      const sessions = await db
        .select()
        .from(activeReviewCheckSessions)
        .orderBy(desc(activeReviewCheckSessions.lastHeartbeatAt));
      return res.json(await enrichSessions(sessions, nowMs));
    }

    if (actor.role !== "supervisor") return res.json([]);

    const session = await loadSessionForSupervisor(actor.id);
    if (!session) return res.json([]);
    return res.json(await enrichSessions([session], nowMs));
  } catch (err) {
    logger.error({ err }, "Failed to list active review check sessions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/jobs/:jobId/review-check-time", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const canView =
      actor.role === "super-admin" ||
      actor.role === "admin" ||
      (actor.role === "supervisor" && job.supervisorId === actor.id) ||
      job.assigneeId === actor.id;
    if (!canView) return res.status(403).json({ error: "Forbidden" });

    const logs = await db
      .select({ duration: timeLogs.duration, userId: timeLogs.userId, task: timeLogs.task })
      .from(timeLogs)
      .where(eq(timeLogs.jobId, jobId));
    const savedSeconds = logs
      .filter(
        (l) =>
          l.userId === (job.supervisorId ?? "") &&
          (l.task === SUPERVISOR_REVIEW_CHECK_TASK || l.task?.toLowerCase().includes("review check")),
      )
      .reduce((sum, l) => sum + (l.duration ?? 0), 0);

    let activeSeconds = 0;
    let isLive = false;
    if (job.supervisorId) {
      const session = await loadSessionForSupervisor(job.supervisorId);
      if (session?.jobId === jobId) {
        activeSeconds = reviewCheckElapsedSeconds(session);
        isLive = !!session.segmentStartedAt;
      }
    }

    return res.json({
      savedSeconds,
      activeSeconds,
      totalSeconds: savedSeconds + activeSeconds,
      isLive,
      reviewStartedAt: job.reviewStartedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load review check time");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/review-check-sessions/start", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = typeof req.body?.jobId === "string" ? req.body.jobId.trim() : "";
    if (!jobId) return res.status(400).json({ error: "Job is required" });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!canStartReviewCheck(actor, job)) {
      return res.status(403).json({ error: "You cannot start checking this job" });
    }

    const supervisorId = actor.role === "supervisor" ? actor.id : (job.supervisorId ?? actor.id);

    await pauseWorkTimerForSupervisor(supervisorId);

    const now = new Date();
    const existing = await loadSessionForSupervisor(supervisorId);
    let switchedJob = false;

    if (existing) {
      if (existing.jobId === jobId && existing.segmentStartedAt) {
        return res.json((await enrichSessions([existing], Date.now()))[0]);
      }

      if (existing.jobId === jobId && !existing.segmentStartedAt) {
        const [updated] = await db
          .update(activeReviewCheckSessions)
          .set({
            segmentStartedAt: now,
            lastHeartbeatAt: now,
            updatedAt: now,
          })
          .where(eq(activeReviewCheckSessions.id, existing.id))
          .returning();
        await db
          .update(jobs)
          .set({ reviewStartedAt: job.reviewStartedAt ?? now, updatedAt: now })
          .where(eq(jobs.id, jobId));
        return res.json((await enrichSessions([updated], Date.now()))[0]);
      }

      await flushReviewCheckSegment(existing);
      switchedJob = true;
      await db
        .update(activeReviewCheckSessions)
        .set({
          jobId,
          accumulatedSeconds: 0,
          segmentStartedAt: now,
          lastHeartbeatAt: now,
          updatedAt: now,
        })
        .where(eq(activeReviewCheckSessions.id, existing.id));
    } else {
      await db.insert(activeReviewCheckSessions).values({
        id: randomUUID(),
        supervisorId,
        jobId,
        accumulatedSeconds: 0,
        segmentStartedAt: now,
        lastHeartbeatAt: now,
        updatedAt: now,
      });
    }

    await db
      .update(jobs)
      .set({ reviewStartedAt: now, updatedAt: now })
      .where(eq(jobs.id, jobId));

    const [session] = await db
      .select()
      .from(activeReviewCheckSessions)
      .where(eq(activeReviewCheckSessions.supervisorId, supervisorId))
      .limit(1);

    if (actor.role === "supervisor") {
      await notifyJobManagers({
        jobId,
        supervisorId: job.supervisorId,
        actorId: actor.id,
        title: `Supervisor started checking: ${job.title}`,
        description: `${actor.name} started reviewing ${job.jobNumber ?? "job"} · ${job.title}.${switchedJob ? " Previous check timer was paused." : ""}`,
        type: "timer",
      });
    }

    return res.json((await enrichSessions([session!], Date.now()))[0]);
  } catch (err) {
    logger.error({ err }, "Failed to start review check session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/review-check-sessions/pause", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    if (actor.role !== "supervisor" && actor.role !== "admin" && actor.role !== "super-admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const supervisorId = actor.role === "supervisor" ? actor.id : actor.id;
    const session = await loadSessionForSupervisor(supervisorId);
    if (!session) return res.status(404).json({ error: "No active review check session" });

    const now = new Date();
    const elapsed = reviewCheckElapsedSeconds(session);
    const [updated] = await db
      .update(activeReviewCheckSessions)
      .set({
        accumulatedSeconds: elapsed,
        segmentStartedAt: null,
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .where(eq(activeReviewCheckSessions.id, session.id))
      .returning();

    return res.json((await enrichSessions([updated], Date.now()))[0]);
  } catch (err) {
    logger.error({ err }, "Failed to pause review check session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/review-check-sessions/stop", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    if (actor.role !== "supervisor" && actor.role !== "admin" && actor.role !== "super-admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const supervisorId = actor.role === "supervisor" ? actor.id : actor.id;
    const session = await loadSessionForSupervisor(supervisorId);
    if (!session) return res.json({ duration: 0 });

    const duration = await stopReviewCheckSessionAndSaveLog(session);
    return res.json({ duration });
  } catch (err) {
    logger.error({ err }, "Failed to stop review check session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/review-check-sessions/heartbeat", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    if (actor.role !== "supervisor") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const session = await loadSessionForSupervisor(actor.id);
    if (!session) return res.status(404).json({ error: "No active review check session" });
    if (!session.segmentStartedAt) {
      return res.status(400).json({ error: "Review check timer is paused" });
    }

    const now = new Date();
    const [updated] = await db
      .update(activeReviewCheckSessions)
      .set({ lastHeartbeatAt: now, updatedAt: now })
      .where(eq(activeReviewCheckSessions.id, session.id))
      .returning();

    const [job] = await db
      .select({ jobNumber: jobs.jobNumber, title: jobs.title })
      .from(jobs)
      .where(eq(jobs.id, updated.jobId))
      .limit(1);

    return res.json(
      publicReviewCheckSession(updated, { supervisorName: actor.name, job: job ?? null }),
    );
  } catch (err) {
    logger.error({ err }, "Failed to heartbeat review check session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
