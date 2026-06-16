import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Checking tables...");
  // Basic check to see if we can connect and see tables
  const result = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log("Existing tables:", result.rows.map((r: any) => r.table_name));
}

main().catch(console.error).finally(() => process.exit());
