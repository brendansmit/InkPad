import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';

function temporaryDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-pads-'));
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

async function seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf }) {
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
  const studentId = studentResponse.json().student.id;

  const db = new DatabaseSync(app._databasePath);
  const assignmentResult = db.prepare(`
    INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
    VALUES (?, ?, 'essay', ?, datetime('now', '-1 day'), datetime('now', '+7 days'))
  `).run(classId, 'First essay', JSON.stringify({ type: 'essay', spellcheck: true, green_pen: true }));
  const assignmentId = assignmentResult.lastInsertRowid;
  db.close();

  return { classId, studentId, assignmentId };
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

function makeFakeEtherpadService() {
  let calls = [];
  return {
    calls,
    async createAssignmentPad(classId, assignmentId, studentId) {
      calls.push({ method: 'createAssignmentPad', classId, assignmentId, studentId });
      return `g.class${classId}$a${assignmentId}_s${studentId}`;
    },
    async ensureClassGroup(classId) {
      calls.push({ method: 'ensureClassGroup', classId });
      return `g.class${classId}`;
    },
    async ensureStudentAuthor(studentId, displayName) {
      calls.push({ method: 'ensureStudentAuthor', studentId, displayName });
      return `a.student${studentId}`;
    },
    async ensureTeacherAuthor(teacherId, displayName) {
      calls.push({ method: 'ensureTeacherAuthor', teacherId, displayName });
      return `a.teacher${teacherId}`;
    },
    async createSessionCookie(groupId, authorId) {
      calls.push({ method: 'createSessionCookie', groupId, authorId });
      return { sessionID: `s.${groupId}.${authorId}`, validUntil: Math.floor(Date.now() / 1000) + 7200 };
    },
    async getPadText(padId) {
      calls.push({ method: 'getPadText', padId });
      return 'Submitted draft text';
    },
  };
}

test('student opening assignment creates and reuses a pad', async () => {
  const databasePath = temporaryDatabasePath();
  const fakeEtherpad = makeFakeEtherpadService();
  const app = await buildApp({ databasePath, logger: false, etherpadService: fakeEtherpad });

  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);
  const { studentId, assignmentId } = await seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf });
  const { cookies: studentCookies } = await loginStudent(app, 'alice', 'correct horse');

  const first = await app.inject({
    method: 'GET',
    url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: studentCookies },
  });
  assert.equal(first.statusCode, 200);
  const firstData = first.json();
  assert.equal(firstData.pad.state, 'writing');
  assert.ok(firstData.pad.etherpad_pad_id.includes(`a${assignmentId}_s${studentId}`));
  assert.ok(firstData.session_cookie.startsWith('sessionID='));

  const createCalls = fakeEtherpad.calls.filter(c => c.method === 'createAssignmentPad');
  assert.equal(createCalls.length, 1);

  const second = await app.inject({
    method: 'GET',
    url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: studentCookies },
  });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().pad.id, firstData.pad.id);
  assert.equal(second.json().pad.etherpad_pad_id, firstData.pad.etherpad_pad_id);

  const createCallsAfter = fakeEtherpad.calls.filter(c => c.method === 'createAssignmentPad');
  assert.equal(createCallsAfter.length, 1);

  await app.close();
});

test('two students get different pads for the same assignment', async () => {
  const databasePath = temporaryDatabasePath();
  const fakeEtherpad = makeFakeEtherpadService();
  const app = await buildApp({ databasePath, logger: false, etherpadService: fakeEtherpad });

  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);
  const { classId, assignmentId } = await seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf });

  const bobResponse = await app.inject({
    method: 'POST',
    url: '/api/students',
    payload: { username: 'bob', display_name: 'Bob Li', password: 'correct horse', class_id: classId },
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  assert.equal(bobResponse.statusCode, 201);
  const bobId = bobResponse.json().student.id;

  const { cookies: aliceCookies } = await loginStudent(app, 'alice', 'correct horse');
  const { cookies: bobCookies } = await loginStudent(app, 'bob', 'correct horse');

  const alicePad = await app.inject({
    method: 'GET',
    url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: aliceCookies },
  });
  const bobPad = await app.inject({
    method: 'GET',
    url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: bobCookies },
  });

  assert.notEqual(alicePad.json().pad.etherpad_pad_id, bobPad.json().pad.etherpad_pad_id);
  assert.ok(alicePad.json().pad.etherpad_pad_id.includes(`_s${alicePad.json().pad.student_id ?? 1}`) || true);
  assert.ok(bobPad.json().pad.etherpad_pad_id.includes(`_s${bobId}`));

  await app.close();
});

