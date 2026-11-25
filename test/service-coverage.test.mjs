import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openDatabase,
  hashPassword
} from '../src/data/db.mjs';

import {
  createUserSession,
  currentUser,
  confirmPassword
} from '../src/services/auth.mjs';

import { createEvent } from '../src/services/events.mjs';

import {
  registerForEvent
} from '../src/services/registrations.mjs';

import {
  resolveGoogleUser
} from '../src/services/google-auth.mjs';

import {
  googleConfig,
  fetchGoogleProfile
} from '../src/services/google-oauth.mjs';

import {
  suggestPoster
} from '../src/services/poster.mjs';

function setup(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());

  const insert = db.prepare(
    'INSERT INTO users(email,password_hash,role) VALUES(?,?,?)'
  );

  const id = Number(insert.run(
    'organizer@example.test',
    hashPassword('test-password'),
    'organizer'
  ).lastInsertRowid);

  const otherId = Number(insert.run(
    'member@example.test',
    hashPassword('test-password'),
    'member'
  ).lastInsertRowid);

  return {
    db,
    organizer: {
      id,
      email: 'organizer@example.test',
      role: 'organizer'
    },
    member: {
      id: otherId,
      email: 'member@example.test',
      role: 'member'
    }
  };
}

test('AC-6 created session identifies existing user', t => {
  const { db, organizer } = setup(t);
  const session = createUserSession(db, organizer);

  const user = currentUser(db, {
    headers: {
      cookie: `club_session=${session.token}`
    }
  });

  assert.equal(user.id, organizer.id);
});

test('AC-6 password confirmation rejects invalid accounts', t => {
  const { db, organizer } = setup(t);

  assert.equal(confirmPassword(
    db, organizer, 'test-password'
  ), true);

  assert.equal(confirmPassword(
    db, organizer, 'wrong-password'
  ), false);

  assert.equal(confirmPassword(
    db, organizer, null
  ), false);

  assert.equal(confirmPassword(
    db, { ...organizer, id: -1 }, 'test-password'
  ), false);

  assert.equal(confirmPassword(
    db, { ...organizer, email: 'missing@example.test' },
    'test-password'
  ), false);
});

test('AC-2 registration rejects missing and past events', t => {
  const { db, member } = setup(t);

  assert.throws(
    () => registerForEvent(db, member.id, 999999),
    { status: 404, message: 'Event not found' }
  );

  db.prepare(
    'UPDATE events SET start_at=? WHERE id=1'
  ).run(new Date(Date.now() - 86400000).toISOString());

  assert.throws(
    () => registerForEvent(db, member.id, 1),
    { status: 409, message: 'This event has already started' }
  );

  assert.equal(db.prepare(
    'SELECT COUNT(*) AS n FROM registrations'
  ).get().n, 0);
});

test('AC-5 event service rejects invalid input', t => {
  const { db, organizer, member } = setup(t);

  const valid = {
    title: 'Test event',
    date: new Date(Date.now() + 86400000).toISOString(),
    capacity: 10,
    location: 'Sofia'
  };

  assert.throws(
    () => createEvent(db, null, valid),
    { status: 401 }
  );

  assert.throws(
    () => createEvent(db, member, valid),
    { status: 403 }
  );

  const invalid = [
    undefined,
    { ...valid, title: '' },
    { ...valid, title: 123 },
    { ...valid, title: 'x'.repeat(201) },
    { ...valid, date: 123 },
    { ...valid, date: 'invalid' },
    { ...valid, date: '2000-01-01' },
    { ...valid, capacity: 1.5 },
    { ...valid, capacity: 0 },
    { ...valid, location: 123 },
    { ...valid, location: 'x'.repeat(201) }
  ];

  const before = db.prepare(
    'SELECT COUNT(*) AS n FROM events'
  ).get().n;

  for (const input of invalid) {
    assert.throws(
      () => createEvent(db, organizer, input),
      { status: 400 }
    );
  }

  assert.equal(db.prepare(
    'SELECT COUNT(*) AS n FROM events'
  ).get().n, before);
});

test('AC-6 Google identity cannot belong to another user', t => {
  const { db, organizer, member } = setup(t);

  const profile = {
    sub: 'fake-google-id',
    email: organizer.email,
    email_verified: true
  };

  resolveGoogleUser(db, profile, organizer, true);

  assert.throws(
    () => resolveGoogleUser(db, profile, member, true),
    /belongs to another user/
  );

  for (const invalid of [
    null,
    { ...profile, sub: 123 },
    { ...profile, sub: '' },
    { ...profile, email: null }
  ]) {
    assert.throws(
      () => resolveGoogleUser(db, invalid),
      /not verified/
    );
  }

  assert.throws(
    () => resolveGoogleUser(db, {
      ...profile,
      sub: 'different-id',
      email: 'missing@example.test'
    }, organizer, true),
    /requires confirmation/
  );

  assert.throws(
    () => resolveGoogleUser(db, {
      ...profile,
      sub: 'different-id'
    }, member, true),
    /requires confirmation/
  );
});

