import { db, userSettings, eq, notifications, users } from "@workspace/db";
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
    throw err;
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
