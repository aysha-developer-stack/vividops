import { db, userSettings, eq, notifications } from "@workspace/db";

export type NotificationType = "assigned" | "updated" | "overdue" | "timer" | "rework" | "job_message" | "checklist" | "file" | "training" | "progress" | "error";

export async function createNotification(userId: string, title: string, description: string, type: NotificationType) {
  return await db.insert(notifications).values({
    userId,
    title,
    description,
    type,
  });
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
