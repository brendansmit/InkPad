import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { estimateRubric } from '../src/services/markerProfile.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-markerprofile-'));
  return path.join(dir, 'inkheron.db');
}

const ESSAY = 'They is playing outside. The game was fun but she recieved the ball too late to win.';

function doerResponse(items) {
  return {
    model: 'fake/doer-model',
    choices: [{ message: { content: JSON.stringify(items) } }],
  };
}

function checkerResponse(verdicts) {
  return {
    model: 'fake/checker-model',
    choices: [{ message: { content: JSON.stringify(verdicts) } }],
  };
}

async function seedPad(db, { withRubric = true } = {}) {
  const app = await buildApp({ db, logger: false });
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const csrf = login.json().user.csrf_token;
  const cookies = login.headers['set-cookie'];
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const studentRes = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: cls.json().class.id },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const studentId = studentRes.json().student.id;
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: {} },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const assignmentId = created.json().assignment.id;

  const padId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'submitted', '{}', ?, 16, 1)
  `).run(studentId, assignmentId, ESSAY).lastInsertRowid;

  let ideasId = null;
  let organisationId = null;
  if (withRubric) {
    ideasId = db.prepare(`
      INSERT INTO assignment_rubric_criteria (assignment_id, label, description, rubric_kind, sort_order)
      VALUES (?, 'Ideas', 'Quality and development of ideas', 'internal', 0)
    `).run(assignmentId).lastInsertRowid;
    for (const [score, label] of [[1, 'Weak'], [2, 'Developing'], [3, 'Strong'], [4, 'Excellent']]) {
      db.prepare(`
        INSERT INTO assignment_rubric_bands (criterion_id, score_value, label, descriptor, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(ideasId, score, label, `${label} ideas`, score);
    }

    organisationId = db.prepare(`
      INSERT INTO assignment_rubric_criteria (assignment_id, label, description, rubric_kind, sort_order)
      VALUES (?, 'Organisation', 'Structure and flow', 'exam', 1)
    `).run(assignmentId).lastInsertRowid;
    for (const [score, label] of [[1, 'Weak'], [2, 'Developing'], [3, 'Strong']]) {
      db.prepare(`
        INSERT INTO assignment_rubric_bands (criterion_id, score_value, label, descriptor, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(organisationId, score, label, `${label} organisation`, score);
    }
  }

  return { app, padId, studentId, assignmentId, ideasId, organisationId };
}

test('estimateRubric writes one row per criterion per rubric_kind with teacher_score left null', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, studentId, assignmentId, ideasId, organisationId } = await seedPad(db);

  // Doer is called once per rubric_kind; route by which criterion id it is asked about.
  const fakeChat = (db2, { intent, messages }) => {
    if (intent.includes('gemini')) return Promise.resolve(checkerResponse([]));
    const userMsg = messages[0].content;
    if (userMsg.includes('Ideas')) {
      return Promise.resolve(doerResponse([{ criterion_id: ideasId, score: 3, rationale: 'Develops the losing-the-ball idea clearly.' }]));
    }
    return Promise.resolve(doerResponse([{ criterion_id: organisationId, score: 2, rationale: 'The essay has a beginning and end but weak transitions.' }]));
  };

  const result = await estimateRubric(db, { padId }, { chat: fakeChat });
  assert.equal(result.status, 'ok');

  const rows = db.prepare('SELECT * FROM ai_grade_estimates WHERE native_pad_id = ? ORDER BY rubric_kind ASC').all(padId);
  assert.equal(rows.length, 2);

  const internal = rows.find((r) => r.rubric_kind === 'internal');
  assert.equal(internal.criterion_id, ideasId);
  assert.equal(internal.ai_score, 3);
  assert.equal(internal.student_id, studentId);
  assert.equal(internal.assignment_id, assignmentId);
  assert.equal(internal.model, 'fake/doer-model');
  assert.match(internal.rationale, /losing-the-ball/);
  assert.equal(internal.teacher_score, null);
  assert.equal(internal.delta, null);

  const exam = rows.find((r) => r.rubric_kind === 'exam');
  assert.equal(exam.criterion_id, organisationId);
  assert.equal(exam.ai_score, 2);

  await app.close();
});

test('re-run clears prior estimates instead of duplicating them', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, ideasId, organisationId } = await seedPad(db);

  const fakeChat = (db2, { intent, messages }) => {
    if (intent.includes('gemini')) return Promise.resolve(checkerResponse([]));
    const userMsg = messages[0].content;
    if (userMsg.includes('Ideas')) {
      return Promise.resolve(doerResponse([{ criterion_id: ideasId, score: 3, rationale: 'Develops the idea clearly in paragraph two.' }]));
    }
    return Promise.resolve(doerResponse([{ criterion_id: organisationId, score: 2, rationale: 'Has a beginning and an end.' }]));
  };

  await estimateRubric(db, { padId }, { chat: fakeChat });
  await estimateRubric(db, { padId }, { chat: fakeChat });

  const count = db.prepare('SELECT COUNT(*) AS n FROM ai_grade_estimates WHERE native_pad_id = ?').get(padId);
  assert.equal(count.n, 2);

  await app.close();
});

test('a score outside the band range is dropped even without a checker verdict', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, ideasId, organisationId } = await seedPad(db);

  const fakeChat = (db2, { intent, messages }) => {
    if (intent.includes('gemini')) return Promise.reject(new Error('openrouter_api_key not set'));
    const userMsg = messages[0].content;
    if (userMsg.includes('Ideas')) {
      // 99 is outside the 1-4 band range for Ideas.
      return Promise.resolve(doerResponse([{ criterion_id: ideasId, score: 99, rationale: 'Bad score.' }]));
    }
    return Promise.resolve(doerResponse([{ criterion_id: organisationId, score: 2, rationale: 'Has a beginning and an end.' }]));
  };

  const result = await estimateRubric(db, { padId }, { chat: fakeChat });
  assert.equal(result.status, 'ok');

  const rows = db.prepare('SELECT * FROM ai_grade_estimates WHERE native_pad_id = ?').all(padId);
  assert.equal(rows.length, 1, 'the out-of-range Ideas estimate was dropped, the valid Organisation one kept');
  assert.equal(rows[0].rubric_kind, 'exam');

  await app.close();
});

test('a checker-flagged out-of-range or ungrounded estimate is dropped', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, ideasId, organisationId } = await seedPad(db);

  const fakeChat = (db2, { intent, messages }) => {
    if (intent.includes('gemini')) return Promise.resolve(checkerResponse([{ index: 0, in_range: true, grounded: false }]));
    const userMsg = messages[0].content;
    if (userMsg.includes('Ideas')) {
      return Promise.resolve(doerResponse([{ criterion_id: ideasId, score: 3, rationale: 'Generic statement.' }]));
    }
    return Promise.resolve(doerResponse([]));
  };

  const result = await estimateRubric(db, { padId }, { chat: fakeChat });
  assert.equal(result.status, 'ok');

  const rows = db.prepare('SELECT * FROM ai_grade_estimates WHERE native_pad_id = ?').all(padId);
  assert.equal(rows.length, 0, 'checker flagged the only estimate as ungrounded');

  await app.close();
});

test('checker failure is non-fatal and keeps the deterministically-guarded doer output', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, ideasId, organisationId } = await seedPad(db);

  const fakeChat = (db2, { intent, messages }) => {
    if (intent.includes('gemini')) return Promise.reject(new Error('openrouter_api_key not set'));
    const userMsg = messages[0].content;
    if (userMsg.includes('Ideas')) {
      return Promise.resolve(doerResponse([{ criterion_id: ideasId, score: 3, rationale: 'Develops the idea clearly.' }]));
    }
    return Promise.resolve(doerResponse([{ criterion_id: organisationId, score: 2, rationale: 'Has a clear structure.' }]));
  };

  const result = await estimateRubric(db, { padId }, { chat: fakeChat });
  assert.equal(result.status, 'ok');
  const rows = db.prepare('SELECT * FROM ai_grade_estimates WHERE native_pad_id = ?').all(padId);
  assert.equal(rows.length, 2);

  await app.close();
});

test('missing rubric skips without calling the model', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(db, { withRubric: false });

  let called = false;
  const countingChat = () => { called = true; return Promise.resolve(doerResponse([])); };

  const result = await estimateRubric(db, { padId }, { chat: countingChat });
  assert.equal(result.status, 'skipped');
  assert.equal(called, false, 'model must not be called when the assignment has no rubric');

  await app.close();
});

test('empty essay text skips without calling the model', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedPad(db);

  const secondAssignmentId = db.prepare(`
    INSERT INTO assignments (class_id, title, type, settings_json)
    VALUES ((SELECT class_id FROM students WHERE id = ?), 'Second essay', 'essay', '{}')
  `).run(studentId).lastInsertRowid;
  const emptyPadId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'writing', '{}', '', 0, 1)
  `).run(studentId, secondAssignmentId).lastInsertRowid;

  let called = false;
  const countingChat = () => { called = true; return Promise.resolve(doerResponse([])); };

  const result = await estimateRubric(db, { padId: emptyPadId }, { chat: countingChat });
  assert.equal(result.status, 'skipped');
  assert.equal(called, false, 'model must not be called for a pad with no text');

  await app.close();
});

