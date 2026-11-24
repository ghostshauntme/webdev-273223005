import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDatabase,
  hashPassword
} from '../src/data/db.mjs';
import { authenticate } from '../src/services/auth.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'club-mcp-'));
  const file = join(dir, 'test.db');
  const db = openDatabase(file);

  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const insert = db.prepare(
    'INSERT INTO users(email,password_hash,role) VALUES(?,?,?)'
  );

  insert.run(
    'first@example.test',
    hashPassword('test-password'),
    'member'
  );

  insert.run(
    'second@example.test',
    hashPassword('test-password'),
    'member'
  );

  db.prepare(
    'UPDATE events SET capacity=1 WHERE id=1'
  ).run();

  const first = authenticate(
    db, 'first@example.test', 'test-password'
  );

  const second = authenticate(
    db, 'second@example.test', 'test-password'
  );

  function rpc(method, params, token = '') {
    const result = spawnSync(
      process.execPath,
      ['mcp-server/server.js'],
      {
        input: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params
        }) + '\n',
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          DB_PATH: file,
          MCP_SESSION_TOKEN: token
        }
      }
    );

    assert.equal(result.status, 0, result.stderr);

    return JSON.parse(result.stdout.trim());
  }

  function call(name, args, token) {
    return rpc('tools/call', {
      name,
      arguments: args
    }, token).result;
  }

  return { db, first, second, rpc, call };
}

test('AC-8 MCP exposes all three project tools', t => {
  const { rpc } = setup(t);

  const response = rpc('tools/list', {});

  const names = response.result.tools.map(
    tool => tool.name
  );

  for (const name of [
    'find_lecture',
    'search_lectures',
    'upcoming_events',
    'my_registrations',
    'register_for_event'
  ]) {
    assert.ok(names.includes(name));
  }
});

test('AC-8 MCP rejects unauthenticated callers', t => {
  const { call } = setup(t);

  for (const name of [
    'upcoming_events',
    'my_registrations',
    'register_for_event'
  ]) {
    const result = call(name, { event_id: 1 }, '');

    assert.equal(result.isError, true);
    assert.equal(
      result.content[0].text,
      'Authentication required'
    );
  }
});

test('AC-8 MCP uses the same capacity rule as HTTP', t => {
  const { db, first, second, call } = setup(t);

  const accepted = call(
    'register_for_event',
    { event_id: 1 },
    first.token
  );

  assert.equal(accepted.isError, false);

  const rejected = call(
    'register_for_event',
    { event_id: 1 },
    second.token
  );

  assert.equal(rejected.isError, true);
  assert.equal(
    rejected.content[0].text,
    'This event is full'
  );

  const rows = db.prepare(
    'SELECT user_id FROM registrations WHERE event_id=1'
  ).all();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, first.user.id);
});

test('AC-8 MCP lists only the callers own registrations', t => {
  const { first, second, call } = setup(t);

  const reserved = call(
    'register_for_event',
    { event_id: 1 },
    first.token
  );

  assert.equal(reserved.isError, false);

  const own = call(
    'my_registrations', {}, first.token
  );

  const other = call(
    'my_registrations', {}, second.token
  );

  assert.equal(own.isError, false);
  assert.equal(other.isError, false);

  assert.equal(
    JSON.parse(own.content[0].text).length,
    1
  );

  assert.deepEqual(
    JSON.parse(other.content[0].text),
    []
  );
});

test('AC-1 MCP lists upcoming events in date order', t => {
  const { first, call } = setup(t);

  const result = call(
    'upcoming_events', {}, first.token
  );

  assert.equal(result.isError, false);

  const events = JSON.parse(result.content[0].text);

  assert.equal(events.length, 3);
  assert.equal(events[0].free_places, 1);

  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i - 1].date <= events[i].date);
  }

  for (const event of events) {
    assert.ok(Date.parse(event.date) > Date.now());
  }
});
