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

async function createCustomTestAssignment(app, teacher, classId, sections, extra = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tests/assignments',
    payload: {
      class_id: classId,
      title: extra.title ?? 'Unit test',
      timer_minutes: extra.timer_minutes ?? null,
      sections,
      due_at: extra.due_at ?? null,
      essay_type: extra.essay_type,
      shuffle: extra.shuffle,
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

test('section passages appear in take payload and questions shuffle within sections only', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const alice = await createStudent(app, teacher, classId, 'alice');
  const bob = await createStudent(app, teacher, classId, 'bob');

  const mcqs = [];
  for (const prompt of ['First MCQ', 'Second MCQ', 'Third MCQ', 'Fourth MCQ']) {
    mcqs.push(await createQuestion(app, teacher, {
      kind: 'mcq',
      prompt_text: prompt,
      options: ['A', 'B', 'C'],
      answer_index: 1,
      points: 1,
    }));
  }
  const srq = await createQuestion(app, teacher, {
    kind: 'srq',
    prompt_text: 'Explain the passage.',
    model_answer: 'Mentions evidence.',
    points: 2,
  });
  const assignment = await createCustomTestAssignment(app, teacher, classId, [
    { kind: 'mcq', title: 'Passage A', passage_text: 'Passage A text for the first section.', question_ids: mcqs.map((q) => q.id) },
    { kind: 'srq', title: 'Passage B', passage_text: 'Passage B text for the second section.', question_ids: [srq.id] },
  ]);

  for (const student of [alice, bob]) {
    const start = await app.inject({
      method: 'POST',
      url: `/api/tests/${assignment.id}/start`,
      headers: { cookie: student.cookies, 'X-CSRF-Token': student.csrf },
    });
    assert.equal(start.statusCode, 201);
  }

  const aliceTake = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/take`,
    headers: { cookie: alice.cookies },
  });
  const bobTake = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/take`,
    headers: { cookie: bob.cookies },
  });
  const aliceReload = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/take`,
    headers: { cookie: alice.cookies },
  });
  assert.equal(aliceTake.statusCode, 200);
  assert.equal(bobTake.statusCode, 200);
  assert.equal(aliceReload.statusCode, 200);
  assertNoAnswerLeak(aliceTake.json());
  assert.equal(aliceTake.json().sections[0].passage_text, 'Passage A text for the first section.');
  assert.equal(aliceTake.json().sections[1].passage_text, 'Passage B text for the second section.');
  assert.deepEqual(aliceTake.json().sections.map((section) => section.title), ['Passage A', 'Passage B']);
  assert.deepEqual(bobTake.json().sections.map((section) => section.title), ['Passage A', 'Passage B']);

  const aliceOrder = aliceTake.json().sections[0].questions.map((question) => question.id);
  const bobOrder = bobTake.json().sections[0].questions.map((question) => question.id);
  assert.deepEqual(aliceReload.json().sections[0].questions.map((question) => question.id), aliceOrder);
  assert.notDeepEqual(bobOrder, aliceOrder);
  assert.deepEqual(new Set(aliceOrder), new Set(mcqs.map((q) => q.id)));
  assert.deepEqual(aliceTake.json().sections[1].questions.map((question) => question.id), [srq.id]);

  const review = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/review`,
    headers: { cookie: teacher.cookies },
  });
  assert.equal(review.statusCode, 200);
  assert.deepEqual(review.json().sections[0].question_ids, mcqs.map((q) => q.id));
  assert.equal(review.json().sections[0].passage_text, 'Passage A text for the first section.');

  await app.close();
});

test('shuffle false keeps authoring order inside each section', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const alice = await createStudent(app, teacher, classId, 'alice');
  const mcqs = [];
  for (const prompt of ['Alpha', 'Beta', 'Gamma']) {
    mcqs.push(await createQuestion(app, teacher, {
      kind: 'mcq',
      prompt_text: prompt,
      options: ['A', 'B'],
      answer_index: 0,
      points: 1,
    }));
  }
  const assignment = await createCustomTestAssignment(app, teacher, classId, [
    { kind: 'mcq', title: 'Fixed order', passage_text: 'Read this short passage.', question_ids: mcqs.map((q) => q.id) },
  ], { shuffle: false });
  const start = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/start`,
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(start.statusCode, 201);
  const take = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/take`,
    headers: { cookie: alice.cookies },
  });
  assert.equal(take.statusCode, 200);
  assert.deepEqual(take.json().sections[0].questions.map((question) => question.id), mcqs.map((q) => q.id));
  assert.equal(take.json().sections[0].passage_text, 'Read this short passage.');

  await app.close();
});

