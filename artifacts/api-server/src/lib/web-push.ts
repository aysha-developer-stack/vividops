import webpush from "web-push";
import { db, users, eq, pushSubscriptions } from "@workspace/db";
import { logger } from "./logger";
import { shouldSendNotification } from "./notifications";

export type WebPushPayload = {
  userId: string;
  notificationId: string;
  title: string;
  body: string;
  type: string;
  jobId?: string | null;
};

const ROLE_BASES: Record<string, string> = {
  "super-admin": "/super-admin",
  admin: "/admin",
  supervisor: "/supervisor",
  user: "/user",
};

const JOB_TABS: Record<string, string> = {
  job_message: "communication",
  checklist: "checklist",
  file: "files",
  timer: "logs",
  rework: "mistakes",
  error: "mistakes",
  assigned: "overview",
  updated: "overview",
  overdue: "overview",
  completed: "overview",
};

function notificationDeepLink(role: string, type: string, jobId?: string | null): string {
  const base = ROLE_BASES[role] ?? "/user";

  if (jobId) {
    const tab = JOB_TABS[type];
    return tab ? `${base}/jobs/${jobId}?tab=${tab}` : `${base}/jobs/${jobId}`;
  }

  if (type === "training") return `${base}/training`;
  if (type === "progress") return `${base}/reports`;
  return `${base}/notifications`;
}

let vapidConfigured = false;
let vapidReady = false;

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function resolveVapidSubject(): string {
  const raw =
    normalizeEnvValue(process.env.VAPID_SUBJECT) ??
    normalizeEnvValue(process.env.PUBLIC_APP_URL) ??
    "mailto:support@vividops.com.au";

  if (raw.includes("@") && !raw.startsWith("mailto:")) {
    return `mailto:${raw}`;
  }
  return raw;
}

export function getVapidPublicKey(): string | null {
  configureVapid();
  return normalizeEnvValue(process.env.VAPID_PUBLIC_KEY) ?? null;
}

function configureVapid(): boolean {
  if (vapidConfigured) return vapidReady;

  const publicKey = normalizeEnvValue(process.env.VAPID_PUBLIC_KEY);
  const privateKey = normalizeEnvValue(process.env.VAPID_PRIVATE_KEY);
  const subject = resolveVapidSubject();

  if (!publicKey || !privateKey) {
    vapidConfigured = true;
    vapidReady = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    vapidReady = true;
    return true;
  } catch (err) {
    logger.error({ err, subject }, "Failed to configure VAPID keys for Web Push");
    vapidConfigured = true;
    vapidReady = false;
    return false;
  }
}

export function isWebPushConfigured(): boolean {
  return configureVapid();
}

/** Fire-and-forget Web Push delivery to all of a user's registered devices. Never throws. */
export async function sendWebPushNotification(payload: WebPushPayload): Promise<void> {
  try {
    if (!configureVapid()) return;
    if (!(await shouldSendNotification(payload.userId, "push"))) return;

    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, payload.userId));

    if (subscriptions.length === 0) return;

    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    const url = notificationDeepLink(user?.role ?? "user", payload.type, payload.jobId);
    const pushBody = JSON.stringify({
      title: payload.title,
      body: payload.body,
      tag: `vividops-${payload.notificationId}`,
      data: {
        notificationId: payload.notificationId,
        jobId: payload.jobId ?? null,
        type: payload.type,
        url,
      },
    });

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            pushBody,
          );
          await db
            .update(pushSubscriptions)
            .set({ lastUsedAt: new Date() })
            .where(eq(pushSubscriptions.id, sub.id));
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
            logger.info({ endpoint: sub.endpoint }, "Removed stale push subscription");
            return;
          }
          logger.warn({ err, userId: payload.userId }, "Web Push delivery failed");
        }
      }),
    );
  } catch (err) {
    logger.warn({ err, userId: payload.userId }, "Web Push send skipped due to error");
  }
}
