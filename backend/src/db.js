import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

// The only file that knows which database is in use. Everything else calls query().
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const query = (sql, params) => pool.query(sql, params);

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const LOCK = 7265; // any fixed number: stops two starting backends migrating at once

// Applies each .sql file in migrations/ once, in name order, each in its own transaction.
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const name of (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(name)) continue;
      const sql = await readFile(new URL(name, MIGRATIONS), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`Applied migration ${name}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${name} failed: ${e.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK]);
    client.release();
  }
}
