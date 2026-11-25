import { once } from 'node:events';
import { closeDatabase, openApplicationDatabase } from './data/db.mjs';
import { createApp } from './routes/http.mjs';

const portValue = process.env.PORT ?? '3000';
const port = Number(portValue);
const databaseUrl = process.env.DATABASE_URL;

async function start() {
  if (!/^\d+$/.test(portValue) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }

  if (process.env.NODE_ENV === 'production' && !databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is required in production.');
  }

  if (databaseUrl) {
    const url = URL.canParse(databaseUrl) && new URL(databaseUrl);
    if (!url || !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
    }
  }

  let db;
  try {
    db = await openApplicationDatabase();
  } catch {
    throw new Error('Database initialization failed. Check database availability and configuration.');
  }

  try {
    const server = createApp(db);
    server.listen(port, '0.0.0.0');
    await once(server, 'listening');
    console.log(`Club Events listening on port ${port}`);
    return { db, server };
  } catch {
    try {
      await closeDatabase(db);
    } catch {
      console.error('Could not close the database after startup failed.');
    }
    throw new Error('Could not start the HTTP listener. Check that PORT is available.');
  }
}

try {
  const { db, server } = await start();
  registerShutdown(db, server);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function registerShutdown(db, server) {
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;

    server.close(async (error) => {
      try {
        await closeDatabase(db);
        if (error) throw error;
      } catch {
        console.error('Could not shut down Club Events cleanly.');
        process.exitCode = 1;
      }
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
