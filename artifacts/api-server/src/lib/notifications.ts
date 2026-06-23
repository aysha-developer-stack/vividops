import { db, userSettings, eq } from "@workspace/db";

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
