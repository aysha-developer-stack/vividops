import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const userName = process.argv[2]?.trim() || "Farjan Faiz";
const secondsToRemove = Number(process.argv[3] ?? 17 * 3600);
const apply = process.argv.includes("--apply");

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
  if (!Number.isFinite(secondsToRemove) || secondsToRemove <= 0) {
    console.error("Invalid seconds to remove");
    process.exit(1);
  }

  const host = new URL(databaseUrl).hostname;
  const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({ connectionString: databaseUrl, ssl });
  await client.connect();

  try {
    const userRes = await client.query(
      `SELECT id, name, email FROM users WHERE name ILIKE $1`,
      [userName],
    );
    if (userRes.rows.length !== 1) {
      console.error(`Expected exactly one user for "${userName}", found ${userRes.rows.length}`);
      process.exit(1);
    }
    const user = userRes.rows[0] as { id: string; name: string; email: string };

    const beforeRes = await client.query(
      `SELECT coalesce(sum(duration), 0)::int AS total_seconds FROM time_logs WHERE user_id = $1`,
      [user.id],
    );
    const beforeTotal = beforeRes.rows[0].total_seconds as number;

    const logsRes = await client.query(
      `SELECT tl.id, tl.task, tl.duration, tl.created_at, j.job_number
       FROM time_logs tl
       LEFT JOIN jobs j ON j.id = tl.job_id
       WHERE tl.user_id = $1
       ORDER BY tl.duration DESC`,
      [user.id],
    );

    let remaining = secondsToRemove;
    const plan: Array<{ id: string; before: number; after: number; delete: boolean; task: string; job: string }> = [];

    for (const row of logsRes.rows) {
      if (remaining <= 0) break;
      const duration = row.duration as number;
      if (duration <= 0) continue;

      const take = Math.min(duration, remaining);
      const after = duration - take;
      plan.push({
        id: row.id,
        before: duration,
        after,
        delete: after <= 0,
        task: row.task,
        job: row.job_number ? `JOB-${row.job_number}` : "no-job",
      });
      remaining -= take;
    }

    if (remaining > 0) {
      console.error(
        `Cannot remove ${formatDuration(secondsToRemove)} — only ${formatDuration(secondsToRemove - remaining)} available.`,
      );
      process.exit(1);
    }

    console.log(`${user.name} (${user.email})`);
    console.log(`Remove: ${formatDuration(secondsToRemove)}`);
    console.log(`Total before: ${formatDuration(beforeTotal)}`);
    console.log(`Total after:  ${formatDuration(beforeTotal - secondsToRemove)}\n`);

    for (const p of plan) {
      if (p.delete) {
        console.log(`DELETE  ${formatDuration(p.before)} | ${p.job} | ${p.task}`);
      } else {
        console.log(
          `UPDATE  ${formatDuration(p.before)} -> ${formatDuration(p.after)} | ${p.job} | ${p.task}`,
        );
      }
    }

    if (!apply) {
      console.log("\nDry run only. Re-run with --apply to commit.");
      return;
    }

    for (const p of plan) {
      if (p.delete) {
        await client.query(`DELETE FROM time_logs WHERE id = $1`, [p.id]);
      } else {
        await client.query(`UPDATE time_logs SET duration = $2 WHERE id = $1`, [p.id, p.after]);
      }
    }

    const afterRes = await client.query(
      `SELECT coalesce(sum(duration), 0)::int AS total_seconds FROM time_logs WHERE user_id = $1`,
      [user.id],
    );
    console.log(`\nApplied. New total: ${formatDuration(afterRes.rows[0].total_seconds as number)}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
