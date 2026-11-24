
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/data/db.mjs';

test('Migration 001 runs once and adds registration fields', () => {
  const temp = mkdtempSync(join(tmpdir(), 'migration-'));
  const file = join(temp, 'test.db');
  let db;

  try {
    db = openDatabase(file);

    const columns = db.prepare(
      'PRAGMA table_info(registrations)'
    ).all();

    assert.ok(columns.some(c => c.name === 'created_at'));

    const indexes = db.prepare(
      'PRAGMA index_list(registrations)'
    ).all();

    assert.ok(indexes.some(
      i => i.name === 'idx_registrations_event'
    ));

    db.close();
    db = null;

    db = openDatabase(file);

    const migration = db.prepare(
      "SELECT value FROM app_meta WHERE key='migration_001'"
    ).get();

    assert.equal(migration.value, 'applied');
  } finally {
    db?.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
