import { db, sql, type UserRow } from "@workspace/db";
import { ensureAllSchemas, ensureJobWriteSchema, ensureLegacySupervisorAssignments } from "./schema-init";

let readSchemaEnsured = false;

export async function ensureJobCommunicationReadSchema(): Promise<void> {
  if (readSchemaEnsured) return;
  readSchemaEnsured = true;
  await ensureAllSchemas();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_communication_read_state (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      last_read_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, job_id)
    );
    CREATE INDEX IF NOT EXISTS job_communication_read_state_job_idx
      ON job_communication_read_state (job_id);
  `);
}

export async function markJobCommunicationRead(userId: string, jobId: string): Promise<void> {
  await ensureJobCommunicationReadSchema();
  await db.execute(sql`
    INSERT INTO job_communication_read_state (user_id, job_id, last_read_at)
    VALUES (${userId}, ${jobId}, now())
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET last_read_at = EXCLUDED.last_read_at
  `);
  await db.execute(sql`
    UPDATE notifications
    SET is_read = true, read_at = now()
    WHERE user_id = ${userId}
      AND job_id = ${jobId}
      AND type = 'job_message'
      AND is_read = false
  `);
}

/**
 * Unread chats = live job_message alerts after last open.
 * History imports do not create those alerts, so they stay out of the badge.
 */
export async function getCommunicationUnreadCounts(
  actor: UserRow,
): Promise<Record<string, number>> {
  await ensureLegacySupervisorAssignments();
  await ensureJobWriteSchema();
  await ensureJobCommunicationReadSchema();

  const rows = await db.execute(sql`
    SELECT n.job_id, COUNT(*)::int AS unread_count
    FROM notifications n
    INNER JOIN jobs j ON j.id = n.job_id
    LEFT JOIN job_communication_read_state rs
      ON rs.job_id = n.job_id AND rs.user_id = n.user_id
    WHERE n.user_id = ${actor.id}
      AND n.is_read = false
      AND n.type = 'job_message'
      AND (rs.last_read_at IS NULL OR n.created_at > rs.last_read_at)
    GROUP BY n.job_id
  `);

  const result: Record<string, number> = {};
  const raw = rows as unknown as { rows?: Array<{ job_id: string; unread_count: number }> };
  const rawRows = Array.isArray(raw.rows) ? raw.rows : Array.isArray(rows) ? (rows as Array<{ job_id: string; unread_count: number }>) : [];
  for (const row of rawRows) {
    if (row.unread_count > 0) result[row.job_id] = row.unread_count;
  }
  return result;
}
