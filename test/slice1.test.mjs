import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEMO_EMAIL, openDatabase, upsertDemoUser, getAllEvents, deleteEvent, restoreEvent } from '../src/data/db.mjs';
import { createApp } from '../src/routes/http.mjs';

let temp, db, server, base;
before(async () => {
  temp = mkdtempSync(join(tmpdir(), 'club-events-'));
  db = openDatabase(join(temp, 'test.db'));
  upsertDemoUser(db, 'test-pass-123');
  server = createApp(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db?.close();
  if (temp) rmSync(temp, { recursive: true, force: true });
});

async function login() {
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: 'test-pass-123' }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  return cookie;
}

test('AC-9 redirects anonymous visitors and rejects anonymous API requests', async () => {
  const html = await fetch(`${base}/events`, { redirect: 'manual' });
  assert.equal(html.status, 302);
  assert.equal(html.headers.get('location'), '/login');
  const api = await fetch(`${base}/api/events`);
  assert.equal(api.status, 401);
  assert.ok(!(await api.text()).includes('Web Development Workshop'));
});

test('AC-10 login displays 3 future database events in chronological order', async () => {
  const cookie = await login();
  const page = await fetch(`${base}/events`, { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  const response = await fetch(`${base}/api/events`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const { events } = await response.json();
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => typeof e.title === 'string' && e.date > new Date().toISOString() && e.free_places > 0));
  assert.deepEqual(events.map((e) => e.id), [1, 2, 3]);
  assert.deepEqual(events.map((e) => e.title), getAllEvents(db).map((e) => e.title));
});

test('AC-11 removing a SQLite row removes exactly that event after reload', async () => {
  const cookie = await login();
  const beforeResponse = await fetch(`${base}/api/events`, { headers: { Cookie: cookie } });
  const beforeEvents = (await beforeResponse.json()).events;
  assert.equal(deleteEvent(db, 2), 1);
  try {
    const afterResponse = await fetch(`${base}/api/events`, { headers: { Cookie: cookie } });
    const afterEvents = (await afterResponse.json()).events;
    assert.deepEqual(afterEvents.map((e) => e.id), [1, 3]);
    assert.equal(afterEvents.length, beforeEvents.length - 1);
  } finally {
    restoreEvent(db, 2);
  }
});

test('sign out deletes the session', async () => {
  const cookie = await login();
  const response = await fetch(`${base}/api/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const afterLogout = await fetch(`${base}/api/events`, { headers: { Cookie: cookie } });
  assert.equal(afterLogout.status, 401);
});

test('authentication handles invalid inputs, missing cookies and secure forwarding', async () => {
  const { authenticate, readSessionToken, currentUser, endSession, sessionCookie, clearSessionCookie } = await import('../src/services/auth.mjs');
  assert.equal(authenticate(db, null, 'not-correct'), null);
  assert.equal(authenticate(db, DEMO_EMAIL, null), null);
  assert.equal(authenticate(db, DEMO_EMAIL, 'wrong-password'), null);
  const anonymous = { headers: {}, socket: { encrypted: false } };
  assert.equal(readSessionToken(anonymous), null);
  assert.equal(readSessionToken({ headers: { cookie: 'other=value' } }), null);
  assert.equal(readSessionToken({ headers: { cookie: 'club_session=broken' } }), null);
  assert.equal(currentUser(db, anonymous), null);
  endSession(db, anonymous);
  assert.match(sessionCookie({ headers: {}, socket: { encrypted: true } }, 'test'), /; Secure$/);
  assert.match(clearSessionCookie({ headers: { 'x-forwarded-proto': 'https' }, socket: {} }), /; Secure$/);
  assert.doesNotMatch(sessionCookie(anonymous, 'test'), /; Secure$/);
});
