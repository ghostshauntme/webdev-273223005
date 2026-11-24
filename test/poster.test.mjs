import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestPoster } from '../src/services/poster.mjs';

const image = 'ZmFrZS1pbWFnZQ==';
const mime = 'image/png';
const key = 'fake-key';

test('AC-7 fake model returns valid suggestions', async () => {
  const expected = {
    title: 'Coding Workshop',
    date: new Date(Date.now() + 86400000).toISOString(),
    location: 'Room 101'
  };

  const fakeClient = async () => JSON.stringify(expected);

  const result = await suggestPoster(
    image, mime, fakeClient, key
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.suggestions, expected);
});

test('AC-7 missing model key uses manual fallback', async () => {
  let called = false;

  const fakeClient = async () => {
    called = true;
  };

  const result = await suggestPoster(
    image, mime, fakeClient, ''
  );

  assert.equal(called, false);

  assert.equal(result.ok, false);
  assert.equal(
    result.message,
    'Automatic suggestions unavailable; enter event details manually.'
  );
});

test('AC-7 nonsense model response uses fallback', async () => {
  const fakeClient = async () => 'nonsense';

  const result = await suggestPoster(
    image, mime, fakeClient, key
  );

  assert.equal(result.ok, false);
});

test('AC-7 invalid model fields use fallback', async () => {
  const fakeClient = async () => JSON.stringify({
    title: '',
    date: 'invalid date',
    location: 'Room 101'
  });

  const result = await suggestPoster(
    image, mime, fakeClient, key
  );

  assert.equal(result.ok, false);
});

test('AC-7 model returns no answer', async () => {
  const fakeClient = async () => undefined;

  const result = await suggestPoster(
    image, mime, fakeClient, key
  );

  assert.equal(result.ok, false);
});

test('AC-7 provider failure uses fallback', async () => {
  const fakeClient = async () => {
    throw new Error('429 Too Many Requests');
  };

  const result = await suggestPoster(
    image, mime, fakeClient, key
  );

  assert.equal(result.ok, false);
});

test('AC-7 model timeout uses manual fallback', async () => {
  const fakeClient = () => new Promise(() => {});

  const result = await suggestPoster(
    image, mime, fakeClient, key
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.message,
    'Automatic suggestions unavailable; enter event details manually.'
  );
});
