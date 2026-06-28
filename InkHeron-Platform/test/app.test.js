import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

function temporaryDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-app-'));
  return path.join(dir, 'inkheron.db');
}

test('healthz returns ok', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath() });
  const response = await app.inject({ method: 'GET', url: '/healthz' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'inkheron-wrapper',
  });

  await app.close();
});

test('serves self-hosted assets', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath() });
  const response = await app.inject({ method: 'GET', url: '/assets/styles.css' });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /@font-face/);
  assert.doesNotMatch(response.body, /https?:\/\//);

  await app.close();
});

test('serves student dashboard shell at root', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath() });
  const response = await app.inject({ method: 'GET', url: '/' });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Student sign in/);
  assert.match(response.body, /Feedback ready/);
  assert.match(response.body, /What to do/);
  assert.match(response.body, /needs_rewrite/);
  assert.match(response.body, /api\/student\/assignments/);

  await app.close();
});
