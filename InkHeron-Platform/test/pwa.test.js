import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { renderNativeWriteView } from '../src/views/nativeWrite.js';

function temporaryDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-pwa-'));
  return path.join(dir, 'inkheron.db');
}

test('PWA routes expose an installable manifest and root-scoped service worker', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath(), logger: false });
  try {
    const manifestResponse = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });
    assert.equal(manifestResponse.statusCode, 200);
    assert.match(manifestResponse.headers['content-type'], /application\/manifest\+json/);
    const manifest = manifestResponse.json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.scope, '/');
    assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
    assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));

    const workerResponse = await app.inject({ method: 'GET', url: '/sw.js' });
    assert.equal(workerResponse.statusCode, 200);
    assert.equal(workerResponse.headers['service-worker-allowed'], '/');
    assert.match(workerResponse.headers['cache-control'], /no-cache/);
    assert.match(workerResponse.body, /request\.mode === 'navigate'/);
    assert.match(workerResponse.body, /SAFE_PATHS\.has\(url\.pathname\)/);
    assert.doesNotMatch(workerResponse.body, /cache\.put\(request.*api/i);

    const offlineResponse = await app.inject({ method: 'GET', url: '/offline' });
    assert.equal(offlineResponse.statusCode, 200);
    assert.match(offlineResponse.body, /Essays and marking data are never stored/);
  } finally {
    await app.close();
  }
});

test('every static app page and native writer include install metadata', () => {
  const publicDir = path.resolve('public');
  const htmlFiles = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.name.endsWith('.html') && entry.name !== 'offline.html') htmlFiles.push(filePath);
    }
  };
  visit(publicDir);
  assert.ok(htmlFiles.length >= 20);
  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, 'utf8');
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/, filePath);
    assert.match(html, /rel="apple-touch-icon"/, filePath);
    assert.match(html, /src="\/assets\/pwa\.js" defer/, filePath);
  }

  const native = renderNativeWriteView({
    title: 'Essay',
    assignmentId: 1,
    pad: { state: 'writing', version: 1, plain_text: '' },
    policy: { paste_mode: 'log' },
    csrfToken: 'test',
    dueAt: null,
    spellcheck: true,
    prompt: '',
    passageText: '',
    passagePdf: null,
  });
  assert.match(native, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(native, /src="\/assets\/pwa\.js" defer/);
});

test('service worker cache allowlist excludes private application routes', () => {
  const worker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const allowlist = worker.match(/const SAFE_ASSETS = \[([\s\S]*?)\];/)?.[1] || '';
  for (const privatePrefix of ['/api/', '/teacher', '/student', '/native/', '/library/uploads/']) {
    assert.doesNotMatch(allowlist, new RegExp(privatePrefix.replaceAll('/', '\\/')));
  }
});

test('PWA registration runs on HTTPS and local development hosts', () => {
  const client = fs.readFileSync(new URL('../public/pwa.js', import.meta.url), 'utf8');
  assert.match(client, /location\.protocol === 'https:'/);
  assert.match(client, /location\.hostname === '127\.0\.0\.1'/);
  assert.match(client, /serviceWorker\.register\('\/sw\.js', \{ scope: '\/' \}\)/);
});