test('section shuffle false overrides global shuffle for that section', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const alice = await createStudent(app, teacher, classId, 'alice');
  const mcqs = [];
  for (const prompt of ['One', 'Two', 'Three', 'Four']) {
    mcqs.push(await createQuestion(app, teacher, {
      kind: 'mcq',
      prompt_text: prompt,
      options: ['A', 'B'],
      answer_index: 0,
      points: 1,
    }));
  }
  const assignment = await createCustomTestAssignment(app, teacher, classId, [
    { kind: 'mcq', title: 'Fixed section', shuffle: false, question_ids: mcqs.map((q) => q.id) },
  ], { shuffle: true });
  await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/start`,
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  const take = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/take`,
    headers: { cookie: alice.cookies },
  });
  assert.equal(take.statusCode, 200);
  assert.equal(take.json().sections[0].shuffle, false);
  assert.deepEqual(take.json().sections[0].questions.map((question) => question.id), mcqs.map((q) => q.id));

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

test('test portal pages are served behind the right sessions and dashboard links point to test pages', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const student = await createStudent(app, teacher, classId, 'alice');

  for (const url of ['/teacher/question-bank', '/teacher/new-test', '/teacher/test-review']) {
    const res = await app.inject({ method: 'GET', url, headers: { cookie: teacher.cookies } });
    assert.equal(res.statusCode, 200);
  }
  const studentTest = await app.inject({ method: 'GET', url: '/native/test/1', headers: { cookie: student.cookies } });
  assert.equal(studentTest.statusCode, 200);

  const studentDashboard = fs.readFileSync(path.join(process.cwd(), 'public/student-dashboard.html'), 'utf8');
  const teacherAssignments = fs.readFileSync(path.join(process.cwd(), 'public/teacher/assignments.html'), 'utf8');
  assert.match(studentDashboard, /\/native\/test\/\$\{a\.id\}/);
  assert.match(teacherAssignments, /\/teacher\/test-review\?assignment_id=/);
  assert.match(teacherAssignments, /\/teacher\/question-bank/);
  assert.match(teacherAssignments, /\/teacher\/new-test/);
  const testReview = fs.readFileSync(path.join(process.cwd(), 'public/teacher/test-review.html'), 'utf8');
  assert.match(testReview, /Green pen rewrite/);
  assert.match(testReview, /\/api\/native\/assignments\/\$\{assignmentId\}\/greenpen-rewrite/);

  await app.close();
});

