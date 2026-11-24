
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import {
  openDatabase,
  hashPassword,
  countRegistrations,
  findRegistration
} from '../src/data/db.mjs';

import { createApp } from '../src/routes/http.mjs';

async function setup(t) {
  const db = openDatabase(':memory:');

  const password = hashPassword('test-password');

  const addUser = db.prepare(
    'INSERT INTO users(email,password_hash,role) VALUES(?,?,?)'
  );

  addUser.run('first@example.test', password, 'member');
  addUser.run('second@example.test', password, 'member');

  db.prepare(
    'UPDATE events SET capacity=1 WHERE id=1'
  ).run();

  const server = createApp(db);

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });

  async function login(email) {
    const response = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password: 'test-password'
      })
    });

    assert.equal(response.status, 200);

    return response.headers.get('set-cookie').split(';')[0];
  }

  async function request(path, method, cookie) {
    return fetch(`${base}${path}`, {
      method,
      headers: cookie ? { Cookie: cookie } : {}
    });
  }

  return { db, login, request };
}

test('AC-2 API creates registration with HTTP 201', async (t) => {
  const { db, login, request } = await setup(t);
  const cookie = await login('first@example.test');

  const response = await request(
    '/api/events/1/register', 'POST', cookie
  );

  assert.equal(response.status, 201);

  const body = await response.json();

  assert.equal(body.registration.event_id, 1);
  assert.equal(body.registration.user_id, 1);
  assert.ok(findRegistration(db, 1, 1));
});

test('AC-3 API rejects full event with HTTP 409', async (t) => {
  const { db, login, request } = await setup(t);

  const first = await login('first@example.test');
  const second = await login('second@example.test');

  const created = await request(
    '/api/events/1/register', 'POST', first
  );

  assert.equal(created.status, 201);

  const response = await request(
    '/api/events/1/register', 'POST', second
  );

  assert.equal(response.status, 409);

  const body = await response.json();

  assert.equal(body.error, 'This event is full');
  assert.equal(countRegistrations(db, 1), 1);
  assert.equal(findRegistration(db, 2, 1), undefined);
});

test('AC-4 API rejects cancelling another users registration', async (t) => {
  const { db, login, request } = await setup(t);

  const first = await login('first@example.test');
  const second = await login('second@example.test');

  const created = await request(
    '/api/events/1/register', 'POST', first
  );

  assert.equal(created.status, 201);

  const response = await request(
    '/api/events/1/register', 'DELETE', second
  );

  assert.equal(response.status, 403);
  assert.ok(findRegistration(db, 1, 1));
});

test('AC-4 API cancels own registration and frees a place', async (t) => {
  const { db, login, request } = await setup(t);
  const cookie = await login('first@example.test');

  const created = await request(
    '/api/events/1/register', 'POST', cookie
  );

  assert.equal(created.status, 201);

  const response = await request(
    '/api/events/1/register', 'DELETE', cookie
  );

  assert.equal(response.status, 200);
  assert.equal(countRegistrations(db, 1), 0);

  const eventsResponse = await request(
    '/api/events', 'GET', cookie
  );

  assert.equal(eventsResponse.status, 200);

  const body = await eventsResponse.json();
  const event = body.events.find(e => e.id === 1);

  assert.equal(event.free_places, 1);
});

test('AC-9 registration API requires authentication', async (t) => {
  const { request } = await setup(t);

  for (const method of ['POST', 'DELETE']) {
    const response = await request(
      '/api/events/1/register', method
    );

    assert.equal(response.status, 401);
  }

  const response = await request(
    '/api/registrations', 'GET'
  );

  assert.equal(response.status, 401);
});

test('Registration API returns only current users registrations', async (t) => {
  const { login, request } = await setup(t);

  const first = await login('first@example.test');
  const second = await login('second@example.test');

  const firstCreated = await request(
    '/api/events/1/register', 'POST', first
  );

  const secondCreated = await request(
    '/api/events/2/register', 'POST', second
  );

  assert.equal(firstCreated.status, 201);
  assert.equal(secondCreated.status, 201);

  const response = await request(
    '/api/registrations', 'GET', first
  );

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.registrations.length, 1);
  assert.equal(body.registrations[0].event_id, 1);
});
