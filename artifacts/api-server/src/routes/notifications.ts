import { Router } from "express";
import { db, notifications, eq, desc, and, sql } from "@workspace/db";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/requireAuth";
import { createNotification, type NotificationType } from "../lib/notifications";

const router = Router();

let schemaEnsured = false;
const ensureSchema = async () => {
  if (schemaEnsured) return;
  schemaEnsured = true;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
      title text NOT NULL,
      description text NOT NULL,
      type text NOT NULL,
      channel text NOT NULL DEFAULT 'in_app',
      is_read boolean NOT NULL DEFAULT false,
      read_at timestamptz,
      delivery_status text NOT NULL DEFAULT 'sent',
      escalation_status text NOT NULL DEFAULT 'none',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_job_idx ON notifications (job_id);`);
};

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const user = req.session!.user;

    const userNotifs = await db.select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt));
    
    res.json(userNotifs);
  } catch (err) {
    logger.error({ err }, "Failed to fetch notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/notifications", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const userId = typeof req.body?.userId === "string" ? req.body.userId : actor.id;
    const type = (typeof req.body?.type === "string" ? req.body.type : "") as NotificationType;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : undefined;
    const channel = (typeof req.body?.channel === "string" ? req.body.channel : "in_app") as any;

    if (!title || !description) return res.status(400).json({ error: "title and description are required" });
    if (!type) return res.status(400).json({ error: "type is required" });

    if (actor.role === "user") {
      if (userId !== actor.id) return res.status(403).json({ error: "Forbidden" });
      if (type !== "timer") return res.status(403).json({ error: "Forbidden" });
    }

    const created = await createNotification({
      userId,
      jobId,
      title,
      description,
      type,
      channel,
    });

    return res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Failed to create notification");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const user = req.session!.user;
    const id = String(req.params.id);

    await db.update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
    
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to mark notification as read");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
