import {
  googleConfig,
  beginGoogleOAuth,
  fetchGoogleProfile
} from './google-oauth.mjs';

import { resolveGoogleUser } from './google-auth.mjs';
import { createUserSession, confirmPassword, sessionCookie } from './auth.mjs';
import { randomBytes } from 'node:crypto';

export function createGoogleFlow(db) {
  const pending = new Map();

  return async function googleFlow(req, res, url, user) {
    const config = googleConfig();

    function reply(status, message) {
      res.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(message);
    }

    if (!config) {
      return reply(503, 'Google sign-in is unavailable. Use password sign-in.');
    }

    const secure = req.socket.encrypted ||
      req.headers['x-forwarded-proto'] === 'https';

    const cookie = (value, age) =>
      `google_flow=${value}; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=${age}` +
      (secure ? '; Secure' : '');

    if (url.pathname === '/auth/google/start') {
      const linking = url.searchParams.get('link') === '1';

      if (linking && !user) {
        return reply(401, 'Sign in first');
      }

      if (linking) {
        if (req.method !== 'POST') {
          return reply(405, 'Confirmation required');
        }

        let body = '';

        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) {
            return reply(400, 'Invalid request');
          }
        }

        const password = new URLSearchParams(body).get('password');

        if (!(await confirmPassword(db, user, password))) {
          return reply(403, 'Incorrect password');
        }
      }

      for (const [key, value] of pending) {
        if (value.expires < Date.now()) pending.delete(key);
      }

      if (pending.size >= 1000) {
        return reply(503, 'Try again later');
      }

      const flow = beginGoogleOAuth(config);
      const browser = randomBytes(32).toString('hex');

      pending.set(flow.state, {
        verifier: flow.verifier,
        browser,
        linking,
        userId: user?.id ?? null,
        expires: Date.now() + 300000
      });

      res.writeHead(302, {
        Location: flow.url,
        'Set-Cookie': cookie(browser, 300),
        'Cache-Control': 'no-store'
      });

      return res.end();
    }

    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const flow = pending.get(state);

    const browser = (req.headers.cookie || '')
      .match(/(?:^|;\s*)google_flow=([a-f0-9]{64})(?:;|$)/)?.[1];

    if (!flow || flow.expires < Date.now() ||
        flow.browser !== browser || !code ||
        flow.userId !== (user?.id ?? null)) {
      return reply(400, 'Invalid OAuth request');
    }

    pending.delete(state);

    try {
      const profile = await fetchGoogleProfile(
        config, code, flow.verifier
      );

      const account = await resolveGoogleUser(
        db, profile, user, flow.linking
      );

      const session = await createUserSession(db, account);

      res.writeHead(302, {
        Location: '/events',
        'Cache-Control': 'no-store',
        'Set-Cookie': [
          sessionCookie(req, session.token),
          cookie('', 0)
        ]
      });

      res.end();
    } catch {
      reply(403, 'Google sign-in failed. Use password sign-in.');
    }
  };
}
