import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';

function temporaryPaths(prefix = 'inkheron-app-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    databasePath: path.join(dir, 'inkheron.db'),
    libraryUploadsDir: path.join(dir, 'library-uploads'),
  };
}

function buildTemporaryApp() {
  return buildApp(temporaryPaths());
}

test('healthz returns ok', async () => {
  const app = await buildTemporaryApp();
  const response = await app.inject({ method: 'GET', url: '/healthz' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'inkheron-wrapper',
  });

  await app.close();
});

test('serves self-hosted assets', async () => {
  const app = await buildTemporaryApp();
  const response = await app.inject({ method: 'GET', url: '/assets/styles.css' });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /@font-face/);
  assert.doesNotMatch(response.body, /https?:\/\//);

  await app.close();
});

test('serves EAP landing page at root', async () => {
  const app = await buildTemporaryApp();
  const response = await app.inject({ method: 'GET', url: '/' });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Grammar Arcade/);
  assert.match(response.body, /https:\/\/inkpad\.inkheron\.app/);
  assert.match(response.body, /File Library/);
  assert.match(response.body, /\/library/);

  await app.close();
});

test('serves student dashboard shell at student route', async () => {
  const app = await buildTemporaryApp();
  const response = await app.inject({ method: 'GET', url: '/student' });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Student sign in/);
  assert.match(response.body, /Feedback ready/);
  assert.match(response.body, /What to do/);
  assert.match(response.body, /needs_rewrite/);
  assert.match(response.body, /api\/student\/assignments/);

  await app.close();
});

test('serves EAP library shell and empty library API', async () => {
  const app = await buildTemporaryApp();
  const page = await app.inject({ method: 'GET', url: '/library' });
  const docs = await app.inject({ method: 'GET', url: '/api/library/docs' });
  const categories = await app.inject({ method: 'GET', url: '/api/library/categories' });

  assert.equal(page.statusCode, 200);
  assert.match(page.body, /EAP File Library/);
  assert.match(page.body, /api\/library\/docs/);

  assert.equal(docs.statusCode, 200);
  assert.deepEqual(docs.json(), []);

  assert.equal(categories.statusCode, 200);
  assert.ok(categories.json().length >= 3);

  await app.close();
});

test('EAP library logs views and gates downloads', async () => {
  const paths = temporaryPaths();
  fs.mkdirSync(paths.libraryUploadsDir, { recursive: true });
  fs.writeFileSync(path.join(paths.libraryUploadsDir, 'sample.html'), '<h1>Sample</h1>');

  const app = await buildApp(paths);
  const db = new DatabaseSync(paths.databasePath);
  try {
    db.prepare(`
      INSERT INTO eap_library_docs (filename, title, file_type, downloadable)
      VALUES ('sample.html', 'Sample File', 'html', 0)
    `).run();
  } finally {
    db.close();
  }

  const blocked = await app.inject({ method: 'GET', url: '/api/library/docs/1/download' });
  assert.equal(blocked.statusCode, 403);

  const db2 = new DatabaseSync(paths.databasePath);
  try {
    db2.prepare('UPDATE eap_library_docs SET downloadable = 1 WHERE id = 1').run();
  } finally {
    db2.close();
  }

  const downloaded = await app.inject({ method: 'GET', url: '/api/library/docs/1/download' });
  assert.equal(downloaded.statusCode, 200);
  assert.match(downloaded.body, /Sample/);

  const viewed = await app.inject({
    method: 'POST',
    url: '/api/library/docs/1/view',
    payload: { student_name: 'Alice', duration_seconds: 12 },
  });
  assert.equal(viewed.statusCode, 200);

  const db3 = new DatabaseSync(paths.databasePath);
  try {
    const doc = db3.prepare('SELECT views FROM eap_library_docs WHERE id = 1').get();
    const log = db3.prepare('SELECT student_name, duration_seconds FROM eap_library_view_log WHERE doc_id = 1').get();
    assert.equal(doc.views, 1);
    assert.equal(log.student_name, 'Alice');
    assert.equal(log.duration_seconds, 12);
  } finally {
    db3.close();
  }

  await app.close();
});
