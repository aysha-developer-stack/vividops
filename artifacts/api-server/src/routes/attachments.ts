import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, sql as dsql } from "drizzle-orm";
import { upload, uploadToSupabase, supabase, buildStorageObjectKey, createDirectUploadUrl, getPublicUrlForKey, storageObjectExists } from "../lib/storage";
import { validateUploadFileName } from "../lib/upload-file-types";
import {
  buildJobAttachmentFolder,
  parseAttachmentUploadBody,
  storageKeyMatchesJobFolder,
  type ParsedAttachmentUpload,
} from "../lib/job-attachment-upload";
import { db, jobs, users, jobAttachments, jobChecklistAttachments, jobMembers, type JobRow, type UserRow, sql } from "@workspace/db";
import { randomUUID } from "crypto";
import { requireAuth } from "../middlewares/requireAuth";
import { io } from "../lib/socket";
import { addToQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { createNotification, notifyJobManagers } from "../lib/notifications";

const router: IRouter = Router();

let jobMembersSchemaEnsured = false;
const ensureJobMembersSchema = async () => {};
let attachmentsSchemaEnsured = false;
const ensureAttachmentsSchema = async () => {
  if (attachmentsSchemaEnsured) return;
  await db.execute(sql`
    ALTER TABLE job_attachments
    ADD COLUMN IF NOT EXISTS file_category text NOT NULL DEFAULT 'job'
  `);
  await db.execute(sql`
    ALTER TABLE job_attachments
    ADD COLUMN IF NOT EXISTS review_note_id uuid
  `);
  attachmentsSchemaEnsured = true;
};

let checklistAttachmentsSchemaEnsured = false;
const ensureChecklistAttachmentsSchema = async () => {
  if (checklistAttachmentsSchemaEnsured) return;
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
  checklistAttachmentsSchemaEnsured = true;
};

async function loadJobForAttachmentUpload(jobId: string, actor: UserRow) {
  const [jobRow] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!jobRow) return { error: { status: 404, message: "Job not found" } as const };
  if (!(await canViewJob(actor, jobRow))) {
    return { error: { status: 403, message: "Forbidden" } as const };
  }
  return { jobRow };
}

