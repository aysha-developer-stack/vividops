import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

function fmt(s) {
  s = Math.floor(Number(s));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

const ids = [
  "dc2a8de0-3cf5-4731-96ba-f13cff2e7262",
  "cb94092c-ed1a-4a3b-ab86-a9980f5dcaf0",
  "3288254b-4824-4334-aa57-d64b0276481e",
  "1250b29b-b394-43e0-a847-7a6848d55e9e",
  "c137c96f-028e-4264-ab07-4e5e83777718",
  "ff110aa6-6e8c-4ec8-b83c-0f3f7634a26e",
  "b77f862e-73e6-4349-bc11-715b18c6afc0",
  "d7907d84-30cc-4e71-8cd9-e5d866c502e5",
];

const host = new URL(process.env.DATABASE_URL).hostname;
const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });
await client.connect();

for (const id of ids) {
  const r = await client.query(
    `SELECT tl.*, u.name, j.job_number FROM time_logs tl
     JOIN users u ON u.id = tl.user_id LEFT JOIN jobs j ON j.id = tl.job_id WHERE tl.id = $1`,
    [id],
  );
  console.log(r.rows[0] ? { ...r.rows[0], duration: fmt(r.rows[0].duration) } : id + " NOT FOUND");
}

for (const jobNum of ["154773", "154768", "154776", "154766", "154761", "154770"]) {
  const rows = await client.query(
    `SELECT tl.id, u.name, tl.task, tl.duration, tl.created_at
     FROM time_logs tl JOIN users u ON u.id = tl.user_id
     JOIN jobs j ON j.id = tl.job_id
     WHERE j.job_number = $1 ORDER BY tl.created_at`,
    [jobNum],
  );
  console.log(`\n=== JOB-${jobNum} (${rows.rows.length} logs) ===`);
  for (const r of rows.rows) {
    console.log(`${fmt(r.duration).padStart(12)} | ${r.name} | ${r.task} | ${r.created_at.toISOString()} | ${r.id.slice(0, 8)}`);
  }
  const sum = rows.rows.reduce((a, r) => a + Number(r.duration), 0);
  console.log("TOTAL", fmt(sum));
}

await client.end();
