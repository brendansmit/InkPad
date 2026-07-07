import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { generateToeflEstimate } from '../src/services/toeflEstimator.js';
import { recordStyleMetrics } from '../src/services/styleMetrics.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-toefl-'));
  return path.join(dir, 'inkheron.db');
}

function doerResponse(overrides = {}) {
  return {
    model: 'fake/doer-model',
    choices: [{ message: { content: JSON.stringify({
      integrated_band: 3.5,
      discussion_band: 4,
      scaled_low: 20,
      scaled_high: 24,
      confidence: 0.6,
      rationale: 'Issue rates are low at 2 per 100 words and MATTR is steady, so control is solid. The rubric trend rises across the essays.',
      ...overrides,
    }) } }],
  };
}

function checkerResponse(overrides = {}) {
  return {
    model: 'fake/checker-model',
    choices: [{ message: { content: JSON.stringify({
      integrated_band: { supported: true, confidence: 0.9 },
      discussion_band: { supported: true, confidence: 0.9 },
      scaled_range: { supported: true, confidence: 0.9 },
      rationale: { supported: true, confidence: 0.9 },
      ...overrides,
    }) } }],
  };
}

function fakeChat({ doer = doerResponse(), checker = checkerResponse() } = {}) {
  return (_db, { intent }) => Promise.resolve(intent.includes('gemini') ? checker : doer);
}

async function seedTeacher(app) {
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  return { csrf: login.json().user.csrf_token, cookies: login.headers['set-cookie'] };
}

// A student with two style-metric essays so the estimator does not skip.
async function seedStudent(db, { essays = 2 } = {}) {
  const app = await buildApp({ db, logger: false });
  const t = await seedTeacher(app);
  const h = { 'X-CSRF-Token': t.csrf, cookie: t.cookies };
  const cls = await app.inject({ method: 'POST', url: '/api/classes', payload: { name: 'G9' }, headers: h });
  const classId = cls.json().class.id;
  const studentRes = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId }, headers: h });
  const studentId = studentRes.json().student.id;

  for (let i = 0; i < essays; i++) {
    const created = await app.inject({ method: 'POST', url: '/api/assignments',
      payload: { class_id: classId, title: 'Essay ' + i, settings: {} }, headers: h });
    const assignmentId = created.json().assignment.id;
    const padId = db.prepare(`
      INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
      VALUES (?, ?, 'marked', '{}', ?, 12, 2)
    `).run(studentId, assignmentId,
      'The author argues that the plan will work. She claims the evidence is strong and clear.').lastInsertRowid;
    recordStyleMetrics(db, { padId });
    db.prepare(`
      INSERT INTO score_snapshots (native_pad_id, student_id, assignment_id, rubric_kind, scores_json, total, pad_state)
      VALUES (?, ?, ?, 'internal', '[]', ?, 'marked')
    `).run(padId, studentId, assignmentId, 4 + i);
  }
  db.prepare(`
    INSERT INTO student_literacy_issue_stats (student_id, code, category, label, evidence_count, open_count, resolved_count)
    VALUES (?, 'Gra', 'grammar', 'Grammar', 3, 2, 1)
  `).run(studentId);

  return { app, t, h, classId, studentId };
}

test('generateToeflEstimate writes a stored estimate with an ordered range', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const result = await generateToeflEstimate(db, { studentId }, { chat: fakeChat() });
  assert.equal(result.status, 'ok');
  assert.ok(result.estimate.scaled_low <= result.estimate.scaled_high, 'range ordered');

  const row = db.prepare('SELECT * FROM toefl_estimates WHERE student_id = ?').get(studentId);
  assert.ok(row, 'estimate row written');
  assert.equal(row.scaled_low, 20);
  assert.equal(row.scaled_high, 24);
  assert.match(row.rationale, /MATTR|100 words/);

  await app.close();
});

