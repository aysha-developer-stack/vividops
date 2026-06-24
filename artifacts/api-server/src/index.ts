import dotenv from "dotenv";
import { createServer } from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [
  path.join(here, "..", ".env"),
  path.join(here, "..", "..", "..", ".env"),
]) {
  dotenv.config({ path: envPath });
}

const { default: app } = await import("./app");
const { logger } = await import("./lib/logger");

// Validate required environment variables
const requiredEnvVars = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SESSION_SECRET"
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`[CRITICAL] Missing environment variables: ${missingVars.join(", ")}`);
  logger.error({ missingVars }, "Startup failed: Missing required environment variables");
} else {
  console.log("[ENV] All required environment variables are present.");
}

const { seedAdminIfEmpty } = await import("./lib/seed");
const { setupSocketIO } = await import("./lib/socket");
const { setupWorkers } = await import("./lib/queue");
const { ensureAllSchemas } = await import("./lib/schema-init");

import { shouldSendNotification } from "./lib/notifications";

const rawPort = process.env["PORT"] || "3000";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(process.env.PORT) || 3001;

if (process.env.NODE_ENV === "production") {
  console.log(`Server starting on port ${port} with health check at /api/health`);
}

const httpServer = createServer(app);

// Initialize Socket.IO
setupSocketIO(httpServer);

// Initialize Background Workers
setupWorkers();