async function finalizeUploadedAttachment(opts: {
  jobId: string;
  jobRow: JobRow;
  actor: UserRow;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileType: string;
  fileSize: string;
  parsed: ParsedAttachmentUpload;
}) {
  const { jobId, jobRow, actor, fileName, fileKey, fileUrl, fileType, fileSize, parsed } = opts;
  const {
    checklistItemId,
    isChecklistCompletedUpload,
    isChecklistInstructionUpload,
    treatAsFieldWorker,
    fileCategory,
    reviewNoteId,
    suppressNotifications,
  } = parsed;

  const [attachment] = await db
    .insert(jobAttachments)
    .values({
      jobId,
      fileName,
      fileKey,
      fileUrl,
      fileType,
      fileSize,
      fileCategory,
      reviewNoteId: reviewNoteId ?? undefined,
      uploadedById: actor.id,
    })
    .returning();

  if (checklistItemId > 0) {
    const linkUserId =
      treatAsFieldWorker && (actor.role === "user" || isChecklistCompletedUpload)
        ? actor.id
        : (jobRow.assigneeId ?? actor.id);
    await ensureChecklistAttachmentsSchema();
    await db.execute(sql`
      INSERT INTO job_checklist_attachments (id, job_id, user_id, item_id, attachment_id)
      VALUES (${randomUUID()}::uuid, ${jobId}::uuid, ${linkUserId}::uuid, ${checklistItemId}, ${attachment.id}::uuid)
    `);
  }

  if (!suppressNotifications) {
    io.to(`job:${jobId}`).emit("attachment:added", {
      jobId,
      attachment,
      uploadedBy: actor.name,
    });

    const fileTitle =
      fileCategory === "completed"
        ? `Completion File Uploaded: ${jobRow.title}`
        : `New Job File: ${jobRow.title}`;
    const fileDesc = `${actor.name} uploaded a file for ${jobRow.title}: ${fileName}`;

    await notifyJobManagers({
      jobId,
      supervisorId: jobRow.supervisorId,
      actorId: actor.id,
      title: fileTitle,
      description: fileDesc,
      type: "file",
    });

    if (fileCategory !== "completed") {
      const recipients = new Set<string>();
      if (jobRow.assigneeId) recipients.add(jobRow.assigneeId);
      const members = await db
        .select({ userId: jobMembers.userId })
        .from(jobMembers)
        .where(eq(jobMembers.jobId, jobRow.id));
      for (const m of members) recipients.add(m.userId);
      recipients.delete(actor.id);
      if (jobRow.supervisorId) recipients.delete(jobRow.supervisorId);

      for (const rid of recipients) {
        await createNotification({
          userId: rid,
          jobId,
          title: fileTitle,
          description: fileDesc,
          type: "file",
        });
      }
    }
  }

  addToQueue("process-attachment", {
    attachmentId: attachment.id,
    jobId,
  });

  return attachment;
}

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
        checklistItemId: jobChecklistAttachments.itemId,
      })
      .from(jobAttachments)
      .leftJoin(users, eq(users.id, jobAttachments.uploadedById))
      .leftJoin(jobChecklistAttachments, eq(jobChecklistAttachments.attachmentId, jobAttachments.id))
      .where(eq(jobAttachments.jobId, jobId))
      .orderBy(desc(jobAttachments.createdAt));

    res.json(
      rows.map((r) => ({
        ...r.attachment,
        uploadedBy: r.uploadedBy?.id ? r.uploadedBy : null,
        checklistItemId: r.checklistItemId ?? null,
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
router.get("/jobs/:jobId/attachments/:attachmentId/view", requireAuth, async (req, res) => {
  try {
    await ensureAttachmentsSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const attachmentId = Array.isArray(req.params.attachmentId)
      ? req.params.attachmentId[0]
      : req.params.attachmentId;
    const disposition = req.query.disposition === "attachment" ? "attachment" : "inline";
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

    const [attachment] = await db
      .select()
      .from(jobAttachments)
      .where(and(eq(jobAttachments.id, attachmentId), eq(jobAttachments.jobId, jobId)))
      .limit(1);
    if (!attachment) {
      res.status(404).json({ message: "Attachment not found" });
      return;
    }

    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "vivid-ops-files";
    const { data, error } = await supabase.storage.from(bucketName).download(attachment.fileKey);
    if (error || !data) {
      res.status(404).json({ message: "File not found in storage" });
      return;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const rawName = (attachment.fileName || "file").split(/[/\\]/).pop() || "file";
    const safeName = rawName.replace(/[\r\n"]+/g, "_").trim() || "file";
    const encodedName = encodeURIComponent(safeName).replace(/['()]/g, escape);
    const contentType = attachment.fileType || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
    return;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Internal server error";
    logger.error({ err, message }, "Failed to view attachment");
    res.status(500).json({ message });
    return;
  }
});

router.post("/jobs/:jobId/attachments/bulk-notify", requireAuth, async (req, res) => {
  try {
    await ensureAttachmentsSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const actor = req.session!.user;
    const jobFileCount = Math.max(0, Number((req.body as { jobFileCount?: unknown })?.jobFileCount) || 0);
    const checklistFileCount = Math.max(0, Number((req.body as { checklistFileCount?: unknown })?.checklistFileCount) || 0);
    const total = jobFileCount + checklistFileCount;
    if (total <= 0) {
      res.json({ ok: true });
      return;
    }

    const [jobRow] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!jobRow) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    if (!(await canViewJob(actor, jobRow))) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const parts: string[] = [];
    if (jobFileCount > 0) {
      parts.push(`${jobFileCount} job file${jobFileCount === 1 ? "" : "s"}`);
    }
    if (checklistFileCount > 0) {
      parts.push(`${checklistFileCount} checklist file${checklistFileCount === 1 ? "" : "s"}`);
    }
    const summary = parts.join(" and ");
    const fileTitle = `Files Uploaded: ${jobRow.title}`;
    const fileDesc = `${actor.name} uploaded ${summary} for ${jobRow.title}.`;

    await notifyJobManagers({
      jobId,
      supervisorId: jobRow.supervisorId,
      actorId: actor.id,
      title: fileTitle,
      description: fileDesc,
      type: "file",
    });

    if (jobFileCount > 0) {
      const recipients = new Set<string>();
      if (jobRow.assigneeId) recipients.add(jobRow.assigneeId);
      const members = await db
        .select({ userId: jobMembers.userId })
        .from(jobMembers)
        .where(eq(jobMembers.jobId, jobRow.id));
      for (const m of members) recipients.add(m.userId);
      recipients.delete(actor.id);
      if (jobRow.supervisorId) recipients.delete(jobRow.supervisorId);

      for (const rid of recipients) {
        await createNotification({
          userId: rid,
          jobId,
          title: fileTitle,
          description: fileDesc,
          type: "file",
        });
      }
    }

    io.to(`job:${jobId}`).emit("attachment:added", {
      jobId,
      bulk: true,
      count: total,
      uploadedBy: actor.name,
    });

    res.json({ ok: true });
    return;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Internal server error";
    logger.error({ err, message }, "Failed to send bulk attachment notification");
    res.status(500).json({ message });
    return;
  }
});

router.post("/jobs/:jobId/attachments/presign", requireAuth, async (req, res) => {
  try {
    await ensureAttachmentsSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const actor = req.session!.user;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    if (!fileName) {
      res.status(400).json({ message: "fileName is required" });
      return;
    }

    const loaded = await loadJobForAttachmentUpload(jobId, actor);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.error.status).json({ message: loaded.error.message });
      return;
    }
    const { jobRow } = loaded;
    const parsed = parseAttachmentUploadBody(actor, jobRow, body);

    const typeError = validateUploadFileName(fileName, {
      checklistInstruction:
        parsed.isChecklistInstructionUpload || parsed.isChecklistCompletedUpload,
      reviewPhoto: parsed.fileCategory === "review",
    });
    if (typeError) {
      res.status(400).json({ message: typeError });
      return;
    }

    const bucketFolder = buildJobAttachmentFolder(jobRow, parsed.fileCategory);
    const storageKey = buildStorageObjectKey(fileName, bucketFolder);
    const direct = await createDirectUploadUrl(storageKey);

    res.json({
      signedUrl: direct.signedUrl,
      token: direct.token,
      key: direct.path,
      fileUrl: getPublicUrlForKey(direct.path),
    });
    return;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Internal server error";
    logger.error({ err, message }, "Failed to presign attachment upload");
    res.status(500).json({ message });
    return;
  }
});

router.post("/jobs/:jobId/attachments/register", requireAuth, async (req, res) => {
  try {
    await ensureAttachmentsSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const actor = req.session!.user;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const fileKey = typeof body.key === "string" ? body.key.trim() : "";
    const fileType =
      typeof body.fileType === "string" && body.fileType.trim()
        ? body.fileType.trim()
        : "application/octet-stream";
    const fileSizeRaw = body.fileSize;
    const fileSize =
      typeof fileSizeRaw === "number"
        ? String(fileSizeRaw)
        : typeof fileSizeRaw === "string"
          ? fileSizeRaw
          : "0";

    if (!fileName || !fileKey) {
      res.status(400).json({ message: "fileName and key are required" });
      return;
    }

    const loaded = await loadJobForAttachmentUpload(jobId, actor);
    if ("error" in loaded && loaded.error) {
      res.status(loaded.error.status).json({ message: loaded.error.message });
      return;
    }
    const { jobRow } = loaded;
    const parsed = parseAttachmentUploadBody(actor, jobRow, body);

    const typeError = validateUploadFileName(fileName, {
      checklistInstruction:
        parsed.isChecklistInstructionUpload || parsed.isChecklistCompletedUpload,
      reviewPhoto: parsed.fileCategory === "review",
    });
    if (typeError) {
      res.status(400).json({ message: typeError });
      return;
    }

    const bucketFolder = buildJobAttachmentFolder(jobRow, parsed.fileCategory);
    if (!storageKeyMatchesJobFolder(fileKey, bucketFolder)) {
      res.status(400).json({ message: "Invalid storage key for this job upload" });
      return;
    }

    const exists = await storageObjectExists(fileKey);
    if (!exists) {
      res.status(400).json({ message: "Uploaded file not found in storage" });
      return;
    }

    const attachment = await finalizeUploadedAttachment({
      jobId,
      jobRow,
      actor,
      fileName,
      fileKey,
      fileUrl: getPublicUrlForKey(fileKey),
      fileType,
      fileSize,
      parsed,
    });

    res.status(201).json({
      ...attachment,
      uploadedBy: { id: actor.id, name: actor.name, role: actor.role },
    });
    return;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Internal server error";
    logger.error({ err, message }, "Failed to register attachment upload");
    res.status(500).json({ message });
    return;
  }
});

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
      const loaded = await loadJobForAttachmentUpload(jobId, actor);
      if ("error" in loaded && loaded.error) {
        res.status(loaded.error.status).json({ message: loaded.error.message });
        return;
      }
      const { jobRow } = loaded;
      const parsed = parseAttachmentUploadBody(actor, jobRow, req.body as Record<string, unknown>);

      const typeError = validateUploadFileName(file.originalname, {
        checklistInstruction:
          parsed.isChecklistInstructionUpload || parsed.isChecklistCompletedUpload,
        reviewPhoto: parsed.fileCategory === "review",
      });
      if (typeError) {
        res.status(400).json({ message: typeError });
        return;
      }

      const bucketFolder = buildJobAttachmentFolder(jobRow, parsed.fileCategory);
      const { key, location } = await uploadToSupabase(file, { prefix: bucketFolder });

      const attachment = await finalizeUploadedAttachment({
        jobId,
        jobRow,
        actor,
        fileName: file.originalname,
        fileKey: key,
        fileUrl: location,
        fileType: file.mimetype,
        fileSize: file.size.toString(),
        parsed,
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

router.delete("/jobs/:jobId/attachments/:attachmentId", requireAuth, async (req, res) => {
  try {
    await ensureAttachmentsSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const attachmentId = Array.isArray(req.params.attachmentId)
      ? req.params.attachmentId[0]
      : req.params.attachmentId;
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

    const [attachment] = await db
      .select()
      .from(jobAttachments)
      .where(and(eq(jobAttachments.id, attachmentId), eq(jobAttachments.jobId, jobId)))
      .limit(1);
    if (!attachment) {
      res.status(404).json({ message: "Attachment not found" });
      return;
    }
    if (attachment.uploadedById !== actor.id) {
      res.status(403).json({ message: "You can only delete files you uploaded" });
      return;
    }

    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "vivid-ops-files";
    if (attachment.fileKey) {
      try {
        await supabase.storage.from(bucketName).remove([attachment.fileKey]);
      } catch (err) {
        logger.warn({ err, attachmentId }, "Failed to delete attachment from storage");
      }
    }

    await db.delete(jobAttachments).where(eq(jobAttachments.id, attachmentId));

    await notifyJobManagers({
      jobId,
      supervisorId: jobRow.supervisorId,
      actorId: actor.id,
      title: `File Removed: ${jobRow.title}`,
      description: `${actor.name} deleted a file from ${jobRow.title}: ${attachment.fileName}`,
      type: "file",
    });

    io.to(`job:${jobId}`).emit("attachment:removed", { jobId, attachmentId });

    res.json({ ok: true });
    return;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Internal server error";
    logger.error({ err, message }, "Failed to delete attachment");
    res.status(500).json({ message });
    return;
  }
});

export default router;