test('green-penning a test creates an essay rewrite seeded from FRQ then SRQs', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const alice = await createStudent(app, teacher, classId, 'alice');
  const bob = await createStudent(app, teacher, classId, 'bob');

  const srqOne = await createQuestion(app, teacher, { kind: 'srq', prompt_text: 'Explain the first choice.', points: 2 });
  const srqTwo = await createQuestion(app, teacher, { kind: 'srq', prompt_text: 'Explain the second choice.', points: 2 });
  const frq = await createQuestion(app, teacher, { kind: 'frq', prompt_text: 'Write the full response.', points: 6 });
  const assignment = await createCustomTestAssignment(app, teacher, classId, [
    { kind: 'frq', title: 'Essay', question_ids: [frq.id] },
    { kind: 'srq', title: 'Short answers', question_ids: [srqOne.id, srqTwo.id] },
  ], { essay_type: 'synthesis', timer_minutes: 40 });

  const start = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/start`,
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(start.statusCode, 201);
  const bobStart = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/start`,
    headers: { cookie: bob.cookies, 'X-CSRF-Token': bob.csrf },
  });
  assert.equal(bobStart.statusCode, 201);

  const frqPad = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignment.id}/pad`,
    headers: { cookie: alice.cookies },
  });
  assert.equal(frqPad.statusCode, 200);
  const frqPadId = frqPad.json().pad.id;
  const frqText = 'FRQ answer begins here. It needs work.';
  const savedFrq = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${frqPadId}/save`,
    payload: { document: { type: 'doc' }, plain_text: frqText, expected_version: 1 },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(savedFrq.statusCode, 200);
  const mark = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${frqPadId}/annotations`,
    payload: {
      type: 'literacy_code',
      start_offset: 0,
      end_offset: 3,
      selected_text: 'FRQ',
      body: '',
      metadata: { code: 'Gra', category: 'grammar', label: 'Grammar' },
    },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(mark.statusCode, 201);

  for (const [question, text] of [[srqOne, 'First short answer.'], [srqTwo, 'Second short answer.']]) {
    const answer = await app.inject({
      method: 'PUT',
      url: `/api/tests/${assignment.id}/answers/${question.id}`,
      payload: { text },
      headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
    });
    assert.equal(answer.statusCode, 200);
  }

  const rewrite = await app.inject({
    method: 'POST',
    url: `/api/native/assignments/${assignment.id}/greenpen-rewrite`,
    payload: { title: 'Greenpen rewrite: Unit test' },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(rewrite.statusCode, 201);
  assert.equal(rewrite.json().assignment.type, 'essay');
  assert.equal(rewrite.json().copied_pads, 1);
  assert.equal(rewrite.json().copied_annotations, 1);

  const rewriteSettings = JSON.parse(rewrite.json().assignment.settings_json);
  assert.equal(rewriteSettings.type, 'essay');
  assert.equal(rewriteSettings.submit_behaviour, 'draft');
  assert.equal(rewriteSettings.native_inkpad, true);
  assert.equal(rewriteSettings.green_pen, false);
  assert.equal(rewriteSettings.greenpen_rewrite, true);
  assert.equal(rewriteSettings.source_assignment_id, assignment.id);
  assert.equal(rewriteSettings.essay_type, 'synthesis');
  assert.equal(rewriteSettings.supervision, 'in_class');
  assert.equal(rewriteSettings.feedback_release, 'batch');
  assert.equal(rewriteSettings.prompt, 'Rewrite your test answers using your feedback.');
  for (const key of ['test', 'timer_minutes', 'shuffle', 'focus_warning', 'pooling']) {
    assert.equal(Object.hasOwn(rewriteSettings, key), false, key);
  }

  const db = new DatabaseSync(dbPath);
  const rewritePad = db.prepare('SELECT * FROM native_pads WHERE assignment_id = ? AND student_id = ?')
    .get(rewrite.json().assignment.id, alice.student.id);
  assert.ok(rewritePad);
  assert.equal(rewritePad.rewrite_of_pad_id, frqPadId);
  assert.ok(rewritePad.plain_text.startsWith(frqText));
  assert.ok(rewritePad.plain_text.indexOf('Explain the first choice.') < rewritePad.plain_text.indexOf('First short answer.'));
  assert.ok(rewritePad.plain_text.indexOf('First short answer.') < rewritePad.plain_text.indexOf('Explain the second choice.'));
  assert.ok(rewritePad.plain_text.indexOf('Explain the second choice.') < rewritePad.plain_text.indexOf('Second short answer.'));
  const copiedMark = db.prepare('SELECT * FROM native_annotations WHERE native_pad_id = ?').get(rewritePad.id);
  assert.equal(copiedMark.start_offset, 0);
  assert.equal(copiedMark.end_offset, 3);
  assert.equal(copiedMark.selected_text, 'FRQ');
  assert.equal(JSON.parse(copiedMark.metadata_json).source_assignment_id, assignment.id);
  const bobPads = db.prepare('SELECT COUNT(*) AS n FROM native_pads WHERE assignment_id = ? AND student_id = ?')
    .get(rewrite.json().assignment.id, bob.student.id);
  assert.equal(bobPads.n, 0);
  db.close();

  const ctx = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${rewritePad.id}/greenpen-context`,
    headers: { cookie: alice.cookies },
  });
  assert.equal(ctx.statusCode, 200);
  assert.equal(ctx.json().original_pad_id, frqPadId);
  assert.equal(ctx.json().marks.length, 1);
  assert.equal(ctx.json().marks[0].quote, 'FRQ');
  assert.equal(ctx.json().marks[0].category, 'grammar');

  await app.close();
});

