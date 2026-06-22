import { db, sql, pool } from "../../lib/db/src/index";
import "dotenv/config";

async function clearUsers() {
  console.log("🚀 Starting database cleanup...");
  
  try {
    // Truncate the users table and all dependent tables (jobs, sessions, etc.)
    await db.execute(sql`TRUNCATE TABLE users CASCADE`);
    
    console.log("✅ Successfully deleted all users and related data.");
    
    // Check if table is empty
    const result = await db.execute(sql`SELECT count(*) FROM users`);
    console.log(`📊 Current user count: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error("❌ Error clearing users:", error);
  } finally {
    await pool.end();
  }
}

clearUsers();
