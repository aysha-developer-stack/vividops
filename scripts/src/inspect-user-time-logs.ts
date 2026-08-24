import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const userName = process.argv[2]?.trim() || "Farjan";
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
    const userRes = await client.query(
      `SELECT id, name, email FROM users WHERE name ILIKE $1`,
      [`%${userName}%`],
    );
    if (userRes.rows.length === 0) {
      console.error(`No user found matching: ${userName}`);
      process.exit(1);
    }
    for (const user of userRes.rows) {
      const uid = user.id as string;
      const sum = await client.query(
        `SELECT count(*)::int AS c, coalesce(sum(duration), 0)::int AS s FROM time_logs WHERE user_id = $1`,
        [uid],
      );
      const logs = await client.query(
        `SELECT tl.id, tl.task, tl.duration, tl.created_at, j.job_number, j.title
         FROM time_logs tl
         LEFT JOIN jobs j ON j.id = tl.job_id
         WHERE tl.user_id = $1
         ORDER BY tl.duration DESC`,
        [uid],
      );
      console.log(`\n=== ${user.name} (${user.email}) ===`);
      console.log(`Total: ${formatDuration(sum.rows[0].s)} | logs: ${sum.rows[0].c}`);
      for (const r of logs.rows) {
        const job = r.job_number ? `JOB-${r.job_number}` : "no-job";
        console.log(
          `${formatDuration(r.duration).padStart(12)} | ${job} | ${String(r.task).slice(0, 50)} | ${new Date(r.created_at).toISOString().slice(0, 10)} | ${r.id}`,
        );
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
