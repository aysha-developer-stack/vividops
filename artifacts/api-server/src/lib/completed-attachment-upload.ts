import { and, eq } from "drizzle-orm";
import { db, jobReworks, type JobRow, type UserRow } from "@workspace/db";
import type { ParsedAttachmentUpload } from "./job-attachment-upload";
import { ACTIVE_REWORK_STATUSES, findActiveReworkForCompletedUpload } from "./reworks";

export async function resolveCompletedUploadReworkId(
  actor: UserRow,
  jobRow: JobRow,
  parsed: ParsedAttachmentUpload,
): Promise<{ reworkId: string | null; error: string | null }> {
  if (parsed.fileCategory !== "completed") {
    return { reworkId: parsed.reworkId, error: null };
  }

  if (parsed.reworkId) {
    const [rework] = await db
      .select({ id: jobReworks.id, status: jobReworks.status })
      .from(jobReworks)
      .where(and(eq(jobReworks.id, parsed.reworkId), eq(jobReworks.jobId, jobRow.id)))
      .limit(1);

    if (!rework) {
      return { reworkId: null, error: "Rework record not found for this job." };
    }
    if (!(ACTIVE_REWORK_STATUSES as readonly string[]).includes(rework.status)) {
      return { reworkId: null, error: "That rework cycle is no longer active." };
    }
    return { reworkId: rework.id, error: null };
  }

  const shouldAutoLink = parsed.treatAsFieldWorker || actor.role === "user";
  if (!shouldAutoLink) {
    return { reworkId: null, error: null };
  }

  const workerId = jobRow.assigneeId ?? actor.id;
  const resolved = await findActiveReworkForCompletedUpload({
    jobId: jobRow.id,
    userId: workerId,
    checklistItemId: parsed.checklistItemId > 0 ? parsed.checklistItemId : undefined,
  });

  return { reworkId: resolved, error: null };
}
