import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { maskSecret } from '../src/services/settingsStore.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-settings-'));
  return path.join(dir, 'inkheron.db');
}

async function createTeacherSession(app) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' },
  });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

async function createStudentSession(app, teacher) {
  const cls = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'G9' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(cls.statusCode, 201);

  const student = await app.inject({
    method: 'POST',
    url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: cls.json().class.id },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(student.statusCode, 201);

  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

test('maskSecret keeps only a small prefix and suffix', () => {
  assert.equal(maskSecret('sk-or-12345678904f2a'), 'sk-or-...4f2a');
  assert.equal(maskSecret('short'), '****');
  assert.equal(maskSecret(''), null);
});

test('teacher can store settings and read back only masked values', async () => {
  const databasePath = tmpDb();
  const app = await buildApp({ databasePath, logger: false });
  const teacher = await createTeacherSession(app);

  const saved = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: {
      openrouter_api_key: 'sk-or-12345678904f2a',
      serverchan_key: 'SCT123456789xyz',
    },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.json().settings.openrouter_api_key, {
    is_set: true,
    masked: 'sk-or-...4f2a',
    updated_at: saved.json().settings.openrouter_api_key.updated_at,
  });
  assert.equal(saved.json().settings.serverchan_key.is_set, true);
  assert.equal(JSON.stringify(saved.json()).includes('1234567890'), false);
  assert.equal(JSON.stringify(saved.json()).includes('SCT123456789xyz'), false);

  const read = await app.inject({
    method: 'GET',
    url: '/api/settings',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().settings.openrouter_api_key.masked, 'sk-or-...4f2a');
  assert.equal(JSON.stringify(read.json()).includes('sk-or-12345678904f2a'), false);

  const db = new DatabaseSync(databasePath);
  try {
    const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all()
      .map(row => ({ key: row.key, value: row.value }));
    assert.deepEqual(rows, [
      { key: 'openrouter_api_key', value: 'sk-or-12345678904f2a' },
      { key: 'serverchan_key', value: 'SCT123456789xyz' },
    ]);
  } finally {
    db.close();
  }

  await app.close();
});

test('settings API rejects students and missing CSRF', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);
  const student = await createStudentSession(app, teacher);

  const studentRead = await app.inject({
    method: 'GET',
    url: '/api/settings',
    headers: { cookie: student.cookies },
  });
  assert.equal(studentRead.statusCode, 403);

  const missingCsrf = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { serverchan_key: 'SCT123' },
    headers: { cookie: teacher.cookies },
  });
  assert.equal(missingCsrf.statusCode, 403);

  const unknownOnly = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { unknown_key: 'secret' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
  });
  assert.equal(unknownOnly.statusCode, 400);

  await app.close();
});

test('teacher settings screen is teacher-only and linked from dashboard', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await createTeacherSession(app);
  const student = await createStudentSession(app, teacher);

  const unauth = await app.inject({ method: 'GET', url: '/teacher/settings' });
  assert.equal(unauth.statusCode, 401);

  const studentPage = await app.inject({
    method: 'GET',
    url: '/teacher/settings',
    headers: { cookie: student.cookies },
  });
  assert.equal(studentPage.statusCode, 403);

  const page = await app.inject({
    method: 'GET',
    url: '/teacher/settings',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /id="settingsForm"/);
  assert.match(page.body, /OpenRouter API key/);
  assert.match(page.body, /ServerChan key/);
  assert.doesNotMatch(page.body, /sk-or-12345678904f2a/);

  const dashboard = await app.inject({
    method: 'GET',
    url: '/teacher',
    headers: { cookie: teacher.cookies },
  });
  assert.equal(dashboard.statusCode, 200);
  assert.match(dashboard.body, /href="\/teacher\/settings"/);

  await app.close();
});
