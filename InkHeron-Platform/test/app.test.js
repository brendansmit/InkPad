import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

test('healthz returns ok', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/healthz' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'inkheron-wrapper',
  });

  await app.close();
});

test('serves self-hosted assets', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/assets/styles.css' });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /@font-face/);
  assert.doesNotMatch(response.body, /https?:\/\//);

  await app.close();
});
