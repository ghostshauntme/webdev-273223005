import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  beginGoogleOAuth,
  fetchGoogleProfile
} from '../src/services/google-oauth.mjs';

const config = {
  clientId: 'test-client',
  clientSecret: 'fake-secret',
  redirectUri: 'http://localhost:3000/auth/google/callback'
};

test('AC-6 OAuth uses random state and PKCE', () => {
  const first = beginGoogleOAuth(config);
  const second = beginGoogleOAuth(config);
  const url = new URL(first.url);

  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
  assert.equal(url.searchParams.get('state'), first.state);
  assert.equal(
    url.searchParams.get('code_challenge_method'),
    'S256'
  );

  assert.equal(
    url.searchParams.get('code_challenge'),
    createHash('sha256')
      .update(first.verifier)
      .digest('base64url')
  );

  assert.equal(url.searchParams.has('client_secret'), false);
});

test('AC-6 OAuth retrieves profile using fake client', async () => {
  const profile = {
    sub: 'google-123',
    email: 'student@example.test',
    email_verified: true
  };

  const fakeClient = async (url, options) => {
    if (url.endsWith('/token')) {
      assert.equal(
        options.body.get('code_verifier'), 'test-verifier'
      );

      return {
        ok: true,
        json: async () => ({ access_token: 'fake-token' })
      };
    }

    assert.equal(
      options.headers.Authorization, 'Bearer fake-token'
    );

    return {
      ok: true,
      json: async () => profile
    };
  };

  assert.deepEqual(
    await fetchGoogleProfile(
      config, 'test-code', 'test-verifier', fakeClient
    ),
    profile
  );
});

test('AC-6 OAuth rejects failed token exchange', async () => {
  await assert.rejects(
    fetchGoogleProfile(
      config, 'invalid-code', 'verifier',
      async () => ({ ok: false })
    ),
    /authorization failed/
  );
});
