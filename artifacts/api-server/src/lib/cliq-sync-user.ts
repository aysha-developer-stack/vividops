import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, users, type UserRow } from "@workspace/db";
import { hashPassword } from "./auth";

export const CLIQ_SYNC_USER_EMAIL = "cliq-sync@vividops.internal";
export const CLIQ_SYNC_USER_NAME = "Zoho Cliq";

let cached: UserRow | null = null;

export function isCliqSyncUserEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === CLIQ_SYNC_USER_EMAIL;
}

export async function getOrCreateCliqSyncUser(): Promise<UserRow> {
  if (cached) return cached;

  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${CLIQ_SYNC_USER_EMAIL}`)
    .limit(1);
  if (existing) {
    cached = existing;
    return existing;
  }

  const passwordHash = await hashPassword(randomUUID());
  const [created] = await db
    .insert(users)
    .values({
      name: CLIQ_SYNC_USER_NAME,
      email: CLIQ_SYNC_USER_EMAIL,
      role: "user",
      status: "inactive",
      passwordHash,
      mustResetPassword: false,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (created) {
    cached = created;
    return created;
  }

  const [again] = await db.select().from(users).where(eq(users.email, CLIQ_SYNC_USER_EMAIL)).limit(1);
  if (!again) throw new Error("Failed to create Cliq sync user");
  cached = again;
  return again;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  return row ?? null;
}

export async function resolveCliqMessageActor(
  senderEmail: string,
  senderName: string,
): Promise<{ actor: UserRow; usedSyncUser: boolean; displayName: string }> {
  const mapped = senderEmail ? await findUserByEmail(senderEmail) : null;
  if (mapped && !isCliqSyncUserEmail(mapped.email)) {
    return { actor: mapped, usedSyncUser: false, displayName: mapped.name };
  }
  const actor = await getOrCreateCliqSyncUser();
  return {
    actor,
    usedSyncUser: true,
    displayName: senderName.trim() || senderEmail.trim() || CLIQ_SYNC_USER_NAME,
  };
}
