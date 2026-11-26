import { suggestPoster } from '../services/poster.mjs';
import { createGoogleFlow } from '../services/google-flow.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { checkDatabase } from '../data/db.mjs';
import { authenticate, clearSessionCookie, currentUser, endSession, sessionCookie } from '../services/auth.mjs';
import { listUpcomingEvents, createEvent, EventError } from '../services/events.mjs';
import {
  registerForEvent,
  cancelRegistration,
  listMyRegistrations,
  RegistrationError
} from '../services/registrations.mjs';


const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const pages = {
  '/login': ['login.html', 'text/html; charset=utf-8'],
  '/events': ['events.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/favicon.ico': ['favicon.ico', 'image/x-icon'],
};

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function redirect(res, destination) {
  res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' });
  res.end();
}
async function bodyAsJson(req, limit = 8192) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      throw new Error('Request too large');
    }
    chunks.push(chunk);
  }
  const payload = size ? JSON.parse(Buffer.concat(chunks, size).toString('utf8')) : {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Expected a JSON object');
  }
  return payload;
}
async function sendPage(res, key) {
  const [name, contentType] = pages[key];
  const contents = await readFile(join(publicDir, name));
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(contents);
}

export function createApp(db) {
  const googleFlow = createGoogleFlow(db);
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com; object-src 'none'");

    try {
      const route = new URL(req.url || '/', 'http://localhost').pathname;
      if (req.method === 'GET' && route === '/health') {
        try {
          await checkDatabase(db);
        } catch {
          return json(res, 503, { status: 'unavailable' });
        }
        return json(res, 200, { status: 'ok' });
      }

      const user = await currentUser(db, req);

      if (
          (req.method === 'GET' &&
            ['/auth/google/start', '/auth/google/callback'].includes(route)) ||
          (req.method === 'POST' && route === '/auth/google/start')
      ) {
        return await googleFlow(
          req, res,
          new URL(req.url, 'http://localhost'),
          user
        );
      }

      if (req.method === 'GET' && route === '/') return redirect(res, user ? '/events' : '/login');
      if (req.method === 'GET' && route === '/login') {
        if (user) return redirect(res, '/events');
        return await sendPage(res, '/login');
      }
      if (req.method === 'GET' && route === '/events') {
        if (!user) return redirect(res, '/login');
        return await sendPage(res, '/events');
      }
      if (req.method === 'GET' && ['/app.js', '/styles.css', '/favicon.ico'].includes(route)) {
        return await sendPage(res, route);
      }
      if (req.method === 'POST' && route === '/api/login') {
        let payload;
        try { payload = await bodyAsJson(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
        const signedIn = await authenticate(db, payload.email, payload.password);
        if (!signedIn) return json(res, 401, { error: 'Invalid email or password' });
        return json(res, 200, { user: signedIn.user }, { 'Set-Cookie': sessionCookie(req, signedIn.token) });
      }
      if (req.method === 'POST' && route === '/api/logout') {
        await endSession(db, req);
        return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
      }
      if (req.method === 'GET' && route === '/api/events') {
        if (!user) return json(res, 401, { error: 'Sign in first' });
        return json(res, 200, { events: await listUpcomingEvents(db) });
      }
      if (req.method === 'POST' && route === '/api/poster/suggest') {
        if (!user) {
          return json(res, 401, { error: 'Sign in first' });
        }

        if (user.role !== 'organizer') {
          return json(res, 403, { error: 'Organizers only' });
        }

        let payload;

        try {
          payload = await bodyAsJson(req, 2900000);
        } catch {
          return json(res, 400, { error: 'Invalid poster upload' });
        }

        const result = await suggestPoster(
          payload?.image, payload?.mimeType
        );

        return json(res, 200, result);
      }

      if (req.method === 'POST' && route === '/api/events') {
        if (!user) {
          return json(res, 401, { error: 'Sign in first' });
        }

        if (user.role !== 'organizer') {
          return json(res, 403, { error: 'Organizers only' });
        }

        let payload;

        try {
          payload = await bodyAsJson(req);
        } catch {
          return json(res, 400, { error: 'Invalid JSON' });
        }

        return json(res, 201, {
          event: await createEvent(db, user, payload)
        });
      }

      if (req.method === 'GET' && route === '/api/me') {
        if (!user) return json(res, 401, { error: 'Sign in first' });
        return json(res, 200, { user });
      }

      // List the current user's registrations
      if (req.method === 'GET' && route === '/api/registrations') {
        if (!user) {
          return json(res, 401, { error: 'Sign in first' });
        }

        return json(res, 200, {
          registrations: await listMyRegistrations(db, user.id)
        });
      }

      // Register for an event or cancel a registration
      const registrationRoute = route.match(
        /^\/api\/events\/(\d+)\/register$/
      );

      if (
        registrationRoute &&
        (req.method === 'POST' || req.method === 'DELETE')
      ) {
        if (!user) {
          return json(res, 401, { error: 'Sign in first' });
        }

        const eventId = Number(registrationRoute[1]);

        if (!Number.isSafeInteger(eventId) || eventId <= 0) {
          return json(res, 400, { error: 'Invalid event ID' });
        }

        if (req.method === 'POST') {
          const registration = await registerForEvent(
            db, user.id, eventId
          );

          return json(res, 201, { registration });
        }

        const result = await cancelRegistration(
          db, user.id, eventId
        );

        return json(res, 200, result);
      }


      return json(res, 404, { error: 'Not found' });

    } catch (error) {
      if ((error instanceof RegistrationError || error instanceof EventError) && !res.headersSent) {
        return json(res, error.status, {
          error: error.message
        });
      }

      console.error('Unexpected HTTP request failure.');

      if (!res.headersSent) json(res, 500, { error: 'Internal server error' });
      else res.end();
    }
  });
}
