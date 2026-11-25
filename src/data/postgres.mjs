import pg from 'pg';
import { readFileSync } from 'node:fs';

export function openPostgres(
  connectionString = process.env.DATABASE_URL
) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
    max: 5
  });
  pool.on('error', () => console.error('An idle PostgreSQL connection failed.'));
  return pool;
}

export async function migratePostgres(pool) {
  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(273223005)');

    const sql = readFileSync(
      new URL('./postgres/001_initial.sql', import.meta.url),
      'utf8'
    );

    await client.query(sql);
  });
}

export async function findUserByEmail(pool, email) {
  const result = await pool.query(
    'SELECT id,email,password_hash,role FROM users WHERE email=$1',
    [email]
  );
  return result.rows[0];
}

export async function findUserBySessionHash(
  pool, tokenHash, now = Date.now()
) {
  const result = await pool.query(
    `SELECT u.id,u.email,u.role FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>$2`,
    [tokenHash, now]
  );
  return result.rows[0];
}

export async function storeSession(
  pool, tokenHash, userId, expiresAt
) {
  await pool.query(
    `INSERT INTO sessions(token_hash,user_id,expires_at)
     VALUES($1,$2,$3)`,
    [tokenHash, userId, expiresAt]
  );
}

export async function removeSession(pool, tokenHash) {
  await pool.query(
    'DELETE FROM sessions WHERE token_hash=$1',
    [tokenHash]
  );
}

export async function getUpcomingEvents(
  pool, now = new Date().toISOString()
) {
  const result = await pool.query(`
    SELECT e.id, e.title, e.location, e.start_at AS date,
           (e.capacity - COUNT(r.user_id))::integer AS free_places
    FROM events e
    LEFT JOIN registrations r ON r.event_id=e.id
    WHERE e.start_at > $1
    GROUP BY e.id
    ORDER BY e.start_at ASC, e.id ASC
  `, [now]);

  return result.rows;
}

export async function findEventById(pool, eventId) {
  const result = await pool.query(
    `SELECT id,title,start_at,capacity,location
     FROM events WHERE id=$1::bigint`,
    [eventId]
  );
  return result.rows[0];
}

export async function insertEvent(
  pool, title, date, capacity, location = ''
) {
  const result = await pool.query(
    `INSERT INTO events(club_id,title,start_at,capacity,location)
     VALUES(1,$1,$2,$3,$4)
     RETURNING id,title,start_at,capacity,location`,
    [title, date, capacity, location]
  );
  return result.rows[0];
}

export async function countRegistrations(db, eventId) {
  const result = await db.query(
    'SELECT COUNT(*)::integer AS total FROM registrations WHERE event_id=$1',
    [eventId]
  );
  return result.rows[0].total;
}

export async function findRegistration(db, userId, eventId) {
  const result = await db.query(
    'SELECT * FROM registrations WHERE user_id=$1 AND event_id=$2::bigint',
    [userId, eventId]
  );
  return result.rows[0];
}

export async function insertRegistration(db, userId, eventId) {
  const result = await db.query(
    `INSERT INTO registrations(user_id,event_id,created_at)
     VALUES($1,$2,$3) RETURNING *`,
    [userId, eventId, new Date().toISOString()]
  );
  return result.rows[0];
}

export async function deleteRegistration(db, userId, eventId) {
  const result = await db.query(
    'DELETE FROM registrations WHERE user_id=$1 AND event_id=$2::bigint',
    [userId, eventId]
  );
  return result.rowCount;
}

export async function getUserRegistrations(db, userId) {
  const result = await db.query(`
    SELECT e.id AS event_id, e.title,
           e.start_at AS date, r.created_at
    FROM registrations r
    JOIN events e ON e.id=r.event_id
    WHERE r.user_id=$1
    ORDER BY e.start_at ASC, e.id ASC
  `, [userId]);
  return result.rows;
}

export async function withTransaction(pool, action) {
  const client = await pool.connect();

  let discard;

  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      discard = rollbackError;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

export async function lockEvent(db, eventId) {
  await db.query(
    'SELECT id FROM events WHERE id=$1::bigint FOR UPDATE',
    [eventId]
  );
}

export async function findGoogleAccount(db, sub) {
  const result = await db.query(`
    SELECT u.id,u.email,u.role
    FROM google_accounts g
    JOIN users u ON u.id=g.user_id
    WHERE g.google_sub=$1
  `, [sub]);
  return result.rows[0];
}

export async function linkGoogleAccount(db, sub, userId) {
  await db.query(
    'INSERT INTO google_accounts(google_sub,user_id) VALUES($1,$2)',
    [sub, userId]
  );
}

export async function upsertDemoUser(db, password) {
  const { DEMO_EMAIL, hashPassword } = await import('./db.mjs');

  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Choose a password with at least eight characters.');
  }

  const result = await db.query(`
    INSERT INTO users(email,password_hash,role)
    VALUES($1,$2,'member')
    ON CONFLICT(email) DO NOTHING
    RETURNING id
  `, [DEMO_EMAIL, hashPassword(password)]);

  if (result.rowCount) {
    return { id: result.rows[0].id, created: true };
  }

  const existing = await findUserByEmail(db, DEMO_EMAIL);
  return { id: existing.id, created: false };
}

export async function seedPostgres(pool) {
  const { makeSeedEvents } = await import('./db.mjs');

  await withTransaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(273223005)');

    const marker = await db.query(
      "SELECT value FROM app_meta WHERE key='seeded'"
    );

    if (marker.rowCount) return;

    await db.query(`
      INSERT INTO clubs(id,name)
      VALUES(1,'Informatics Club')
      ON CONFLICT(id) DO NOTHING
    `);

    for (const event of makeSeedEvents()) {
      await db.query(`
        INSERT INTO events(club_id,title,start_at,capacity)
        VALUES(1,$1,$2,$3)
      `, [event.title, event.start_at, event.capacity]);
    }

    await db.query(`
      SELECT setval(pg_get_serial_sequence('clubs','id'),
                    (SELECT MAX(id) FROM clubs))
    `);

    await db.query(
      "INSERT INTO app_meta(key,value) VALUES('seeded','yes')"
    );
  });
}

export async function lockGoogleAccounts(db) {
  // Serialize the lookup and link across both unique keys (subject and user).
  await db.query('SELECT pg_advisory_xact_lock(273223005, 1)');
}
