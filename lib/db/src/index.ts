import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type PoolConfig } from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

let ssl: PoolConfig["ssl"] | undefined;
try {
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    ssl = { rejectUnauthorized: false };
  }
} catch {
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
export const db = drizzle(pool, { schema });

export * from "drizzle-orm";
export * from "./schema";
