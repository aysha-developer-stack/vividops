import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  jobs,
  users,
  jobMembers,
  jobNotes,
  JOB_NOTE_TYPES,
  type JobNoteType,
  type JobRow,
  type UserRow,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { createNotification, notifyJobManagers, previewText } from "../lib/notifications";
import { logger } from "../lib/logger";

const router: IRouter = Router();

let schemaEnsured = false;

async function ensureJobNotesSchema() {
  if (schemaEnsured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text text NOT NULL,
      note_type text NOT NULL DEFAULT 'general',
      pinned boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_notes_job_idx ON job_notes (job_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_notes_job_pinned_idx ON job_notes (job_id, pinned)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS job_notes_user_idx ON job_notes (user_id)`);
  schemaEnsured = true;
}

function isAdmin(actor: UserRow): boolean {
  return actor.role === "super-admin" || actor.role === "admin";
}

async function canViewJob(actor: UserRow, job: JobRow): Promise<boolean> {
  if (isAdmin(actor)) return true;
  if (actor.role === "supervisor") return job.supervisorId === actor.id;
  if (job.assigneeId === actor.id) return true;
  const [row] = await db
    .select({ id: jobMembers.id })
    .from(jobMembers)
    .where(and(eq(jobMembers.jobId, job.id), eq(jobMembers.userId, actor.id)))
    .limit(1);
  return !!row;
}

function canPinNotes(actor: UserRow, job: JobRow): boolean {
  if (isAdmin(actor)) return true;
  return actor.role === "supervisor" && job.supervisorId === actor.id;
}

function canModifyNote(actor: UserRow, noteUserId: string): boolean {
  if (isAdmin(actor)) return true;
  return noteUserId === actor.id;
}

function canSetInternalNote(actor: UserRow): boolean {
  return isAdmin(actor) || actor.role === "supervisor";
}

function isJobNoteType(value: unknown): value is JobNoteType {
  return typeof value === "string" && (JOB_NOTE_TYPES as readonly string[]).includes(value);
}

function canViewNote(actor: UserRow, noteType: string): boolean {
  if (noteType !== "internal") return true;
  return actor.role !== "user";
}

async function loadJob(jobId: string): Promise<JobRow | null> {
  const [jobRow] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return jobRow ?? null;
}

router.get("/jobs/:jobId/notes", requireAuth, async (req, res) => {
  try {
    await ensureJobNotesSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const actor = req.session!.user;
    const jobRow = await loadJob(jobId);
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
        note: jobNotes,
        author: { id: users.id, name: users.name, role: users.role },
      })
      .from(jobNotes)
      .innerJoin(users, eq(users.id, jobNotes.userId))
      .where(eq(jobNotes.jobId, jobId))
      .orderBy(desc(jobNotes.pinned), desc(jobNotes.createdAt));

    const notes = rows
      .filter((r) => canViewNote(actor, r.note.noteType))
      .map((r) => ({
        ...r.note,
        author: r.author,
      }));

    res.json(notes);
    return;
  } catch (err) {
    logger.error({ err }, "Failed to list job notes");
    res.status(500).json({ message: "Internal server error" });
    return;
  }
});

router.post("/jobs/:jobId/notes", requireAuth, async (req, res) => {
  try {
    await ensureJobNotesSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const actor = req.session!.user;
    const jobRow = await loadJob(jobId);
    if (!jobRow) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    if (!(await canViewJob(actor, jobRow))) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ message: "Note text is required" });
      return;
    }
    if (text.length > 5000) {
      res.status(400).json({ message: "Note is too long (max 5000 characters)" });
      return;
    }

    let noteType: JobNoteType = "general";
    if (isJobNoteType(req.body?.noteType)) {
      noteType = req.body.noteType;
    }
    if (noteType === "internal" && !canSetInternalNote(actor)) {
      res.status(403).json({ message: "You cannot create internal notes" });
      return;
    }
    if (noteType === "completion") {
      res.status(403).json({ message: "Completion notes are added when submitting or completing a job" });
      return;
    }

    const pinned = isAdmin(actor) && req.body?.pinned === true;

    const [created] = await db
      .insert(jobNotes)
      .values({
        jobId,
        userId: actor.id,
        text,
        noteType,
        pinned,
      })
      .returning();

    const author = { id: actor.id, name: actor.name, role: actor.role };

    await notifyJobManagers({
      jobId,
      supervisorId: jobRow.supervisorId,
      actorId: actor.id,
      title: `New note on ${jobRow.title}`,
      description: `${actor.name} added a ${noteType} note: ${previewText(text)}`,
      type: "updated",
    });

    if (jobRow.assigneeId && jobRow.assigneeId !== actor.id && noteType !== "internal") {
      await createNotification({
        userId: jobRow.assigneeId,
        jobId,
        title: `New note on ${jobRow.title}`,
        description: `${actor.name} added a note: ${previewText(text)}`,
        type: "updated",
      });
    }

    res.status(201).json({ ...created, author });
    return;
  } catch (err) {
    logger.error({ err }, "Failed to create job note");
    res.status(500).json({ message: "Internal server error" });
    return;
  }
});

router.patch("/jobs/:jobId/notes/:noteId", requireAuth, async (req, res) => {
  try {
    await ensureJobNotesSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const noteId = Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId;
    const actor = req.session!.user;
    const jobRow = await loadJob(jobId);
    if (!jobRow) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    if (!(await canViewJob(actor, jobRow))) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const [existing] = await db
      .select()
      .from(jobNotes)
      .where(and(eq(jobNotes.id, noteId), eq(jobNotes.jobId, jobId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ message: "Note not found" });
      return;
    }
    if (!canModifyNote(actor, existing.userId)) {
      res.status(403).json({ message: "You can only edit your own notes" });
      return;
    }

    const updates: Partial<{ text: string; noteType: JobNoteType; pinned: boolean; updatedAt: Date }> = {
      updatedAt: new Date(),
    };

    if (typeof req.body?.text === "string") {
      const text = req.body.text.trim();
      if (!text) {
        res.status(400).json({ message: "Note text is required" });
        return;
      }
      if (text.length > 5000) {
        res.status(400).json({ message: "Note is too long (max 5000 characters)" });
        return;
      }
      updates.text = text;
    }

    if (isJobNoteType(req.body?.noteType)) {
      if (req.body.noteType === "internal" && !canSetInternalNote(actor)) {
        res.status(403).json({ message: "You cannot set internal note type" });
        return;
      }
      updates.noteType = req.body.noteType;
    }

    if (typeof req.body?.pinned === "boolean" && canPinNotes(actor, jobRow)) {
      updates.pinned = req.body.pinned;
    }

    const [updated] = await db
      .update(jobNotes)
      .set(updates)
      .where(eq(jobNotes.id, noteId))
      .returning();

    const [author] = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, updated.userId))
      .limit(1);

    if (updates.text) {
      await notifyJobManagers({
        jobId,
        supervisorId: jobRow.supervisorId,
        actorId: actor.id,
        title: `Note updated on ${jobRow.title}`,
        description: `${actor.name} edited a note: ${previewText(updates.text)}`,
        type: "updated",
      });
    }

    res.json({ ...updated, author: author ?? null });
    return;
  } catch (err) {
    logger.error({ err }, "Failed to update job note");
    res.status(500).json({ message: "Internal server error" });
    return;
  }
});

router.delete("/jobs/:jobId/notes/:noteId", requireAuth, async (req, res) => {
  try {
    await ensureJobNotesSchema();
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const noteId = Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId;
    const actor = req.session!.user;
    const jobRow = await loadJob(jobId);
    if (!jobRow) {
      res.status(404).json({ message: "Job not found" });
      return;
    }
    if (!(await canViewJob(actor, jobRow))) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const [existing] = await db
      .select()
      .from(jobNotes)
      .where(and(eq(jobNotes.id, noteId), eq(jobNotes.jobId, jobId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ message: "Note not found" });
      return;
    }
    if (!canModifyNote(actor, existing.userId)) {
      res.status(403).json({ message: "You can only delete your own notes" });
      return;
    }

    await db.delete(jobNotes).where(eq(jobNotes.id, noteId));

    await notifyJobManagers({
      jobId,
      supervisorId: jobRow.supervisorId,
      actorId: actor.id,
      title: `Note removed on ${jobRow.title}`,
      description: `${actor.name} deleted a note: ${previewText(existing.text)}`,
      type: "updated",
    });

    res.json({ ok: true });
    return;
  } catch (err) {
    logger.error({ err }, "Failed to delete job note");
    res.status(500).json({ message: "Internal server error" });
    return;
  }
});

export default router;
