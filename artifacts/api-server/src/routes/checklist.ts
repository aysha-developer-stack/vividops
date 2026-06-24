import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  jobs,
  jobAttachments,
  jobChecklistAttachments,
  jobChecklistState,
  jobMembers,
  users,
  type JobRow,
  type UserRow,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ensureSchema = async () => {};

async function canViewJob(actor: UserRow, job: JobRow): Promise<boolean> {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id || job.createdById === actor.id;
  }
  if (job.assigneeId === actor.id) return true;
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, job.id), eq(jobMembers.userId, actor.id)))
    .limit(1);
  return !!row;
}

function canManageJob(actor: UserRow, job: JobRow): boolean {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id || job.createdById === actor.id;
  }
  return false;
}

function isValidStatus(s: unknown): s is "pending" | "in_progress" | "completed" | "rework" {
  return s === "pending" || s === "in_progress" || s === "completed" || s === "rework";
}

router.get("/jobs/:jobId/checklist-state", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const userIdParam = typeof req.query.userId === "string" ? req.query.userId : null;

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(actor, job))) return res.status(403).json({ error: "Forbidden" });

    const targetUserId =
      actor.role === "user" ? actor.id : (userIdParam ?? job.assigneeId ?? actor.id);

    if (actor.role === "user" && targetUserId !== actor.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const rows = await db
      .select()
      .from(jobChecklistState)
      .where(and(eq(jobChecklistState.jobId, jobId), eq(jobChecklistState.userId, targetUserId)))
      .orderBy(desc(jobChecklistState.updatedAt));

    const attachments = await db
      .select({ itemId: jobChecklistAttachments.itemId, attachmentId: jobChecklistAttachments.attachmentId })
      .from(jobChecklistAttachments)
      .where(and(eq(jobChecklistAttachments.jobId, jobId), eq(jobChecklistAttachments.userId, targetUserId)));

    const countByItem: Record<number, number> = {};
    for (const a of attachments) {
      countByItem[a.itemId] = (countByItem[a.itemId] ?? 0) + 1;
      void a.attachmentId;
    }

    return res.json(
      rows.map((r) => ({
        itemId: r.itemId,
        status: r.status,
        reworkReason: r.reworkReason,
        attachmentCount: countByItem[r.itemId] ?? 0,
        updatedAt: r.updatedAt,
      })),
    );
  } catch (err) {
    logger.error({ err }, "Failed to load checklist state");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/jobs/:jobId/checklist-state", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const itemId = Number(req.body?.itemId);
    const status = req.body?.status;
    const reworkReason = typeof req.body?.reworkReason === "string" ? req.body.reworkReason : null;
    const userIdParam = typeof req.body?.userId === "string" ? req.body.userId : null;

    if (!Number.isFinite(itemId) || itemId <= 0) return res.status(400).json({ error: "itemId is required" });
    if (!isValidStatus(status)) return res.status(400).json({ error: "Invalid status" });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(actor, job))) return res.status(403).json({ error: "Forbidden" });

    const targetUserId = actor.role === "user" ? actor.id : (userIdParam ?? job.assigneeId ?? actor.id);
    if (actor.role === "user" && targetUserId !== actor.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (actor.role === "user" && status === "rework") {
      return res.status(403).json({ error: "Users cannot set rework status" });
    }
    if (actor.role !== "super-admin" && actor.role !== "admin" && actor.role !== "supervisor" && status === "rework") {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (actor.role === "supervisor" && !canManageJob(actor, job)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db
      .insert(jobChecklistState)
      .values({
        id: randomUUID(),
        jobId,
        userId: targetUserId,
        itemId,
        status,
        reworkReason: status === "rework" ? (reworkReason ?? "") : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [jobChecklistState.jobId, jobChecklistState.userId, jobChecklistState.itemId],
        set: {
          status,
          reworkReason: status === "rework" ? (reworkReason ?? "") : null,
          updatedAt: new Date(),
        },
      });

    if (status === "rework") {
      await db
        .update(jobs)
        .set({
          status: "rework" as any,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
    }

    if (actor.role === "user" && status === "completed") {
      const templateJson = typeof job.description === "string" ? job.description : null;
      let total = 0;
      try {
        if (templateJson) {
          const parsed = JSON.parse(templateJson) as any;
          const list = Array.isArray(parsed?.checklist) ? parsed.checklist : [];
          total = list.length;
        }
      } catch {
      }

      if (total > 0) {
        const rows = await db
          .select({ itemId: jobChecklistState.itemId, status: jobChecklistState.status })
          .from(jobChecklistState)
          .where(and(eq(jobChecklistState.jobId, jobId), eq(jobChecklistState.userId, targetUserId)));
        const done = rows.filter((r) => r.status === "completed").length;
        const nextProgress = Math.round((done / total) * 100);
        const hasRework = rows.some((r) => r.status === "rework");
        const nextStatus = hasRework ? "rework" : nextProgress >= 100 ? "completed" : nextProgress > 0 ? "in_progress" : "pending";
        await db
          .update(jobs)
          .set({
            progress: nextProgress,
            status: nextStatus as any,
            completedAt: nextStatus === "completed" ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, jobId));
      }
    }

    return res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to update checklist state");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/jobs/:jobId/checklist-attachments", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const jobId = String(req.params.jobId);
    const itemId = Number(req.body?.itemId);
    const attachmentId = typeof req.body?.attachmentId === "string" ? req.body.attachmentId : "";
    const userIdParam = typeof req.body?.userId === "string" ? req.body.userId : null;

    if (!Number.isFinite(itemId) || itemId <= 0) return res.status(400).json({ error: "itemId is required" });
    if (!attachmentId) return res.status(400).json({ error: "attachmentId is required" });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!(await canViewJob(actor, job))) return res.status(403).json({ error: "Forbidden" });

    const targetUserId = actor.role === "user" ? actor.id : (userIdParam ?? job.assigneeId ?? actor.id);
    if (actor.role === "user" && targetUserId !== actor.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [att] = await db.select().from(jobAttachments).where(eq(jobAttachments.id, attachmentId)).limit(1);
    if (!att || att.jobId !== jobId) return res.status(400).json({ error: "Attachment not found" });

    await db.insert(jobChecklistAttachments).values({
      id: randomUUID(),
      jobId,
      userId: targetUserId,
      itemId,
      attachmentId,
    });

    return res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to link checklist attachment");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
