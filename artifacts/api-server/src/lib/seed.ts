import { db, users } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

export async function seedAdminIfEmpty(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Vivid Admin";

  if (!email || !password) {
    logger.warn(
      "No users in database and SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set. Set them to auto-create the first super-admin.",
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    email: email.toLowerCase(),
    name,
    role: "super-admin",
    passwordHash,
    mustResetPassword: false,
  });
  logger.info({ email }, "Seeded super-admin user");
}
