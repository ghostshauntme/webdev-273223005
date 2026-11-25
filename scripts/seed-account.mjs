import { DEMO_EMAIL, closeDatabase, openApplicationDatabase, upsertDemoUser } from '../src/data/db.mjs';

if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 8) {
  console.error('Set SEED_PASSWORD to your own password of at least eight characters before npm run setup.');
  process.exit(1);
}
const db = await openApplicationDatabase();
try {
  const result = await upsertDemoUser(db, process.env.SEED_PASSWORD);
  console.log(result.created ? 'Created local member.' : 'Member already exists; existing password was not changed.');
  console.log(`Login email: ${DEMO_EMAIL}`);
  console.log('Three upcoming events are stored in the events table.');
} finally {
  await closeDatabase(db);
}
