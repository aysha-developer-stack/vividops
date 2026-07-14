import { db, sql } from "@workspace/db";
import { logger } from "./logger";

let initialized = false;
let legacySupervisorAssignmentsPromise: Promise<void> | null = null;

export async function ensureLegacySupervisorAssignments() {
  if (legacySupervisorAssignmentsPromise) return legacySupervisorAssignmentsPromise;

  legacySupervisorAssignmentsPromise = (async () => {
    try {
      await db.execute(sql`
        UPDATE jobs AS j
        SET supervisor_id = j.created_by_id,
            updated_at = now()
        FROM users AS u
        WHERE j.supervisor_id IS NULL
          AND j.created_by_id IS NOT NULL
          AND u.id = j.created_by_id
          AND u.role = 'supervisor'
      `);
      logger.info("Legacy supervisor job assignments backfilled.");
    } catch (err) {
      legacySupervisorAssignmentsPromise = null;
      logger.error({ err }, "Legacy supervisor assignment backfill failed");
    }
  })();

  return legacySupervisorAssignmentsPromise;
}

let jobWriteSchemaEnsured = false;

/** Lightweight migrations required before creating or listing jobs. */
export async function ensureJobWriteSchema() {
  if (jobWriteSchemaEnsured) return;

  try {
    await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_number text`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS jobs_job_number_uniq_idx
      ON jobs (job_number)
      WHERE job_number IS NOT NULL
    `);

    // Review pipeline statuses (safe if already present)
    for (const value of ["awaiting_supervisor", "awaiting_admin", "rework"] as const) {
      try {
        await db.execute(sql.raw(`ALTER TYPE job_status ADD VALUE IF NOT EXISTS '${value}'`));
      } catch (err) {
        logger.warn({ err, value }, "job_status enum value may already exist");
      }
    }

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_members (
        id uuid PRIMARY KEY,
        job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT job_members_job_user_uniq UNIQUE (job_id, user_id)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS job_members_job_idx ON job_members (job_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS job_members_user_idx ON job_members (user_id)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text NOT NULL,
        type text NOT NULL,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL
    `);
    await db.execute(sql`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS channel text DEFAULT 'in_app'
    `);
    await db.execute(sql`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS read_at timestamptz
    `);
    await db.execute(sql`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'sent'
    `);
    await db.execute(sql`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS escalation_status text DEFAULT 'none'
    `);
    await db.execute(sql`UPDATE notifications SET channel = 'in_app' WHERE channel IS NULL`);
    await db.execute(sql`UPDATE notifications SET delivery_status = 'sent' WHERE delivery_status IS NULL`);
    await db.execute(sql`UPDATE notifications SET escalation_status = 'none' WHERE escalation_status IS NULL`);

    jobWriteSchemaEnsured = true;
    logger.info("Job write schema ensured.");
  } catch (err) {
    logger.error({ err }, "Job write schema migration failed");
  }
}

let jobMessageSyncSchemaEnsured = false;

/** Migrate legacy job_message_sync tables created before two-way sync metadata existed. */
export async function ensureJobMessageSyncSchema() {
  if (jobMessageSyncSchemaEnsured) return;

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_message_sync (
        id uuid PRIMARY KEY,
        job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        source text NOT NULL,
        external_message_id text,
        sender_email text,
        payload jsonb
      )
    `);
    await db.execute(sql`
      ALTER TABLE job_message_sync
      ADD COLUMN IF NOT EXISTS job_message_id uuid REFERENCES job_messages(id) ON DELETE CASCADE
    `);
    await db.execute(sql`
      ALTER TABLE job_message_sync
      ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inbound'
    `);
    await db.execute(sql`
      ALTER TABLE job_message_sync
      ADD COLUMN IF NOT EXISTS external_channel_id text
    `);
    await db.execute(sql`
      ALTER TABLE job_message_sync
      ADD COLUMN IF NOT EXISTS external_channel_name text
    `);
    await db.execute(sql`
      ALTER TABLE job_message_sync
      ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'received'
    `);
    await db.execute(sql`
      ALTER TABLE job_message_sync
      ADD COLUMN IF NOT EXISTS last_error text
    `);
    await db.execute(sql`
      ALTER TABLE job_message_sync
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
    `);
    await db.execute(sql`
      ALTER TABLE job_message_sync
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS job_message_sync_job_idx ON job_message_sync (job_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS job_message_sync_message_idx ON job_message_sync (job_message_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS job_message_sync_job_message_uniq_idx
      ON job_message_sync (job_message_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS job_message_sync_external_message_uniq_idx
      ON job_message_sync (source, external_message_id)
      WHERE external_message_id IS NOT NULL
    `);

    jobMessageSyncSchemaEnsured = true;
    logger.info("Job message sync schema ensured.");
  } catch (err) {
    logger.error({ err }, "Job message sync schema migration failed");
    throw err;
  }
}

