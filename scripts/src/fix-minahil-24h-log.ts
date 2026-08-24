import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const LOG_ID = "aadb5ce2-fa1b-4761-9e2f-38d8436ad294";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const host = new URL(databaseUrl).hostname;
  const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({ connectionString: databaseUrl, ssl });
  await client.connect();
  try {
    const before = await client.query(
      `SELECT tl.duration, u.name, j.job_number, tl.task, tl.created_at, j.completed_at
       FROM time_logs tl
       JOIN users u ON u.id = tl.user_id
       LEFT JOIN jobs j ON j.id = tl.job_id
       WHERE tl.id = $1`,
      [LOG_ID],
    );
    console.log("Before:", before.rows[0]);
    await client.query(`DELETE FROM time_logs WHERE id = $1`, [LOG_ID]);
    const after = await client.query(
      `SELECT coalesce(sum(duration),0)::int AS s FROM time_logs tl JOIN users u ON u.id = tl.user_id WHERE u.name ILIKE 'Minahil'`,
    );
    console.log("Minahil total seconds after:", after.rows[0].s);
    console.log("Deleted invalid 24h post-completion log.");
  } finally {
    await client.end();
  }
}

main().catch(console.error);
