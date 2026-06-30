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
  assert.equal(created.json().pad.version, 1);
  assert.equal(created.json().policy.paste_mode, 'log');
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Hello native pad' }] },
      plain_text: 'Hello native pad',
      expected_version: 1,
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().pad.word_count, 3);
  assert.equal(saved.json().pad.plain_text, 'Hello native pad');
  assert.equal(saved.json().pad.version, 2);

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

test('native autosave rejects stale document versions', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const firstSave = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'First save' }] },
      plain_text: 'First save',
      expected_version: 1,
    },
  });
  assert.equal(firstSave.statusCode, 200);
  assert.equal(firstSave.json().pad.version, 2);

  const staleSave = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Stale overwrite' }] },
      plain_text: 'Stale overwrite',
      expected_version: 1,
    },
  });
  assert.equal(staleSave.statusCode, 409);
  assert.equal(staleSave.json().error, 'version_conflict');
  assert.equal(staleSave.json().pad.plain_text, 'First save');
  assert.equal(staleSave.json().pad.version, 2);

  await app.close();
});

test('teacher can review native pad, add comments and change live paste policy', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Sentence one. Sentence two.' }] },
      plain_text: 'Sentence one. Sentence two.',
    },
  });
  assert.equal(saved.statusCode, 200);

  const policy = await app.inject({
    method: 'PUT',
    url: `/api/native/pads/${padId}/policy`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { paste_mode: 'block', spellcheck_enabled: false },
  });
  assert.equal(policy.statusCode, 200);
  assert.equal(policy.json().policy.paste_mode, 'block');
  assert.equal(policy.json().policy.spellcheck_enabled, false);

  const studentPolicy = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/policy`,
    headers: { cookie: cookies },
  });
  assert.equal(studentPolicy.statusCode, 200);
  assert.equal(studentPolicy.json().policy.paste_mode, 'block');

  const pasteEvent = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/paste-event`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: { length: 24, input_type: 'paste' },
  });
  assert.equal(pasteEvent.statusCode, 201);

  const general = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { type: 'general_comment', body: 'Good control overall.' },
  });
  assert.equal(general.statusCode, 201);
  assert.equal(general.json().annotation.type, 'general_comment');
  assert.equal(general.json().annotation.body, 'Good control overall.');

  const inline = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      type: 'inline_comment',
      start_offset: 0,
      end_offset: 12,
      selected_text: 'Sentence one',
      body: 'Make this opening more specific.',
      metadata: { tone: 'teacher' },
    },
  });
  assert.equal(inline.statusCode, 201);
  assert.equal(inline.json().annotation.type, 'inline_comment');
  assert.equal(inline.json().annotation.document_version, 2);

  const updatedInline = await app.inject({
    method: 'PATCH',
    url: `/api/native/annotations/${inline.json().annotation.id}`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { resolved: true },
  });
  assert.equal(updatedInline.statusCode, 200);
  assert.equal(updatedInline.json().annotation.resolved, true);

  const review = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/review`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(review.statusCode, 200);
  assert.equal(review.json().pad.plain_text, 'Sentence one. Sentence two.');
  assert.equal(review.json().policy.paste_mode, 'block');
  assert.equal(review.json().paste_events.length, 1);
  assert.deepEqual(review.json().annotations.map(annotation => annotation.type), ['general_comment', 'inline_comment']);

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

test('teacher native review page is served behind teacher auth', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { teacherCookies } = await seedNativeAssignment(app);

  const blocked = await app.inject({
    method: 'GET',
    url: '/teacher/native-review',
  });
  assert.equal(blocked.statusCode, 401);

  const page = await app.inject({
    method: 'GET',
    url: '/teacher/native-review',
    headers: { cookie: teacherCookies },
  });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Native review/);
  assert.match(page.body, /api\/native\/pads/);
  assert.match(page.body, /pasteMode/);

  await app.close();
});
