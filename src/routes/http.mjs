import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { authenticate, clearSessionCookie, currentUser, endSession, sessionCookie } from '../services/auth.mjs';
import { listUpcomingEvents } from '../services/events.mjs';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const pages = {
  '/login': ['login.html', 'text/html; charset=utf-8'],
  '/events': ['events.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function redirect(res, destination) {
  res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' });
  res.end();
}
async function bodyAsJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 8192) throw new Error('Request too large');
  }
  return JSON.parse(data || '{}');
}
async function sendPage(res, key) {
  const [name, contentType] = pages[key];
  const contents = await readFile(join(publicDir, name));
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(contents);
}

export function createApp(db) {
  return createServer(async (req, res) => {
    try {
      const route = new URL(req.url || '/', 'http://localhost').pathname;
      const user = currentUser(db, req);
      if (req.method === 'GET' && route === '/') return redirect(res, user ? '/events' : '/login');
      if (req.method === 'GET' && route === '/login') {
        if (user) return redirect(res, '/events');
        return await sendPage(res, '/login');
      }
      if (req.method === 'GET' && route === '/events') {
        if (!user) return redirect(res, '/login');
        return await sendPage(res, '/events');
      }
      if (req.method === 'GET' && (route === '/app.js' || route === '/styles.css')) return await sendPage(res, route);
      if (req.method === 'POST' && route === '/api/login') {
        let payload;
        try { payload = await bodyAsJson(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
        const signedIn = authenticate(db, payload.email, payload.password);
        if (!signedIn) return json(res, 401, { error: 'Invalid email or password' });
        return json(res, 200, { user: signedIn.user }, { 'Set-Cookie': sessionCookie(req, signedIn.token) });
      }
      if (req.method === 'POST' && route === '/api/logout') {
        endSession(db, req);
        return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
      }
      if (req.method === 'GET' && route === '/api/events') {
        if (!user) return json(res, 401, { error: 'Sign in first' });
        return json(res, 200, { events: listUpcomingEvents(db) });
      }
      if (req.method === 'GET' && route === '/api/me') {
        if (!user) return json(res, 401, { error: 'Sign in first' });
        return json(res, 200, { user });
      }
      return json(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('Request failed:', error.message);
      if (!res.headersSent) json(res, 500, { error: 'Internal server error' });
      else res.end();
    }
  });
}