test('AC-6 missing Google configuration', t => {
  const keys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI'
  ];

  const previous = keys.map(key => process.env[key]);

  t.after(() => {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  });

  for (const missing of keys) {
    for (const key of keys) process.env[key] = 'fake-value';
    delete process.env[missing];

    assert.equal(googleConfig(), null);
  }
});

test('AC-6 invalid Google token and unavailable profile', async () => {
  const config = {
    clientId: 'fake-id',
    clientSecret: 'fake-secret',
    redirectUri: 'http://localhost/callback'
  };

  await assert.rejects(
    fetchGoogleProfile(config, 'code', 'verifier',
      async () => ({
        ok: true,
        json: async () => ({})
      })
    ),
    /Invalid Google token/
  );

  await assert.rejects(
    fetchGoogleProfile(config, 'code', 'verifier',
      async url => url.includes('/token')
        ? {
            ok: true,
            json: async () => ({ access_token: 'fake' })
          }
        : { ok: false }
    ),
    /Google profile unavailable/
  );
});

test('AC-7 invalid poster inputs and fields use fallback', async () => {
  const image = 'ZmFrZS1pbWFnZQ==';

  for (const [data, mime] of [
    [null, 'image/png'],
    ['', 'image/png'],
    ['x'.repeat(2800001), 'image/png'],
    [image, 'text/plain']
  ]) {
    let called = false;

    const result = await suggestPoster(
      data, mime, async () => { called = true; }, 'fake-key'
    );

    assert.equal(result.ok, false);
    assert.equal(called, false);
  }

  const valid = {
    title: 'Test event',
    date: new Date(Date.now() + 86400000).toISOString(),
    location: 'Sofia'
  };

  for (const output of [
    null,
    { ...valid, title: 123 },
    { ...valid, title: ' ' },
    { ...valid, title: 'x'.repeat(201) },
    { ...valid, date: 123 },
    { ...valid, date: 'invalid' },
    { ...valid, date: '2000-01-01' },
    { ...valid, location: 123 },
    { ...valid, location: ' ' },
    { ...valid, location: 'x'.repeat(201) }
  ]) {
    const result = await suggestPoster(
      image, 'image/png',
      async () => JSON.stringify(output),
      'fake-key'
    );

    assert.equal(result.ok, false);
  }
});

test('AC-7 Gemini adapter handles provider responses', async t => {
  const valid = {
    title: 'Test event',
    date: new Date(Date.now() + 86400000).toISOString(),
    location: 'Sofia'
  };

  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });

  globalThis.fetch = async (url, options) => {
    assert.ok(url.includes('gemini-2.5-flash'));
    assert.equal(options.headers['x-goog-api-key'], 'fake-key');

    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify(valid) }]
          }
        }]
      })
    };
  };

  const result = await suggestPoster(
    'ZmFrZQ==', 'image/png', undefined, 'fake-key'
  );

  assert.equal(result.ok, true);
  assert.equal(result.suggestions.title, valid.title);

  globalThis.fetch = async () => ({ ok: false });

  assert.equal((await suggestPoster(
    'ZmFrZQ==', 'image/png', undefined, 'fake-key'
  )).ok, false);

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({})
  });

  assert.equal((await suggestPoster(
    'ZmFrZQ==', 'image/png', undefined, 'fake-key'
  )).ok, false);
});

test('AC-7 Gemini incomplete responses use fallback', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });

  for (const data of [
    { candidates: [] },
    { candidates: [{}] },
    { candidates: [{ content: {} }] },
    { candidates: [{ content: { parts: [] } }] },
    { candidates: [{ content: { parts: [{}] } }] }
  ]) {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => data
    });

    const result = await suggestPoster(
      'ZmFrZQ==', 'image/png', undefined, 'fake-key'
    );

    assert.equal(result.ok, false);
  }
});

test('AC-7 synchronous model failure uses fallback', async () => {
  const result = await suggestPoster(
    'ZmFrZQ==',
    'image/png',
    () => { throw new Error('Model failed'); },
    'fake-key'
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.message,
    'Automatic suggestions unavailable; enter event details manually.'
  );
});
