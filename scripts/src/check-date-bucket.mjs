import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const r = await client.query(`
  SELECT (tl.created_at AT TIME ZONE 'Asia/Karachi')::date AS work_date,
         tl.created_at, tl.duration, u.name
  FROM time_logs tl JOIN users u ON u.id = tl.user_id
  WHERE u.name = 'Farjan Faiz'
    AND tl.created_at >= '2026-08-20'::timestamptz
    AND tl.created_at < '2026-08-26'::timestamptz
  ORDER BY tl.created_at
`);
for (const x of r.rows) {
  const wd = x.work_date;
  const dateStr = wd instanceof Date ? wd.toISOString().slice(0, 10) : String(wd).slice(0, 10);
  console.log({ work_date: dateStr, raw: wd, utc: x.created_at.toISOString(), dur: x.duration });
}
await client.end();
