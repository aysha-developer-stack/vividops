import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, jobAttachments } from "@workspace/db";
import { logger } from "./logger";
import { removeStorageKeys } from "./storage";
import { DELETED_ATTACHMENT_RETENTION_MS } from "./deleted-attachment-retention";

export { DELETED_ATTACHMENT_RETENTION_MS, isDeletedAttachmentExpired } from "./deleted-attachment-retention";

const PURGE_BATCH_SIZE = 100;

function previewCacheKey(attachmentId: string): string {
  return `previews/${attachmentId}.jpg`;
}

/** Permanently delete soft-deleted files older than 1 week (storage + database). */
export async function purgeExpiredDeletedAttachments(): Promise<{ purged: number }> {
  let purged = 0;
  for (let batch = 0; batch < 20; batch += 1) {
    const cutoff = new Date(Date.now() - DELETED_ATTACHMENT_RETENTION_MS);
    const rows = await db
      .select({
        id: jobAttachments.id,
        fileKey: jobAttachments.fileKey,
      })
      .from(jobAttachments)
      .where(and(isNotNull(jobAttachments.deletedAt), lte(jobAttachments.deletedAt, cutoff)))
      .limit(PURGE_BATCH_SIZE);

    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        await removeStorageKeys([row.fileKey, previewCacheKey(row.id)]);
        await db.delete(jobAttachments).where(eq(jobAttachments.id, row.id));
        purged += 1;
      } catch (err) {
        logger.warn({ err, attachmentId: row.id }, "Failed to permanently delete expired attachment");
      }
    }
  }

  if (purged > 0) {
    logger.info({ purged }, "Purged expired deleted attachments");
  }
  return { purged };
}
