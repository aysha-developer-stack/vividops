import { Router, type IRouter } from "express";
import { and, eq, inArray, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  jobs,
  jobMembers,
  activeTimerSessions,
  activeReviewCheckSessions,
  type JobRow,
  type UserRow,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { ensureJobWriteSchema } from "../lib/schema-init";
import {
  canListTeamTimerSessions,
  publicTimerSession,
  timerSessionElapsedSeconds,
} from "../lib/timer-sessions";
import {
  stopTimerSessionAndSaveLog,
  pauseTimerSessionAfterGap,
  reconcileStaleRunningTimerSession,
  TIMER_HEARTBEAT_GAP_PAUSE_MS,
  workerMayStartTimerOnJobStatus,
} from "../lib/persist-timer-session";
import { flushReviewCheckSegment } from "../lib/persist-review-check-session";
import {
  jobStatusPatchFields,
  notifyStatusTransition,
  type ReviewableStatus,
} from "../lib/job-review";

const router: IRouter = Router();

const ensureSchema = async () => {
  await ensureJobWriteSchema();
};

async function isAdditionalJobMember(jobId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, jobId), eq(jobMembers.userId, userId)))
    .limit(1);
  return !!row;
}

async function canViewJob(actor: UserRow, job: JobRow): Promise<boolean> {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") return job.supervisorId === actor.id;
  if (actor.role === "coordinator") return job.coordinatorId === actor.id;
  if (job.assigneeId === actor.id) return true;
  return isAdditionalJobMember(job.id, actor.id);
}

async function markJobInProgressIfPending(jobId: string, actor: UserRow): Promise<void> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || job.status !== "pending") return;
  const previousStatus = job.status;
  const nextStatus: ReviewableStatus = "in_progress";
  const patch = {
    ...jobStatusPatchFields({
      nextStatus,
      previousStatus,
      currentProgress: job.progress,
    }),
    updatedAt: new Date(),
  };
  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));
  await notifyStatusTransition({ actor, job, previousStatus, nextStatus });
}

async function stopSessionAndSaveLog(
  session: typeof activeTimerSessions.$inferSelect,
  actor: UserRow,
): Promise<number> {
  return stopTimerSessionAndSaveLog(session, actor.id, { useElapsed: true });
}

async function loadSessionForUser(userId: string) {
  const [row] = await db
    .select()
    .from(activeTimerSessions)
    .where(eq(activeTimerSessions.userId, userId))
    .limit(1);
  return row ?? null;
}

async function listOwnActiveSessions(userId: string, nowMs: number) {
  let session = await loadSessionForUser(userId);
  if (!session) return [];
  if (session.segmentStartedAt) {
    session = await reconcileStaleRunningTimerSession(session);
  }
  let job: Pick<JobRow, "jobNumber" | "title"> | null = null;
  if (session.jobId) {
    const [j] = await db
      .select({ jobNumber: jobs.jobNumber, title: jobs.title })
      .from(jobs)
      .where(eq(jobs.id, session.jobId))
      .limit(1);
    job = j ?? null;
  }
  return [publicTimerSession(session, job, nowMs)];
}

