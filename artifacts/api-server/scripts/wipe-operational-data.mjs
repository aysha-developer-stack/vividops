/**
 * Wipe operational data for client handoff.
 * KEEPS: users, user_settings, system_settings, notification_templates, checklist_templates, sessions
 * REMOVES: jobs, files/attachments, time logs, reworks, errors, notifications, messages, training posts, cliq channels
 *
 * Usage (from artifacts/api-server):
 *   node --env-file=.env ./scripts/wipe-operational-data.mjs
 */
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

let ssl;
try {
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    ssl = { rejectUnauthorized: false };
  }
} catch {
  // ignore
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });

async function count(client, table) {
  try {
    const res = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return res.rows[0]?.n ?? 0;
  } catch {
    return null;
  }
}

async function wipeTable(client, table) {
  try {
    const before = await count(client, table);
    if (before === null) {
      console.log(`  skip ${table} (missing)`);
      return;
    }
    await client.query(`DELETE FROM ${table}`);
    console.log(`  cleared ${table}: ${before} row(s)`);
  } catch (err) {
    console.warn(`  failed ${table}:`, err instanceof Error ? err.message : err);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const usersBefore = await count(client, "users");
    console.log(`Users before wipe: ${usersBefore} (will be kept)`);
    console.log("Wiping operational data…");

    await client.query("BEGIN");

    // Child / dependent tables first
    await wipeTable(client, "job_checklist_attachments");
    await wipeTable(client, "job_checklist_state");
    await wipeTable(client, "job_message_sync");
    await wipeTable(client, "job_messages");
    await wipeTable(client, "error_reports");
    await wipeTable(client, "job_reworks");
    await wipeTable(client, "job_members");
    await wipeTable(client, "job_attachments");
    await wipeTable(client, "job_cliq_channels");
    await wipeTable(client, "notifications");
    await wipeTable(client, "time_logs");
    await wipeTable(client, "post_attachments");
    await wipeTable(client, "posts");
    await wipeTable(client, "password_reset_tokens");
    await wipeTable(client, "api_request_daily");
    await wipeTable(client, "jobs");

    // Reset job serial so new jobs start clean
    try {
      await client.query(`ALTER SEQUENCE IF EXISTS jobs_serial_seq RESTART WITH 1`);
      console.log("  reset jobs_serial_seq → 1");
    } catch (err) {
      console.warn("  could not reset jobs serial:", err instanceof Error ? err.message : err);
    }

    await client.query("COMMIT");

    const usersAfter = await count(client, "users");
    const jobsAfter = await count(client, "jobs");
    console.log("Done.");
    console.log(`Kept users: ${usersAfter}`);
    console.log(`Jobs remaining: ${jobsAfter}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Wipe failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
