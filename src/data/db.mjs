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
  if (typeof password !== 'string' || password.length < 8) throw new Error('Choose a password with at least eight characters.');
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(DEMO_EMAIL);
  if (existing) return { id: existing.id, created: false };
  const result = db.prepare('INSERT INTO users(email,password_hash,role) VALUES(?,?,?)')
    .run(DEMO_EMAIL, hashPassword(password), 'member');
  return { id: Number(result.lastInsertRowid), created: true };
}

export function findUserByEmail(db, email) {
  return db.prepare('SELECT id,email,password_hash,role FROM users WHERE email=?').get(email);
}

export function findUserBySessionHash(db, tokenHash, now = Date.now()) {
  return db.prepare(`SELECT u.id,u.email,u.role FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash, now);
}

export function storeSession(db, tokenHash, userId, expiresAt) {
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash, userId, expiresAt);
}

export function removeSession(db, tokenHash) {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
}

export function getUpcomingEvents(db, now = new Date().toISOString()) {
  return db.prepare(`
    SELECT e.id, e.title, e.start_at AS date,
           e.capacity - COUNT(r.user_id) AS free_places
    FROM events e LEFT JOIN registrations r ON r.event_id=e.id
    WHERE e.start_at > ?
    GROUP BY e.id, e.title, e.start_at, e.capacity
    ORDER BY e.start_at ASC, e.id ASC
  `).all(now);
}

export function getAllEvents(db) {
  return db.prepare('SELECT id,title,start_at,capacity FROM events ORDER BY start_at ASC, id ASC').all();
}

export function deleteEvent(db, id) {
  return db.prepare('DELETE FROM events WHERE id=?').run(id).changes;
}

export function restoreEvent(db, id) {
  const event = makeSeedEvents().find((item) => item.id === id);
  if (!event) throw new Error('Only seed events 1, 2 or 3 can be restored.');
  return db.prepare('INSERT OR IGNORE INTO events(id, club_id, title, start_at, capacity) VALUES(?,?,?,?,?)')
    .run(event.id, event.club_id, event.title, event.start_at, event.capacity).changes;
}

export function findEventById(db, eventId) {
  return db.prepare(
    'SELECT id, title, start_at, capacity FROM events WHERE id=?'
  ).get(eventId);
}

export function countRegistrations(db, eventId) {
  return db.prepare(
    'SELECT COUNT(*) AS total FROM registrations WHERE event_id=?'
  ).get(eventId).total;
}

export function findRegistration(db, userId, eventId) {
  return db.prepare(
    'SELECT * FROM registrations WHERE user_id=? AND event_id=?'
  ).get(userId, eventId);
}

export function insertRegistration(db, userId, eventId) {
  db.prepare(
    'INSERT INTO registrations(user_id, event_id, created_at) VALUES(?,?,?)'
  ).run(userId, eventId, new Date().toISOString());

  return findRegistration(db, userId, eventId);
}

export function deleteRegistration(db, userId, eventId) {
  return db.prepare(
    'DELETE FROM registrations WHERE user_id=? AND event_id=?'
  ).run(userId, eventId).changes;
}

export function withTransaction(db, action) {
  db.exec('BEGIN IMMEDIATE');

  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