export async function ensureAllSchemas() {
  if (initialized) return;
  
  try {
    logger.info("Initializing database schemas...");
    
    // We run these in a single transaction-like block or sequentially
    // Using CREATE TABLE IF NOT EXISTS is safe but slow if done many times.
    // Here we do it once at startup.
    
    await db.execute(sql`
      -- Core tables usually exist from drizzle push, but we ensure extensions/types
      DO $$ BEGIN
        CREATE TYPE error_severity AS ENUM ('low', 'medium', 'high');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE error_report_status AS ENUM ('open', 'resolved');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS phone text,
        ADD COLUMN IF NOT EXISTS bio text,
        ADD COLUMN IF NOT EXISTS avatar_url text;

      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_number text;
      CREATE UNIQUE INDEX IF NOT EXISTS jobs_job_number_uniq_idx
        ON jobs (job_number)
        WHERE job_number IS NOT NULL;

      -- Job Members
      CREATE TABLE IF NOT EXISTS job_members (
        id uuid PRIMARY KEY,
        job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT job_members_job_user_uniq UNIQUE (job_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS job_members_job_idx ON job_members (job_id);
      CREATE INDEX IF NOT EXISTS job_members_user_idx ON job_members (user_id);

      -- Notifications
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text NOT NULL,
        type text NOT NULL,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS escalation_status text NOT NULL DEFAULT 'none';
      CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id);
      CREATE INDEX IF NOT EXISTS notifications_job_idx ON notifications (job_id);

      -- Time Logs
      CREATE TABLE IF NOT EXISTS time_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
        task text NOT NULL,
        duration integer NOT NULL,
        start_time timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS time_logs_user_idx ON time_logs (user_id);
      CREATE INDEX IF NOT EXISTS time_logs_job_idx ON time_logs (job_id);

      -- Job Messages
      CREATE TABLE IF NOT EXISTS job_messages (
        id uuid PRIMARY KEY,
        job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS job_messages_job_idx ON job_messages (job_id);
      CREATE INDEX IF NOT EXISTS job_messages_job_created_idx ON job_messages (job_id, created_at);

      -- Cliq Integration
      CREATE TABLE IF NOT EXISTS job_cliq_channels (
        job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        channel_name text NOT NULL,
        channel_id text,
        channel_url text,
        status text NOT NULL DEFAULT 'pending',
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS job_cliq_channels_status_idx ON job_cliq_channels (status);
      ALTER TABLE job_cliq_channels ADD COLUMN IF NOT EXISTS chat_id text;

      -- Error Reports
      CREATE TABLE IF NOT EXISTS error_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text NOT NULL,
        category text NOT NULL DEFAULT 'other',
        checklist_item_id integer,
        source text NOT NULL DEFAULT 'manual',
        severity error_severity NOT NULL DEFAULT 'medium',
        status error_report_status NOT NULL DEFAULT 'open',
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';
      ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS checklist_item_id integer;
      ALTER TABLE error_reports ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
      CREATE INDEX IF NOT EXISTS error_reports_job_idx ON error_reports(job_id);
      CREATE INDEX IF NOT EXISTS error_reports_status_idx ON error_reports(status);
      CREATE INDEX IF NOT EXISTS error_reports_category_idx ON error_reports(category);

      CREATE TABLE IF NOT EXISTS checklist_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS checklist_templates_name_idx ON checklist_templates(name);

      -- Checklist
      CREATE TABLE IF NOT EXISTS job_checklist_state (
        id uuid PRIMARY KEY,
        job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id integer NOT NULL,
        status text NOT NULL,
        rework_reason text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT job_checklist_state_job_user_item_uniq UNIQUE (job_id, user_id, item_id)
      );

      CREATE TABLE IF NOT EXISTS job_checklist_attachments (
        id uuid PRIMARY KEY,
        job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id integer NOT NULL,
        file_name text NOT NULL,
        file_key text NOT NULL,
        file_url text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      
      -- API Metrics
      CREATE TABLE IF NOT EXISTS api_request_daily (
        day date PRIMARY KEY,
        count bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      -- Password Reset Tokens
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        token text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await ensureJobMessageSyncSchema();
    await ensureLegacySupervisorAssignments();
    
    initialized = true;
    logger.info("Database schemas initialized successfully.");
  } catch (err) {
    logger.error({ err }, "Database schema initialization failed");
    // We don't throw here to allow the app to try and start anyway
  }
}
