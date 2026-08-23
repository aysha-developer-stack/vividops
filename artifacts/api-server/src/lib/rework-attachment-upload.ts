import { and, eq } from "drizzle-orm";
import { db, jobReworks, type JobRow, type UserRow } from "@workspace/db";
import type { ParsedAttachmentUpload } from "./job-attachment-upload";

export async function validateReworkAttachmentUpload(
  actor: UserRow,
  jobRow: JobRow,
  parsed: ParsedAttachmentUpload,
): Promise<string | null> {
  const canUploadReworkInstruction =
    actor.role === "supervisor" ||
    actor.role === "admin" ||
    actor.role === "super-admin";

  if (parsed.reworkId && parsed.fileCategory === "job") {
    if (!canUploadReworkInstruction) {
      return "Only supervisors and admins can upload rework instruction files.";
    }
    const [rework] = await db
      .select({ id: jobReworks.id, reworkOrigin: jobReworks.reworkOrigin })
      .from(jobReworks)
      .where(and(eq(jobReworks.id, parsed.reworkId), eq(jobReworks.jobId, jobRow.id)))
      .limit(1);
    if (!rework) {
      return "Rework record not found for this job.";
    }
    if (rework.reworkOrigin !== "external") {
      return "Only external rework files can be uploaded to Job Files.";
    }
    return null;
  }

  if (parsed.fileCategory !== "rework") return null;

  if (!canUploadReworkInstruction) {
    return "Only supervisors and admins can upload rework instruction files.";
  }

  if (!parsed.reworkId) {
    return "reworkId is required for rework file uploads.";
  }

  const [rework] = await db
    .select({ id: jobReworks.id, reworkOrigin: jobReworks.reworkOrigin })
    .from(jobReworks)
    .where(and(eq(jobReworks.id, parsed.reworkId), eq(jobReworks.jobId, jobRow.id)))
    .limit(1);

  if (!rework) {
    return "Rework record not found for this job.";
  }

  if (rework.reworkOrigin === "external") {
    return "External rework files must be uploaded to Job Files, not the Rework section.";
  }

  return null;
}
