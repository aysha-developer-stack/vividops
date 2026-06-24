import { db, users, posts, notifications, timeLogs, eq, sql } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

export async function seedAdminIfEmpty(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@gmail.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Vivid123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Vivid Admin";

  if (!email || !password) {
    // This branch is now effectively unreachable due to nullish coalescing above, 
    // but kept for logic safety if defaults are ever removed.
    logger.warn(
      "No users in database and SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are not set.",
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  
  if (existing.length === 0) {
    await db.insert(users).values({
      email: email.toLowerCase(),
      name,
      role: "super-admin",
      passwordHash,
      mustResetPassword: false,
    });
    logger.info({ email }, "Seeded super-admin user");
  } else {
    // If user wants to reset, we can force update the admin user's password here
    // based on the provided SEED_ADMIN_EMAIL or the default one.
    const targetEmail = email.toLowerCase();
    await db.update(users)
      .set({ 
        passwordHash,
        status: "active",
        mustResetPassword: false 
      })
      .where(eq(users.email, targetEmail));
    logger.info({ email: targetEmail }, "Updated super-admin password and forced active status via seed");
  }

  // Seed initial posts if empty
  // No demo training posts. Training data should be created by admins/supervisors in the UI.
}
