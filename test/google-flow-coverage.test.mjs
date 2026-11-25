import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  openDatabase,
  hashPassword
} from '../src/data/db.mjs';

import {
  createGoogleFlow
} from '../src/services/google-flow.mjs';

import {
  currentUser
} from '../src/services/auth.mjs';

function setup(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());

  const keys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI'
  ];

  const previous = keys.map(key => process.env[key]);

  process.env.GOOGLE_CLIENT_ID = 'fake-id';
  process.env.GOOGLE_CLIENT_SECRET = 'fake-secret';
  process.env.GOOGLE_REDIRECT_URI =
    'http://localhost/auth/google/callback';

  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;

  t.after(() => {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;

    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  });

  const email = 'google@example.test';

  const id = Number(db.prepare(
    'INSERT INTO users(email,password_hash,role) VALUES(?,?,?)'
  ).run(
    email, hashPassword('test-password'), 'member'
  ).lastInsertRowid);

  const user = { id, email, role: 'member' };
  const flow = createGoogleFlow(db);

  globalThis.fetch = async () => {
    throw new Error('Unexpected external request');
  };

  async function request(path, options = {}) {
    const req = Readable.from(
      options.body ? [options.body] : []
    );

    req.method = options.method || 'GET';
    req.headers = { cookie: options.cookie || '' };
    req.socket = { encrypted: options.secure || false };

    const result = {};

    const res = {
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers;
      },
      end(body) {
        result.body = body;
      }
    };

    await flow(
      req, res,
      new URL(path, 'http://localhost'),
      options.user || null
    );

    return result;
  }

  return { db, user, request };
}

function callbackData(response) {
  const state = new URL(
    response.headers.Location
  ).searchParams.get('state');

  return {
    path: '/auth/google/callback?code=fake&state=' + state,
    cookie: response.headers['Set-Cookie'].split(';')[0]
  };
}

test('AC-6 Google flow unavailable without configuration', async t => {
  const { request } = setup(t);

  delete process.env.GOOGLE_CLIENT_ID;

  const result = await request('/auth/google/start');

  assert.equal(result.status, 503);
  assert.match(result.body, /Use password sign-in/);
});

test('AC-6 Google flow rejects oversized confirmation', async t => {
  const { user, request } = setup(t);

  const result = await request('/auth/google/start?link=1', {
    method: 'POST',
    user,
    body: 'password=' + 'x'.repeat(8193)
  });

  assert.equal(result.status, 400);
});

test('AC-6 Google flow expires old requests', async t => {
  const { request } = setup(t);

  const first = await request('/auth/google/start');
  const callback = callbackData(first);

  const now = Date.now();
  Date.now = () => now + 300001;

  const expired = await request(callback.path, {
    cookie: callback.cookie
  });

  assert.equal(expired.status, 400);

  const next = await request('/auth/google/start');
  assert.equal(next.status, 302);
});

test('AC-6 Google flow limits pending requests', async t => {
  const { request } = setup(t);

  const now = Date.now();
  Date.now = () => now;

  for (let i = 0; i < 1000; i++) {
    const result = await request('/auth/google/start');
    assert.equal(result.status, 302);
  }

  const rejected = await request('/auth/google/start');

  assert.equal(rejected.status, 503);
  assert.equal(rejected.body, 'Try again later');
});

test('AC-6 Google callback links account and creates session', async t => {
  const { db, user, request } = setup(t);

  globalThis.fetch = async url => {
    if (url.includes('/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'fake-token' })
      };
    }

    return {
      ok: true,
      json: async () => ({
        sub: 'fake-google-account',
        email: user.email,
        email_verified: true
      })
    };
  };

  const start = await request('/auth/google/start?link=1', {
    method: 'POST',
    body: 'password=test-password',
    user,
    secure: true
  });

  assert.equal(start.status, 302);
  assert.match(start.headers['Set-Cookie'], /Secure/);

  const callback = callbackData(start);

  const result = await request(callback.path, {
    cookie: callback.cookie,
    user,
    secure: true
  });

  assert.equal(result.status, 302);
  assert.equal(result.headers.Location, '/events');

  const cookie = result.headers['Set-Cookie'][0].split(';')[0];

  assert.equal(currentUser(db, {
    headers: { cookie }
  }).id, user.id);

  assert.equal(db.prepare(
    'SELECT COUNT(*) AS n FROM users'
  ).get().n, 1);

  const replay = await request(callback.path, {
    cookie: callback.cookie,
    user
  });

  assert.equal(replay.status, 400);

  const login = callbackData(
    await request('/auth/google/start')
  );

  const signedIn = await request(login.path, {
    cookie: login.cookie
  });

  assert.equal(signedIn.status, 302);

  assert.equal(currentUser(db, {
    headers: {
      cookie: signedIn.headers['Set-Cookie'][0].split(';')[0]
    }
  }).id, user.id);
});

test('AC-6 Google callback handles provider failure', async t => {
  const { request } = setup(t);

  globalThis.fetch = async () => ({ ok: false });

  const callback = callbackData(
    await request('/auth/google/start')
  );

  const result = await request(callback.path, {
    cookie: callback.cookie
  });

  assert.equal(result.status, 403);
  assert.match(result.body, /Google sign-in failed/);
});

test('AC-6 Google callback rejects changed user and missing code', async t => {
  const { user, request } = setup(t);

  const callback = callbackData(
    await request('/auth/google/start')
  );

  const changed = await request(callback.path, {
    cookie: callback.cookie,
    user
  });

  assert.equal(changed.status, 400);

  const missing = await request(
    callback.path.replace('code=fake&', ''),
    { cookie: callback.cookie }
  );

  assert.equal(missing.status, 400);
});
