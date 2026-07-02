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
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text NOT NULL,
        type text NOT NULL,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id);

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

      -- Error Reports
      CREATE TABLE IF NOT EXISTS error_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text NOT NULL,
        severity error_severity NOT NULL DEFAULT 'medium',
        status error_report_status NOT NULL DEFAULT 'open',
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS error_reports_job_idx ON error_reports(job_id);
      CREATE INDEX IF NOT EXISTS error_reports_status_idx ON error_reports(status);

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

    await ensureLegacySupervisorAssignments();
    
    initialized = true;
    logger.info("Database schemas initialized successfully.");
  } catch (err) {
    logger.error({ err }, "Database schema initialization failed");
    // We don't throw here to allow the app to try and start anyway
  }
}
