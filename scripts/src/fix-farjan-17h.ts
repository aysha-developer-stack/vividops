import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const BRACING_LOG_ID = "0f5922ca-1ead-45d7-9b46-e5c4eca83f74";
const CAD_LOG_ID = "65d07f30-7adf-463f-83ba-d795ce0dcf7e";
const BRACING_RESTORE_SECONDS = 21 * 3600 + 43 * 60 + 9; // 78189
const CAD_AFTER_SECONDS = 23 * 60 + 14; // 1414 — 17h removed from 17h 23m 14s log

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

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
    await client.query(`UPDATE time_logs SET duration = $2 WHERE id = $1`, [
      BRACING_LOG_ID,
      BRACING_RESTORE_SECONDS,
    ]);
    await client.query(`UPDATE time_logs SET duration = $2 WHERE id = $1`, [CAD_LOG_ID, CAD_AFTER_SECONDS]);

    const sum = await client.query(
      `SELECT coalesce(sum(tl.duration), 0)::int AS s
       FROM time_logs tl
       JOIN users u ON u.id = tl.user_id
       WHERE u.name ILIKE 'Farjan Faiz'`,
    );
    console.log(`Restored bracing log to ${formatDuration(BRACING_RESTORE_SECONDS)}`);
    console.log(`Reduced CAD log to ${formatDuration(CAD_AFTER_SECONDS)} (removed 17h)`);
    console.log(`Farjan total: ${formatDuration(sum.rows[0].s as number)}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
