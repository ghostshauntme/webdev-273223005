import test from 'node:test';
import assert from 'node:assert/strict';
import { migratePostgres, seedPostgres } from '../src/data/postgres.mjs';
import { DEMO_EMAIL, upsertDemoUser } from '../src/data/db.mjs';
import { authenticate, currentUser, endSession } from '../src/services/auth.mjs';
import { createEvent, listUpcomingEvents } from '../src/services/events.mjs';
import { cancelRegistration, listMyRegistrations } from '../src/services/registrations.mjs';
import { resolveGoogleUser } from '../src/services/google-auth.mjs';

test('PostgreSQL schema and seed use transactions, and seeding skips an initialized database', async () => {
  const transactions = [];
  let seeded = false;
  const pool = {
    async connect() {
      const statements = [];
      transactions.push(statements);
      return {
        async query(sql, params) {
          statements.push({ sql: sql.trim(), params });
          if (sql.includes('SELECT value FROM app_meta')) return { rowCount: Number(seeded) };
          if (sql.includes('INSERT INTO app_meta')) seeded = true;
        },
        release() {
          statements.push({ sql: 'release' });
        }
      };
    }
  };

  await migratePostgres(pool);
  await seedPostgres(pool);
  await seedPostgres(pool);

  for (const statements of transactions) {
    assert.match(statements[0].sql, /^BEGIN/);
    assert.match(statements[1].sql, /pg_advisory_xact_lock/);
    assert.deepEqual(statements.slice(-2).map(({ sql }) => sql), ['COMMIT', 'release']);
  }

  assert.match(transactions[0][2].sql, /CREATE TABLE IF NOT EXISTS events/);
  const events = transactions[1].filter(({ sql }) => sql.startsWith('INSERT INTO events'));
  assert.equal(events.length, 3);
  assert.ok(events.every(({ params }) => Date.parse(params[1]) > Date.now()));
  assert.equal(transactions[2].length, 5);
});

test('PostgreSQL-backed services await SQL results for login, events, cancellation and Google linking', async () => {
  const account = { id: 1, email: DEMO_EMAIL, role: 'member' };
  let passwordHash;
  let sessionHash;
  let googleSub;
  let registration = { user_id: account.id, event_id: 1 };
  let event;

  async function query(sql, params = []) {
    switch (true) {
      case sql.includes('INSERT INTO users'):
        if (passwordHash) return { rowCount: 0 };
        assert.equal(params[0], account.email);
        passwordHash = params[1];
        return { rowCount: 1, rows: [{ id: account.id }] };
      case sql.includes('FROM users WHERE email'):
        assert.equal(params[0], account.email);
        return { rows: [{ ...account, password_hash: passwordHash }] };
      case sql.includes('INSERT INTO sessions'):
        [sessionHash] = params;
        assert.equal(params[1], account.id);
        assert.ok(params[2] > Date.now());
        return {};
      case sql.includes('SELECT u.id,u.email,u.role FROM sessions'):
        return { rows: sessionHash === params[0] ? [account] : [] };
      case sql.includes('DELETE FROM sessions'):
        assert.equal(params[0], sessionHash);
        sessionHash = undefined;
        return {};
      case sql.includes('INSERT INTO events'):
        event = { id: 1, title: params[0], start_at: params[1], capacity: params[2], location: params[3] };
        return { rows: [event] };
      case sql.includes('LEFT JOIN registrations'):
        return { rows: [{ id: event.id, date: event.start_at, free_places: event.capacity - 1 }] };
      case sql.includes('JOIN events e ON'):
        assert.equal(params[0], account.id);
        return { rows: registration ? [{ event_id: event.id }] : [] };
      case sql.includes('SELECT * FROM registrations'):
        assert.deepEqual(params, [account.id, event.id]);
        return { rows: [registration] };
      case sql.includes('DELETE FROM registrations'):
        assert.deepEqual(params, [account.id, event.id]);
        registration = undefined;
        return { rowCount: 1 };
      case sql.includes('FROM google_accounts'):
        return { rows: googleSub === params[0] ? [account] : [] };
      case sql.includes('INSERT INTO google_accounts'):
        assert.equal(params[1], account.id);
        [googleSub] = params;
        return {};
      default:
        assert.match(sql, /^(BEGIN|COMMIT|SELECT id FROM events .*FOR UPDATE|SELECT pg_advisory_xact_lock)/);
        return {};
    }
  }

  const pool = { query, async connect() { return { query, release() {} }; } };
  assert.deepEqual(await upsertDemoUser(pool, 'test-password'), { id: account.id, created: true });
  assert.deepEqual(await upsertDemoUser(pool, 'other-password'), { id: account.id, created: false });

  const login = await authenticate(pool, DEMO_EMAIL, 'test-password');
  assert.deepEqual(login.user, account);
  const req = { headers: { cookie: `club_session=${login.token}` } };
  assert.deepEqual(await currentUser(pool, req), account);

  const date = new Date(Date.now() + 86400000).toISOString();
  const created = await createEvent(pool, { role: 'organizer' }, {
    title: 'Test event', date, capacity: 2, location: 'Test room'
  });
  assert.deepEqual(created, { id: 1, title: 'Test event', start_at: date, capacity: 2, location: 'Test room' });
  assert.deepEqual(await listUpcomingEvents(pool), [{ id: 1, date, free_places: 1 }]);
  assert.deepEqual(await listMyRegistrations(pool, account.id), [{ event_id: 1 }]);
  assert.deepEqual(await cancelRegistration(pool, account.id, 1), { cancelled: true });
  assert.deepEqual(await listMyRegistrations(pool, account.id), []);

  const profile = { sub: 'fake-subject', email: account.email, email_verified: true };
  assert.deepEqual(await resolveGoogleUser(pool, profile, account, true), account);
  assert.deepEqual(await resolveGoogleUser(pool, profile), account);

  await endSession(pool, req);
  assert.equal(await currentUser(pool, req), undefined);
});
