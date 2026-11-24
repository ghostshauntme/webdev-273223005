import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, hashPassword, getAllEvents } from '../src/data/db.mjs';
import { createApp } from '../src/routes/http.mjs';

test('AC-5 organizer creates event and member receives 403', async t => {
  const db = openDatabase(':memory:');

  const add = db.prepare(
    'INSERT INTO users(email,password_hash,role) VALUES(?,?,?)'
  );

  const password = hashPassword('test-password');

  add.run('organizer@example.test', password, 'organizer');
  add.run('member@example.test', password, 'member');

  const server = createApp(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });

  const base = `http://127.0.0.1:${server.address().port}`;

  async function login(email) {
    const response = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'test-password'
      })
    });

    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }

  const organizer = await login('organizer@example.test');
  const member = await login('member@example.test');

  const event = {
    title: 'New Coding Workshop',
    date: new Date(Date.now() + 86400000).toISOString(),
    capacity: 25
  };

  async function create(cookie, payload) {
    return fetch(`${base}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: JSON.stringify(payload)
    });
  }

  const before = getAllEvents(db).length;

  const denied = await create(member, event);
  assert.equal(denied.status, 403);
  assert.equal(getAllEvents(db).length, before);

  const invalid = await create(organizer, {
    ...event, capacity: 0
  });
  assert.equal(invalid.status, 400);
  assert.equal(getAllEvents(db).length, before);

  const created = await create(organizer, event);
  assert.equal(created.status, 201);

  const body = await created.json();
  assert.equal(body.event.title, event.title);
  assert.equal(body.event.capacity, 25);
  assert.equal(getAllEvents(db).length, before + 1);
});
