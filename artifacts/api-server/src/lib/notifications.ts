import { db, userSettings, eq, and, gte, notifications, users } from "@workspace/db";
import { logger } from "./logger";

export type NotificationType = "assigned" | "updated" | "overdue" | "timer" | "rework" | "job_message" | "checklist" | "file" | "training" | "progress" | "error";

export interface CreateNotificationOptions {
  userId: string;
  title: string;
  description: string;
  type: NotificationType;
  jobId?: string;
  channel?: "in_app" | "email" | "cliq" | "push";
}

export async function notificationExists(
  userId: string,
  type: NotificationType,
  title: string,
  since?: Date,
): Promise<boolean> {
  const sinceAt = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        eq(notifications.title, title),
        gte(notifications.createdAt, sinceAt),
      ),
    )
    .limit(1);
  return Boolean(existing);
}

/** Create a notification only if the same user/type/title does not already exist since `since`. */
export async function createNotificationOnce(
  options: CreateNotificationOptions,
  since?: Date,
) {
  const exists = await notificationExists(options.userId, options.type, options.title, since);
  if (exists) return null;
  return createNotification(options);
}

export async function createNotification(options: CreateNotificationOptions) {
  const { userId, title, description, type, jobId, channel = "in_app" } = options;
  
  try {
    const [result] = await db.insert(notifications).values({
      userId,
      jobId,
      title,
      description,
      type,
      channel,
      deliveryStatus: "sent", // Default to sent for in_app, update if external fails
    }).returning();

    // Handle external channels
    if (channel === "email" || channel === "cliq") {
      await handleExternalNotification(options);
    }

    return result;
  } catch (err) {
    logger.error({ err, options }, "Failed to create notification");
    return null;
  }
}

async function handleExternalNotification(options: CreateNotificationOptions) {
  const { userId, title, description, channel } = options;
  
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  if (channel === "email" && await shouldSendNotification(userId, "email")) {
    // We would call sendSystemEmail here
    // For now, just log
    logger.info({ to: user.email, title }, "[notification:email] Would send email notification");
  }

  if (channel === "cliq" && await shouldSendNotification(userId, "push")) { // Reusing push toggle for cliq for now
    const webhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `*${title}*\n${description}` }),
        });
      } catch (err) {
        logger.error({ err }, "Failed to send Cliq notification");
      }
    }
  }
}

export async function shouldSendNotification(userId: string, type: 'email' | 'push' | 'sms' | 'weekly' | 'mentions'): Promise<boolean> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });

  if (!settings) return true; // Default to true if no settings found

  switch (type) {
    case 'email': return settings.emailNotifications;
    case 'push': return settings.pushNotifications;
    case 'sms': return settings.smsNotifications;
    case 'weekly': return settings.weeklyDigest;
    case 'mentions': return settings.mentions;
    default: return true;
  }
}
