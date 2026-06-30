import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';

function temporaryDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-native-pads-'));
  return path.join(dir, 'inkheron.db');
}

async function createTeacherSession(app, { username = 'teacher', password = 'teacherpass123' } = {}) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username, display_name: 'Teacher', password },
  });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrfToken: login.json().user.csrf_token };
}

async function loginStudent(app, username, password) {
  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrfToken: login.json().user.csrf_token };
}

async function seedNativeAssignment(app, { enabled = true } = {}) {
  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);

  const classResponse = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'Grade 9' },
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  assert.equal(classResponse.statusCode, 201);
  const classId = classResponse.json().class.id;

  const studentResponse = await app.inject({
    method: 'POST',
    url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice Chen', password: 'correct horse', class_id: classId },
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  assert.equal(studentResponse.statusCode, 201);

  const db = new DatabaseSync(app._databasePath);
  const settings = {
    type: 'essay',
    spellcheck: true,
    native_inkpad: enabled,
    prompt: 'Write one clear paragraph.',
  };
  const result = db.prepare(`
    INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
    VALUES (?, 'Native essay', 'essay', ?, datetime('now', '-1 day'), datetime('now', '+7 days'))
  `).run(classId, JSON.stringify(settings));
  db.close();

  return {
    assignmentId: result.lastInsertRowid,
    teacherCookies,
    teacherCsrf,
  };
}

test('native pad routes stay hidden unless assignment opts in', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId } = await seedNativeAssignment(app, { enabled: false });
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const response = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'native_inkpad_not_enabled');
  await app.close();
});

test('student can create, autosave and submit a native pad', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().pad.state, 'writing');
  assert.equal(created.json().pad.word_count, 0);
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Hello native pad' }] },
      plain_text: 'Hello native pad',
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().pad.word_count, 3);
  assert.equal(saved.json().pad.plain_text, 'Hello native pad');

  const submitted = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/submit`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
  });
  assert.equal(submitted.statusCode, 201);
  assert.equal(submitted.json().pad.state, 'submitted');
  assert.equal(submitted.json().locked, true);

  const blockedSave = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: { document: { type: 'doc' }, plain_text: 'late edit' },
  });
  assert.equal(blockedSave.statusCode, 409);

  const revisions = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/revisions`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(revisions.statusCode, 200);
  assert.deepEqual(revisions.json().revisions.map(revision => revision.reason), ['create', 'autosave', 'submit']);

  await app.close();
});

test('native write view renders without touching Etherpad', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId } = await seedNativeAssignment(app);
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const response = await app.inject({
    method: 'GET',
    url: `/native/write/${assignmentId}`,
    headers: { cookie: cookies },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Native InkPad/);
  assert.match(response.body, /Write one clear paragraph/);

  await app.close();
});
