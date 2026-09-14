export function canRestoreDeletedAttachments(actor: { role: string }): boolean {
  return actor.role === "admin" || actor.role === "super-admin";
}