async function start(): Promise<void> {
  // 1. Initialize database schemas once at startup
  try {
    await ensureAllSchemas();
  } catch (err) {
    logger.error({ err }, "Schema initialization failed");
  }

  // 2. Seed admin user if needed
  try {
    await seedAdminIfEmpty();
  } catch (err) {
    logger.error({ err }, "Seed step failed");
  }

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`[STARTUP] HTTP server listening on 0.0.0.0:${port}`);
  });

  console.log("[STARTUP] Starting background tasks...");

  try {
    const { db, jobs, users, notifications, jobMembers, timeLogs, and, eq, inArray, sql, gte } = await import("@workspace/db");

    const cliqWebhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;

    const runOverdueScan = async () => {
      try {
        // 1. Overdue Jobs Scan
        const overdueJobs = await db
          .select()
          .from(jobs)
          .where(sql`${jobs.dueDate} is not null and ${jobs.dueDate} < now() and ${jobs.status} <> 'completed' and ${jobs.status} <> 'cancelled'`);

        const admins = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(inArray(users.role, ["super-admin", "admin"] as any));
        const adminIds = admins.map((a: any) => a.id);
        const superAdminIds = admins.filter(a => a.role === "super-admin").map(a => a.id);

        for (const j of overdueJobs) {
          const due = j.dueDate ? new Date(j.dueDate) : new Date();
          const daysOverdue = Math.max(1, Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24)));
          const title = `Job Overdue: JOB-${j.serial}`;
          const description = `Job ${j.title} for ${j.client} is overdue by ${daysOverdue} day(s).`;

          const recipients = new Set<string>();
          if (j.assigneeId) recipients.add(j.assigneeId);
          if (j.supervisorId) recipients.add(j.supervisorId);
          for (const a of adminIds) recipients.add(a);
          
          // Escalation: 7+ days overdue notify super admins
          if (daysOverdue >= 7) {
            for (const s of superAdminIds) recipients.add(s);
          }

          for (const userId of recipients) {
            const [existing] = await db
              .select({ id: notifications.id })
              .from(notifications)
              .where(
                and(
                  eq(notifications.userId, userId),
                  eq(notifications.type, "overdue"),
                  eq(notifications.title, title),
                  sql`${notifications.createdAt} > now() - interval '24 hours'`,
                ),
              )
              .limit(1);
            
            if (existing) continue;

            await db.insert(notifications).values({
              id: randomUUID(),
              userId,
              title,
              description,
              type: "overdue",
              isRead: false,
            } as any);
          }
        }

        // 2. Due Date Reminders (3 days, 1 day, today)
        const upcomingJobs = await db
          .select()
          .from(jobs)
          .where(sql`${jobs.dueDate} is not null and ${jobs.dueDate} >= now() and ${jobs.dueDate} <= now() + interval '4 days' and ${jobs.status} <> 'completed' and ${jobs.status} <> 'cancelled'`);

        for (const j of upcomingJobs) {
          const due = new Date(j.dueDate!);
          const diffDays = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          
          let title = "";
          let description = "";
          const recipients = new Set<string>();
          if (j.assigneeId) recipients.add(j.assigneeId);
          if (j.supervisorId) recipients.add(j.supervisorId);

          if (diffDays === 3) {
            title = `Job Due in 3 Days: JOB-${j.serial}`;
            description = `Job ${j.title} is due on ${due.toLocaleDateString()}.`;
          } else if (diffDays === 1) {
            title = `Job Due Tomorrow: JOB-${j.serial}`;
            description = `Job ${j.title} is due tomorrow (${due.toLocaleDateString()}).`;
            for (const a of adminIds) recipients.add(a);
          } else if (diffDays === 0) {
            title = `Job Due Today: JOB-${j.serial}`;
            description = `Job ${j.title} is due today!`;
            for (const a of adminIds) recipients.add(a);
          }

          if (!title) continue;

          for (const userId of recipients) {
            const [existing] = await db
              .select({ id: notifications.id })
              .from(notifications)
              .where(
                and(
                  eq(notifications.userId, userId),
                  eq(notifications.type, "updated"),
                  eq(notifications.title, title),
                  sql`${notifications.createdAt} > now() - interval '24 hours'`,
                ),
              )
              .limit(1);
            
            if (existing) continue;

            await db.insert(notifications).values({
              id: randomUUID(),
              userId,
              title,
              description,
              type: "updated",
              isRead: false,
            } as any);
          }
        }
      } catch (err) {
        logger.error({ err }, "Overdue/Reminder scan failed");
      }
    };

    const runDailySummary = async () => {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // 1. Time Summary
        const logs = await db.select().from(timeLogs).where(gte(timeLogs.createdAt, todayStart));
        const userTimes = new Map<string, number>();
        for (const l of logs) {
          userTimes.set(l.userId, (userTimes.get(l.userId) || 0) + l.duration);
        }

        for (const [userId, totalSeconds] of userTimes.entries()) {
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const summary = `Today's work time: ${hours}h ${minutes}m`;

          // Notify User
          await db.insert(notifications).values({
            id: randomUUID(),
            userId,
            title: "Daily Time Summary",
            description: summary,
            type: "timer",
            isRead: false,
          } as any);

          // Notify Supervisor
          const [userRow] = await db.select({ name: users.name, supervisorId: sql<string>`(select supervisor_id from jobs where assignee_id = ${userId} limit 1)` }).from(users).where(eq(users.id, userId)).limit(1);
          const supervisorId = (userRow as any)?.supervisorId;
          if (supervisorId) {
            await db.insert(notifications).values({
              id: randomUUID(),
              userId: supervisorId,
              title: `Daily Summary: ${userRow.name}`,
              description: `${userRow.name} worked for ${hours}h ${minutes}m today.`,
              type: "timer",
              isRead: false,
            } as any);
          }
        }

        // 2. Training Not Completed Reminder (After 24 hours)
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayEnd = new Date(todayStart.getTime());
        const recentPosts = await db.select().from(posts).where(and(gte(posts.createdAt, yesterdayStart), lt(posts.createdAt, yesterdayEnd)));
        
        for (const post of recentPosts) {
          const allActive = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active"));
          for (const u of allActive) {
            const [liked] = await db.execute(sql`SELECT 1 FROM post_likes WHERE post_id = ${post.id} AND user_id = ${u.id} LIMIT 1`);
            const likedRows = (liked as any)?.rows ?? liked;
            if (Array.isArray(likedRows) && likedRows.length > 0) continue;

            // Notify User
            await db.insert(notifications).values({
              id: randomUUID(),
              userId: u.id,
              title: `Training Not Completed: ${post.title}`,
              description: `You have not completed the training "${post.title}" assigned yesterday.`,
              type: "training",
              isRead: false,
            } as any);

            // Notify Supervisor (approximate via first job found)
            const [sup] = await db.execute(sql`(select supervisor_id from jobs where assignee_id = ${u.id} limit 1)`);
            const supId = (sup as any)?.rows?.[0]?.supervisor_id;
            if (supId) {
              await db.insert(notifications).values({
                id: randomUUID(),
                userId: supId,
                title: `Training Incomplete: ${u.name}`,
                description: `${u.name} has not completed the training: ${post.title}`,
                type: "training",
                isRead: false,
              } as any);
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "Daily summary failed");
      }
    };

    // Delay initial scan slightly to let server handle incoming requests first
    setTimeout(() => {
      void runOverdueScan();
    }, 5000);
    setInterval(() => void runOverdueScan(), 15 * 60 * 1000);

    // Run daily summary at 11:55 PM
    const scheduleDaily = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 55, 0);
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
      setTimeout(() => {
        void runDailySummary();
        scheduleDaily();
      }, next.getTime() - now.getTime());
    };
    scheduleDaily();
  } catch (err) {
    logger.error({ err }, "Failed to start overdue scheduler");
  }
}

void start();
