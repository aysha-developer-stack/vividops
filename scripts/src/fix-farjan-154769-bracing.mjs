import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

function fmt(seconds) {
  const s = Number(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

const logId = "0f5922ca-1ead-45d7-9b46-e5c4eca83f74";
const jobId = "ebb98185-aa64-4332-8c7a-44691c37f0af";
const newDur = 23693;

const host = new URL(databaseUrl).hostname;
const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
const client = new pg.Client({ connectionString: databaseUrl, ssl });
await client.connect();

try {
  const old = await client.query(
    "SELECT duration, task, created_at FROM time_logs WHERE id = $1",
    [logId],
  );
  if (old.rows.length === 0) {
    console.error("Log not found:", logId);
    process.exit(1);
  }

  const oldDur = Number(old.rows[0].duration);
  await client.query("UPDATE time_logs SET duration = $1 WHERE id = $2", [newDur, logId]);

  const sum = await client.query(
    "SELECT coalesce(sum(duration), 0)::int AS s FROM time_logs WHERE job_id = $1",
    [jobId],
  );

  console.log(
    JSON.stringify(
      {
        logId,
        task: old.rows[0].task,
        created_at: old.rows[0].created_at,
        before: fmt(oldDur),
        after: fmt(newDur),
        removed: fmt(oldDur - newDur),
        jobTotal: fmt(sum.rows[0].s),
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
