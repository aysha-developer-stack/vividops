import dotenv from "dotenv";
import { createServer } from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
if (!isRailway && process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.join(here, "..", ".env"), override: false });
}

const { default: app } = await import("./app");
const { logger } = await import("./lib/logger");
const { seedAdminIfEmpty } = await import("./lib/seed");
const { setupSocketIO } = await import("./lib/socket");
const { setupWorkers } = await import("./lib/queue");

const rawPort = process.env["PORT"] || "3000";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort) || 3001;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

// Initialize Socket.IO
setupSocketIO(httpServer);

// Initialize Background Workers
setupWorkers();

async function start(): Promise<void> {
  try {
    await seedAdminIfEmpty();
  } catch (err) {
    logger.error({ err }, "Seed step failed");
  }

  try {
    const { db, jobs, users, notifications, jobMembers, and, eq, inArray, sql } = await import("@workspace/db");

    let overdueSchemaEnsured = false;
    const ensureOverdueSchemas = async () => {
      if (overdueSchemaEnsured) return;
      overdueSchemaEnsured = true;
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS notifications (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title text NOT NULL,
          description text NOT NULL,
          type text NOT NULL,
          is_read boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id);`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS job_members (
          id uuid PRIMARY KEY,
          job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT job_members_job_user_uniq UNIQUE (job_id, user_id)
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS job_members_job_idx ON job_members (job_id);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS job_members_user_idx ON job_members (user_id);`);
    };

    const cliqWebhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;

    const runOverdueScan = async () => {
      try {
        await ensureOverdueSchemas();
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
            const existing = await db
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
            if (existing.length > 0) continue;

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

    void runOverdueScan();
    setInterval(() => void runOverdueScan(), 15 * 60 * 1000);
  } catch (err) {
    logger.error({ err }, "Failed to start overdue scheduler");
  }

  httpServer.listen(port, () => {
    logger.info({ port }, "Server listening with Socket.IO");
  });
}

void start();
