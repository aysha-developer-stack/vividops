import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const jobNumber = process.argv[2]?.trim() || "154760";
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

type PlanDelete = { id: string; reason: string };
type PlanUpdate = {
  id: string;
  duration: number;
  reworkCycleNumber?: number | null;
  reason: string;
};

async function main() {
  const host = new URL(databaseUrl).hostname;
  const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({ connectionString: databaseUrl, ssl });
  await client.connect();

  try {
    const jobRes = await client.query(
      `SELECT id, job_number, title, status, updated_at FROM jobs WHERE job_number = $1 OR serial = $2::int`,
      [jobNumber, jobNumber],
    );
    if (jobRes.rows.length !== 0) {
      // continue
    }
    const job = jobRes.rows[0] as {
      id: string;
      job_number: string;
      title: string;
      status: string;
      updated_at: string;
    } | undefined;
    if (!job) {
      console.error(`Job ${jobNumber} not found`);
      process.exit(1);
    }

    const logsRes = await client.query(
      `SELECT tl.id, tl.task, tl.duration, tl.rework_cycle_number, tl.start_time, tl.created_at
       FROM time_logs tl
       WHERE tl.job_id = $1
       ORDER BY tl.created_at ASC`,
      [job.id],
    );

    const reworksRes = await client.query(
      `SELECT cycle_number, created_at, completed_at, status
       FROM job_reworks
       WHERE job_id = $1
       ORDER BY cycle_number ASC`,
      [job.id],
    );

    const logs = logsRes.rows as Array<{
      id: string;
      task: string;
      duration: number;
      rework_cycle_number: number | null;
      start_time: string;
      created_at: string;
    }>;

    const reworks = reworksRes.rows as Array<{
      cycle_number: number;
      created_at: string;
      completed_at: string | null;
      status: string;
    }>;

    const jobCompletedAt = new Date(job.updated_at);
    const toDelete: PlanDelete[] = [];
    const toUpdate: PlanUpdate[] = [];

    for (const log of logs) {
      const createdAt = new Date(log.created_at);

      // Phantom log after job was completed.
      if (job.status === "completed" && createdAt > jobCompletedAt && log.duration > 3600) {
        toDelete.push({
          id: log.id,
          reason: `Logged ${formatDuration(log.duration)} after job completed on ${jobCompletedAt.toISOString()}`,
        });
        continue;
      }

      // Absurd single-segment duration (> 12h) on an same-day rework job.
      if (log.duration > 12 * 3600) {
        const cycle = log.rework_cycle_number;
        const rework = cycle != null ? reworks.find((r) => r.cycle_number === cycle) : null;
        if (rework?.completed_at) {
          const start = new Date(rework.created_at).getTime();
          const end = new Date(rework.completed_at).getTime();
          const corrected = Math.max(0, Math.floor((end - start) / 1000));
          if (corrected > 0 && corrected < log.duration) {
            toUpdate.push({
              id: log.id,
              duration: corrected,
              reworkCycleNumber: cycle,
              reason: `Replace inflated ${formatDuration(log.duration)} with rework #${cycle} window ${formatDuration(corrected)}`,
            });
            continue;
          }
        }
        toDelete.push({
          id: log.id,
          reason: `Inflated duration ${formatDuration(log.duration)} with no reliable rework window`,
        });
      }
    }

    // Retag short rework-era logs that were saved under the wrong cycle.
    for (const log of logs) {
      if (toDelete.some((d) => d.id === log.id) || toUpdate.some((u) => u.id === log.id)) continue;
      if (log.rework_cycle_number === 3) {
        const createdAt = new Date(log.created_at).getTime();
        const rework2 = reworks.find((r) => r.cycle_number === 2);
        const rework4 = reworks.find((r) => r.cycle_number === 4);
        if (
          rework2 &&
          rework4 &&
          createdAt >= new Date(rework2.created_at).getTime() &&
          createdAt < new Date(rework4.created_at).getTime()
        ) {
          toUpdate.push({
            id: log.id,
            duration: log.duration,
            reworkCycleNumber: 2,
            reason: "Retag fix time from rework #3 to rework #2 (active rework window)",
          });
        }
      }
    }

    console.log(`Job JOB-${job.job_number} — ${job.title} (${job.status})\n`);
    console.log("=== Planned corrections ===\n");

    if (toDelete.length === 0 && toUpdate.length === 0) {
      console.log("Nothing to fix.");
      return;
    }

    for (const d of toDelete) {
      const log = logs.find((l) => l.id === d.id)!;
      console.log(
        `DELETE  ${log.task} | cycle ${log.rework_cycle_number ?? "original"} | ${formatDuration(log.duration)} | ${log.created_at}`,
      );
      console.log(`        ${d.reason}`);
    }

    for (const u of toUpdate) {
      const log = logs.find((l) => l.id === u.id)!;
      const cycleLabel =
        u.reworkCycleNumber === undefined
          ? String(log.rework_cycle_number ?? "original")
          : u.reworkCycleNumber == null
            ? "original"
            : String(u.reworkCycleNumber);
      console.log(
        `UPDATE  ${log.task} | cycle ${log.rework_cycle_number ?? "original"} -> ${cycleLabel} | ${formatDuration(log.duration)} -> ${formatDuration(u.duration)} | ${log.created_at}`,
      );
      console.log(`        ${u.reason}`);
    }

    const beforeTotal = logs.reduce((acc, l) => acc + l.duration, 0);
    const deletedIds = new Set(toDelete.map((d) => d.id));
    const updateById = new Map(toUpdate.map((u) => [u.id, u]));
    const afterTotal = logs
      .filter((l) => !deletedIds.has(l.id))
      .reduce((acc, l) => acc + (updateById.get(l.id)?.duration ?? l.duration), 0);

    console.log(`\nTotal: ${formatDuration(beforeTotal)} -> ${formatDuration(afterTotal)}`);

    if (!apply) {
      console.log("\nDry run only. Re-run with --apply to commit changes.");
      return;
    }

    for (const d of toDelete) {
      await client.query(`DELETE FROM time_logs WHERE id = $1`, [d.id]);
    }
    for (const u of toUpdate) {
      if (u.reworkCycleNumber !== undefined) {
        await client.query(
          `UPDATE time_logs SET duration = $2, rework_cycle_number = $3 WHERE id = $1`,
          [u.id, u.duration, u.reworkCycleNumber],
        );
      } else {
        await client.query(`UPDATE time_logs SET duration = $2 WHERE id = $1`, [u.id, u.duration]);
      }
    }

    const timerCleanup = await client.query(
      `DELETE FROM active_timer_sessions WHERE job_id = $1 RETURNING id`,
      [job.id],
    );
    if (timerCleanup.rowCount && timerCleanup.rowCount > 0) {
      console.log(`\nCleared ${timerCleanup.rowCount} stale active timer session(s) for this job.`);
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