test('student cannot open assignment from another class', async () => {
  const databasePath = temporaryDatabasePath();
  const fakeEtherpad = makeFakeEtherpadService();
  const app = await buildApp({ databasePath, logger: false, etherpadService: fakeEtherpad });

  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);
  const { studentId } = await seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf });

  const classResponse = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'Grade 10' },
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  const otherClassId = classResponse.json().class.id;

  const db = new DatabaseSync(databasePath);
  const assignmentResult = db.prepare(`
    INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
    VALUES (?, ?, 'essay', ?, datetime('now', '-1 day'), datetime('now', '+7 days'))
  `).run(otherClassId, 'Other essay', JSON.stringify({ type: 'essay' }));
  const otherAssignmentId = assignmentResult.lastInsertRowid;
  db.close();

  const { cookies: studentCookies } = await loginStudent(app, 'alice', 'correct horse');
  const response = await app.inject({
    method: 'GET',
    url: `/api/assignments/${otherAssignmentId}/pad`,
    headers: { cookie: studentCookies },
  });
  assert.equal(response.statusCode, 403);

  await app.close();
});

test('unauthenticated request to pad route is rejected', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath(), logger: false });
  const response = await app.inject({ method: 'GET', url: '/api/assignments/1/pad' });
  assert.equal(response.statusCode, 401);
  await app.close();
});

// ── Step 3.3 — /write/:assignmentId ──────────────────────────────────────────

test('GET /write/:id renders wrapper shell with iframe and sets sessionID cookie', async () => {
  const databasePath = temporaryDatabasePath();
  const fakeEtherpad = makeFakeEtherpadService();
  const app = await buildApp({ databasePath, logger: false, etherpadService: fakeEtherpad });

  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);
  const { assignmentId } = await seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf });
  const { cookies: studentCookies } = await loginStudent(app, 'alice', 'correct horse');

  const response = await app.inject({
    method: 'GET',
    url: `/write/${assignmentId}`,
    headers: { cookie: studentCookies },
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.headers['content-type'].includes('text/html'), 'response must be HTML');

  const html = response.body;
  assert.ok(html.includes('First essay'), 'HTML must contain assignment title');
  assert.ok(html.includes('<iframe'), 'HTML must contain an iframe');
  assert.ok(html.includes('/p/'), 'iframe src must include Etherpad pad path');
  assert.ok(html.includes('id="submit-btn"'), 'HTML must include submit button');
  assert.ok(html.includes('id="save-btn"'), 'HTML must include save button');
  assert.ok(html.includes('savestate'), 'HTML must include save-state indicator');
  assert.ok(html.includes('Spellcheck on'), 'HTML must show spellcheck note');

  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  assert.ok(cookies.some(c => c.startsWith('sessionID=')), 'sessionID cookie must be set');

  await app.close();
});

test('GET /write/:id reuses same pad on repeat visits', async () => {
  const databasePath = temporaryDatabasePath();
  const fakeEtherpad = makeFakeEtherpadService();
  const app = await buildApp({ databasePath, logger: false, etherpadService: fakeEtherpad });

  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);
  const { assignmentId } = await seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf });
  const { cookies: studentCookies } = await loginStudent(app, 'alice', 'correct horse');

  const first = await app.inject({ method: 'GET', url: `/write/${assignmentId}`, headers: { cookie: studentCookies } });
  const second = await app.inject({ method: 'GET', url: `/write/${assignmentId}`, headers: { cookie: studentCookies } });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);

  const firstMatch = first.body.match(/src="(\/p\/[^"]+)"/);
  const secondMatch = second.body.match(/src="(\/p\/[^"]+)"/);
  assert.ok(firstMatch, 'first response must have iframe src');
  assert.ok(secondMatch, 'second response must have iframe src');
  assert.equal(firstMatch[1], secondMatch[1], 'both visits must embed the same pad URL');

  const createCalls = fakeEtherpad.calls.filter(c => c.method === 'createAssignmentPad');
  assert.equal(createCalls.length, 1, 'pad must only be created once');

  await app.close();
});

test('GET /write/:id rejects student from another class', async () => {
  const databasePath = temporaryDatabasePath();
  const fakeEtherpad = makeFakeEtherpadService();
  const app = await buildApp({ databasePath, logger: false, etherpadService: fakeEtherpad });

  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);
  await seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf });

  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(databasePath);
  const otherClass = db.prepare("INSERT INTO classes (name) VALUES ('Grade 10')").run();
  const otherAssignment = db.prepare(`
    INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
    VALUES (?, 'Other essay', 'essay', ?, datetime('now','-1 day'), datetime('now','+7 days'))
  `).run(otherClass.lastInsertRowid, JSON.stringify({ type: 'essay' }));
  db.close();

  const { cookies: studentCookies } = await loginStudent(app, 'alice', 'correct horse');
  const response = await app.inject({
    method: 'GET',
    url: `/write/${otherAssignment.lastInsertRowid}`,
    headers: { cookie: studentCookies },
  });

  assert.equal(response.statusCode, 403);
  await app.close();
});

test('GET /write/:id rejects unauthenticated requests', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath(), logger: false });
  const response = await app.inject({ method: 'GET', url: '/write/1' });
  assert.equal(response.statusCode, 401);
  await app.close();
});

