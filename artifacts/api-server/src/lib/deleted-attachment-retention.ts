export const DELETED_ATTACHMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function isDeletedAttachmentExpired(
  deletedAt: Date | string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!deletedAt) return false;
  const t = deletedAt instanceof Date ? deletedAt.getTime() : new Date(deletedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= DELETED_ATTACHMENT_RETENTION_MS;
}
