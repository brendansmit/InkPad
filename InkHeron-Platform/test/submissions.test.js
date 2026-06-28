import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-sub-'));
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

async function setupTeacher(app) {
  const setup = await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

async function createClassAndStudent(app, teacher) {
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const stu = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const studentId = stu.json().student.id;

  const login = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const student = { id: studentId, cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };

  return { classId, student };
}

async function createAssignment(app, teacher, classId, settings = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: {
      class_id: classId, title: 'Essay', type: 'essay',
      opens_at: '2020-01-01T00:00:00Z', due_at: '2099-12-31T23:59:59Z',
      settings,
    },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(res.statusCode, 201);
  return res.json().assignment.id;
}

async function openPad(app, student, assignmentId) {
  const res = await app.inject({ method: 'GET', url: `/write/${assignmentId}`,
    headers: { cookie: student.cookies } });
  assert.equal(res.statusCode, 200);
  // Extract pad id from HTML (submit button uses it)
  const padRes = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: student.cookies } });
  return padRes.json().pad.id;
}

test('student can submit a draft pad — creates submission row, not locked', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);
  const assignmentId = await createAssignment(app, teacher, classId, { submit_behaviour: 'draft' });
  const padId = await openPad(app, student, assignmentId);

  const res = await app.inject({ method: 'POST', url: `/api/pads/${padId}/submit`,
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.pad.state, 'submitted');
  assert.equal(body.locked, false);
  assert.ok(body.submission.id > 0);

  await app.close();
});

test('student can submit an exam pad — returns locked: true', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);
  const assignmentId = await createAssignment(app, teacher, classId, { submit_behaviour: 'exam' });
  const padId = await openPad(app, student, assignmentId);

  const res = await app.inject({ method: 'POST', url: `/api/pads/${padId}/submit`,
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().locked, true);

  await app.close();
});

test('submitting twice returns 409', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);
  const assignmentId = await createAssignment(app, teacher, classId);
  const padId = await openPad(app, student, assignmentId);

  const first = await app.inject({ method: 'POST', url: `/api/pads/${padId}/submit`,
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });
  assert.equal(first.statusCode, 201);

  const second = await app.inject({ method: 'POST', url: `/api/pads/${padId}/submit`,
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });
  assert.equal(second.statusCode, 409);

  await app.close();
});

test('exam pad shows locked view after submit', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);
  const assignmentId = await createAssignment(app, teacher, classId, { submit_behaviour: 'exam' });
  const padId = await openPad(app, student, assignmentId);

  await app.inject({ method: 'POST', url: `/api/pads/${padId}/submit`,
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });

  const view = await app.inject({ method: 'GET', url: `/write/${assignmentId}`,
    headers: { cookie: student.cookies } });
  assert.equal(view.statusCode, 200);
  assert.ok(view.body.includes('Assignment closed'), 'should show locked view');
  assert.ok(!view.body.includes('id="submit-btn"'), 'should not show submit button');

  await app.close();
});

test('assignment not yet open returns 403 on write route', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);

  const future = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Future', opens_at: '2099-01-01T00:00:00Z', due_at: '2099-12-31T00:00:00Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = future.json().assignment.id;

  const res = await app.inject({ method: 'GET', url: `/write/${assignmentId}`,
    headers: { cookie: student.cookies } });
  assert.equal(res.statusCode, 403);

  await app.close();
});

test('past due_at auto-locks a writing pad and shows locked view', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);

  // Create assignment that is already past due
  const past = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Past due',
      opens_at: '2020-01-01T00:00:00Z', due_at: '2020-06-01T00:00:00Z',
      settings: { submit_behaviour: 'draft' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = past.json().assignment.id;

  const view = await app.inject({ method: 'GET', url: `/write/${assignmentId}`,
    headers: { cookie: student.cookies } });
  assert.equal(view.statusCode, 200);
  assert.ok(view.body.includes('Assignment closed'), 'should show locked view for overdue pad');

  await app.close();
});

test('student dashboard shows in_progress after opening a pad', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);
  const assignmentId = await createAssignment(app, teacher, classId);
  await openPad(app, student, assignmentId);

  const res = await app.inject({ method: 'GET', url: '/api/student/assignments',
    headers: { cookie: student.cookies } });
  const asgn = res.json().assignments.find(a => a.id === assignmentId);
  assert.equal(asgn.status, 'in_progress');

  await app.close();
});

test('student dashboard shows submitted after submitting', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);
  const assignmentId = await createAssignment(app, teacher, classId);
  const padId = await openPad(app, student, assignmentId);

  await app.inject({ method: 'POST', url: `/api/pads/${padId}/submit`,
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });

  const res = await app.inject({ method: 'GET', url: '/api/student/assignments',
    headers: { cookie: student.cookies } });
  const asgn = res.json().assignments.find(a => a.id === assignmentId);
  assert.equal(asgn.status, 'submitted');

  await app.close();
});

test('finish marking reopens green-pen assignment for rewrite', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);
  const assignmentId = await createAssignment(app, teacher, classId, { green_pen: true });
  const padId = await openPad(app, student, assignmentId);

  const submitted = await app.inject({ method: 'POST', url: `/api/pads/${padId}/submit`,
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });
  const submissionId = submitted.json().submission.id;

  const finished = await app.inject({ method: 'POST', url: `/api/submissions/${submissionId}/finish-marking`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(finished.statusCode, 200);
  assert.equal(finished.json().pad.state, 'green_pen_open');

  const view = await app.inject({ method: 'GET', url: `/write/${assignmentId}`,
    headers: { cookie: student.cookies } });
  assert.equal(view.statusCode, 200);
  assert.ok(view.body.includes('id="submit-btn"'), 'green-pen work should be editable again');
  assert.ok(!view.body.includes('Assignment closed'));

  const dashboard = await app.inject({ method: 'GET', url: '/api/student/assignments',
    headers: { cookie: student.cookies } });
  const asgn = dashboard.json().assignments.find(a => a.id === assignmentId);
  assert.equal(asgn.status, 'needs_rewrite');

  await app.close();
});

test('finish marking keeps non-green-pen assignment locked', async () => {
  const fakeEtherpad = makeFakeEtherpad();
  const app = await buildApp({ databasePath: tmpDb(), logger: false, etherpadService: fakeEtherpad });
  const teacher = await setupTeacher(app);
  const { classId, student } = await createClassAndStudent(app, teacher);
  const assignmentId = await createAssignment(app, teacher, classId, { green_pen: false });
  const padId = await openPad(app, student, assignmentId);

  const submitted = await app.inject({ method: 'POST', url: `/api/pads/${padId}/submit`,
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });
  const submissionId = submitted.json().submission.id;

  const finished = await app.inject({ method: 'POST', url: `/api/submissions/${submissionId}/finish-marking`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(finished.statusCode, 200);
  assert.equal(finished.json().pad.state, 'marked');

  const view = await app.inject({ method: 'GET', url: `/write/${assignmentId}`,
    headers: { cookie: student.cookies } });
  assert.equal(view.statusCode, 200);
  assert.ok(view.body.includes('Assignment closed'), 'marked work should stay locked');
  assert.ok(!view.body.includes('id="submit-btn"'));

  await app.close();
});
