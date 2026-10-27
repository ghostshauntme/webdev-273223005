import { openDatabase } from './data/db.mjs';
import { createApp } from './routes/http.mjs';

const db = openDatabase();
const port = Number(process.env.PORT || 3000);
const server = createApp(db);
server.listen(port, '0.0.0.0', () => {
  console.log(`Club Events listening on http://localhost:${port}`);
  console.log('Sign in with student@example.test and the password chosen during npm run setup.');
});
const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
