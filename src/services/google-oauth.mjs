import { randomBytes, createHash } from 'node:crypto';

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

export function beginGoogleOAuth(config) {
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(32).toString('base64url');

  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');

  const url = new URL(
    'https://accounts.google.com/o/oauth2/v2/auth'
  );

  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();

  return { state, verifier, url: url.toString() };
}

export async function fetchGoogleProfile(
  config, code, verifier, client = fetch
) {
  const response = await client(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier
      }),
      signal: AbortSignal.timeout(5000)
    }
  );

  if (!response.ok) {
    throw new Error('Google authorization failed');
  }

  const token = await response.json();

  if (typeof token.access_token !== 'string') {
    throw new Error('Invalid Google token');
  }

  const profile = await client(
    'https://openidconnect.googleapis.com/v1/userinfo',
    {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      },
      signal: AbortSignal.timeout(5000)
    }
  );

  if (!profile.ok) {
    throw new Error('Google profile unavailable');
  }

  return profile.json();
}
