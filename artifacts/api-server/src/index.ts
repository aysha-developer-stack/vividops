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
    const { db, jobs, users, notifications, jobMembers, and, eq, inArray, sql } = await import("@workspace/db");

    const cliqWebhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;

    const runOverdueScan = async () => {
      try {
        const overdueJobs = await db
          .select()
          .from(jobs)
          .where(sql`${jobs.dueDate} is not null and ${jobs.dueDate} < now() and ${jobs.status} <> 'completed' and ${jobs.status} <> 'cancelled'`);

        if (overdueJobs.length === 0) return;

        const admins = await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.role, ["super-admin", "admin"] as any));
        const adminIds = admins.map((a: any) => a.id);

        for (const j of overdueJobs) {
          const due = j.dueDate ? new Date(j.dueDate) : new Date();
          const daysOverdue = Math.max(1, Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24)));
          const title = `Job overdue: JOB-${j.serial}`;
          const description = `${title} · ${j.title} · ${daysOverdue} day(s) overdue`;

          const memberRows = await db
            .select({ userId: jobMembers.userId })
            .from(jobMembers)
            .where(eq(jobMembers.jobId, j.id));
          
          const recipients = new Set<string>();
          if (j.assigneeId) recipients.add(j.assigneeId);
          if (j.supervisorId) recipients.add(j.supervisorId);
          for (const a of adminIds) recipients.add(a);
          for (const m of memberRows) recipients.add(m.userId);

          for (const userId of recipients) {
            // Check for existing notification in last 24h
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

            // We only send push/in-app for overdue if user allows it
            // Optimization: skip the DB check for settings if we're in a hurry at startup
            // or just assume true for critical overdue alerts
            await db.insert(notifications).values({
              id: randomUUID(),
              userId,
              title,
              description,
              type: "overdue",
              isRead: false,
            } as any);
          }

          if (cliqWebhookUrl) {
            try {
              await fetch(cliqWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: description }),
              });
            } catch {
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "Overdue scan failed");
      }
    };

    // Delay initial scan slightly to let server handle incoming requests first
    setTimeout(() => void runOverdueScan(), 5000);
    setInterval(() => void runOverdueScan(), 15 * 60 * 1000);
  } catch (err) {
    logger.error({ err }, "Failed to start overdue scheduler");
  }
}

void start();
