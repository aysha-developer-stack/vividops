import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const userName = process.argv[2]?.trim() || "Haseeb";
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
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
    if (userRes.rows.length !== 1) {
      console.error(`Expected exactly one user for "${userName}", found ${userRes.rows.length}`);
      process.exit(1);
    }
    const user = userRes.rows[0] as { id: string; name: string; email: string };

    const logsRes = await client.query(
      `SELECT tl.id, tl.task, tl.duration, tl.created_at, tl.job_id, j.title, j.job_number
       FROM time_logs tl
       LEFT JOIN jobs j ON j.id = tl.job_id
       WHERE tl.user_id = $1
       ORDER BY tl.created_at ASC`,
      [user.id],
    );

    const logs = logsRes.rows as Array<{
      id: string;
      task: string;
      duration: number;
      created_at: string;
      job_id: string | null;
      title: string | null;
      job_number: string | null;
    }>;

    console.log(`User: ${user.name} (${user.email})\n`);

    const byJob = new Map<string, typeof logs>();
    for (const log of logs) {
      const key = log.job_id ?? "no-job";
      const list = byJob.get(key) ?? [];
      list.push(log);
      byJob.set(key, list);
    }

    const toDelete: string[] = [];
    const toUpdate: Array<{ id: string; duration: number; reason: string }> = [];

    for (const [jobId, jobLogs] of byJob) {
      if (jobId === "no-job") continue;

      const sorted = [...jobLogs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      const manualIdx = sorted.findIndex((l) => l.task === "Manually stopped");
      const guttersIdx = sorted.findIndex((l) => l.task === "Gutters Design");

      if (manualIdx === -1) continue;

      const manual = sorted[manualIdx]!;
      const prev = manualIdx > 0 ? sorted[manualIdx - 1] : null;

      // Duplicate inflated save: "Manually stopped" right after another long log on same job.
      if (
        prev &&
        manual.duration > 3600 &&
        manual.duration >= prev.duration * 0.9 &&
        new Date(manual.created_at).getTime() - new Date(prev.created_at).getTime() < 6 * 60 * 60 * 1000
      ) {
        if (guttersIdx >= 0 && guttersIdx === manualIdx - 1) {
          const gapSec = Math.max(
            0,
            Math.floor(
              (new Date(manual.created_at).getTime() - new Date(prev.created_at).getTime()) / 1000,
            ),
          );
          if (gapSec > 0 && gapSec < manual.duration) {
            toUpdate.push({
              id: manual.id,
              duration: gapSec,
              reason: `Replace inflated duplicate with actual gap after "${prev.task}" (${formatDuration(gapSec)})`,
            });
          } else {
            toDelete.push(manual.id);
          }
        } else {
          toDelete.push(manual.id);
        }
      }
    }

    console.log("=== Planned corrections ===\n");
    if (toDelete.length === 0 && toUpdate.length === 0) {
      console.log("No duplicate inflated timer logs found to fix.");
      return;
    }

    for (const id of toDelete) {
      const log = logs.find((l) => l.id === id)!;
      console.log(
        `DELETE  ${log.job_number ?? "?"} | ${log.task} | ${formatDuration(log.duration)} | ${log.created_at}`,
      );
    }
    for (const u of toUpdate) {
      const log = logs.find((l) => l.id === u.id)!;
      console.log(
        `UPDATE  ${log.job_number ?? "?"} | ${log.task} | ${formatDuration(log.duration)} -> ${formatDuration(u.duration)} | ${log.created_at}`,
      );
      console.log(`        ${u.reason}`);
    }

    const beforeTotal = logs.reduce((acc, l) => acc + l.duration, 0);
    const afterTotal =
      logs
        .filter((l) => !toDelete.includes(l.id))
        .reduce((acc, l) => {
          const upd = toUpdate.find((u) => u.id === l.id);
          return acc + (upd ? upd.duration : l.duration);
        }, 0);

    console.log(`\nTotal: ${formatDuration(beforeTotal)} -> ${formatDuration(afterTotal)}`);

    if (!apply) {
      console.log("\nDry run only. Re-run with --apply to commit changes.");
      return;
    }

    for (const id of toDelete) {
      await client.query(`DELETE FROM time_logs WHERE id = $1`, [id]);
    }
    for (const u of toUpdate) {
      await client.query(`UPDATE time_logs SET duration = $2 WHERE id = $1`, [u.id, u.duration]);
    }

    console.log("\nApplied corrections.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
