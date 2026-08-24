import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const TZ = process.env.REPORT_DISPLAY_TIMEZONE || "Asia/Karachi";

function fmt(s) {
  s = Math.floor(Number(s));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

function pgDateToStr(d) {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function formatDisplayDate(dateStr) {
  const parsed = new Date(`${dateStr}T12:00:00`);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TZ,
  });
}

/** User-pasted expected rows (Abdul included — should be gone after DB fix) */
const USER_ROWS = `
Mon, Aug 24, 2026	Farjan Faiz	3h 28m 16s
Mon, Aug 24, 2026	Haseeb	5h 26m 33s
Mon, Aug 24, 2026	M. Ammar Butt	2h 35m 53s
Mon, Aug 24, 2026	Muhammad Adnan	9h 14m 25s
Mon, Aug 24, 2026	Shoaib	6h 30m 23s
Mon, Aug 24, 2026	Yousaf Hassan	6h 17m 22s
Sat, Aug 22, 2026	Farjan Faiz	5h 18m 32s
Sat, Aug 22, 2026	M. Ammar Butt	3h 20m 23s
Sat, Aug 22, 2026	Muhammad Adnan	0h 26m 19s
Sat, Aug 22, 2026	Shoaib	4h 1m 33s
Sat, Aug 22, 2026	Yousaf Hassan	1h 43m 8s
Fri, Aug 21, 2026	Farjan Faiz	22h 50m 54s
Fri, Aug 21, 2026	Haseeb	20h 26m 35s
Fri, Aug 21, 2026	M. Ammar Butt	6h 11m 33s
Fri, Aug 21, 2026	Minahil	18h 54m 7s
Fri, Aug 21, 2026	Shoaib	1h 47m 44s
Fri, Aug 21, 2026	Yousaf Hassan	0h 6m 6s
`.trim();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const result = await client.query(`
  SELECT tl.user_id, u.name, u.role,
    (tl.created_at AT TIME ZONE $1)::date AS work_date,
    SUM(tl.duration)::int AS total_seconds,
    COUNT(*)::int AS session_count,
    COUNT(DISTINCT tl.job_id) FILTER (WHERE tl.job_id IS NOT NULL)::int AS job_count
  FROM time_logs tl
  JOIN users u ON u.id = tl.user_id
  WHERE u.role IN ('user', 'supervisor')
  GROUP BY tl.user_id, u.name, u.role, work_date
  ORDER BY work_date DESC, u.name
`, [TZ]);

const dbMap = new Map();
for (const row of result.rows) {
  const dateStr = pgDateToStr(row.work_date);
  const key = `${formatDisplayDate(dateStr)}|${row.name}|${fmt(row.total_seconds)}`;
  dbMap.set(key, row);
}

let ok = 0;
let fail = 0;
for (const line of USER_ROWS.split("\n")) {
  const [date, name, hours] = line.split("\t");
  const key = `${date}|${name}|${hours}`;
  if (dbMap.has(key)) {
    ok++;
    dbMap.delete(key);
  } else {
    console.log("MISMATCH (not in DB):", key);
    fail++;
  }
}

console.log(`Sample rows matched: ${ok}/${ok + fail}`);

// Full DB export with correct dates
console.log("\n=== DB TRUTH (correct Karachi dates) ===");
for (const row of result.rows) {
  const dateStr = pgDateToStr(row.work_date);
  console.log(`${formatDisplayDate(dateStr)}\t${row.name}\t${fmt(row.total_seconds)}\t${row.job_count} jobs\t${row.session_count} sessions`);
}

// Haseeb Aug 21 detail
const h = await client.query(`
  SELECT tl.task, tl.duration, tl.created_at, j.job_number
  FROM time_logs tl
  JOIN users u ON u.id = tl.user_id
  LEFT JOIN jobs j ON j.id = tl.job_id
  WHERE u.name = 'Haseeb'
    AND (tl.created_at AT TIME ZONE $1)::date = '2026-08-21'::date
  ORDER BY tl.created_at
`, [TZ]);
console.log("\n=== Haseeb Fri Aug 21 logs ===");
for (const r of h.rows) {
  console.log(fmt(r.duration), r.task, r.job_number, r.created_at.toISOString());
}

await client.end();
