import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const directory = resolve("packages/db/migrations");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const name of (await readdir(directory)).filter(file => file.endsWith(".sql")).sort()) {
    if ((await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name])).rowCount) continue;
    const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query(await readFile(resolve(directory, name), "utf8")); await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]); await client.query("COMMIT"); }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
} finally { await pool.end(); }
