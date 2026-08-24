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
  const s = Math.max(0, Math.floor(Number(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

const host = new URL(databaseUrl).hostname;
const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
const client = new pg.Client({ connectionString: databaseUrl, ssl });
await client.connect();

try {
  const logs = await client.query(`
    SELECT
      tl.id,
      tl.user_id,
      tl.job_id,
      tl.task,
      tl.duration,
      tl.created_at,
      u.name AS user_name,
      j.job_number
    FROM time_logs tl
    JOIN users u ON u.id = tl.user_id
    LEFT JOIN jobs j ON j.id = tl.job_id
    ORDER BY tl.user_id, tl.job_id, lower(trim(tl.task)), tl.created_at ASC
  `);

  /** Same user + job + normalized task: later log duration ≈ prior cumulative + gap */
  const cumulativeDuplicates = [];
  /** Same user + job + task within 48h where later duration > earlier (possible double count) */
  const suspiciousPairs = [];
  /** Absurd single entries (>16h on one save — worth review) */
  const veryLongSingle = [];
  /** Exact duplicate: same user/job/task/duration within 5 minutes */
  const exactNearDupes = [];

  const byGroup = new Map();
  for (const row of logs.rows) {
    const taskKey = String(row.task ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const groupKey = `${row.user_id}|${row.job_id ?? "null"}|${taskKey}`;
    if (!byGroup.has(groupKey)) byGroup.set(groupKey, []);
    byGroup.get(groupKey).push(row);
  }

  for (const [, group] of byGroup) {
    let runningSum = 0;
    for (let i = 0; i < group.length; i++) {
      const row = group[i];
      const dur = Number(row.duration);
      const createdMs = new Date(row.created_at).getTime();

      if (dur >= 16 * 3600) {
        veryLongSingle.push({
          id: row.id,
          user: row.user_name,
          job: row.job_number ? `JOB-${row.job_number}` : "—",
          task: row.task,
          duration: fmt(dur),
          durationSec: dur,
          created_at: row.created_at,
        });
      }

      if (i > 0) {
        const prev = group[i - 1];
        const prevDur = Number(prev.duration);
        const prevCreatedMs = new Date(prev.created_at).getTime();
        const gapSec = Math.max(0, Math.floor((createdMs - prevCreatedMs) / 1000));
        runningSum += prevDur;

        // Classic bug: this log's duration ≈ all prior time on this task + wall gap since last save
        const expectedIfCumulative = runningSum + gapSec;
        const diffFromCumulative = Math.abs(dur - expectedIfCumulative);
        const tolerance = Math.max(120, Math.floor(gapSec * 0.05));

        if (
          dur > prevDur &&
          gapSec > 0 &&
          gapSec < 48 * 3600 &&
          diffFromCumulative <= tolerance &&
          dur > gapSec + prevDur * 0.8
        ) {
          cumulativeDuplicates.push({
            user: row.user_name,
            job: row.job_number ? `JOB-${row.job_number}` : "—",
            task: row.task,
            prevLogId: prev.id,
            prevDuration: fmt(prevDur),
            prevAt: prev.created_at,
            logId: row.id,
            badDuration: fmt(dur),
            badDurationSec: dur,
            suggestedDuration: fmt(gapSec),
            suggestedDurationSec: gapSec,
            overcountSec: dur - gapSec,
            created_at: row.created_at,
          });
        }

        // Softer signal: later log much longer than gap between saves
        if (gapSec >= 300 && dur > gapSec + 3600 && dur >= prevDur * 0.9) {
          suspiciousPairs.push({
            user: row.user_name,
            job: row.job_number ? `JOB-${row.job_number}` : "—",
            task: row.task,
            logId: row.id,
            duration: fmt(dur),
            durationSec: dur,
            prevDuration: fmt(prevDur),
            gap: fmt(gapSec),
            gapSec,
            created_at: row.created_at,
          });
        }

        if (
          Math.abs(dur - prevDur) <= 5 &&
          Math.abs(createdMs - prevCreatedMs) <= 5 * 60 * 1000
        ) {
          exactNearDupes.push({
            user: row.user_name,
            job: row.job_number ? `JOB-${row.job_number}` : "—",
            task: row.task,
            id1: prev.id,
            id2: row.id,
            duration: fmt(dur),
            created_at: row.created_at,
          });
        }
      }
    }
  }

  // Per-user totals sanity: jobs where sum of logs seems high vs max single session patterns
  const userTotals = await client.query(`
    SELECT u.name, count(*)::int AS logs, coalesce(sum(tl.duration), 0)::bigint AS total_sec
    FROM time_logs tl
    JOIN users u ON u.id = tl.user_id
    GROUP BY u.name
    ORDER BY total_sec DESC
  `);

  console.log("=== USER TOTALS ===");
  for (const r of userTotals.rows) {
    console.log(`${r.name}: ${fmt(r.total_sec)} (${r.logs} logs)`);
  }

  console.log("\n=== CUMULATIVE DOUBLE-COUNT (high confidence) ===");
  console.log(`Found: ${cumulativeDuplicates.length}`);
  for (const r of cumulativeDuplicates) {
    console.log(JSON.stringify(r));
  }

  console.log("\n=== SUSPICIOUS PAIRS (review) ===");
  console.log(`Found: ${suspiciousPairs.length}`);
  for (const r of suspiciousPairs.slice(0, 30)) {
    console.log(JSON.stringify(r));
  }
  if (suspiciousPairs.length > 30) {
    console.log(`... and ${suspiciousPairs.length - 30} more`);
  }

  console.log("\n=== VERY LONG SINGLE LOGS (>16h) ===");
  console.log(`Found: ${veryLongSingle.length}`);
  for (const r of veryLongSingle) {
    console.log(JSON.stringify(r));
  }

  console.log("\n=== NEAR DUPLICATE LOGS (same duration within 5 min) ===");
  console.log(`Found: ${exactNearDupes.length}`);
  for (const r of exactNearDupes) {
    console.log(JSON.stringify(r));
  }

  const fixable = cumulativeDuplicates.filter(
    (r) => r.suggestedDurationSec > 0 && r.overcountSec > 300,
  );
  console.log("\n=== AUTO-FIX CANDIDATES ===");
  console.log(`Count: ${fixable.length}`);
  for (const r of fixable) {
    console.log(
      `${r.user} | ${r.job} | ${r.task} | ${r.logId.slice(0, 8)}… ${r.badDuration} -> ${r.suggestedDuration} (remove ${fmt(r.overcountSec)})`,
    );
  }
} finally {
  await client.end();
}
