import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  openDatabase,
  upsertDemoUser
} from '../src/data/db.mjs';
import { createApp } from '../src/routes/http.mjs';

test('AC-6 OAuth HTTP security checks', async t => {
  const db = openDatabase(':memory:');
  upsertDemoUser(db, 'test-password');

  const config = {
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'fake-secret',
    GOOGLE_REDIRECT_URI:
      'http://localhost:3000/auth/google/callback'
  };

  for (const [key, value] of Object.entries(config)) {
    const previous = process.env[key];
    process.env[key] = value;

    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });

  const base = `http://127.0.0.1:${server.address().port}`;

  const invalid = await fetch(
    `${base}/auth/google/callback?state=invalid&code=fake`,
    { redirect: 'manual' }
  );
  assert.equal(invalid.status, 400);

  const anonymous = await fetch(
    `${base}/auth/google/start?link=1`,
    { redirect: 'manual' }
  );
  assert.equal(anonymous.status, 401);

  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'student@example.test',
      password: 'test-password'
    })
  });

  assert.equal(login.status, 200);

  const cookie = login.headers.get('set-cookie').split(';')[0];

  const unconfirmed = await fetch(
    `${base}/auth/google/start?link=1`,
    { headers: { Cookie: cookie }, redirect: 'manual' }
  );
  assert.equal(unconfirmed.status, 405);

  const wrongPassword = await fetch(
    `${base}/auth/google/start?link=1`,
    {
      method: 'POST',
      headers: { Cookie: cookie },
      body: new URLSearchParams({ password: 'wrong-password' }),
      redirect: 'manual'
    }
  );
  assert.equal(wrongPassword.status, 403);

  const confirmed = await fetch(
    `${base}/auth/google/start?link=1`,
    {
      method: 'POST',
      headers: { Cookie: cookie },
      body: new URLSearchParams({ password: 'test-password' }),
      redirect: 'manual'
    }
  );
  assert.equal(confirmed.status, 302);

  const location = new URL(confirmed.headers.get('location'));
  assert.equal(location.hostname, 'accounts.google.com');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');

  const noBrowserCookie = await fetch(
    `${base}/auth/google/callback?state=${location.searchParams.get('state')}&code=fake`,
    { headers: { Cookie: cookie }, redirect: 'manual' }
  );
  assert.equal(noBrowserCookie.status, 400);
});
