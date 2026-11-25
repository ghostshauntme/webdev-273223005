import pg from 'pg';
import { readFileSync } from 'node:fs';

export function openPostgres(
  connectionString = process.env.DATABASE_URL
) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  return new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
    max: 5
  });
}

export async function migratePostgres(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(273223005)');

    const sql = readFileSync(
      new URL('./postgres/001_initial.sql', import.meta.url),
      'utf8'
    );

    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
