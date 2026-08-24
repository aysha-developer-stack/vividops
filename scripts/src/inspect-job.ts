import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const jobNumber = process.argv[2]?.trim() || "154760";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

function fmt(seconds: number): string {
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

  const jobRes = await client.query(
    `SELECT j.id, j.job_number, j.serial, j.title, j.status, j.progress,
            u.name AS assignee, s.name AS supervisor, j.created_at, j.updated_at, j.review_started_at
     FROM jobs j
     LEFT JOIN users u ON u.id = j.assignee_id
     LEFT JOIN users s ON s.id = j.supervisor_id
     WHERE j.job_number = $1 OR j.serial = $2::int`,
    [jobNumber, jobNumber],
  );

  if (jobRes.rows.length === 0) {
    console.log(`No job found for ${jobNumber}`);
    await client.end();
    return;
  }

  const job = jobRes.rows[0];
  console.log("=== JOB ===");
  console.log(job);

  const jobId = job.id;

  const reworks = await client.query(
    `SELECT r.cycle_number, r.checklist_item_id, r.reason, r.category, r.status, r.severity,
            r.created_at, r.completed_at, r.approved_at, u.name AS worker, c.name AS created_by
     FROM job_reworks r
     JOIN users u ON u.id = r.user_id
     JOIN users c ON c.id = r.created_by_id
     WHERE r.job_id = $1
     ORDER BY r.cycle_number, r.created_at`,
    [jobId],
  );
  console.log("\n=== REWORKS ===");
  for (const row of reworks.rows) console.log(row);

  const timeLogs = await client.query(
    `SELECT tl.id, tl.task, tl.duration, tl.rework_cycle_number, tl.start_time, tl.created_at, u.name AS user_name
     FROM time_logs tl
     JOIN users u ON u.id = tl.user_id
     WHERE tl.job_id = $1
     ORDER BY tl.created_at`,
    [jobId],
  );
  console.log("\n=== TIME LOGS ===");
  for (const row of timeLogs.rows) {
    console.log({
      id: row.id,
      user: row.user_name,
      task: row.task,
      cycle: row.rework_cycle_number ?? "original",
      duration: fmt(Number(row.duration)),
      start_time: row.start_time,
      at: row.created_at,
    });
  }

  const byCycle = new Map<string, number>();
  for (const row of timeLogs.rows) {
    const key = row.rework_cycle_number == null ? "original" : `rework_${row.rework_cycle_number}`;
    byCycle.set(key, (byCycle.get(key) ?? 0) + Number(row.duration));
  }
  console.log("\n=== TIME BY CYCLE ===");
  for (const [k, v] of byCycle) console.log(k, fmt(v));

  const checklist = await client.query(
    `SELECT jcs.item_id, jcs.status, jcs.updated_at, u.name AS user_name
     FROM job_checklist_state jcs
     JOIN users u ON u.id = jcs.user_id
     WHERE jcs.job_id = $1
     ORDER BY jcs.item_id`,
    [jobId],
  );
  console.log("\n=== CHECKLIST STATE ===");
  for (const row of checklist.rows) console.log(row);

  const descRes = await client.query(`SELECT description FROM jobs WHERE id = $1`, [jobId]);
  const rawDesc = descRes.rows[0]?.description;
  try {
    const meta = JSON.parse(rawDesc);
    console.log("\n=== CHECKLIST TEMPLATE ===");
    for (const [i, item] of (meta.checklist ?? []).entries()) {
      console.log({ item_id: i + 1, text: item.text, desc: item.desc });
    }
  } catch {
    console.log("\n=== DESCRIPTION (non-json) ===", rawDesc?.slice(0, 200));
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
