import * as postgres from './postgres.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const DEMO_EMAIL = 'student@example.test';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

export function verifyPassword(password, encoded) {
  const [salt, hex] = (encoded || '').split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(hex || '')) return false;
  const digest = scryptSync(password, salt, 64);
  const stored = Buffer.from(hex, 'hex');
  return timingSafeEqual(stored, digest);
}

function futureDay(n) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + n);
  date.setUTCHours(17, 0, 0, 0);
  return date.toISOString();
}

export function makeSeedEvents() {
  return [
    { id: 1, club_id: 1, title: 'Web Development Workshop', start_at: futureDay(7), capacity: 20 },
    { id: 2, club_id: 1, title: 'Student Tech Meetup', start_at: futureDay(14), capacity: 30 },
    { id: 3, club_id: 1, title: 'Hackathon Kickoff', start_at: futureDay(21), capacity: 15 },
  ];
}

export function openDatabase(file = process.env.DB_PATH || 'data/club-events.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('member','organizer'))
    );
    CREATE TABLE IF NOT EXISTS clubs (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      club_id INTEGER NOT NULL REFERENCES clubs(id),
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0)
    );
    CREATE TABLE IF NOT EXISTS registrations (
      user_id INTEGER NOT NULL REFERENCES users(id),
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  if (!db.prepare("SELECT value FROM app_meta WHERE key='migration_001'").get()) {
    db.exec('BEGIN');
    try {
      const sql = readFileSync(
        new URL('./migrations/001_registrations.sql', import.meta.url),
        'utf8'
      );

      db.exec(sql);

      db.prepare(
        'INSERT INTO app_meta(key, value) VALUES (?, ?)'
      ).run('migration_001', 'applied');

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }


  if (!db.prepare("SELECT value FROM app_meta WHERE key='migration_002'").get()) {
    db.exec('BEGIN');
    try {
      const sql = readFileSync(
        new URL('./migrations/002_google_accounts.sql', import.meta.url),
        'utf8'
      );
      db.exec(sql);
      db.prepare(
        'INSERT INTO app_meta(key,value) VALUES(?,?)'
      ).run('migration_002', 'applied');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  if (!db.prepare("SELECT value FROM app_meta WHERE key='migration_003'").get()) {
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(
        new URL('./migrations/003_event_location.sql', import.meta.url),
        'utf8'
      ));

      db.prepare(
        'INSERT INTO app_meta(key,value) VALUES(?,?)'
      ).run('migration_003', 'applied');

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  if (!db.prepare("SELECT value FROM app_meta WHERE key='seeded'").get()) {
    db.exec('BEGIN');
    try {
      db.prepare('INSERT OR IGNORE INTO clubs(id, name) VALUES(1, ?)').run('Informatics Club');
      const addEvent = db.prepare('INSERT OR IGNORE INTO events(id, club_id, title, start_at, capacity) VALUES(?,?,?,?,?)');
      for (const event of makeSeedEvents()) addEvent.run(event.id, event.club_id, event.title, event.start_at, event.capacity);
      db.prepare("INSERT INTO app_meta(key,value) VALUES('seeded','yes')").run();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}

export function upsertDemoUser(db, password) {
  if (typeof db.query === 'function') return postgres.upsertDemoUser(db, password);
  return sqliteOperation(db, () => {
    if (typeof password !== 'string' || password.length < 8) throw new Error('Choose a password with at least eight characters.');
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(DEMO_EMAIL);
    if (existing) return { id: existing.id, created: false };
    const result = db.prepare('INSERT INTO users(email,password_hash,role) VALUES(?,?,?)')
      .run(DEMO_EMAIL, hashPassword(password), 'member');
    return { id: Number(result.lastInsertRowid), created: true };
  });
}

export function findUserByEmail(db, email) {
  if (typeof db.query === 'function') return postgres.findUserByEmail(db, email);
  return sqliteOperation(db, () => {
    return db.prepare('SELECT id,email,password_hash,role FROM users WHERE email=?').get(email);
  });
}

export function findUserBySessionHash(db, tokenHash, now = Date.now()) {
  if (typeof db.query === 'function') return postgres.findUserBySessionHash(db, tokenHash, now);
  return sqliteOperation(db, () => {
    return db.prepare(`SELECT u.id,u.email,u.role FROM sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash, now);
  });
}

export function storeSession(db, tokenHash, userId, expiresAt) {
  if (typeof db.query === 'function') return postgres.storeSession(db, tokenHash, userId, expiresAt);
  return sqliteOperation(db, () => {
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash, userId, expiresAt);
  });
}

export function removeSession(db, tokenHash) {
  if (typeof db.query === 'function') return postgres.removeSession(db, tokenHash);
  return sqliteOperation(db, () => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
  });
}

export function getUpcomingEvents(db, now = new Date().toISOString()) {
  if (typeof db.query === 'function') return postgres.getUpcomingEvents(db, now);
  return sqliteOperation(db, () => {
    return db.prepare(`
      SELECT e.id, e.title, e.location, e.start_at AS date,
             e.capacity - COUNT(r.user_id) AS free_places
      FROM events e LEFT JOIN registrations r ON r.event_id=e.id
      WHERE e.start_at > ?
      GROUP BY e.id, e.title, e.start_at, e.capacity
      ORDER BY e.start_at ASC, e.id ASC
    `).all(now);
  });
}

export function getAllEvents(db) {
  return sqliteOperation(db, () => {
    return db.prepare('SELECT id,title,start_at,capacity FROM events ORDER BY start_at ASC, id ASC').all();
  });
}

export function deleteEvent(db, id) {
  return sqliteOperation(db, () => {
    return db.prepare('DELETE FROM events WHERE id=?').run(id).changes;
  });
}

export function restoreEvent(db, id) {
  return sqliteOperation(db, () => {
    const event = makeSeedEvents().find((item) => item.id === id);
    if (!event) throw new Error('Only seed events 1, 2 or 3 can be restored.');
    return db.prepare('INSERT OR IGNORE INTO events(id, club_id, title, start_at, capacity) VALUES(?,?,?,?,?)')
      .run(event.id, event.club_id, event.title, event.start_at, event.capacity).changes;
  });
}

function selectSQLiteEvent(db, eventId) {
  return db.prepare(
    'SELECT id, title, start_at, capacity, location FROM events WHERE id=?'
  ).get(eventId);
}

export function findEventById(db, eventId) {
  if (typeof db.query === 'function') return postgres.findEventById(db, eventId);
  return sqliteOperation(db, () => {
    return selectSQLiteEvent(db, eventId);
  });
}

export function countRegistrations(db, eventId) {
  if (typeof db.query === 'function') return postgres.countRegistrations(db, eventId);
  return sqliteOperation(db, () => {
    return db.prepare(
      'SELECT COUNT(*) AS total FROM registrations WHERE event_id=?'
    ).get(eventId).total;
  });
}

function selectSQLiteRegistration(db, userId, eventId) {
  return db.prepare(
    'SELECT * FROM registrations WHERE user_id=? AND event_id=?'
  ).get(userId, eventId);
}

export function findRegistration(db, userId, eventId) {
  if (typeof db.query === 'function') return postgres.findRegistration(db, userId, eventId);
  return sqliteOperation(db, () => {
    return selectSQLiteRegistration(db, userId, eventId);
  });
}

export function insertRegistration(db, userId, eventId) {
  if (typeof db.query === 'function') return postgres.insertRegistration(db, userId, eventId);
  return sqliteOperation(db, () => {
    db.prepare(
      'INSERT INTO registrations(user_id, event_id, created_at) VALUES(?,?,?)'
    ).run(userId, eventId, new Date().toISOString());

    return selectSQLiteRegistration(db, userId, eventId);
  });
}

export function deleteRegistration(db, userId, eventId) {
  if (typeof db.query === 'function') return postgres.deleteRegistration(db, userId, eventId);
  return sqliteOperation(db, () => {
    return db.prepare(
      'DELETE FROM registrations WHERE user_id=? AND event_id=?'
    ).run(userId, eventId).changes;
  });
}

// A SQLite connection can have only one transaction. Use a scoped handle
// for its statements so operations on the original connection wait outside it.
const sqliteTransactions = new WeakMap();

function sqliteOperation(db, action) {
  const pending = sqliteTransactions.get(db);
  return pending ? pending.then(() => sqliteOperation(db, action)) : action();
}

export async function withTransaction(db, action) {
  if (typeof db.query === 'function') return postgres.withTransaction(db, action);
  const transaction = Promise.resolve(sqliteTransactions.get(db)).then(async () => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = await action({ prepare: db.prepare.bind(db) });
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  const settled = transaction.catch(() => {});
  sqliteTransactions.set(db, settled);

  try {
    return await transaction;
  } finally {
    if (sqliteTransactions.get(db) === settled) sqliteTransactions.delete(db);
  }
}

export function getUserRegistrations(db, userId) {
  if (typeof db.query === 'function') return postgres.getUserRegistrations(db, userId);
  return sqliteOperation(db, () => {
    return db.prepare(`
      SELECT e.id AS event_id,
             e.title,
             e.start_at AS date,
             r.created_at
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.user_id = ?
      ORDER BY e.start_at ASC, e.id ASC
    `).all(userId);
  });
}

export function insertEvent(db, title, date, capacity, location = '') {
  if (typeof db.query === 'function') return postgres.insertEvent(db, title, date, capacity, location);
  return sqliteOperation(db, () => {
    const result = db.prepare(
      'INSERT INTO events(club_id,title,start_at,capacity,location) VALUES(1,?,?,?,?)'
    ).run(title, date, capacity, location);

    return selectSQLiteEvent(db, Number(result.lastInsertRowid));
  });
}

export function findGoogleAccount(db, sub) {
  if (typeof db.query === 'function') return postgres.findGoogleAccount(db, sub);
  return sqliteOperation(db, () => {
    return db.prepare(`
      SELECT u.id, u.email, u.role
      FROM google_accounts g
      JOIN users u ON u.id = g.user_id
      WHERE g.google_sub = ?
    `).get(sub);
  });
}

export function linkGoogleAccount(db, sub, userId) {
  if (typeof db.query === 'function') return postgres.linkGoogleAccount(db, sub, userId);
  return sqliteOperation(db, () => {
    db.prepare(
      'INSERT INTO google_accounts(google_sub,user_id) VALUES(?,?)'
    ).run(sub, userId);
  });
}

export async function lockEvent(db, eventId) {
  if (typeof db.query === 'function') {
    await postgres.lockEvent(db, eventId);
  }
}

export async function lockGoogleAccounts(db) {
  if (typeof db.query === 'function') {
    await postgres.lockGoogleAccounts(db);
  }
}

export async function openApplicationDatabase() {
  if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
    return openDatabase();
  }

  const pool = postgres.openPostgres();
  try {
    await postgres.migratePostgres(pool);
    await postgres.seedPostgres(pool);
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}

export async function closeDatabase(db) {
  if (typeof db.query === 'function') await db.end();
  else db.close();
}

export async function checkDatabase(db, timeoutMs = 3000) {
  if (typeof db.query !== 'function') {
    db.prepare('SELECT 1').get();
    return;
  }

  // The driver query timeout starts after checkout from the pool.
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Database health check timed out')), timeoutMs);
  });
  try {
    await Promise.race([
      db.query({ text: 'SELECT 1', query_timeout: timeoutMs }),
      deadline
    ]);
  } finally {
    clearTimeout(timer);
  }
}
