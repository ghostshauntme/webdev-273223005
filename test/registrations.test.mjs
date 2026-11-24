
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openDatabase,
  hashPassword,
  findRegistration,
  countRegistrations,
  getUpcomingEvents
} from '../src/data/db.mjs';

import {
  registerForEvent,
  cancelRegistration
} from '../src/services/registrations.mjs';

function setup(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());

  const password = hashPassword('test-password');

  const insertUser = db.prepare(
    'INSERT INTO users(email,password_hash,role) VALUES(?,?,?)'
  );

  insertUser.run('first@example.test', password, 'member');
  insertUser.run('second@example.test', password, 'member');

  db.prepare(
    'UPDATE events SET capacity=1 WHERE id=1'
  ).run();

  return db;
}

test('AC-2 successfully reserves an available place', (t) => {
  const db = setup(t);

  const result = registerForEvent(db, 1, 1);

  assert.equal(result.user_id, 1);
  assert.equal(result.event_id, 1);
  assert.ok(result.created_at);
  assert.ok(findRegistration(db, 1, 1));
  assert.equal(countRegistrations(db, 1), 1);
});

test('AC-3 rejects registration when event is full', (t) => {
  const db = setup(t);

  registerForEvent(db, 1, 1);

  assert.throws(
    () => registerForEvent(db, 2, 1),
    {
      message: 'This event is full',
      status: 409
    }
  );

  assert.equal(countRegistrations(db, 1), 1);
  assert.equal(findRegistration(db, 2, 1), undefined);
});

test('AC-4 cancelling own registration frees a place', (t) => {
  const db = setup(t);

  registerForEvent(db, 1, 1);
  registerForEvent(db, 2, 2);

  const result = cancelRegistration(db, 1, 1);

  assert.equal(result.cancelled, true);
  assert.equal(countRegistrations(db, 1), 0);
  assert.ok(findRegistration(db, 2, 2));

  const event = getUpcomingEvents(db).find(e => e.id === 1);

  assert.equal(event.free_places, 1);
});

test('AC-4 rejects cancelling another users registration', (t) => {
  const db = setup(t);

  registerForEvent(db, 1, 1);

  assert.throws(
    () => cancelRegistration(db, 2, 1),
    { status: 403 }
  );

  assert.ok(findRegistration(db, 1, 1));
  assert.equal(countRegistrations(db, 1), 1);
});

test('Duplicate registration is rejected', (t) => {
  const db = setup(t);

  registerForEvent(db, 1, 1);

  assert.throws(
    () => registerForEvent(db, 1, 1),
    {
      message: 'Already registered',
      status: 409
    }
  );

  assert.equal(countRegistrations(db, 1), 1);
});
