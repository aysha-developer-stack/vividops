import { db, sql, type UserRow } from "@workspace/db";
import { getCommunicationUnreadCounts } from "./job-communication-read";
import { ensureAllSchemas } from "./schema-init";

export const SIDEBAR_SECTIONS = ["training", "jobs", "communication", "mistakes"] as const;
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];

export type SidebarBadgeCounts = {
  training: number;
  jobs: number;
  communication: number;
  mistakes: number;
};

let schemaEnsured = false;

export async function ensureSectionReadSchema(): Promise<void> {
  if (schemaEnsured) return;
  schemaEnsured = true;
  await ensureAllSchemas();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_section_read_state (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section text NOT NULL,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, section)
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_comments (
      id uuid PRIMARY KEY,
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function countFrom(result: unknown): number {
  const rows = (result as { rows?: Array<{ n?: number }> }).rows;
  if (Array.isArray(rows) && rows[0]?.n != null) return Math.max(0, Number(rows[0].n) || 0);
  if (Array.isArray(result) && (result as Array<{ n?: number }>)[0]?.n != null) {
    return Math.max(0, Number((result as Array<{ n?: number }>)[0].n) || 0);
  }
  return 0;
}

export function isSidebarSection(value: string): value is SidebarSection {
  return (SIDEBAR_SECTIONS as readonly string[]).includes(value);
}

export async function getOrInitSectionLastSeen(userId: string, section: SidebarSection): Promise<Date> {
  await ensureSectionReadSchema();
  await db.execute(sql`
    INSERT INTO user_section_read_state (user_id, section, last_seen_at)
    VALUES (${userId}, ${section}, now())
    ON CONFLICT (user_id, section) DO NOTHING
  `);
  const result = await db.execute(sql`
    SELECT last_seen_at FROM user_section_read_state
    WHERE user_id = ${userId} AND section = ${section}
    LIMIT 1
  `);
  const rows = (result as { rows?: Array<{ last_seen_at: Date | string }> }).rows ?? [];
  const raw = rows[0]?.last_seen_at;
  const date = raw instanceof Date ? raw : new Date(raw ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

export async function markSectionSeen(userId: string, section: SidebarSection): Promise<void> {
  await ensureSectionReadSchema();
  await db.execute(sql`
    INSERT INTO user_section_read_state (user_id, section, last_seen_at)
    VALUES (${userId}, ${section}, now())
    ON CONFLICT (user_id, section)
    DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
  `);
}

async function countTraining(userId: string, since: Date): Promise<number> {
  const postsCount = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM posts
    WHERE author_id <> ${userId}
      AND created_at > ${since}
  `);
  const commentsCount = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM post_comments
    WHERE user_id <> ${userId}
      AND created_at > ${since}
  `);
  return countFrom(postsCount) + countFrom(commentsCount);
}

async function countJobs(userId: string, since: Date): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM notifications n
    INNER JOIN jobs j ON j.id = n.job_id
    WHERE n.user_id = ${userId}
      AND n.is_read = false
      AND n.created_at > ${since}
      AND n.type IN (
        'assigned', 'updated', 'overdue', 'rework',
        'checklist', 'file', 'completed', 'cliq_channel', 'admin_ops'
      )
  `);
  return countFrom(result);
}

function mistakesScopeSql(actor: UserRow) {
  if (actor.role === "super-admin" || actor.role === "admin") {
    return sql`TRUE`;
  }
  if (actor.role === "user") {
    return sql`er.user_id = ${actor.id}`;
  }
  if (actor.role === "supervisor") {
    return sql`(
      er.job_id IN (SELECT id FROM jobs WHERE supervisor_id = ${actor.id})
      OR (
        er.job_id IS NULL AND er.user_id IN (
          SELECT assignee_id FROM jobs WHERE supervisor_id = ${actor.id} AND assignee_id IS NOT NULL
          UNION
          SELECT jm.user_id FROM job_members jm
          INNER JOIN jobs j ON j.id = jm.job_id
          WHERE j.supervisor_id = ${actor.id}
        )
      )
    )`;
  }
  if (actor.role === "coordinator") {
    return sql`(
      er.job_id IN (SELECT id FROM jobs WHERE coordinator_id = ${actor.id})
      OR (
        er.job_id IS NULL AND er.user_id IN (
          SELECT assignee_id FROM jobs WHERE coordinator_id = ${actor.id} AND assignee_id IS NOT NULL
          UNION
          SELECT jm.user_id FROM job_members jm
          INNER JOIN jobs j ON j.id = jm.job_id
          WHERE j.coordinator_id = ${actor.id}
        )
      )
    )`;
  }
  return sql`FALSE`;
}

async function countMistakes(actor: UserRow, since: Date): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM error_reports er
    WHERE er.source = 'manual'
      AND er.rework_id IS NULL
      AND er.created_by_id <> ${actor.id}
      AND er.created_at > ${since}
      AND ${mistakesScopeSql(actor)}
  `);
  return countFrom(result);
}

export async function getSidebarBadgeCounts(actor: UserRow): Promise<SidebarBadgeCounts> {
  await ensureSectionReadSchema();
  const [trainingSeen, jobsSeen, mistakesSeen, commCounts] = await Promise.all([
    getOrInitSectionLastSeen(actor.id, "training"),
    getOrInitSectionLastSeen(actor.id, "jobs"),
    getOrInitSectionLastSeen(actor.id, "mistakes"),
    getCommunicationUnreadCounts(actor),
  ]);
  const [training, jobs, mistakes] = await Promise.all([
    countTraining(actor.id, trainingSeen),
    countJobs(actor.id, jobsSeen),
    countMistakes(actor, mistakesSeen),
  ]);
  const communication = Object.values(commCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return { training, jobs, communication, mistakes };
}
