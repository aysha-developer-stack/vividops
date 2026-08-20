import { Router, type IRouter } from "express";
import { db, eq, and, sql, pushSubscriptions } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { getVapidPublicKey, isWebPushConfigured } from "../lib/web-push";

const router: IRouter = Router();

let schemaEnsured = false;

const ensureSchema = async () => {
  if (schemaEnsured) return;
  schemaEnsured = true;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);
  `);
};

function parseSubscribeBody(body: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const endpoint = record.endpoint;
  const keys = record.keys;
  if (typeof endpoint !== "string" || !endpoint.startsWith("http")) return null;
  if (!keys || typeof keys !== "object") return null;
  const keyRecord = keys as Record<string, unknown>;
  if (typeof keyRecord.p256dh !== "string" || typeof keyRecord.auth !== "string") return null;
  return { endpoint, keys: { p256dh: keyRecord.p256dh, auth: keyRecord.auth } };
}

function parseUnsubscribeBody(body: unknown): { endpoint: string } | null {
  if (!body || typeof body !== "object") return null;
  const endpoint = (body as Record<string, unknown>).endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("http")) return null;
  return { endpoint };
}

router.get("/push/vapid-public-key", requireAuth, async (_req, res) => {
  try {
    await ensureSchema();
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return res.json({ enabled: false, publicKey: null });
    }
    return res.json({ enabled: true, publicKey });
  } catch (err) {
    logger.error({ err }, "Failed to fetch VAPID public key");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/push/status", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const userId = req.session!.user.id;
    const subs = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    return res.json({
      configured: isWebPushConfigured(),
      subscribed: subs.length > 0,
      subscriptionCount: subs.length,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch push status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/push/subscribe", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const userId = req.session!.user.id;
    const parsed = parseSubscribeBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: "Invalid subscription payload" });
    }

    if (!isWebPushConfigured()) {
      return res.status(503).json({ error: "Web Push is not configured on this server" });
    }

    const { endpoint, keys } = parsed;
    const userAgent = req.headers["user-agent"] ?? null;

    await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: typeof userAgent === "string" ? userAgent : null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: typeof userAgent === "string" ? userAgent : null,
        },
      });

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to store push subscription");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/push/subscribe", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const userId = req.session!.user.id;
    const parsed = parseUnsubscribeBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: "Invalid unsubscribe payload" });
    }

    await db
      .delete(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, parsed.endpoint),
      ));

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to remove push subscription");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/push/subscribe/all", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const userId = req.session!.user.id;
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to remove all push subscriptions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
