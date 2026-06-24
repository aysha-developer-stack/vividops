import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, sql as dsql } from "drizzle-orm";
import { upload, uploadToSupabase } from "../lib/storage";
import { db, jobs, users, jobAttachments, jobMembers, type JobRow, type UserRow, sql } from "@workspace/db";
import { randomUUID } from "crypto";
import { requireAuth } from "../middlewares/requireAuth";
import { io } from "../lib/socket";
import { addToQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

let jobMembersSchemaEnsured = false;
const ensureJobMembersSchema = async () => {};
const ensureAttachmentsSchema = async () => {};

async function canViewJob(actor: UserRow, job: JobRow): Promise<boolean> {
  if (actor.role === "super-admin" || actor.role === "admin") return true;
  if (actor.role === "supervisor") {
    return job.supervisorId === actor.id;
  }
  if (job.assigneeId === actor.id) return true;
  await ensureJobMembersSchema();
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, job.id), eq(jobMembers.userId, actor.id)))
    .limit(1);
  return !!row;
}

router.get("/jobs/:jobId/attachments", requireAuth, async (req, res) => {
  try {
    await ensureAttachmentsSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const actor = req.session!.user;

    const [jobRow] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!jobRow) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    if (!(await canViewJob(actor, jobRow))) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const rows = await db
      .select({
        attachment: jobAttachments,
        uploadedBy: { id: users.id, name: users.name, role: users.role },
      })
      .from(jobAttachments)
      .leftJoin(users, eq(users.id, jobAttachments.uploadedById))
      .where(eq(jobAttachments.jobId, jobId))
      .orderBy(desc(jobAttachments.createdAt));

    res.json(
      rows.map((r) => ({
        ...r.attachment,
        uploadedBy: r.uploadedBy?.id ? r.uploadedBy : null,
      })),
    );
    return;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Internal server error";
    logger.error({ err, message }, "Failed to list attachments");
    res.status(500).json({ message });
    return;
  }
});

// Endpoint to upload an attachment to a job
router.post(
  "/jobs/:jobId/attachments",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      await ensureAttachmentsSchema();
      const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      const file = req.file;

      if (!file) {
        res.status(400).json({ message: "No file uploaded" });
        return;
      }

      const actor = req.session!.user;
      const [jobRow] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (!jobRow) {
        res.status(404).json({ message: "Job not found" });
        return;
      }
      if (!(await canViewJob(actor, jobRow))) {
        res.status(403).json({ message: "Forbidden" });
        return;
      }

      // Upload to Supabase Storage
      const jobSlug = String(jobRow.title ?? "job")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "")
        .slice(0, 60) || "job";
      const jobFolder = `JOB-${jobRow.serial}-${jobSlug}`;
      const bucketFolder = `jobs/${jobFolder}/${actor.role === "user" ? "completed-files" : "job-files"}`;
      const { key, location } = await uploadToSupabase(file, { prefix: bucketFolder });

      // Save attachment metadata to DB
      const [attachment] = await db
        .insert(jobAttachments)
        .values({
          jobId,
          fileName: file.originalname,
          fileKey: key,
          fileUrl: location,
          fileType: file.mimetype,
          fileSize: file.size.toString(),
          uploadedById: actor.id,
        })
        .returning();

      const checklistItemIdRaw = typeof (req.body as any)?.checklistItemId === "string" ? String((req.body as any).checklistItemId) : "";
      const checklistItemId = Number(checklistItemIdRaw);
      if (Number.isFinite(checklistItemId) && checklistItemId > 0) {
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS job_checklist_attachments (
            id uuid PRIMARY KEY,
            job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            item_id integer NOT NULL,
            attachment_id uuid NOT NULL REFERENCES job_attachments(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now()
          );
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS job_checklist_attachments_item_idx ON job_checklist_attachments (job_id, user_id, item_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS job_checklist_attachments_job_idx ON job_checklist_attachments (job_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS job_checklist_attachments_user_idx ON job_checklist_attachments (user_id);`);

        await db.execute(sql`
          INSERT INTO job_checklist_attachments (id, job_id, user_id, item_id, attachment_id)
          VALUES (${randomUUID()}::uuid, ${jobId}::uuid, ${actor.id}::uuid, ${checklistItemId}, ${attachment.id}::uuid)
        `);
      }

      // Realtime notification via Socket.IO
      io.to(`job:${jobId}`).emit("attachment:added", {
        jobId,
        attachment,
        uploadedBy: actor.name,
      });

      // Persistent Notification
      if (actor.role === "user") {
        // Completion file upload notification
        if (jobRow.supervisorId) {
          await createNotification({
            userId: jobRow.supervisorId,
            jobId: jobId,
            title: `Completion File Uploaded: ${jobRow.title}`,
            description: `${actor.name} has uploaded a completion file for ${jobRow.title}: ${file.originalname}`,
            type: "file"
          });
        }
        // Notify Admins
        const admins = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "super-admin"]));
        for (const admin of admins) {
          await createNotification({
            userId: admin.id,
            jobId: jobId,
            title: `Completion File Uploaded: ${jobRow.title}`,
            description: `${actor.name} uploaded a file for ${jobRow.title}.`,
            type: "file"
          });
        }
      } else {
        // Job file upload notification
        const recipients = new Set<string>();
        if (jobRow.assigneeId) recipients.add(jobRow.assigneeId);
        
        // Add additional members
        const members = await db.select({ userId: jobMembers.userId }).from(jobMembers).where(eq(jobMembers.jobId, jobRow.id));
        for (const m of members) recipients.add(m.userId);

        for (const rid of recipients) {
          if (rid === actor.id) continue;
          await createNotification({
            userId: rid,
            jobId: jobId,
            title: `New Job File: ${jobRow.title}`,
            description: `${actor.name} uploaded a file for ${jobRow.title}: ${file.originalname}`,
            type: "file"
          });
        }

        if (jobRow.supervisorId && actor.id !== jobRow.supervisorId) {
          await createNotification({
            userId: jobRow.supervisorId,
            jobId: jobId,
            title: `Job File Uploaded: ${jobRow.title}`,
            description: `${actor.name} uploaded a file for ${jobRow.title}: ${file.originalname}`,
            type: "file"
          });
        }
      }

      // Background processing is optional; do not fail the upload if Redis is over quota.
      addToQueue("process-attachment", {
        attachmentId: attachment.id,
        jobId,
      });

      res.status(201).json({
        ...attachment,
        uploadedBy: { id: actor.id, name: actor.name, role: actor.role },
      });
      return;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Internal server error";
      logger.error({ err, message }, "Failed to upload attachment");
      res.status(500).json({ message });
      return;
    }
  }
);

export default router;
