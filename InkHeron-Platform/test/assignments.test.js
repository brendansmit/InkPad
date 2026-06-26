import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-asgn-'));
  return path.join(dir, 'inkheron.db');
}

async function setupTeacher(app) {
  const setup = await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

async function setupStudent(app, { cookies: tCookies, csrf: tCsrf }, classId) {
  const res = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId },
    headers: { 'X-CSRF-Token': tCsrf, cookie: tCookies } });
  assert.equal(res.statusCode, 201);
  const login = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

test('teacher can create an assignment with settings_json', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);

  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'Grade 9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const res = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: {
      class_id: classId, title: 'First essay', type: 'essay',
      settings: { submit_behaviour: 'draft', spellcheck: true, green_pen: true },
      opens_at: '2026-01-01T00:00:00Z', due_at: '2026-12-31T23:59:59Z',
    },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  assert.equal(res.statusCode, 201);
  const { assignment } = res.json();
  assert.equal(assignment.title, 'First essay');
  assert.equal(assignment.class_id, classId);
  const settings = JSON.parse(assignment.settings_json);
  assert.equal(settings.submit_behaviour, 'draft');
  assert.equal(settings.word_count, true);
  assert.equal(settings.paste_detection, true);
  assert.equal(settings.green_pen, true);

  await app.close();
});

test('word_count and paste_detection are always true regardless of input', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const res = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Test', settings: { word_count: false, paste_detection: false } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(res.statusCode, 201);
  const settings = JSON.parse(res.json().assignment.settings_json);
  assert.equal(settings.word_count, true);
  assert.equal(settings.paste_detection, true);

  await app.close();
});

test('teacher can list, update and delete assignments', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Draft essay' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const id = created.json().assignment.id;

  const list = await app.inject({ method: 'GET', url: `/api/assignments?class_id=${classId}`,
    headers: { cookie: teacher.cookies } });
  assert.equal(list.json().assignments.length, 1);

  const updated = await app.inject({ method: 'PATCH', url: `/api/assignments/${id}`,
    payload: { title: 'Updated essay' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(updated.json().assignment.title, 'Updated essay');

  const deleted = await app.inject({ method: 'DELETE', url: `/api/assignments/${id}`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(deleted.statusCode, 204);

  await app.close();
});

test('student cannot create or list teacher assignments', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const student = await setupStudent(app, teacher, classId);

  const tryCreate = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Hack' },
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });
  assert.equal(tryCreate.statusCode, 403);

  await app.close();
});

test('student sees own assignments with correct statuses', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  // upcoming assignment (future opens_at)
  await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Coming soon',
      opens_at: '2099-01-01T00:00:00Z', due_at: '2099-12-31T23:59:59Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  // open assignment (past opens_at, future due_at)
  await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Open now',
      opens_at: '2020-01-01T00:00:00Z', due_at: '2099-12-31T23:59:59Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  // closed assignment (past due_at)
  await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Closed',
      opens_at: '2020-01-01T00:00:00Z', due_at: '2020-06-01T00:00:00Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  const student = await setupStudent(app, teacher, classId);
  const res = await app.inject({ method: 'GET', url: '/api/student/assignments',
    headers: { cookie: student.cookies } });
  assert.equal(res.statusCode, 200);

  const { assignments } = res.json();
  assert.equal(assignments.length, 3);
  const byTitle = Object.fromEntries(assignments.map(a => [a.title, a]));
  assert.equal(byTitle['Coming soon'].status, 'upcoming');
  assert.equal(byTitle['Open now'].status, 'not_started');
  assert.equal(byTitle['Closed'].status, 'closed');

  await app.close();
});
