import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const REPORT_TIMEZONE = process.env.REPORT_DISPLAY_TIMEZONE || "Asia/Karachi";

function fmt(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

/** Match Reports.tsx formatDisplayDate */
function formatDisplayDate(dateStr) {
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: REPORT_TIMEZONE,
  });
}

function toDateStr(workDate) {
  if (workDate instanceof Date) return workDate.toISOString().slice(0, 10);
  return String(workDate).slice(0, 10);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const result = await client.query(
    `
    SELECT
      tl.user_id,
      u.name AS user_name,
      u.role AS user_role,
      (tl.created_at AT TIME ZONE $1)::date AS work_date,
      SUM(tl.duration)::int AS total_seconds,
      COUNT(*)::int AS session_count,
      COUNT(DISTINCT tl.job_id) FILTER (WHERE tl.job_id IS NOT NULL)::int AS job_count
    FROM time_logs tl
    INNER JOIN users u ON u.id = tl.user_id
    WHERE u.role IN ('user', 'supervisor')
    GROUP BY tl.user_id, u.name, u.role, work_date
    ORDER BY work_date DESC, u.name ASC
    `,
    [REPORT_TIMEZONE],
  );

  console.log(`Timezone: ${REPORT_TIMEZONE}`);
  console.log(`Total rows: ${result.rows.length}\n`);
  console.log("Date\tWorker\tRole\tHours\tJobs\tSessions");

  for (const row of result.rows) {
    const dateStr = toDateStr(row.work_date);
    const roleLabel = row.user_role === "supervisor" ? "Supervisor" : "User";
    console.log(
      `${formatDisplayDate(dateStr)}\t${row.user_name}\t${roleLabel}\t${fmt(row.total_seconds)}\t${row.job_count}\t${row.session_count}`,
    );
  }

  // Per-day sanity: list raw logs for days with very high hours
  const highDays = result.rows.filter((r) => Number(r.total_seconds) >= 18 * 3600);
  if (highDays.length > 0) {
    console.log("\n=== HIGH HOURS DAYS (detail) ===");
    for (const day of highDays) {
      const dateStr = toDateStr(day.work_date);
      const logs = await client.query(
        `
        SELECT tl.task, tl.duration, tl.created_at, j.job_number
        FROM time_logs tl
        LEFT JOIN jobs j ON j.id = tl.job_id
        WHERE tl.user_id = $1
          AND (tl.created_at AT TIME ZONE $2)::date = $3::date
        ORDER BY tl.created_at
        `,
        [day.user_id, REPORT_TIMEZONE, dateStr],
      );
      console.log(`\n${day.user_name} | ${dateStr} | ${fmt(day.total_seconds)}`);
      for (const l of logs.rows) {
        const local = new Date(l.created_at).toLocaleString("en-PK", {
          timeZone: REPORT_TIMEZONE,
        });
        console.log(`  ${fmt(l.duration).padStart(12)} | JOB-${l.job_number ?? "?"} | ${l.task} | saved ${local}`);
      }
    }
  }

  // Verify Abdul Rehman gone
  const abdul = await client.query(
    `SELECT count(*)::int c FROM time_logs tl JOIN users u ON u.id = tl.user_id WHERE u.name ILIKE '%abdul%rehman%'`,
  );
  console.log(`\nAbdul Rehman log count: ${abdul.rows[0].c}`);

  // Cross-check totals vs sum of daily rows
  const grand = result.rows.reduce((a, r) => a + Number(r.total_seconds), 0);
  const all = await client.query(
    `SELECT coalesce(sum(tl.duration),0)::int s FROM time_logs tl JOIN users u ON u.id = tl.user_id WHERE u.role IN ('user','supervisor')`,
  );
  console.log(`Daily rows sum: ${fmt(grand)} | All worker logs sum: ${fmt(all.rows[0].s)} | Match: ${grand === Number(all.rows[0].s)}`);
} finally {
  await client.end();
}
