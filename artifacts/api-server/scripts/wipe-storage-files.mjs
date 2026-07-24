/**
 * Best-effort wipe of Supabase storage objects used by the app.
 * Does not touch users. Safe to run after wipe-operational-data.mjs.
 *
 * Usage:
 *   node --env-file=.env ./scripts/wipe-storage-files.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "vivid-ops-files";

if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(url, key);

async function listAll(prefix = "") {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  });
  if (error) throw error;
  const files = [];
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    // folders have id null and no metadata in some responses
    if (item.id == null && !item.metadata) {
      const nested = await listAll(path);
      files.push(...nested);
    } else {
      files.push(path);
    }
  }
  return files;
}

async function main() {
  console.log(`Listing objects in bucket "${bucket}"…`);
  let files = [];
  try {
    files = await listAll("");
  } catch (err) {
    console.error("List failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(`Found ${files.length} object(s)`);
  if (files.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const chunkSize = 50;
  let deleted = 0;
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      console.warn("Chunk delete warning:", error.message);
    } else {
      deleted += chunk.length;
      console.log(`  deleted ${deleted}/${files.length}`);
    }
  }
  console.log("Storage wipe complete.");
}

await main();
