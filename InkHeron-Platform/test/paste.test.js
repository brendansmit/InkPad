import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-paste-'));
  return path.join(dir, 'inkheron.db');
}

function makeFakeEtherpad() {
  return {
    async createAssignmentPad(classId, assignmentId, studentId) {
      return `g.c${classId}$a${assignmentId}_s${studentId}`;
    },
    async ensureClassGroup(classId) { return `g.c${classId}`; },
    async ensureStudentAuthor(studentId) { return `a.s${studentId}`; },
    async createSessionCookie(groupId, authorId) {
      return { sessionID: `sess.${groupId}.${authorId}`, validUntil: Date.now() / 1000 + 7200 };
    },
  };
}

async function setupAll(app) {
  const setup = await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);

  const tLogin = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const teacher = { cookies: tLogin.headers['set-cookie'], csrf: tLogin.json().user.csrf_token };

  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const stu = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const studentId = stu.json().student.id;

  const sLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const student = { id: studentId, cookies: sLogin.headers['set-cookie'], csrf: sLogin.json().user.csrf_token };

  const asgn = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', opens_at: '2020-01-01T00:00:00Z', due_at: '2099-12-31T23:59:59Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = asgn.json().assignment.id;

  // Open the pad to provision it
  const padApi = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: student.cookies } });
  const padId = padApi.json().pad.id;

  return { teacher, student, assignmentId, padId, classId };
}

test('paste event is stored against the pad', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: makeFakeEtherpad() });
  const { student, padId } = await setupAll(app);

  const res = await app.inject({
    method: 'POST',
    url: `/api/pads/${padId}/paste-event`,
    payload: { length: 120, input_type: 'insertFromPaste' },
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().ok, true);

  await app.close();
});

test('paste event rejects zero or missing length', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: makeFakeEtherpad() });
  const { student, padId } = await setupAll(app);

  const res = await app.inject({
    method: 'POST',
    url: `/api/pads/${padId}/paste-event`,
    payload: { length: 0, input_type: 'insertFromPaste' },
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies },
  });
  assert.equal(res.statusCode, 400);

  await app.close();
});

test('paste event rejects unauthenticated request', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: makeFakeEtherpad() });
  const { padId } = await setupAll(app);

  const res = await app.inject({
    method: 'POST',
    url: `/api/pads/${padId}/paste-event`,
    payload: { length: 50, input_type: 'insertFromPaste' },
  });
  assert.equal(res.statusCode, 401);

  await app.close();
});

test('student cannot post to another student pad', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });

  // Two students in the same class, each with their own pad
  const tLogin = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  // teacher doesn't exist yet, set up first
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const tL2 = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const teacher = { cookies: tL2.headers['set-cookie'], csrf: tL2.json().user.csrf_token };

  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  for (const name of ['bob', 'carol']) {
    await app.inject({ method: 'POST', url: '/api/students',
      payload: { username: name, display_name: name, password: 'pass12345', class_id: classId },
      headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  }

  const asgn = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', opens_at: '2020-01-01T00:00:00Z', due_at: '2099-12-31T23:59:59Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = asgn.json().assignment.id;

  const bobLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'bob', password: 'pass12345' } });
  const bob = { cookies: bobLogin.headers['set-cookie'], csrf: bobLogin.json().user.csrf_token };

  const carolLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'carol', password: 'pass12345' } });
  const carol = { cookies: carolLogin.headers['set-cookie'], csrf: carolLogin.json().user.csrf_token };

  // Bob provisions his pad
  const bobPad = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: bob.cookies } });
  const bobPadId = bobPad.json().pad.id;

  // Carol tries to post to Bob's pad
  const res = await app.inject({
    method: 'POST',
    url: `/api/pads/${bobPadId}/paste-event`,
    payload: { length: 200, input_type: 'insertFromPaste' },
    headers: { 'X-CSRF-Token': carol.csrf, cookie: carol.cookies },
  });
  assert.equal(res.statusCode, 404);

  await app.close();
});
