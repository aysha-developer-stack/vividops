import { Router, type IRouter } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, userSettings, systemSettings, users, sessions } from "@workspace/db";
import { UpdateUserSettingsBody, UpdateSystemSettingsBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// User Settings
router.get("/settings/user", requireAuth, async (req, res) => {
  const userId = req.session!.user.id;
  
  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
  
  if (!settings) {
    // Initialize default settings if not exists
    [settings] = await db.insert(userSettings).values({ userId }).returning();
  }
  
  return res.json(settings);
});

router.patch("/settings/user", requireAuth, async (req, res) => {
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
});

// System Settings
router.get("/settings/system", requireAuth, async (req, res) => {
  const settings = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.id, "default"),
  });
  
  return res.json(settings);
});

router.patch("/settings/system", requireAuth, async (req, res) => {
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
