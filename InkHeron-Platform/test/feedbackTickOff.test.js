import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-tickoff-'));
  return path.join(dir, 'inkheron.db');
}

async function teacherSession(app) {
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

// Seeds a class, two students, a greenpen-enabled assignment (immediate
// release), submits alice's pad, adds a target, and finishes marking. Under the
// separate-assignment model finish-marking lands the source pad on 'marked' and
// spins up the green-pen rewrite assignment; alice ticks targets off on her
// rewrite pad there.
async function seedGreenPenPad(app) {
  const t = await teacherSession(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const classId = cls.json().class.id;

  const aliceRes = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const bobRes = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'bob', display_name: 'Bob', password: 'pass12345', class_id: classId },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const aliceId = aliceRes.json().student.id;
  const bobId = bobRes.json().student.id;

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', settings: { green_pen: true, feedback_release: 'immediate' } },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const assignmentId = created.json().assignment.id;

  const aliceLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const aliceCookies = aliceLogin.headers['set-cookie'];
  const aliceCsrf = aliceLogin.json().user.csrf_token;

  const bobLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'bob', password: 'pass12345' } });
  const bobCookies = bobLogin.headers['set-cookie'];
  const bobCsrf = bobLogin.json().user.csrf_token;

  const padRes = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: aliceCookies } });
  const padId = padRes.json().pad.id;

  await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/submit`,
    headers: { cookie: aliceCookies, 'X-CSRF-Token': aliceCsrf } });

  const item = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-items`,
    payload: { kind: 'target', title: 'Vary sentence openings', explanation: 'Too many sentences start the same way.' },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const itemId = item.json().item.id;

  const finished = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/finish-marking`,
    headers: { cookie: t.cookies, 'X-CSRF-Token': t.csrf } });
  assert.equal(finished.json().pad.state, 'marked');
  const rewriteAssignmentId = finished.json().rewrite_assignment.id;

  // Alice's rewrite pad in the new assignment (created by finish-marking under
  // immediate release). This is where she does the green-pen round.
  const rewritePadRes = await app.inject({ method: 'GET', url: `/api/native/assignments/${rewriteAssignmentId}/pad`,
    headers: { cookie: aliceCookies } });
  const rewritePadId = rewritePadRes.json().pad.id;

  return { t, assignmentId, rewriteAssignmentId, padId, rewritePadId, itemId, aliceId, aliceCookies, aliceCsrf, bobId, bobCookies, bobCsrf };
}

test('the owning student can toggle a target checked and unchecked', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const { rewritePadId, itemId, aliceCookies, aliceCsrf } = await seedGreenPenPad(app);

  const on = await app.inject({ method: 'POST', url: `/api/native/pads/${rewritePadId}/feedback-items/${itemId}/toggle-check`,
    headers: { cookie: aliceCookies, 'X-CSRF-Token': aliceCsrf } });
  assert.equal(on.statusCode, 200);
  assert.equal(on.json().item.student_checked, true);
  assert.ok(on.json().item.student_checked_at);

  const off = await app.inject({ method: 'POST', url: `/api/native/pads/${rewritePadId}/feedback-items/${itemId}/toggle-check`,
    headers: { cookie: aliceCookies, 'X-CSRF-Token': aliceCsrf } });
  assert.equal(off.statusCode, 200);
  assert.equal(off.json().item.student_checked, false);
  assert.equal(off.json().item.student_checked_at, null);

  await app.close();
});

test('another student gets 404, not the owner\'s pad', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const { rewritePadId, itemId, bobCookies, bobCsrf } = await seedGreenPenPad(app);

  const res = await app.inject({ method: 'POST', url: `/api/native/pads/${rewritePadId}/feedback-items/${itemId}/toggle-check`,
    headers: { cookie: bobCookies, 'X-CSRF-Token': bobCsrf } });
  assert.equal(res.statusCode, 404);

  await app.close();
});

test('toggle is rejected once the pad is outside the green pen window', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const t = await teacherSession(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const classId = cls.json().class.id;
  await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  // green_pen NOT enabled, so finish-marking lands on 'marked', not 'green_pen_open'.
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', settings: { green_pen: false } },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const assignmentId = created.json().assignment.id;
  const aliceLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const aliceCookies = aliceLogin.headers['set-cookie'];
  const aliceCsrf = aliceLogin.json().user.csrf_token;
  const padRes = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: aliceCookies } });
  const padId = padRes.json().pad.id;
  await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/submit`,
    headers: { cookie: aliceCookies, 'X-CSRF-Token': aliceCsrf } });
  const item = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-items`,
    payload: { kind: 'target', title: 'Vary sentence openings' },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const itemId = item.json().item.id;
  const finished = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/finish-marking`,
    headers: { cookie: t.cookies, 'X-CSRF-Token': t.csrf } });
  assert.equal(finished.json().pad.state, 'marked');

  const res = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-items/${itemId}/toggle-check`,
    headers: { cookie: aliceCookies, 'X-CSRF-Token': aliceCsrf } });
  assert.equal(res.statusCode, 409);

  await app.close();
});

test('student_checked appears in both the student feedback view and the teacher review payload', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const { t, assignmentId, padId, rewritePadId, itemId, aliceCookies, aliceCsrf } = await seedGreenPenPad(app);

  await app.inject({ method: 'POST', url: `/api/native/pads/${rewritePadId}/feedback-items/${itemId}/toggle-check`,
    headers: { cookie: aliceCookies, 'X-CSRF-Token': aliceCsrf } });

  const feedback = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/feedback`,
    headers: { cookie: aliceCookies } });
  assert.equal(feedback.statusCode, 200);
  assert.equal(feedback.json().feedback.targets[0].student_checked, true);

  const review = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/review`,
    headers: { cookie: t.cookies } });
  assert.equal(review.statusCode, 200);
  assert.equal(review.json().feedback.targets[0].student_checked, true);

  await app.close();
});