test('green-penning an SRQ-only test seeds pads from SRQs with no rewrite_of_pad_id', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const alice = await createStudent(app, teacher, classId, 'alice');
  const srq = await createQuestion(app, teacher, { kind: 'srq', prompt_text: 'Give one reason.', points: 2 });
  const assignment = await createCustomTestAssignment(app, teacher, classId, [
    { kind: 'srq', title: 'Short answers', question_ids: [srq.id] },
  ]);

  const start = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/start`,
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(start.statusCode, 201);
  const answer = await app.inject({
    method: 'PUT',
    url: `/api/tests/${assignment.id}/answers/${srq.id}`,
    payload: { text: 'Because the evidence is clear.' },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(answer.statusCode, 200);

  const rewrite = await app.inject({
    method: 'POST',
    url: `/api/native/assignments/${assignment.id}/greenpen-rewrite`,
    payload: { title: 'Greenpen rewrite: SRQ test' },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(rewrite.statusCode, 201);
  assert.equal(rewrite.json().copied_pads, 1);
  assert.equal(rewrite.json().copied_annotations, 0);

  const db = new DatabaseSync(dbPath);
  const rewritePad = db.prepare('SELECT * FROM native_pads WHERE assignment_id = ? AND student_id = ?')
    .get(rewrite.json().assignment.id, alice.student.id);
  assert.equal(rewritePad.rewrite_of_pad_id, null);
  assert.equal(rewritePad.plain_text, 'Give one reason.\nBecause the evidence is clear.');
  db.close();

  await app.close();
});

test('test exam activity supports acknowledgement, live monitor, pause, unlock and excusal', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const alice = await createStudent(app, teacher, classId, 'alice');
  const mcq = await createQuestion(app, teacher, {
    kind: 'mcq',
    prompt_text: 'Choose the valid claim.',
    options: ['First', 'Second'],
    answer_index: 0,
    points: 1,
  });
  const assignment = await createCustomTestAssignment(app, teacher, classId, [
    { kind: 'mcq', title: 'Multiple choice', question_ids: [mcq.id] },
  ], { timer_minutes: 20 });

  const acknowledged = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/acknowledge-rules`,
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(acknowledged.statusCode, 201);
  assert.ok(acknowledged.json().attempt.rules_acknowledged_at);
  assert.equal(acknowledged.json().attempt.seconds_remaining <= 1200, true);

  const focus = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/activity`,
    payload: { event_type: 'question_focus', question_id: mcq.id, section_index: 0 },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(focus.statusCode, 201);

  const warning = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/activity`,
    payload: { event_type: 'fullscreen_exit', question_id: mcq.id, metadata: { warning_number: 1 } },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(warning.statusCode, 201);
  const timing = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/activity`,
    payload: { event_type: 'question_time', question_id: mcq.id, metadata: { seconds: 12 } },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(timing.statusCode, 201);

  const answer = await app.inject({
    method: 'PUT',
    url: `/api/tests/${assignment.id}/answers/${mcq.id}`,
    payload: { chosen_index: 0 },
    headers: { cookie: alice.cookies, 'X-CSRF-Token': alice.csrf },
  });
  assert.equal(answer.statusCode, 200);

  const live = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/live`,
    headers: { cookie: teacher.cookies },
  });
  assert.equal(live.statusCode, 200);
  assert.equal(live.json().rows.length, 1);
  assert.equal(live.json().rows[0].student.id, alice.student.id);
  assert.equal(live.json().rows[0].current_question.id, mcq.id);
  assert.equal(live.json().rows[0].answered_count, 1);
  assert.equal(live.json().rows[0].warning_count, 1);
  assert.equal(live.json().rows[0].latest_warning.id, warning.json().event.id);

  const paused = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/pause`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(paused.statusCode, 200);
  assert.ok(paused.json().control.paused_at);

  const resumed = await app.inject({
    method: 'POST',
    url: `/api/tests/${assignment.id}/resume`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(resumed.statusCode, 200);
  assert.equal(resumed.json().control.paused_at, null);

  const attemptId = acknowledged.json().attempt.id;
  const added = await app.inject({
    method: 'POST',
    url: `/api/tests/attempts/${attemptId}/add-time`,
    payload: { minutes: 5 },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(added.statusCode, 200);
  assert.equal(added.json().attempt.extra_seconds, 300);

  const accessible = await app.inject({
    method: 'POST',
    url: `/api/tests/attempts/${attemptId}/accessibility`,
    payload: { sound_disabled: true, pulse_disabled: true },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(accessible.statusCode, 200);
  assert.equal(accessible.json().attempt.sound_disabled, true);
  assert.equal(accessible.json().attempt.pulse_disabled, true);

  const excused = await app.inject({
    method: 'POST',
    url: `/api/tests/activity-events/${warning.json().event.id}/excuse`,
    payload: { reason: 'Browser issue' },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(excused.statusCode, 200);
  assert.ok(excused.json().event.excused_at);

  const liveAfterExcuse = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/live`,
    headers: { cookie: teacher.cookies },
  });
  assert.equal(liveAfterExcuse.statusCode, 200);
  assert.equal(liveAfterExcuse.json().rows[0].warning_count, 0);
  assert.equal(liveAfterExcuse.json().rows[0].excused_warning_count, 1);
  assert.equal(liveAfterExcuse.json().rows[0].latest_warning, null);

  const force = await app.inject({
    method: 'POST',
    url: `/api/tests/attempts/${attemptId}/force-submit`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(force.statusCode, 200);
  assert.ok(force.json().attempt.submitted_at);

  const unlocked = await app.inject({
    method: 'POST',
    url: `/api/tests/attempts/${attemptId}/unlock`,
    payload: { minutes: 10, reason: 'Reopened after browser problem' },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(unlocked.statusCode, 200);
  assert.equal(unlocked.json().attempt.submitted_at, null);
  assert.ok(unlocked.json().attempt.unlocked_until);

  await app.close();
});
