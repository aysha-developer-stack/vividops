import { db, users } from "@workspace/db";

async function main() {
  const allUsers = await db.select().from(users);
  console.log("Users in database:", allUsers.length);
  for (const user of allUsers) {
    console.log(`- ${user.name} (${user.role})`);
  }
}

main().catch(console.error).finally(() => process.exit());
