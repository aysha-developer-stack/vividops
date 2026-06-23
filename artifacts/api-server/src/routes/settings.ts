import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userSettings, systemSettings } from "@workspace/db";
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

export default router;
