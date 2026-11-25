import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createApp } from '../src/routes/http.mjs';
import { checkDatabase, openDatabase } from '../src/data/db.mjs';

const exec = promisify(execFile);
const serverFile = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const localEnv = { PATH: process.env.PATH, NODE_ENV: 'development', DB_PATH: ':memory:' };

test('Exercise 4: public health probes PostgreSQL without session lookup and reflects failure and recovery', async (t) => {
  const queries = [];
  let databaseAvailable = true;
  const db = {
    async query(query) {
      queries.push(query);
      if (!databaseAvailable) throw new Error('Private database diagnostic');
    }
  };
  const app = createApp(db).listen(0, '127.0.0.1');
  t.after(() => app.close());
  await once(app, 'listening');

  const response = await fetch(`http://127.0.0.1:${app.address().port}/health`, {
    headers: { Cookie: `club_session=${'a'.repeat(64)}` }
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), { status: 'ok' });

  const url = `http://127.0.0.1:${app.address().port}/health`;
  databaseAvailable = false;
  const unavailable = await fetch(url);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await unavailable.json(), { status: 'unavailable' });

  databaseAvailable = true;
  const recovered = await fetch(url);
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), { status: 'ok' });
  assert.deepEqual(queries, Array.from({ length: 3 }, () => ({
    text: 'SELECT 1', query_timeout: 3000
  })));
});

test('Exercise 4: database probe detects closed SQLite and bounds a stalled PostgreSQL query', async () => {
  const sqlite = openDatabase(':memory:');
  try {
    await checkDatabase(sqlite);
  } finally {
    sqlite.close();
  }
  await assert.rejects(checkDatabase(sqlite), /not open/);
  const stalledPool = { query: () => new Promise(() => {}) };
  await assert.rejects(checkDatabase(stalledPool, 10), /health check timed out/);
});

test('Exercise 4: invalid startup configuration exits with sanitized diagnostics', async () => {
  const cases = [
    [{ PORT: '65536' }, 'PORT must be an integer'],
    [{ PORT: '3e3' }, 'PORT must be an integer'],
    [{ NODE_ENV: 'production' }, 'DATABASE_URL is required'],
    [{ NODE_ENV: 'production', DATABASE_URL: ' ' }, 'DATABASE_URL is required'],
    [{ DATABASE_URL: 'https://example.invalid/synthetic-marker' }, 'must be a PostgreSQL connection URL'],
    [{ DB_PATH: fileURLToPath(new URL('../src/', import.meta.url)) }, 'Database initialization failed']
  ];

  for (const [overrides, message] of cases) {
    await assert.rejects(
      exec(process.execPath, [serverFile], {
        env: { ...localEnv, ...overrides }, timeout: 5000
      }),
      (error) => error.code === 1 && error.stderr.includes(message) &&
        !error.stderr.includes('synthetic-marker') && !error.stdout.includes('listening')
    );
  }
});

test('Exercise 4: server starts on the configured port, serves login securely and stops on SIGTERM', async (t) => {
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve) => reservation.close(resolve));

  const child = spawn(process.execPath, [serverFile], {
    env: { ...localEnv, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: AbortSignal.timeout(10000)
  });
  const closed = once(child, 'close');
  closed.catch(() => {});
  t.after(() => child.kill());
  const [output] = await Promise.race([
    once(child.stdout, 'data'),
    closed.then(([code]) => assert.fail(`Server exited before startup, code ${code}`))
  ]);
  assert.match(String(output), new RegExp(`listening on port ${port}`));

  const base = `http://127.0.0.1:${port}`;
  const login = await fetch(base);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /<title>Sign in \| Club Events<\/title>/);
  assert.equal(login.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(login.headers.get('referrer-policy'), 'no-referrer');
  assert.match(login.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const page = await fetch(`${base}/events`, { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login');
  const api = await fetch(`${base}/api/events`);
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'Sign in first' });

  const unavailable = await fetch(`${base}/.env`);
  assert.equal(unavailable.status, 404);
  assert.deepEqual(await unavailable.json(), { error: 'Not found' });

  const malformedLogin = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null'
  });
  assert.equal(malformedLogin.status, 400);
  assert.deepEqual(await malformedLogin.json(), { error: 'Invalid JSON' });

  const oversizedLogin = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'é'.repeat(4096) })
  });
  assert.equal(oversizedLogin.status, 400);
  assert.deepEqual(await oversizedLogin.json(), { error: 'Invalid JSON' });

  child.kill('SIGTERM');
  assert.deepEqual(await closed, [0, null]);
});
