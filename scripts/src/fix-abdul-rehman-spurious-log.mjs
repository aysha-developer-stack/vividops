import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const logId = "4bb157bb-6ec9-425e-9008-b4c3c4a9e466";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const row = await client.query(
  `SELECT tl.duration, tl.task, tl.created_at, u.name, j.job_number
   FROM time_logs tl
   JOIN users u ON u.id = tl.user_id
   LEFT JOIN jobs j ON j.id = tl.job_id
   WHERE tl.id = $1`,
  [logId],
);
if (row.rows.length === 0) {
  console.log("Log already removed");
  await client.end();
  process.exit(0);
}

console.log("Removing:", row.rows[0]);
await client.query("DELETE FROM time_logs WHERE id = $1", [logId]);
console.log("Deleted invalid overnight log for Abdul Rehman");
await client.end();
