import { db, users, posts, notifications, timeLogs, eq, sql } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

export async function seedAdminIfEmpty(): Promise<void> {
  // Ensure tables exist (temporary until migrations are fully integrated)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Technical',
        author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attachments TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS time_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
        task TEXT NOT NULL,
        duration INTEGER NOT NULL,
        start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure tables exist");
  }

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
