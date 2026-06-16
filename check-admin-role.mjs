import pg from 'pg';
const { Client } = pg;

async function check() {
  const client = new Client({
    connectionString: "postgresql://postgres.exqhhyfoibmwtmwlovfi:Opsvivid321$$@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
  });
  try {
    await client.connect();
    const res = await client.query("SELECT email, role FROM users WHERE email = 'admin@gmail.com'");
    console.log("Admin User:", res.rows[0]);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

check();