router.get("/timer-sessions/active", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const nowMs = Date.now();
    const scope = req.query.scope === "team" ? "team" : "mine";

    if (scope === "mine" || !canListTeamTimerSessions(actor)) {
      return res.json(await listOwnActiveSessions(actor.id, nowMs));
    }

    let visibleUserIds: string[] | null = null;
    if (actor.role === "supervisor") {
      const supervised = await db
        .select({ id: jobs.id, assigneeId: jobs.assigneeId })
        .from(jobs)
        .where(eq(jobs.supervisorId, actor.id));
      const jobIds = supervised.map((j) => j.id);
      const assigneeIds = supervised.map((j) => j.assigneeId).filter(Boolean) as string[];
      const memberRows =
        jobIds.length > 0
          ? await db
              .select({ userId: jobMembers.userId })
              .from(jobMembers)
              .where(inArray(jobMembers.jobId, jobIds))
          : [];
      visibleUserIds = [...new Set([...assigneeIds, ...memberRows.map((m) => m.userId)])];
      if (visibleUserIds.length === 0) return res.json([]);
    }

    let sessions;
    if (visibleUserIds) {
      sessions = await db
        .select()
        .from(activeTimerSessions)
        .where(inArray(activeTimerSessions.userId, visibleUserIds))
        .orderBy(desc(activeTimerSessions.lastHeartbeatAt));
    } else {
      sessions = await db
        .select()
        .from(activeTimerSessions)
        .orderBy(desc(activeTimerSessions.lastHeartbeatAt));
    }
    if (sessions.length === 0) return res.json([]);

    const jobIds = [...new Set(sessions.map((s) => s.jobId).filter(Boolean))] as string[];
    const jobRows =
      jobIds.length > 0
        ? await db
            .select({ id: jobs.id, jobNumber: jobs.jobNumber, title: jobs.title })
            .from(jobs)
            .where(inArray(jobs.id, jobIds))
        : [];
    const jobById = new Map(jobRows.map((j) => [j.id, j]));

    return res.json(
      sessions.map((session) =>
        publicTimerSession(session, session.jobId ? jobById.get(session.jobId) ?? null : null, nowMs),
      ),
    );
  } catch (err) {
    logger.error({ err }, "Failed to list active timer sessions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/timer-sessions/start", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = typeof req.body?.jobId === "string" ? req.body.jobId.trim() : "";
    const task = typeof req.body?.task === "string" ? req.body.task.trim() : "";
    // Client-supplied accumulatedSeconds is ignored — only the server session row is authoritative.

    if (!task) return res.status(400).json({ error: "Task is required" });
    if (!jobId) return res.status(400).json({ error: "Job is required" });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(actor, job))) {
      return res.status(403).json({ error: "You cannot work on this job" });
    }
    if (!workerMayStartTimerOnJobStatus(job.status)) {
      return res.status(400).json({
        error:
          job.status === "awaiting_supervisor" ||
          job.status === "awaiting_admin" ||
          job.status === "awaiting_super_admin"
            ? "Job is awaiting review — timer cannot run until rework is needed"
            : "This job is not in a state where work time can be tracked",
      });
    }

    const [reviewSession] = await db
      .select()
      .from(activeReviewCheckSessions)
      .where(eq(activeReviewCheckSessions.supervisorId, actor.id))
      .limit(1);
    if (reviewSession?.segmentStartedAt) {
      await flushReviewCheckSegment(reviewSession);
      await db
        .update(activeReviewCheckSessions)
        .set({
          accumulatedSeconds: 0,
          segmentStartedAt: null,
          lastHeartbeatAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(activeReviewCheckSessions.id, reviewSession.id));
    }

    const existing = await loadSessionForUser(actor.id);
    if (existing) {
      if (existing.jobId === jobId) {
        const now = new Date();
        if (existing.segmentStartedAt) {
          const [updated] = await db
            .update(activeTimerSessions)
            .set({
              task,
              lastHeartbeatAt: now,
              updatedAt: now,
            })
            .where(eq(activeTimerSessions.id, existing.id))
            .returning();
          return res.json(
            publicTimerSession(updated, { jobNumber: job.jobNumber, title: job.title }),
          );
        }
        const [updated] = await db
          .update(activeTimerSessions)
          .set({
            task,
            accumulatedSeconds: Math.max(0, existing.accumulatedSeconds ?? 0),
            segmentStartedAt: now,
            lastHeartbeatAt: now,
            updatedAt: now,
          })
          .where(eq(activeTimerSessions.id, existing.id))
          .returning();
        return res.json(
          publicTimerSession(updated, { jobNumber: job.jobNumber, title: job.title }),
        );
      }
      await stopSessionAndSaveLog(existing, actor);
    }

    await markJobInProgressIfPending(jobId, actor);

    const now = new Date();
    const [session] = await db
      .insert(activeTimerSessions)
      .values({
        id: randomUUID(),
        userId: actor.id,
        jobId,
        task,
        accumulatedSeconds: 0,
        segmentStartedAt: now,
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: activeTimerSessions.userId,
        set: {
          jobId,
          task,
          accumulatedSeconds: 0,
          segmentStartedAt: now,
          lastHeartbeatAt: now,
          updatedAt: now,
        },
      })
      .returning();

    return res.json(
      publicTimerSession(session, { jobNumber: job.jobNumber, title: job.title }),
    );
  } catch (err) {
    logger.error({ err }, "Failed to start timer session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/timer-sessions/pause", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const session = await loadSessionForUser(actor.id);
    if (!session) return res.status(404).json({ error: "No active timer session" });

    const now = new Date();
    const elapsed = timerSessionElapsedSeconds(session, now.getTime());

    const [updated] = await db
      .update(activeTimerSessions)
      .set({
        accumulatedSeconds: elapsed,
        segmentStartedAt: null,
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .where(eq(activeTimerSessions.id, session.id))
      .returning();

    let job: Pick<JobRow, "jobNumber" | "title"> | null = null;
    if (updated.jobId) {
      const [j] = await db
        .select({ jobNumber: jobs.jobNumber, title: jobs.title })
        .from(jobs)
        .where(eq(jobs.id, updated.jobId))
        .limit(1);
      job = j ?? null;
    }

    return res.json(publicTimerSession(updated, job));
  } catch (err) {
    logger.error({ err }, "Failed to pause timer session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/timer-sessions/stop", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const session = await loadSessionForUser(actor.id);
    if (!session) return res.json({ duration: 0, timeLog: null });

    const duration = await stopSessionAndSaveLog(session, actor);
    return res.json({ duration, timeLog: duration > 0 ? { duration } : null });
  } catch (err) {
    logger.error({ err }, "Failed to stop timer session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/timer-sessions/heartbeat", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const session = await loadSessionForUser(actor.id);
    if (!session) return res.status(404).json({ error: "No active timer session" });
    if (!session.segmentStartedAt) {
      return res.status(400).json({ error: "Timer is paused" });
    }

    const now = new Date();
    const gapMs = now.getTime() - session.lastHeartbeatAt.getTime();
    if (gapMs > TIMER_HEARTBEAT_GAP_PAUSE_MS) {
      const paused = await pauseTimerSessionAfterGap(session);
      let job: Pick<JobRow, "jobNumber" | "title"> | null = null;
      if (paused.jobId) {
        const [j] = await db
          .select({ jobNumber: jobs.jobNumber, title: jobs.title })
          .from(jobs)
          .where(eq(jobs.id, paused.jobId))
          .limit(1);
        job = j ?? null;
      }
      return res.json({
        ...publicTimerSession(paused, job),
        autoPaused: true,
        reason: "sleep",
      });
    }

    if (session.jobId) {
      const [job] = await db
        .select({ status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, session.jobId))
        .limit(1);
      if (job && !workerMayStartTimerOnJobStatus(job.status)) {
        const duration = await stopSessionAndSaveLog(session, actor);
        return res.json({ autoStopped: true, duration, timeLog: duration > 0 ? { duration } : null });
      }
    }

    const [updated] = await db
      .update(activeTimerSessions)
      .set({ lastHeartbeatAt: now, updatedAt: now })
      .where(eq(activeTimerSessions.id, session.id))
      .returning();

    let job: Pick<JobRow, "jobNumber" | "title"> | null = null;
    if (updated.jobId) {
      const [j] = await db
        .select({ jobNumber: jobs.jobNumber, title: jobs.title })
        .from(jobs)
        .where(eq(jobs.id, updated.jobId))
        .limit(1);
      job = j ?? null;
    }

    return res.json(publicTimerSession(updated, job));
  } catch (err) {
    logger.error({ err }, "Failed to heartbeat timer session");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
