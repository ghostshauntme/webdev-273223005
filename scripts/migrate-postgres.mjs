import {
  openPostgres,
  migratePostgres
} from '../src/data/postgres.mjs';

const pool = openPostgres();

try {
  await migratePostgres(pool);
  console.log('PostgreSQL migration completed');
} finally {
  await pool.end();
}
