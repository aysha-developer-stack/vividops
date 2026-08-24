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

const users = await client.query(
  `SELECT id, name, email, role, created_at FROM users WHERE name ILIKE $1`,
  ["%abdul%rehman%"],
);
console.log("USERS", users.rows);

for (const user of users.rows) {
  const logs = await client.query(
    `SELECT tl.id, tl.task, tl.duration, tl.created_at, tl.start_time, j.job_number
     FROM time_logs tl LEFT JOIN jobs j ON j.id = tl.job_id
     WHERE tl.user_id = $1 ORDER BY tl.created_at DESC`,
    [user.id],
  );
  console.log(`\n=== ${user.name} (${logs.rows.length} logs) ===`);
  for (const r of logs.rows) {
    console.log({
      task: r.task,
      duration: r.duration,
      created_at: r.created_at,
      start_time: r.start_time,
      job: r.job_number,
      id: r.id,
    });
  }
}

const active = await client.query(
  `SELECT ats.*, j.job_number FROM active_timer_sessions ats
   LEFT JOIN jobs j ON j.id = ats.job_id
   JOIN users u ON u.id = ats.user_id
   WHERE u.name ILIKE $1`,
  ["%abdul%rehman%"],
);
console.log("\nACTIVE SESSIONS", active.rows);

await client.end();
