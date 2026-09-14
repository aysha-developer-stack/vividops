import { isNotNull, isNull } from "drizzle-orm";
import { jobAttachments } from "@workspace/db";

export const attachmentIsActive = isNull(jobAttachments.deletedAt);
export const attachmentIsDeleted = isNotNull(jobAttachments.deletedAt);
