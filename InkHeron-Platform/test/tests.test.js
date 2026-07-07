import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-tests-'));
  return path.join(dir, 'inkheron.db');
}

async function setupTeacher(app) {
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

async function createClass(app, teacher, name = 'Grade 9') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(res.statusCode, 201);
  return res.json().class.id;
}

async function createStudent(app, teacher, classId, username) {
  const password = 'studentpass123';
  const res = await app.inject({
    method: 'POST',
    url: '/api/students',
    payload: { username, display_name: username.toUpperCase(), password, class_id: classId },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(res.statusCode, 201);
  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token, student: res.json().student };
}

async function createQuestion(app, teacher, payload) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tests/questions',
    payload,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(res.statusCode, 201);
  return res.json().question;
}

async function createTestAssignment(app, teacher, classId, questions, extra = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tests/assignments',
    payload: {
      class_id: classId,
      title: extra.title ?? 'Unit test',
      timer_minutes: extra.timer_minutes ?? null,
      sections: [
        { kind: 'mcq', title: 'Choose', question_ids: [questions.mcq.id] },
        { kind: 'srq', title: 'Explain', question_ids: [questions.srq.id] },
        { kind: 'frq', title: 'Write', question_ids: [questions.frq.id] },
      ],
      due_at: extra.due_at ?? null,
    },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(res.statusCode, 201);
  return res.json().assignment;
}

function assertNoAnswerLeak(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key, 'answer_index');
    assert.notEqual(key, 'model_answer');
    assert.notEqual(key, 'is_correct');
    assert.notEqual(key, 'points_awarded');
    assertNoAnswerLeak(child);
  }
}