test('model failure writes nothing and returns error status', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(db);

  const result = await estimateRubric(db, { padId },
    { chat: () => Promise.reject(new Error('openrouter_api_key not set')) });
  assert.equal(result.status, 'error');
  const count = db.prepare('SELECT COUNT(*) AS n FROM ai_grade_estimates WHERE native_pad_id = ?').get(padId);
  assert.equal(count.n, 0, 'nothing written on doer failure');

  await app.close();
});

test('label-style doer answers (criterion label + band name) are normalized, not dropped', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, ideasId, organisationId } = await seedPad(db);

  // Seen live with deepseek-chat: labels instead of numeric ids/scores.
  const fakeChat = (db2, { intent, messages }) => {
    if (intent.includes('gemini')) return Promise.resolve(checkerResponse([]));
    const userMsg = messages[0].content;
    if (userMsg.includes('Ideas')) {
      return Promise.resolve(doerResponse([{ criterion_id: 'Ideas', score: 'Strong', rationale: 'Develops the idea with specific examples.' }]));
    }
    return Promise.resolve(doerResponse([{ criterion_id: 'organisation', score: 'Developing', rationale: 'Beginning and end present, weak transitions.' }]));
  };

  const result = await estimateRubric(db, { padId }, { chat: fakeChat });
  assert.equal(result.status, 'ok');
  assert.equal(result.written, 2);

  const rows = db.prepare('SELECT * FROM ai_grade_estimates WHERE native_pad_id = ? ORDER BY rubric_kind ASC').all(padId);
  assert.equal(rows.length, 2);
  const internal = rows.find((r) => r.rubric_kind === 'internal');
  assert.equal(internal.criterion_id, ideasId);
  assert.equal(internal.ai_score, 3, 'band name Strong maps to its score_value');
  const exam = rows.find((r) => r.rubric_kind === 'exam');
  assert.equal(exam.criterion_id, organisationId, 'case-insensitive label match');
  assert.equal(exam.ai_score, 2);

  await app.close();
});
