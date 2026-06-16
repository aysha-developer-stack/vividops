import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const tables = ["users", "posts", "notifications", "time_logs"];
  console.log("Verifying tables...");
  
  const result = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  const existingTables = result.rows.map((r: any) => r.table_name);
  
  for (const table of tables) {
    if (existingTables.includes(table)) {
      console.log(`✅ Table '${table}' exists.`);
    } else {
      console.log(`❌ Table '${table}' is MISSING.`);
    }
  }
}

main().catch(console.error).finally(() => process.exit());