test('question bank CRUD and test assignment creation are teacher-only', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const student = await createStudent(app, teacher, classId, 'alice');

  const denied = await app.inject({
    method: 'POST',
    url: '/api/tests/questions',
    payload: { kind: 'mcq', prompt_text: 'No', options: ['A', 'B'], answer_index: 0 },
    headers: { cookie: student.cookies, 'X-CSRF-Token': student.csrf },
  });
  assert.equal(denied.statusCode, 403);

  const question = await createQuestion(app, teacher, {
    kind: 'mcq',
    prompt_text: 'Pick the claim.',
    options: ['A', 'B', 'C'],
    answer_index: 1,
    points: 2,
    tag: 'claims',
  });
  assert.equal(question.answer_index, 1);

  const updated = await app.inject({
    method: 'PUT',
    url: `/api/tests/questions/${question.id}`,
    payload: { ...question, prompt_text: 'Pick the strongest claim.', answer_index: 2 },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().question.answer_index, 2);

  const archived = await app.inject({
    method: 'POST',
    url: `/api/tests/questions/${question.id}/archive`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.json().is_archived, true);

  const srq = await createQuestion(app, teacher, {
    kind: 'srq',
    prompt_text: 'Explain one choice.',
    model_answer: 'Uses evidence.',
    points: 3,
  });
  const frq = await createQuestion(app, teacher, {
    kind: 'frq',
    prompt_text: 'Write the full response.',
    points: 6,
  });
  const activeMcq = await createQuestion(app, teacher, {
    kind: 'mcq',
    prompt_text: 'Pick again.',
    options: ['A', 'B'],
    answer_index: 0,
  });
  const assignment = await createTestAssignment(app, teacher, classId, { mcq: activeMcq, srq, frq });
  const settings = JSON.parse(assignment.settings_json);
  assert.equal(assignment.type, 'test');
  assert.equal(settings.submit_behaviour, 'exam');
  assert.equal(settings.pooling, 'off');
  assert.equal(settings.test.sections.length, 3);

  await app.close();
});

test('student test flow hides answer data, shuffles deterministically, records focus, scores and gates results', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const alice = await createStudent(app, teacher, classId, 'alice');

  const questions = {
    mcq: await createQuestion(app, teacher, {
      kind: 'mcq',
      prompt_text: 'Which sentence is most precise?',
      options: ['Maybe good', 'This is precise', 'Thing'],
      answer_index: 1,
      points: 2,
    }),
    srq: await createQuestion(app, teacher, {
      kind: 'srq',
      prompt_text: 'Explain your choice.',
      model_answer: 'Names precision and evidence.',
      points: 3,
    }),
    frq: await createQuestion(app, teacher, {
      kind: 'frq',
      prompt_text: 'Write a paragraph.',
      points: 6,
    }),
  };
  const assignment = await createTestAssignment(app, teacher, classId, questions);

  const started = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/start`,
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(started.statusCode, 201);
  const takePayload = started.json();
  assertNoAnswerLeak(takePayload);
  const firstOrder = takePayload.sections[0].questions[0].options.map((option) => option.index);

  const reloaded = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/take`,
    headers: { cookie: alice.cookies },
  });
  assert.equal(reloaded.statusCode, 200);
  assert.deepEqual(reloaded.json().sections[0].questions[0].options.map((option) => option.index), firstOrder);
  assertNoAnswerLeak(reloaded.json());

  const focus = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/focus-event`,
    payload: { kind: 'blur' },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(focus.statusCode, 201);

  const mcq = await app.inject({
    method: 'PUT',
    url: `/api/tests/${assignment.id}/answers/${questions.mcq.id}`,
    payload: { chosen_index: 1 },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(mcq.statusCode, 200);

  const srq = await app.inject({
    method: 'PUT',
    url: `/api/tests/${assignment.id}/answers/${questions.srq.id}`,
    payload: { text: 'It gives the clearest information.' },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(srq.statusCode, 200);

  const submitted = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/submit`,
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(submitted.statusCode, 201);
  assert.equal(submitted.json().submitted, true);
  assert.ok(submitted.json().frq_pad_id);

  const db = new DatabaseSync(dbPath);
  const focusCount = db.prepare('SELECT COUNT(*) AS n FROM test_focus_events').get().n;
  assert.equal(focusCount, 1);
  const pad = db.prepare('SELECT state FROM native_pads WHERE id = ?').get(submitted.json().frq_pad_id);
  assert.equal(pad.state, 'submitted');
  db.close();

  const held = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/results`,
    headers: { cookie: alice.cookies },
  });
  assert.equal(held.statusCode, 403);
  assert.equal(held.json().error, 'results_not_released');

  const review = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/review`,
    headers: { cookie: teacher.cookies },
  });
  assert.equal(review.statusCode, 200);
  const row = review.json().rows[0];
  assert.equal(row.totals.mcq, 2);
  assert.equal(row.frq.pad_id, submitted.json().frq_pad_id);
  const srqResponse = row.responses.find((response) => response.kind === 'srq');

  const scored = await app.inject({
    method: 'PUT',
    url: `/api/tests/responses/${srqResponse.id}/score`,
    payload: { points_awarded: 2.5 },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(scored.statusCode, 200);

  const release = await app.inject({
    method: 'POST',
    url: `/api/assignments/${assignment.id}/release-feedback`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(release.statusCode, 200);

  const results = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/results`,
    headers: { cookie: alice.cookies },
  });
  assert.equal(results.statusCode, 200);
  assert.equal(results.json().total.earned, 4.5);
  assert.equal(results.json().sections[0].questions[0].is_correct, true);
  assert.equal(Object.hasOwn(results.json().sections[0].questions[0], 'correct_index'), false);

  await app.close();
});

test('student writes are rejected after timer expiry and other students cannot open a private test', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const otherClassId = await createClass(app, teacher, 'Other');
  const alice = await createStudent(app, teacher, classId, 'alice');
  const bob = await createStudent(app, teacher, otherClassId, 'bob');
  const questions = {
    mcq: await createQuestion(app, teacher, {
      kind: 'mcq',
      prompt_text: 'Choose.',
      options: ['A', 'B'],
      answer_index: 0,
    }),
    srq: await createQuestion(app, teacher, { kind: 'srq', prompt_text: 'Why?', points: 1 }),
    frq: await createQuestion(app, teacher, { kind: 'frq', prompt_text: 'Write.', points: 1 }),
  };
  const assignment = await createTestAssignment(app, teacher, classId, questions, { timer_minutes: 1 });

  const bobStart = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/start`,
    headers: { cookie: bob.cookies, 'X-CSRF-Token': bob.csrf },
  });
  assert.equal(bobStart.statusCode, 404);

  const aliceStart = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/start`,
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(aliceStart.statusCode, 201);
  assert.equal(aliceStart.json().attempt.seconds_allowed, 60);

  const db = new DatabaseSync(dbPath);
  db.prepare(`
    UPDATE test_attempts
    SET started_at = datetime('now', '-3 minutes')
    WHERE assignment_id = ? AND student_id = ?
  `).run(assignment.id, alice.student.id);
  db.close();

  const late = await app.inject({
    method: 'PUT',
    url: `/api/tests/${assignment.id}/answers/${questions.mcq.id}`,
    payload: { chosen_index: 0 },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(late.statusCode, 409);
  assert.equal(late.json().error, 'attempt_locked');

  await app.close();
});
