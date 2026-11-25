import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countRegistrations,
  findRegistration,
  insertRegistration,
  openDatabase,
  withTransaction
} from '../src/data/db.mjs';
import { registerForEvent } from '../src/services/registrations.mjs';
import { resolveGoogleUser } from '../src/services/google-auth.mjs';

function setup(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());

  const insert = db.prepare(
    "INSERT INTO users(email,password_hash,role) VALUES(?,'unused','member') RETURNING id,email,role"
  );
  const users = [insert.get('first@example.test'), insert.get('second@example.test')];
  db.prepare('UPDATE events SET capacity=1 WHERE id=1').run();
  return { db, users };
}

test('AC-3 simultaneous registrations yield exactly one place', async t => {
  const { db, users } = setup(t);
  const results = await Promise.allSettled(
    users.map(user => registerForEvent(db, user.id, 1))
  );

  const accepted = results.filter(result => result.status === 'fulfilled');
  const denied = results.filter(result => result.status === 'rejected');
  assert.equal(accepted.length, 1);
  assert.equal(denied.length, 1);
  assert.equal(denied[0].reason.status, 409);
  assert.equal(denied[0].reason.message, 'This event is full');
  assert.equal(await countRegistrations(db, 1), 1);
  assert.ok(await findRegistration(db, accepted[0].value.user_id, 1));
});

test('AC-2 rollback hides pending writes and allows a waiting registration', async t => {
  const { db, users: [first, second] } = setup(t);
  const inserted = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const failure = new Error('force rollback');
  const aborted = withTransaction(db, async tx => {
    await insertRegistration(tx, first.id, 1);
    inserted.resolve();
    await resume.promise;
    throw failure;
  });

  const checkedRollback = assert.rejects(aborted, error => error === failure);
  await Promise.race([inserted.promise, aborted]);

  const read = findRegistration(db, first.id, 1);
  const waiting = registerForEvent(db, second.id, 1);
  resume.resolve();

  const [, rolledBack, committed] = await Promise.all([checkedRollback, read, waiting]);
  assert.equal(rolledBack, undefined);
  assert.equal(committed.user_id, second.id);
  assert.equal(await countRegistrations(db, 1), 1);
});

test('AC-6 concurrent confirmation links the same Google identity once', async t => {
  const { db, users: [user] } = setup(t);
  const profile = { sub: 'test-subject', email: user.email, email_verified: true };
  const accounts = await Promise.all([
    resolveGoogleUser(db, profile, user, true),
    resolveGoogleUser(db, profile, user, true)
  ]);
  assert.deepEqual(accounts.map(account => account.id), [user.id, user.id]);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM google_accounts').get().total, 1);
});

test('AC-3 PostgreSQL reserves a place using one locked transaction client', async () => {
  const statements = [];
  const event = { id: 1, capacity: 1, start_at: '2099-01-01T00:00:00.000Z' };
  const registration = { user_id: 2, event_id: 1 };
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: 1 }] };
      if (sql.includes('FROM events')) return { rows: [event] };
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
      if (sql.startsWith('SELECT *')) return { rows: [] };
      if (sql.startsWith('INSERT INTO registrations')) return { rows: [registration] };
      return { rows: [] };
    },
    release() {
      statements.push('release');
    }
  };
  const pool = {
    async connect() {
      return client;
    },
    query() {
      assert.fail('Transaction statements must use the checked-out client');
    }
  };

  assert.deepEqual(await registerForEvent(pool, 2, 1), registration);
  assert.equal(statements.length, 8);
  assert.match(statements[0], /^BEGIN.*READ COMMITTED$/);
  assert.match(statements[1], /FOR UPDATE$/);
  assert.match(statements[4], /COUNT\(\*\)/);
  assert.match(statements[5], /^INSERT INTO registrations/);
  assert.deepEqual(statements.slice(-2), ['COMMIT', 'release']);
});

test('PostgreSQL discards a client when rollback fails and retains the original error', async () => {
  const failure = new Error('transaction failed');
  const rollbackFailure = new Error('connection failed');
  const statements = [];
  let releasedWith;
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql === 'ROLLBACK') throw rollbackFailure;
    },
    release(error) {
      releasedWith = error;
    }
  };
  const pool = { query() {}, async connect() { return client; } };

  await assert.rejects(withTransaction(pool, async tx => {
    assert.equal(tx, client);
    throw failure;
  }), error => error === failure);
  assert.deepEqual(statements, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK']);
  assert.equal(releasedWith, rollbackFailure);
});
