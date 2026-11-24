import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  openDatabase,
  hashPassword,
  upsertDemoUser
} from '../src/data/db.mjs';
import { createApp } from '../src/routes/http.mjs';

test('AC-7 poster API fallback and manual event creation', async t => {
  const db = openDatabase(':memory:');

  upsertDemoUser(db, 'test-password');

  db.prepare(
    'INSERT INTO users(email,password_hash,role) VALUES(?,?,?)'
  ).run(
    'organizer@example.test',
    hashPassword('test-password'),
    'organizer'
  );

  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  t.after(() => {
    if (previousKey !== undefined) {
      process.env.GEMINI_API_KEY = previousKey;
    }
  });

  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });

  const base = `http://127.0.0.1:${server.address().port}`;

  async function post(path, body, cookie = '') {
    return fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify(body)
    });
  }

  async function login(email) {
    const response = await post('/api/login', {
      email,
      password: 'test-password'
    });

    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }

  const member = await login('student@example.test');
  const organizer = await login('organizer@example.test');

  const poster = {
    image: 'ZmFrZS1pbWFnZQ==',
    mimeType: 'image/png'
  };

  assert.equal(
    (await post('/api/poster/suggest', poster)).status,
    401
  );

  assert.equal(
    (await post('/api/poster/suggest', poster, member)).status,
    403
  );

  const count = () => db.prepare(
    'SELECT COUNT(*) AS total FROM events'
  ).get().total;

  const before = count();

  const response = await post(
    '/api/poster/suggest', poster, organizer
  );

  assert.equal(response.status, 200);

  const result = await response.json();

  assert.equal(result.ok, false);
  assert.equal(
    result.message,
    'Automatic suggestions unavailable; enter event details manually.'
  );

  assert.equal(count(), before);

  const created = await post('/api/events', {
    title: 'Manual Workshop',
    date: new Date(Date.now() + 86400000).toISOString(),
    capacity: 20,
    location: 'Room 101'
  }, organizer);

  assert.equal(created.status, 201);
  assert.equal(count(), before + 1);

  const data = await created.json();

  assert.equal(data.event.location, 'Room 101');

  const stored = db.prepare(
    'SELECT location FROM events WHERE id=?'
  ).get(data.event.id);

  assert.equal(stored.location, 'Room 101');
});
