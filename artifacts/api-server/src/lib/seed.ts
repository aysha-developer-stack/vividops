import { db, users, eq } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

export async function seedAdminIfEmpty(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@gmail.com").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Vivid123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Vivid Admin";
  const forceReset = process.env.SEED_ADMIN_FORCE_RESET === "true";

  if (!email || !password) {
    logger.warn(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set; skipping admin seed.",
    );
    return;
  }

  if (existing.length === 0) {
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      email,
      name,
      role: "super-admin",
      passwordHash,
      mustResetPassword: false,
    });
    logger.info({ email }, "Seeded super-admin user");
    return;
  }

  if (!forceReset) {
    return;
  }

  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      status: "active",
      mustResetPassword: false,
    })
    .where(eq(users.email, email))
    .returning({ id: users.id });

  if (updated) {
    logger.info({ email }, "Reset super-admin password via SEED_ADMIN_FORCE_RESET");
  } else {
    logger.warn({ email }, "SEED_ADMIN_FORCE_RESET set but no matching user found");
  }
}
