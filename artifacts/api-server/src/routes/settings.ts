import { Router, type IRouter } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, userSettings, systemSettings, users, sessions } from "@workspace/db";
import { UpdateUserSettingsBody, UpdateSystemSettingsBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

let schemaEnsured = false;
const ensureSchema = async () => {
  if (schemaEnsured) return;
  schemaEnsured = true;
  
  // User Settings columns
  await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS in_app_notifications boolean NOT NULL DEFAULT true;`);
  await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS zoho_cliq_notifications boolean NOT NULL DEFAULT true;`);
  await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notification_frequency text NOT NULL DEFAULT 'instant';`);
  await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS quiet_hours_start text;`);
  await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS quiet_hours_end text;`);
  await db.execute(sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS sound_enabled boolean NOT NULL DEFAULT true;`);

  // System Settings columns
  await db.execute(sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS notif_retention_days integer NOT NULL DEFAULT 90;`);
  await db.execute(sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS overdue_escalation_days integer NOT NULL DEFAULT 7;`);
  await db.execute(sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS reminder_schedule text NOT NULL DEFAULT '3,1,0';`);

  // Notification Templates table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id text PRIMARY KEY,
      name text NOT NULL,
      email_subject text,
      email_body text,
      cliq_template text,
      in_app_template text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

// User Settings
router.get("/settings/user", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const userId = req.session!.user.id;
    
    let settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });
    
    if (!settings) {
      // Initialize default settings if not exists
      [settings] = await db.insert(userSettings).values({ userId }).returning();
    }
    
    return res.json(settings);
  } catch (err) {
    logger.error({ err }, "Failed to fetch user settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/settings/user", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const userId = req.session!.user.id;
    const parsed = UpdateUserSettingsBody.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid settings data" });
    }
    
    const [updated] = await db
      .insert(userSettings)
      .values({ userId, ...parsed.data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning();
      
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update user settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// System Settings
router.get("/settings/system", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const settings = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, "default"),
    });
    
    return res.json(settings);
  } catch (err) {
    logger.error({ err }, "Failed to fetch system settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/settings/system", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    // Only Super Admin can change system settings
    if (req.session!.user.role !== "super-admin") {
      return res.status(403).json({ error: "Forbidden - Super Admin only" });
    }
    
    const parsed = UpdateSystemSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid settings data" });
    }
    
    const [updated] = await db
      .update(systemSettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(systemSettings.id, "default"))
      .returning();
      
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update system settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/settings/system/metrics", requireAuth, async (req, res) => {
  if (req.session!.user.role !== "super-admin") {
    return res.status(403).json({ error: "Forbidden - Super Admin only" });
  }

  const [userCountResult] = await db.select({ value: count() }).from(users);
  const [activeSessionsResult] = await db
    .select({ value: sql<number>`count(DISTINCT ${sessions.userId})` })
    .from(sessions);

  const [jobStorageResult] = await db.execute(sql`
    SELECT COALESCE(SUM(NULLIF(file_size, '')::bigint), 0)::bigint AS bytes
    FROM job_attachments;
  `).then((r: any) => (r.rows ?? r) as Array<{ bytes?: string | number | bigint }>);

  const [postStorageResult] = await db.execute(sql`
    SELECT COALESCE(SUM(size), 0)::bigint AS bytes
    FROM post_attachments;
  `).then((r: any) => (r.rows ?? r) as Array<{ bytes?: string | number | bigint }>);

  const [jobFileCountResult] = await db.execute(sql`
    SELECT COUNT(*)::bigint AS count
    FROM job_attachments;
  `).then((r: any) => (r.rows ?? r) as Array<{ count?: string | number | bigint }>);

  const [postFileCountResult] = await db.execute(sql`
    SELECT COUNT(*)::bigint AS count
    FROM post_attachments;
  `).then((r: any) => (r.rows ?? r) as Array<{ count?: string | number | bigint }>);

  const [apiTodayResult] = await db.execute(sql`
    SELECT COALESCE(count, 0)::bigint AS count
    FROM api_request_daily
    WHERE day = current_date;
  `).then((r: any) => (r.rows ?? r) as Array<{ count?: string | number | bigint }>);

  const [apiYesterdayResult] = await db.execute(sql`
    SELECT COALESCE(count, 0)::bigint AS count
    FROM api_request_daily
    WHERE day = current_date - interval '1 day';
  `).then((r: any) => (r.rows ?? r) as Array<{ count?: string | number | bigint }>);

  const totalStorageBytes =
    Number(jobStorageResult?.bytes ?? 0) + Number(postStorageResult?.bytes ?? 0);
  const totalTrackedFiles =
    Number(jobFileCountResult?.count ?? 0) + Number(postFileCountResult?.count ?? 0);
  const apiCallsToday = Number(apiTodayResult?.count ?? 0);
  const apiCallsYesterday = Number(apiYesterdayResult?.count ?? 0);
  const apiCallsTrend =
    apiCallsYesterday > 0
      ? `${apiCallsToday >= apiCallsYesterday ? "+" : ""}${(((apiCallsToday - apiCallsYesterday) / apiCallsYesterday) * 100).toFixed(1)}% vs yesterday`
      : "No yesterday baseline";

  const metrics = {
    storageUsed: formatBytes(totalStorageBytes),
    storageFiles: totalTrackedFiles,
    apiCallsToday,
    apiCallsTrend,
    activeUsers: Number(activeSessionsResult.value) || 0,
    totalUsers: Number(userCountResult.value) || 0,
  };

  return res.json(metrics);
});

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value >= 10 || unitIdx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIdx]}`;
}

export default router;
