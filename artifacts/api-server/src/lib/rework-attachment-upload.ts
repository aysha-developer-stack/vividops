import { and, eq } from "drizzle-orm";
import { db, jobReworks, type JobRow, type UserRow } from "@workspace/db";
import type { ParsedAttachmentUpload } from "./job-attachment-upload";

export async function validateReworkAttachmentUpload(
  actor: UserRow,
  jobRow: JobRow,
  parsed: ParsedAttachmentUpload,
): Promise<string | null> {
  if (parsed.fileCategory !== "rework") return null;

  const canUploadRework =
    actor.role === "supervisor" ||
    actor.role === "admin" ||
    actor.role === "super-admin";
  if (!canUploadRework) {
    return "Only supervisors and admins can upload rework instruction files.";
  }

  if (!parsed.reworkId) {
    return "reworkId is required for rework file uploads.";
  }

  const [rework] = await db
    .select({ id: jobReworks.id })
    .from(jobReworks)
    .where(and(eq(jobReworks.id, parsed.reworkId), eq(jobReworks.jobId, jobRow.id)))
    .limit(1);

  if (!rework) {
    return "Rework record not found for this job.";
  }

  return null;
}
