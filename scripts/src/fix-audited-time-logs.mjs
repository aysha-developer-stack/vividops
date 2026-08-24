import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

function fmt(s) {
  s = Math.floor(Number(s));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

/** Confirmed fixes from full audit */
const DURATION_FIXES = [
  { id: "dc2a8de0-3cf5-4731-96ba-f13cff2e7262", newDuration: 756, note: "Haseeb JOB-154776 double-count" },
  { id: "cb94092c-ed1a-4a3b-ab86-a9980f5dcaf0", newDuration: 711, note: "Farjan JOB-154766 PLANS READING double-count" },
];

/** Exact duplicate saves — remove the later row */
const DELETE_IDS = [
  { id: "1250b29b-b394-43e0-a847-7a6848d55e9e", note: "Muhammad Adnan duplicate footing log" },
  { id: "ff110aa6-6e8c-4ec8-b83c-0f3f7634a26e", note: "M. Ammar Butt duplicate CHNAGES log" },
];

const host = new URL(process.env.DATABASE_URL).hostname;
const ssl = host !== "localhost" && host !== "127.0.0.1" ? { rejectUnauthorized: false } : undefined;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });
await client.connect();

try {
  await client.query("BEGIN");

  for (const fix of DURATION_FIXES) {
    const before = await client.query("SELECT duration, task FROM time_logs WHERE id = $1", [fix.id]);
    if (before.rows.length === 0) {
      console.log("SKIP missing", fix.id);
      continue;
    }
    await client.query("UPDATE time_logs SET duration = $1 WHERE id = $2", [fix.newDuration, fix.id]);
    console.log(
      `FIX ${fix.note}: ${fmt(before.rows[0].duration)} -> ${fmt(fix.newDuration)} (${fix.id.slice(0, 8)})`,
    );
  }

  for (const del of DELETE_IDS) {
    const row = await client.query(
      "SELECT duration, task FROM time_logs WHERE id = $1",
      [del.id],
    );
    if (row.rows.length === 0) {
      console.log("SKIP missing", del.id);
      continue;
    }
    await client.query("DELETE FROM time_logs WHERE id = $1", [del.id]);
    console.log(`DELETE ${del.note}: ${fmt(row.rows[0].duration)} ${row.rows[0].task} (${del.id.slice(0, 8)})`);
  }

  await client.query("COMMIT");
  console.log("\nDone. Updated user totals:");

  const totals = await client.query(`
    SELECT u.name, coalesce(sum(tl.duration), 0)::int AS s, count(*)::int AS c
    FROM users u
    LEFT JOIN time_logs tl ON tl.user_id = u.id
    GROUP BY u.name
    HAVING coalesce(sum(tl.duration), 0) > 0
    ORDER BY s DESC
  `);
  for (const r of totals.rows) {
    console.log(`  ${r.name}: ${fmt(r.s)} (${r.c} logs)`);
  }
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
