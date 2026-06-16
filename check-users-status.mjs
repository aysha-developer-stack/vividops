import pg from 'pg';
const { Client } = pg;

async function check() {
  const client = new Client({
    connectionString: "postgresql://postgres.exqhhyfoibmwtmwlovfi:Opsvivid321$$@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
  });
  try {
    await client.connect();
    const res = await client.query("SELECT email, role, \"mustResetPassword\" FROM users");
    console.log("Users in DB:", JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

check();
