import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const userName = process.argv[2]?.trim() || "Abdul Rehman";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const host = new URL(databaseUrl).hostname;
  const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl,
    connectionTimeoutMillis: 30000,
  });
  await client.connect();

  try {
    const userRes = await client.query(
      `SELECT id, name, email FROM users WHERE name ILIKE $1`,
      [userName],
    );
    if (userRes.rows.length === 0) {
      console.error(`No user found matching name: ${userName}`);
      process.exit(1);
    }
    if (userRes.rows.length > 1) {
      console.error(`Multiple users match "${userName}":`);
      for (const u of userRes.rows) console.error(`  - ${u.name} (${u.email})`);
      process.exit(1);
    }

    const user = userRes.rows[0] as { id: string; name: string; email: string };
    const beforeRes = await client.query(
      `SELECT count(*)::int AS count, coalesce(sum(duration), 0)::int AS total_seconds FROM time_logs WHERE user_id = $1`,
      [user.id],
    );
    const before = beforeRes.rows[0] as { count: number; total_seconds: number };

    const deletedLogs = await client.query(
      `DELETE FROM time_logs WHERE user_id = $1 RETURNING id`,
      [user.id],
    );
    const deletedSessions = await client.query(
      `DELETE FROM active_timer_sessions WHERE user_id = $1 RETURNING id`,
      [user.id],
    );

    console.log(JSON.stringify({
      user: { id: user.id, name: user.name, email: user.email },
      before: { logCount: before.count, totalSeconds: before.total_seconds },
      deleted: {
        timeLogs: deletedLogs.rowCount ?? deletedLogs.rows.length,
        activeTimerSessions: deletedSessions.rowCount ?? deletedSessions.rows.length,
      },
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
