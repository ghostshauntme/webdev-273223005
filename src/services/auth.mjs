import { createHash, randomBytes } from 'node:crypto';
import { findUserByEmail, findUserBySessionHash, removeSession, storeSession, verifyPassword } from '../data/db.mjs';

const COOKIE = 'club_session';
const MAX_AGE_SECONDS = 60 * 60 * 24;
const digest = (token) => createHash('sha256').update(token).digest('hex');

export function authenticate(db, email, password) {
  const user = findUserByEmail(db, String(email || '').trim().toLowerCase());
  if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) return null;
  const token = randomBytes(32).toString('hex');
  storeSession(db, digest(token), user.id, Date.now() + MAX_AGE_SECONDS * 1000);
  return { token, user: { id: user.id, email: user.email, role: user.role } };
}

export function readSessionToken(req) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim());
  const value = cookie.find((part) => part.startsWith(`${COOKIE}=`));
  const token = value?.slice(COOKIE.length + 1) || '';
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function currentUser(db, req) {
  const token = readSessionToken(req);
  return token ? findUserBySessionHash(db, digest(token)) : null;
}

export function endSession(db, req) {
  const token = readSessionToken(req);
  if (token) removeSession(db, digest(token));
}

const cookieSecure = (req) => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
export function sessionCookie(req, token) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}${cookieSecure(req) ? '; Secure' : ''}`;
}
export function clearSessionCookie(req) {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSecure(req) ? '; Secure' : ''}`;
}
