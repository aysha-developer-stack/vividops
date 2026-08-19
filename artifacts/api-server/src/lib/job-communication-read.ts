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

function communicationJobsSubquery(actor: UserRow) {
  if (actor.role === "super-admin" || actor.role === "admin") {
    return sql`(SELECT id FROM jobs)`;
  }
  if (actor.role === "supervisor") {
    return sql`(SELECT id FROM jobs WHERE supervisor_id = ${actor.id})`;
  }
  return sql`(
    SELECT id FROM jobs WHERE assignee_id = ${actor.id}
    UNION
    SELECT job_id FROM job_members WHERE user_id = ${actor.id}
  )`;
}

export async function markJobCommunicationRead(userId: string, jobId: string): Promise<void> {
  await ensureJobCommunicationReadSchema();
  await db.execute(sql`
    INSERT INTO job_communication_read_state (user_id, job_id, last_read_at)
    VALUES (${userId}, ${jobId}, now())
    ON CONFLICT (user_id, job_id)
    DO UPDATE SET last_read_at = EXCLUDED.last_read_at
  `);
}

export async function getCommunicationUnreadCounts(
  actor: UserRow,
): Promise<Record<string, number>> {
  await ensureLegacySupervisorAssignments();
  await ensureJobWriteSchema();
  await ensureJobCommunicationReadSchema();

  const visibleJobs = communicationJobsSubquery(actor);
  const rows = await db.execute(sql`
    SELECT jm.job_id, COUNT(*)::int AS unread_count
    FROM job_messages jm
    LEFT JOIN job_communication_read_state rs
      ON rs.job_id = jm.job_id AND rs.user_id = ${actor.id}
    WHERE jm.job_id IN ${visibleJobs}
      AND jm.user_id <> ${actor.id}
      AND jm.created_at > COALESCE(rs.last_read_at, to_timestamp(0))
    GROUP BY jm.job_id
  `);

  const result: Record<string, number> = {};
  const rawRows = ((rows as unknown as { rows?: Array<{ job_id: string; unread_count: number }> }).rows ?? []);
  for (const row of rawRows) {
    if (row.unread_count > 0) result[row.job_id] = row.unread_count;
  }
  return result;
}
