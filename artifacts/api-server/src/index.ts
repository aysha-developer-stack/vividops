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
// Initialize Background Workers (optional — requires REDIS_URL)
void import("./lib/queue").then(({ setupWorkers }) => setupWorkers());
const { ensureAllSchemas, ensureJobWriteSchema } = await import("./lib/schema-init");

const { createNotification, createNotificationOnce } = await import("./lib/notifications");

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

async function start(): Promise<void> {
  // 1. Initialize database schemas once at startup
  try {
    await ensureAllSchemas();
    await ensureJobWriteSchema();
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
    const { db, jobs, users, jobMembers, timeLogs, posts, userSettings, and, eq, inArray, sql, gte, lt } = await import("@workspace/db");

    const cliqWebhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;

    // Node setTimeout delays are capped at 2^31-1 ms (~24.85 days). Chunk longer waits.
    const MAX_TIMEOUT_MS = 2_147_483_647;
    const scheduleAt = (target: Date, fn: () => void) => {
      const tick = () => {
        const remaining = target.getTime() - Date.now();
        if (remaining <= 0) {
          fn();
          return;
        }
        setTimeout(tick, Math.min(remaining, MAX_TIMEOUT_MS));
      };
      tick();
    };

    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startOfWeek = (date: Date) => {
      const start = startOfDay(date);
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + diff);
      return start;
    };
    const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
    const reportPeriodLabel = (type: "weekly" | "monthly", now = new Date()) => {
      if (type === "monthly") {
        return now.toLocaleString("en-US", { month: "long", year: "numeric" });
      }
      const weekStart = startOfWeek(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(weekStart)}–${fmt(weekEnd)}, ${weekStart.getFullYear()}`;
    };

    const loadJobRecipientIds = async (jobId: string, assigneeId: string | null, supervisorId: string | null) => {
      const recipients = new Set<string>();
      if (assigneeId) recipients.add(assigneeId);
      if (supervisorId) recipients.add(supervisorId);
      const members = await db
        .select({ userId: jobMembers.userId })
        .from(jobMembers)
        .where(eq(jobMembers.jobId, jobId));
      for (const member of members) {
        if (member.userId) recipients.add(member.userId);
      }
      return recipients;
    };

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

          const recipients = await loadJobRecipientIds(j.id, j.assigneeId, j.supervisorId);
          for (const a of adminIds) recipients.add(a);
          
          // Escalation: 7+ days overdue notify super admins
          if (daysOverdue >= 7) {
            for (const s of superAdminIds) recipients.add(s);
          }

          for (const userId of recipients) {
            await createNotificationOnce(
              {
                userId,
                jobId: j.id,
                title,
                description,
                type: "overdue",
                channel: "in_app",
              },
              new Date(Date.now() - 24 * 60 * 60 * 1000),
            );
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
          const recipients = await loadJobRecipientIds(j.id, j.assigneeId, j.supervisorId);

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
            await createNotificationOnce(
              {
                userId,
                jobId: j.id,
                title,
                description,
                type: "updated",
                channel: diffDays <= 1 ? "email" : "in_app",
              },
              new Date(Date.now() - 24 * 60 * 60 * 1000),
            );
          }
        }
      } catch (err) {
        logger.error({ err }, "Overdue/Reminder scan failed");
      }
    };

    const runDailySummary = async () => {
      try {
        const now = new Date();
        const todayStart = startOfDay(now);
        const dateLabel = todayStart.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

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
          const userTitle = `Daily Time Summary — ${dateLabel}`;

          await createNotificationOnce(
            {
              userId,
              title: userTitle,
              description: summary,
              type: "timer",
            },
            todayStart,
          );

          const [userRow] = await db.select({ name: users.name, supervisorId: sql<string>`(select supervisor_id from jobs where assignee_id = ${userId} limit 1)` }).from(users).where(eq(users.id, userId)).limit(1);
          const supervisorId = (userRow as any)?.supervisorId;
          if (supervisorId) {
            await createNotificationOnce(
              {
                userId: supervisorId,
                title: `Daily Summary: ${userRow.name} — ${dateLabel}`,
                description: `${userRow.name} worked for ${hours}h ${minutes}m today.`,
                type: "timer",
              },
              todayStart,
            );
          }
        }

        // 2. Training Not Completed Reminder (After 24 hours)
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayEnd = new Date(todayStart.getTime());
        const recentPosts = await db.select().from(posts).where(and(gte(posts.createdAt, yesterdayStart), lt(posts.createdAt, yesterdayEnd)));
        
        for (const post of recentPosts) {
          const allActive = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active"));
          for (const u of allActive) {
            const liked = await db.execute(sql`SELECT 1 FROM post_likes WHERE post_id = ${post.id} AND user_id = ${u.id} LIMIT 1`);
            const likedRows = (liked as any)?.rows ?? (Array.isArray(liked) ? liked : []);
            if (likedRows.length > 0) continue;

            const userTitle = `Training Not Completed: ${post.title}`;
            await createNotificationOnce(
              {
                userId: u.id,
                title: userTitle,
                description: `You have not completed the training "${post.title}" assigned yesterday.`,
                type: "training",
              },
              yesterdayStart,
            );

            const sup = await db.execute(sql`(select supervisor_id from jobs where assignee_id = ${u.id} limit 1)`);
            const supRows = (sup as any)?.rows ?? (Array.isArray(sup) ? sup : []);
            const supId = supRows[0]?.supervisor_id;
            if (supId) {
              await createNotificationOnce(
                {
                  userId: supId,
                  title: `Training Incomplete: ${u.name} — ${post.title}`,
                  description: `${u.name} has not completed the training: ${post.title}`,
                  type: "training",
                },
                yesterdayStart,
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "Daily summary failed");
      }
    };

    const reportRuns = new Set<"weekly" | "monthly">();

    const runReportNotifications = async (type: "weekly" | "monthly") => {
      if (reportRuns.has(type)) return;
      reportRuns.add(type);
      try {
        const now = new Date();
        const periodLabel = reportPeriodLabel(type, now);
        const periodStart = type === "weekly" ? startOfWeek(now) : startOfMonth(now);
        const humanPeriod = type === "weekly" ? "last week" : "last month";
        const activeUsers = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.status, "active"));
        const managerRoles = new Set(["super-admin", "admin", "supervisor"]);

        const digestSettings = await db
          .select({ userId: userSettings.userId, weeklyDigest: userSettings.weeklyDigest })
          .from(userSettings);
        const digestDisabled = new Set(
          digestSettings.filter((s) => s.weeklyDigest === false).map((s) => s.userId),
        );

        for (const u of activeUsers) {
          if (digestDisabled.has(u.id)) continue;

          await createNotificationOnce(
            {
              userId: u.id,
              title: `${type === "weekly" ? "Weekly" : "Monthly"} Report Available — ${periodLabel}`,
              description: `Your ${type} performance report for ${humanPeriod} is now available in the Reports section.`,
              type: "progress",
            },
            periodStart,
          );

          if (managerRoles.has(u.role)) {
            await createNotificationOnce(
              {
                userId: u.id,
                title: `Team ${type === "weekly" ? "Weekly" : "Monthly"} Report — ${periodLabel}`,
                description: `The team ${type} report for ${humanPeriod} has been generated. View insights in the Reports dashboard.`,
                type: "progress",
              },
              periodStart,
            );
          }
        }
      } catch (err) {
        logger.error({ err }, `${type} report notification failed`);
      } finally {
        reportRuns.delete(type);
      }
    };

    // Delay initial scan slightly to let server handle incoming requests first
    setTimeout(() => {
      void runOverdueScan();
      void runReportNotifications("weekly");
      void runReportNotifications("monthly");
    }, 5000);
    setInterval(() => void runOverdueScan(), 15 * 60 * 1000);

    // Run daily summary at 11:55 PM
    const scheduleDaily = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 55, 0);
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
      scheduleAt(next, () => {
        void runDailySummary();
        scheduleDaily();
      });
    };
    scheduleDaily();

    const scheduleWeeklyReports = () => {
      const now = new Date();
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
      nextMonday.setHours(9, 0, 0, 0);
      if (nextMonday.getTime() <= now.getTime()) {
        nextMonday.setDate(nextMonday.getDate() + 7);
      }

      scheduleAt(nextMonday, () => {
        void runReportNotifications("weekly");
        scheduleWeeklyReports();
      });
    };

    const scheduleMonthlyReports = () => {
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0, 0);
      scheduleAt(nextMonth, () => {
        void runReportNotifications("monthly");
        scheduleMonthlyReports();
      });
    };

    scheduleWeeklyReports();
    scheduleMonthlyReports();
  } catch (err) {
    logger.error({ err }, "Failed to start overdue scheduler");
  }
}

void start();
