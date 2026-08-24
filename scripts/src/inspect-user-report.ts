import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const userName = process.argv[2]?.trim() || "Minahil";
const databaseUrl = process.env.DATABASE_URL!;

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

async function main() {
  const host = new URL(databaseUrl).hostname;
  const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({ connectionString: databaseUrl, ssl });
  await client.connect();

  try {
    const userRes = await client.query(`SELECT id, name, email FROM users WHERE name ILIKE $1`, [userName]);
    const user = userRes.rows[0];
    if (!user) {
      console.error("User not found");
      process.exit(1);
    }

    const jobs = await client.query(
      `SELECT j.id, j.job_number, j.title, j.status, j.created_at, j.completed_at, j.updated_at,
              EXTRACT(EPOCH FROM (COALESCE(j.completed_at, j.updated_at) - j.created_at))::int AS lifecycle_seconds
       FROM jobs j
       WHERE j.assignee_id = $1
          OR j.id IN (SELECT job_id FROM job_members WHERE user_id = $1)
       ORDER BY j.created_at DESC`,
      [user.id],
    );

    const logs = await client.query(
      `SELECT tl.task, tl.duration, tl.created_at, tl.start_time, j.job_number, j.status AS job_status
       FROM time_logs tl
       LEFT JOIN jobs j ON j.id = tl.job_id
       WHERE tl.user_id = $1
       ORDER BY tl.created_at ASC`,
      [user.id],
    );

    console.log("\nACTIVE TIMERS: skipped");

    console.log(`\n=== ${user.name} ===\n`);
    console.log("JOBS:");
    for (const j of jobs.rows) {
      console.log(
        `  JOB-${j.job_number} | ${j.status} | created ${new Date(j.created_at).toISOString()} | completed ${j.completed_at ? new Date(j.completed_at).toISOString() : "—"} | lifecycle ${formatDuration(j.lifecycle_seconds)}`,
      );
    }

    console.log("\nTIME LOGS:");
    let total = 0;
    for (const l of logs.rows) {
      total += l.duration;
      console.log(
        `  ${formatDuration(l.duration)} | JOB-${l.job_number ?? "?"} (${l.job_status}) | ${l.task} | logged ${new Date(l.created_at).toISOString()} | start ${new Date(l.start_time).toISOString()}`,
      );
    }
    console.log(`  TOTAL LOGGED: ${formatDuration(total)}`);

    console.log("\nACTIVE TIMERS:");
    const sessions = await client.query(`SELECT * FROM active_timer_sessions WHERE user_id = $1`, [user.id]);
    if (sessions.rows.length === 0) console.log("  (none)");
    else console.log(JSON.stringify(sessions.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
