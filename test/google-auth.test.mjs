import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openDatabase,
  upsertDemoUser,
  findUserByEmail
} from '../src/data/db.mjs';
import {
  resolveGoogleUser
} from '../src/services/google-auth.mjs';

function setup(t) {
  const db = openDatabase(':memory:');
  upsertDemoUser(db, 'test-password');

  t.after(() => db.close());

  const user = findUserByEmail(db, 'student@example.test');

  const profile = {
    sub: 'google-test-123',
    email: 'student@example.test',
    email_verified: true
  };

  return { db, user, profile };
}

test('AC-6 verified Google account links to existing user', async t => {
  const { db, user, profile } = setup(t);

  const linked = await resolveGoogleUser(db, profile, user, true);
  assert.equal(linked.id, user.id);

  const signedIn = await resolveGoogleUser(db, profile);
  assert.equal(signedIn.id, user.id);

  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM users').get().total,
    1
  );
});

test('AC-6 unverified Google identity is rejected', async t => {
  const { db, user, profile } = setup(t);

  await assert.rejects(() => resolveGoogleUser(
    db,
    { ...profile, email_verified: false },
    user,
    true
  ), /not verified/);
});

test('AC-6 linking requires explicit confirmation', async t => {
  const { db, user, profile } = setup(t);

  await assert.rejects(() => resolveGoogleUser(
    db, profile, user, false
  ), /requires confirmation/);

  await assert.rejects(() => resolveGoogleUser(
    db, profile
  ), /requires confirmation/);

  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM google_accounts')
      .get().total,
    0
  );
});
