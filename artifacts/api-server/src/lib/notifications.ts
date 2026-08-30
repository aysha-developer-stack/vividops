import { db, userSettings, eq, and, gte, notifications, users, inArray, isNull, sql, jobMembers } from "@workspace/db";
import { logger } from "./logger";
import { pushNotificationRealtime } from "./socket";
import { sendWebPushNotification } from "./web-push";

export type NotificationType = "assigned" | "updated" | "overdue" | "timer" | "rework" | "job_message" | "cliq_channel" | "checklist" | "file" | "training" | "progress" | "error" | "completed";

/** Notification types that refer to a job — hide/delete when the job no longer exists. */
export const JOB_LINKED_NOTIFICATION_TYPES: NotificationType[] = [
  "assigned",
  "updated",
  "overdue",
  "timer",
  "rework",
  "job_message",
  "cliq_channel",
  "checklist",
  "file",
  "progress",
  "error",
  "completed",
];

export async function deleteNotificationsForJob(jobId: string): Promise<number> {
  const deleted = await db
    .delete(notifications)
    .where(eq(notifications.jobId, jobId))
    .returning({ id: notifications.id });
  return deleted.length;
}

/** Remove stale alerts left behind when jobs were deleted (job_id was set to null). */
/** One-time-safe DB fix for alerts saved with internal serial (JOB-12) instead of job_number. */
export async function backfillLegacyJobNotificationTitles(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE notifications n
    SET title = REPLACE(n.title, 'JOB-' || j.serial::text, 'JOB-' || TRIM(j.job_number))
    FROM jobs j
    WHERE n.job_id = j.id
      AND j.job_number IS NOT NULL
      AND TRIM(j.job_number) <> ''
      AND n.title LIKE '%JOB-' || j.serial::text || '%'
  `);
  return Number((result as { rowCount?: number }).rowCount ?? 0);
}

/** One-time-safe DB fix for alerts saved as "New message on JOB-{serial}". */
export async function backfillLegacyJobMessageNotificationTitles(): Promise<number> {
  return backfillLegacyJobNotificationTitles();
}

export async function cleanupOrphanedJobNotifications(): Promise<number> {
  const deleted = await db
    .delete(notifications)
    .where(and(isNull(notifications.jobId), inArray(notifications.type, JOB_LINKED_NOTIFICATION_TYPES)))
    .returning({ id: notifications.id });
  return deleted.length;
}

export function previewText(text: string | null | undefined, max = 120): string {
  const value = (text ?? "").trim();
  if (!value) return "(cleared)";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Notify assignee, supervisor, and all job members (excluding the actor). */
export async function notifyAllJobMembers(opts: {
  jobId: string;
  assigneeId?: string | null;
  supervisorId?: string | null;
  coordinatorId?: string | null;
  actorId: string;
  title: string;
  description: string;
  type: NotificationType;
}) {
  const recipientIds = new Set<string>();
  if (opts.assigneeId) recipientIds.add(opts.assigneeId);
  if (opts.supervisorId) recipientIds.add(opts.supervisorId);
  if (opts.coordinatorId) recipientIds.add(opts.coordinatorId);
  const members = await db
    .select({ userId: jobMembers.userId })
    .from(jobMembers)
    .where(eq(jobMembers.jobId, opts.jobId));
  for (const m of members) recipientIds.add(m.userId);
  recipientIds.delete(opts.actorId);

  for (const userId of recipientIds) {
    await createNotification({
      userId,
      jobId: opts.jobId,
      title: opts.title,
      description: opts.description,
      type: opts.type,
    });
  }
}

/** Like notifyAllJobMembers, but skips users who already received the same title (all time). */
export async function notifyAllJobMembersOnce(opts: {
  jobId: string;
  assigneeId?: string | null;
  supervisorId?: string | null;
  coordinatorId?: string | null;
  actorId?: string;
  title: string;
  description: string;
  type: NotificationType;
}) {
  const recipientIds = new Set<string>();
  if (opts.assigneeId) recipientIds.add(opts.assigneeId);
  if (opts.supervisorId) recipientIds.add(opts.supervisorId);
  if (opts.coordinatorId) recipientIds.add(opts.coordinatorId);
  const members = await db
    .select({ userId: jobMembers.userId })
    .from(jobMembers)
    .where(eq(jobMembers.jobId, opts.jobId));
  for (const m of members) recipientIds.add(m.userId);
  if (opts.actorId) recipientIds.delete(opts.actorId);

  for (const userId of recipientIds) {
    await createNotificationOnce(
      {
        userId,
        jobId: opts.jobId,
        title: opts.title,
        description: opts.description,
        type: opts.type,
      },
      new Date(0),
    );
  }
}

/** Notify admins only (excludes super-admin). */
export async function notifyAdminsOnly(opts: {
  jobId: string;
  actorId: string;
  title: string;
  description: string;
  type: NotificationType;
}) {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"));
  for (const admin of admins) {
    if (admin.id === opts.actorId) continue;
    await createNotification({
      userId: admin.id,
      jobId: opts.jobId,
      title: opts.title,
      description: opts.description,
      type: opts.type,
    });
  }
}

/** Notify super-admins only. */
export async function notifySuperAdminsOnly(opts: {
  jobId: string;
  actorId: string;
  title: string;
  description: string;
  type: NotificationType;
}) {
  const superAdmins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "super-admin"));
  for (const row of superAdmins) {
    if (row.id === opts.actorId) continue;
    await createNotification({
      userId: row.id,
      jobId: opts.jobId,
      title: opts.title,
      description: opts.description,
      type: opts.type,
    });
  }
}

/** Notify all admins, super-admins, and the job supervisor (not the actor). */
export async function notifyJobManagers(opts: {
  jobId: string;
  supervisorId?: string | null;
  actorId: string;
  title: string;
  description: string;
  type: NotificationType;
}) {
  const recipientIds = new Set<string>();
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "super-admin"]));
  for (const admin of admins) recipientIds.add(admin.id);
  if (opts.supervisorId && opts.supervisorId !== opts.actorId) {
    recipientIds.add(opts.supervisorId);
  }
  recipientIds.delete(opts.actorId);

  for (const userId of recipientIds) {
    await createNotification({
      userId,
      jobId: opts.jobId,
      title: opts.title,
      description: opts.description,
      type: opts.type,
    });
  }
}

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

    pushNotificationRealtime({
      id: result.id,
      userId: result.userId,
      jobId: result.jobId,
      title: result.title,
      description: result.description,
      type: result.type,
      isRead: result.isRead,
      createdAt: result.createdAt.toISOString(),
    });

    void sendWebPushNotification({
      userId: result.userId,
      notificationId: result.id,
      title: result.title,
      body: result.description,
      type: result.type,
      jobId: result.jobId,
    }).catch((err) => {
      logger.warn({ err, userId: result.userId }, "Web Push send failed");
    });

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

  if (channel === "cliq" && await shouldSendNotification(userId, "cliq")) {
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

export async function shouldSendNotification(userId: string, type: 'email' | 'push' | 'sms' | 'weekly' | 'mentions' | 'cliq'): Promise<boolean> {
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });

  if (!settings) return true; // Default to true if no settings found

  switch (type) {
    case 'email': return settings.emailNotifications;
    case 'push': return settings.pushNotifications;
    case 'cliq': return settings.zohoCliqNotifications;
    case 'sms': return settings.smsNotifications;
    case 'weekly': return settings.weeklyDigest;
    case 'mentions': return settings.mentions;
    default: return true;
  }
}
