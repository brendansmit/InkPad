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

async function createTeacherSession(app) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' },
  });
  assert.equal(setup.statusCode, 201);

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrfToken: login.json().user.csrf_token };
}

function multipartPayload({ fields = {}, file }) {
  const boundary = `----inkheron-${Date.now()}`;
  const chunks = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
  }

  if (file) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${file.contentType}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body));
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
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

test('EAP library admin manages uploads, visibility, downloads and categories', async () => {
  const paths = temporaryPaths();
  const app = await buildApp(paths);

  const blockedAdminPage = await app.inject({ method: 'GET', url: '/library/admin' });
  assert.equal(blockedAdminPage.statusCode, 401);

  const teacher = await createTeacherSession(app);
  const adminPage = await app.inject({
    method: 'GET',
    url: '/library/admin',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(adminPage.statusCode, 200);
  assert.match(adminPage.body, /EAP Library Admin/);

  const createdCategory = await app.inject({
    method: 'POST',
    url: '/api/library/admin/categories',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrfToken },
    payload: { label: 'Unit 1', icon: 'target' },
  });
  assert.equal(createdCategory.statusCode, 201);
  const categoryId = createdCategory.json().category.id;

  const updatedCategory = await app.inject({
    method: 'PUT',
    url: `/api/library/admin/categories/${categoryId}`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrfToken },
    payload: { label: 'Unit One', icon: 'folder' },
  });
  assert.equal(updatedCategory.statusCode, 200);
  assert.equal(updatedCategory.json().category.label, 'Unit One');

  const uploadBody = multipartPayload({
    fields: { title: 'Admin Upload', category_id: categoryId, icon: 'document', downloadable: '1' },
    file: { fieldName: 'file', filename: 'sample.html', contentType: 'text/html', body: '<h1>Admin Upload</h1>' },
  });
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/library/admin/docs',
    headers: {
      cookie: teacher.cookies,
      'X-CSRF-Token': teacher.csrfToken,
      'Content-Type': uploadBody.contentType,
    },
    payload: uploadBody.payload,
  });
  assert.equal(uploaded.statusCode, 201);
  const doc = uploaded.json().doc;
  assert.equal(doc.title, 'Admin Upload');
  assert.equal(doc.downloadable, true);
  assert.equal(doc.file_type, 'html');
  assert.ok(fs.existsSync(path.join(paths.libraryUploadsDir, doc.filename)));

  const publicDocs = await app.inject({ method: 'GET', url: '/api/library/docs' });
  assert.equal(publicDocs.json().length, 1);

  const download = await app.inject({ method: 'GET', url: `/api/library/docs/${doc.id}/download` });
  assert.equal(download.statusCode, 200);
  assert.match(download.body, /Admin Upload/);

  const hidden = await app.inject({
    method: 'PUT',
    url: `/api/library/admin/docs/${doc.id}`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrfToken },
    payload: { hidden: 1, downloadable: 0, release_at: '2026-07-01' },
  });
  assert.equal(hidden.statusCode, 200);
  assert.equal(hidden.json().doc.hidden, 1);
  assert.equal(hidden.json().doc.downloadable, false);

  const publicHidden = await app.inject({ method: 'GET', url: '/api/library/docs' });
  assert.deepEqual(publicHidden.json(), []);

  const shown = await app.inject({
    method: 'PUT',
    url: `/api/library/admin/docs/${doc.id}`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrfToken },
    payload: { hidden: 0, release_at: '' },
  });
  assert.equal(shown.statusCode, 200);

  const blockedDownload = await app.inject({ method: 'GET', url: `/api/library/docs/${doc.id}/download` });
  assert.equal(blockedDownload.statusCode, 403);

  const replaceBody = multipartPayload({
    file: { fieldName: 'file', filename: 'replacement.pdf', contentType: 'application/pdf', body: '%PDF-1.4 replacement' },
  });
  const replaced = await app.inject({
    method: 'POST',
    url: `/api/library/admin/docs/${doc.id}/replace`,
    headers: {
      cookie: teacher.cookies,
      'X-CSRF-Token': teacher.csrfToken,
      'Content-Type': replaceBody.contentType,
    },
    payload: replaceBody.payload,
  });
  assert.equal(replaced.statusCode, 200);
  assert.equal(replaced.json().doc.file_type, 'pdf');
  assert.equal(fs.existsSync(path.join(paths.libraryUploadsDir, doc.filename)), false);
  assert.ok(fs.existsSync(path.join(paths.libraryUploadsDir, replaced.json().doc.filename)));

  const view = await app.inject({
    method: 'POST',
    url: `/api/library/docs/${doc.id}/view`,
    payload: { student_name: 'Alice', duration_seconds: 7 },
  });
  assert.equal(view.statusCode, 200);

  const log = await app.inject({
    method: 'GET',
    url: '/api/library/admin/view-log',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(log.statusCode, 200);
  assert.equal(log.json()[0].student_name, 'Alice');

  const deletedCategory = await app.inject({
    method: 'DELETE',
    url: `/api/library/admin/categories/${categoryId}`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrfToken },
  });
  assert.equal(deletedCategory.statusCode, 200);

  const deletedDoc = await app.inject({
    method: 'DELETE',
    url: `/api/library/admin/docs/${doc.id}`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrfToken },
  });
  assert.equal(deletedDoc.statusCode, 200);
  assert.equal(fs.existsSync(path.join(paths.libraryUploadsDir, replaced.json().doc.filename)), false);

  await app.close();
});

test('root page is host-aware: inkpad gets the student login, others the EAP landing', async () => {
  const { buildApp } = await import('../src/app.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-root-'));
  const app = await buildApp({ databasePath: path.join(dir, 'inkheron.db'), logger: false });

  const inkpad = await app.inject({ method: 'GET', url: '/', headers: { host: 'inkpad.inkheron.app' } });
  assert.equal(inkpad.statusCode, 200);
  assert.match(inkpad.body, /Student sign in/, 'inkpad root serves the chooser');
  assert.match(inkpad.body, /Teacher sign in/);

  const eap = await app.inject({ method: 'GET', url: '/', headers: { host: 'eap.inkheron.app' } });
  assert.equal(eap.statusCode, 200);
  assert.match(eap.body, /Grammar Arcade/, 'other hosts keep the EAP landing');

  await app.close();
});
