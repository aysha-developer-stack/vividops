import pg from 'pg';
const { Client } = pg;

async function fix() {
  const client = new Client({
    connectionString: "postgresql://postgres.exqhhyfoibmwtmwlovfi:Opsvivid321$$@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
  });
  try {
    await client.connect();
    
    // Check current state
    const res = await client.query("SELECT email, role, must_reset_password FROM users");
    console.log("Current Users:", JSON.stringify(res.rows, null, 2));

    // Fix all users to not require password reset
    const updateRes = await client.query("UPDATE users SET must_reset_password = false WHERE must_reset_password = true RETURNING email");
    console.log("Updated users (reset set to false):", updateRes.rows.map(r => r.email));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

fix();
