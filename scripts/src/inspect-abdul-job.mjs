import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const job = await client.query(
  `SELECT j.id, j.job_number, j.title, j.status, u.name AS assignee
   FROM jobs j LEFT JOIN users u ON u.id = j.assignee_id WHERE j.job_number = '154774'`,
);
console.log("JOB", job.rows[0]);

const members = await client.query(
  `SELECT u.name FROM job_members jm JOIN users u ON u.id = jm.user_id WHERE jm.job_id = $1`,
  [job.rows[0]?.id],
);
console.log("MEMBERS", members.rows);

const log = await client.query(
  `SELECT tl.*, u.name FROM time_logs tl JOIN users u ON u.id = tl.user_id WHERE tl.id = '4bb157bb-6ec9-425e-9008-b4c3c4a9e466'`,
);
console.log("LOG", log.rows[0]);

await client.end();