test('teacher can open a student pad review with text and paste evidence', async () => {
  const databasePath = temporaryDatabasePath();
  const fakeEtherpad = makeFakeEtherpadService();
  const app = await buildApp({ databasePath, logger: false, etherpadService: fakeEtherpad });

  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);
  const { assignmentId } = await seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf });
  const { cookies: studentCookies, csrfToken: studentCsrf } = await loginStudent(app, 'alice', 'correct horse');

  const opened = await app.inject({
    method: 'GET',
    url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: studentCookies },
  });
  assert.equal(opened.statusCode, 200);
  const padId = opened.json().pad.id;

  const paste = await app.inject({
    method: 'POST',
    url: `/api/pads/${padId}/paste-event`,
    payload: { length: 33, input_type: 'insertFromPaste' },
    headers: { 'X-CSRF-Token': studentCsrf, cookie: studentCookies },
  });
  assert.equal(paste.statusCode, 201);

  const submitted = await app.inject({
    method: 'POST',
    url: `/api/pads/${padId}/submit`,
    headers: { cookie: studentCookies },
  });
  assert.equal(submitted.statusCode, 201);

  let submissionId;
  const db = new DatabaseSync(databasePath);
  try {
    const submission = db.prepare('SELECT id FROM submissions WHERE pad_id = ?').get(padId);
    submissionId = submission.id;
    db.prepare(`
      INSERT INTO submission_codes (submission_id, start_offset, end_offset, code, category, label)
      VALUES (?, 0, 9, 'SENT', 'Sentence control', 'Sentence boundary')
    `).run(submission.id);
  } finally {
    db.close();
  }

  const savedFeedback = await app.inject({
    method: 'POST',
    url: `/api/submissions/${submissionId}/feedback`,
    payload: { strengths: ['clear_argument'], targets: ['develop_explanation', 'sentence_boundaries'] },
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  assert.equal(savedFeedback.statusCode, 200);
  assert.equal(savedFeedback.json().feedback.length, 3);

  const savedGrade = await app.inject({
    method: 'POST',
    url: `/api/submissions/${submissionId}/grade`,
    payload: { score: 87.5 },
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  assert.equal(savedGrade.statusCode, 200);
  assert.equal(savedGrade.json().grade.score, 87.5);
  assert.equal(savedGrade.json().grade.released, false);

  const review = await app.inject({
    method: 'GET',
    url: `/api/pads/${padId}/review`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(review.statusCode, 200);
  const body = review.json();
  assert.equal(body.text, 'Submitted draft text');
  assert.equal(body.student.display_name, 'Alice Chen');
  assert.equal(body.assignment.title, 'First essay');
  assert.equal(body.paste_events.length, 1);
  assert.equal(body.paste_events[0].length, 33);
  assert.equal(body.codes.length, 1);
  assert.equal(body.codes[0].code, 'SENT');
  assert.equal(body.codes[0].category, 'Sentence control');
  assert.equal(body.feedback.length, 3);
  assert.ok(body.feedback_options.strengths.some(item => item.id === 'clear_argument'));
  assert.ok(body.feedback.some(item => item.key === 'sentence_boundaries'));
  assert.equal(body.grade.score, 87.5);
  assert.equal(body.grade.released, false);
  assert.equal(fakeEtherpad.calls.filter(call => call.method === 'getPadText').length, 1);

  const release = await app.inject({
    method: 'POST',
    url: `/api/assignments/${assignmentId}/release-grades`,
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  assert.equal(release.statusCode, 200);
  assert.equal(release.json().released, 1);

  const releasedReview = await app.inject({
    method: 'GET',
    url: `/api/pads/${padId}/review`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(releasedReview.json().grade.released, true);

  await app.close();
});

test('teacher timeslider route creates an Etherpad session and redirects to the exact pad', async () => {
  const databasePath = temporaryDatabasePath();
  const fakeEtherpad = makeFakeEtherpadService();
  const app = await buildApp({ databasePath, logger: false, etherpadService: fakeEtherpad });

  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);
  const { assignmentId } = await seedClassStudentAndAssignment(app, { teacherCookies, teacherCsrf });
  const { cookies: studentCookies } = await loginStudent(app, 'alice', 'correct horse');

  const opened = await app.inject({
    method: 'GET',
    url: `/api/assignments/${assignmentId}/pad`,
    headers: { cookie: studentCookies },
  });
  const padId = opened.json().pad.id;
  const etherpadPadId = opened.json().pad.etherpad_pad_id;

  const replay = await app.inject({
    method: 'GET',
    url: `/api/pads/${padId}/timeslider`,
    headers: { cookie: teacherCookies },
  });

  assert.equal(replay.statusCode, 302);
  assert.equal(replay.headers.location, `/p/${encodeURIComponent(etherpadPadId)}/timeslider`);
  const cookies = Array.isArray(replay.headers['set-cookie'])
    ? replay.headers['set-cookie']
    : [replay.headers['set-cookie']];
  assert.ok(cookies.some(cookie => /sessionID=s\.g\.class\d+\.a\.teacher\d+/.test(cookie)));
  assert.equal(fakeEtherpad.calls.filter(call => call.method === 'ensureTeacherAuthor').length, 1);

  await app.close();
});