test('a reversed range from the model is reordered before storing', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const result = await generateToeflEstimate(db, { studentId },
    { chat: fakeChat({ doer: doerResponse({ scaled_low: 26, scaled_high: 18 }) }) });
  assert.equal(result.status, 'ok');
  assert.equal(result.estimate.scaled_low, 18);
  assert.equal(result.estimate.scaled_high, 26);
  assert.ok(result.estimate.scaled_low <= result.estimate.scaled_high);

  await app.close();
});

test('the checker can only blank an unsupported field, never rewrite it', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const result = await generateToeflEstimate(db, { studentId }, {
    chat: fakeChat({ checker: checkerResponse({ rationale: { supported: false, confidence: 0.95 } }) }),
  });
  assert.equal(result.status, 'ok');
  const row = db.prepare('SELECT * FROM toefl_estimates WHERE student_id = ?').get(studentId);
  assert.equal(row.rationale, '', 'unsupported rationale blanked');
  assert.equal(row.integrated_band, 3.5, 'supported field kept');

  await app.close();
});

test('a student with fewer than 2 style essays is skipped without calling the model', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db, { essays: 1 });

  let called = false;
  const result = await generateToeflEstimate(db, { studentId },
    { chat: () => { called = true; return Promise.resolve(doerResponse()); } });
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'insufficient_essays');
  assert.equal(called, false);
  const row = db.prepare('SELECT * FROM toefl_estimates WHERE student_id = ?').get(studentId);
  assert.equal(row, undefined);

  await app.close();
});

test('a known TOEFL score is stored and fed into the estimate evidence as a class anchor', async () => {
  const db = openDatabase(tmpDb());
  const { app, h, studentId } = await seedStudent(db);

  const rec = await app.inject({ method: 'POST',
    url: `/api/teacher/students/${studentId}/toefl-known-score`,
    payload: { writing_score: 25, noted_at: '2026-05' }, headers: h });
  assert.equal(rec.statusCode, 201);
  assert.equal(rec.json().known_scores[0].writing_score, 25);

  let seenEvidence = null;
  const chat = (_db, { intent, messages }) => {
    if (!intent.includes('gemini')) seenEvidence = messages[1].content;
    return Promise.resolve(intent.includes('gemini') ? checkerResponse() : doerResponse());
  };
  const result = await generateToeflEstimate(db, { studentId }, { chat });
  assert.equal(result.status, 'ok');
  assert.match(seenEvidence, /class_known_toefl_writing_scores/);
  assert.match(seenEvidence, /"writing_score":25/);

  await app.close();
});

test('routes require a teacher session', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const get = await app.inject({ method: 'GET', url: `/api/teacher/students/${studentId}/toefl-estimate` });
  assert.equal(get.statusCode, 401);
  const gen = await app.inject({ method: 'POST', url: `/api/teacher/students/${studentId}/toefl-estimate` });
  assert.equal(gen.statusCode, 401);
  const known = await app.inject({ method: 'POST', url: `/api/teacher/students/${studentId}/toefl-known-score`, payload: { writing_score: 20 } });
  assert.equal(known.statusCode, 401);

  await app.close();
});

test('unknown student returns 404 on every route', async () => {
  const db = openDatabase(tmpDb());
  const { app, h } = await seedStudent(db);

  const get = await app.inject({ method: 'GET', url: '/api/teacher/students/99999/toefl-estimate', headers: h });
  assert.equal(get.statusCode, 404);
  const gen = await app.inject({ method: 'POST', url: '/api/teacher/students/99999/toefl-estimate', headers: h });
  assert.equal(gen.statusCode, 404);
  const known = await app.inject({ method: 'POST', url: '/api/teacher/students/99999/toefl-known-score', payload: { writing_score: 20 }, headers: h });
  assert.equal(known.statusCode, 404);

  await app.close();
});

test('a bad writing score is rejected', async () => {
  const db = openDatabase(tmpDb());
  const { app, h, studentId } = await seedStudent(db);

  const bad = await app.inject({ method: 'POST', url: `/api/teacher/students/${studentId}/toefl-known-score`, payload: { writing_score: 40 }, headers: h });
  assert.equal(bad.statusCode, 400);

  await app.close();
});
