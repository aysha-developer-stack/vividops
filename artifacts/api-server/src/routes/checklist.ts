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
import { createNotification } from "../lib/notifications";
import { ensureJobWriteSchema } from "../lib/schema-init";
import { createReworkWithErrorReport, markOpenReworksAwaitingReview } from "../lib/reworks";

const router: IRouter = Router();

const ensureSchema = async () => {
  await ensureJobWriteSchema();
};

async function canViewJob(actor: UserRow, job: JobRow): Promise<boolean> {
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

function canManageJob(actor: UserRow, job: JobRow): boolean {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
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

    const linked = await db
      .select({
        itemId: jobChecklistAttachments.itemId,
        linkUserId: jobChecklistAttachments.userId,
        attachment: jobAttachments,
        uploadedBy: { id: users.id, name: users.name, role: users.role },
      })
      .from(jobChecklistAttachments)
      .innerJoin(jobAttachments, eq(jobAttachments.id, jobChecklistAttachments.attachmentId))
      .leftJoin(users, eq(users.id, jobAttachments.uploadedById))
      .where(eq(jobChecklistAttachments.jobId, jobId))
      .orderBy(desc(jobAttachments.createdAt));

    const filesByItem: Record<
      number,
      Array<{
        id: string;
        fileName: string;
        fileType: string | null;
        fileSize: string | null;
        fileUrl: string;
        uploadedBy: { id: string; name: string; role: UserRow["role"] } | null;
        createdAt: Date;
      }>
    > = {};
    const countByItem: Record<number, number> = {};

    for (const row of linked) {
      const itemId = row.itemId;
      if (!filesByItem[itemId]) filesByItem[itemId] = [];
      filesByItem[itemId].push({
        id: row.attachment.id,
        fileName: row.attachment.fileName,
        fileType: row.attachment.fileType,
        fileSize: row.attachment.fileSize,
        fileUrl: row.attachment.fileUrl,
        uploadedBy: row.uploadedBy?.id ? row.uploadedBy : null,
        createdAt: row.attachment.createdAt,
      });
      // Count only worker completion uploads — not manager instruction files
      if (row.uploadedBy?.role === "user" || row.attachment.uploadedById === targetUserId) {
        countByItem[itemId] = (countByItem[itemId] ?? 0) + 1;
      }
    }

    // Ensure we still return template items with files even if no state rows yet
    const itemIds = new Set<number>([
      ...rows.map((r) => r.itemId),
      ...Object.keys(filesByItem).map((k) => Number(k)),
    ]);
    const stateByItem = new Map(rows.map((r) => [r.itemId, r]));

    return res.json(
      Array.from(itemIds)
        .sort((a, b) => a - b)
        .map((itemId) => {
          const r = stateByItem.get(itemId);
          return {
            itemId,
            status: r?.status ?? "pending",
            reworkReason: r?.reworkReason ?? null,
            attachmentCount: countByItem[itemId] ?? 0,
            files: filesByItem[itemId] ?? [],
            updatedAt: r?.updatedAt ?? null,
          };
        }),
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
    const category = typeof req.body?.category === "string" ? req.body.category : null;
    const comments = typeof req.body?.comments === "string" ? req.body.comments : null;
    const dueAt = typeof req.body?.dueAt === "string" ? req.body.dueAt : null;
    const severity = typeof req.body?.severity === "string" ? req.body.severity : null;
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

    let checklistList: any[] = [];
    try {
      const parsed = JSON.parse(typeof job.description === "string" ? job.description : "{}") as any;
      checklistList = Array.isArray(parsed?.checklist) ? parsed.checklist : [];
    } catch {
      checklistList = [];
    }

    if (actor.role === "user" && status === "completed") {
      if (checklistList.length === 0) {
        return res.status(400).json({ error: "This job has no checklist items to complete." });
      }
      const template = checklistList[itemId - 1];
      if (!template) {
        return res.status(400).json({ error: "Checklist item not found" });
      }
      const [uploaded] = await db
        .select({ id: jobChecklistAttachments.id })
        .from(jobChecklistAttachments)
        .where(
          and(
            eq(jobChecklistAttachments.jobId, jobId),
            eq(jobChecklistAttachments.userId, targetUserId),
            eq(jobChecklistAttachments.itemId, itemId),
          ),
        )
        .limit(1);
      if (!uploaded) {
        return res.status(400).json({
          error: "Upload a checklist file before marking this item complete.",
        });
      }
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

      // Keep a personal mistake record for analytics / coaching
      let checklistItemLabel = `Checklist item #${itemId}`;
      try {
        const parsed = JSON.parse(typeof job.description === "string" ? job.description : "{}") as any;
        const list = Array.isArray(parsed?.checklist) ? parsed.checklist : [];
        const item = list[itemId - 1];
        if (item && typeof item.text === "string" && item.text.trim()) {
          checklistItemLabel = item.text.trim();
        }
      } catch {
        // keep default label
      }

      await createReworkWithErrorReport({
        actor,
        job,
        userId: targetUserId,
        checklistItemId: itemId,
        reason: reworkReason?.trim() || `Rework requested on checklist item "${checklistItemLabel}".`,
        category,
        comments,
        dueAt,
        severity,
        source: "checklist_rework",
        title: `Rework: ${checklistItemLabel}`,
      });

      await createNotification({
        userId: targetUserId,
        jobId: jobId,
        title: `Checklist Rework Required: ${job.title}`,
        description: `Rework requested on Item #${itemId}. Reason: ${reworkReason || "No reason provided."}`,
        type: "rework"
      });

      if (job.supervisorId && job.supervisorId !== actor.id) {
        await createNotification({
          userId: job.supervisorId,
          jobId,
          title: `Rework Flagged: ${job.title}`,
          description: `${actor.name} requested rework on checklist item #${itemId} for ${job.title}.`,
          type: "rework",
        });
      }
    }

    if (actor.role === "user" && status === "completed") {
      const total = checklistList.length;

      if (total > 0) {
        const rows = await db
          .select({ itemId: jobChecklistState.itemId, status: jobChecklistState.status })
          .from(jobChecklistState)
          .where(and(eq(jobChecklistState.jobId, jobId), eq(jobChecklistState.userId, targetUserId)));
        const done = rows.filter((r) => r.status === "completed").length;
        const nextProgress = Math.round((done / total) * 100);
        const hasRework = rows.some((r) => r.status === "rework");

        let nextStatus: string =
          hasRework ? "rework" : nextProgress > 0 ? "in_progress" : "pending";

        // Only move to supervisor review when every checklist item (+ required files) is done
        if (!hasRework && nextProgress >= 100) {
          const { assertWorkerChecklistReady } = await import("../lib/job-review");
          const checklistError = await assertWorkerChecklistReady(job, targetUserId);
          if (!checklistError) {
            await markOpenReworksAwaitingReview(job.id, targetUserId);
            nextStatus = "awaiting_supervisor";
          }
        }

        const previousStatus = job.status;
        await db
          .update(jobs)
          .set({
            progress: nextProgress,
            status: nextStatus as any,
            completedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, jobId));

        if (nextStatus === "awaiting_supervisor" && previousStatus !== "awaiting_supervisor") {
          if (job.supervisorId) {
            await createNotification({
              userId: job.supervisorId,
              jobId: jobId,
              title: `Ready for Supervisor Review: ${job.title}`,
              description: `Checklist for job ${job.title} has been completed by ${actor.name}. Please review.`,
              type: "checklist",
            });
          }
          await createNotification({
            userId: targetUserId,
            jobId,
            title: `Submitted for Review: ${job.title}`,
            description: `Your checklist for ${job.title} is complete and awaiting supervisor review.`,
            type: "checklist",
          });
        }
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
