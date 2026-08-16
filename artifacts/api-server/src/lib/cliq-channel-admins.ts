import { and, eq } from "drizzle-orm";
import { db, users } from "@workspace/db";

/** Active OPS admins flagged for Cliq channel admin on every job channel. */
export async function listOpsCliqChannelAdminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        eq(users.cliqChannelAdmin, true),
        eq(users.role, "admin"),
        eq(users.status, "active"),
      ),
    );

  const emails = new Set<string>();
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return Array.from(emails);
}
