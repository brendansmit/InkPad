import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-analysis-'));
  return path.join(dir, 'inkheron.db');
}

async function teacherSession(app) {
  const setup = await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

// Seeds a class, one student, a native assignment, and opens the student pad.
// Returns everything a test needs plus the opened padId.
async function seed(app, { greenPen = false } = {}) {
  const t = await teacherSession(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const classId = cls.json().class.id;
  const studentRes = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const studentId = studentRes.json().student.id;

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', settings: { green_pen: greenPen } },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const assignmentId = created.json().assignment.id;

  const sLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const sCookies = sLogin.headers['set-cookie'];
  const sCsrf = sLogin.json().user.csrf_token;

  const pad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: sCookies } });
  assert.equal(pad.statusCode, 200);
  const padId = pad.json().pad.id;

  return { t, classId, studentId, assignmentId, padId, sCookies, sCsrf };
}

test('teacher can add structured strengths and targets, visible in review and student feedback', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const { t, assignmentId, padId, sCookies } = await seed(app);

  const strength = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-items`,
    payload: { kind: 'strength', title: 'Clear thesis', explanation: 'Your opening states the argument plainly.' },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(strength.statusCode, 201);
  assert.equal(strength.json().item.kind, 'strength');

  const target = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-items`,
    payload: { kind: 'target', title: 'Vary sentence openings', explanation: 'Too many sentences start the same way.', try_now_prompt: 'Rewrite paragraph two with three different openings.' },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(target.statusCode, 201);

  const rejectBad = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-items`,
    payload: { kind: 'nonsense', title: 'x' },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(rejectBad.statusCode, 400);

  // Appears in teacher review.
  const review = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/review`,
    headers: { cookie: t.cookies } });
  assert.equal(review.json().feedback.strengths.length, 1);
  assert.equal(review.json().feedback.targets.length, 1);
  assert.equal(review.json().feedback.targets[0].try_now_prompt, 'Rewrite paragraph two with three different openings.');

  // Appears in the student feedback view.
  const feedback = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/feedback`,
    headers: { cookie: sCookies } });
  assert.equal(feedback.statusCode, 200);
  assert.equal(feedback.json().feedback.strengths[0].title, 'Clear thesis');

  // Delete one.
  const del = await app.inject({ method: 'DELETE', url: `/api/native/pads/${padId}/feedback-items/${strength.json().item.id}`,
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(del.statusCode, 204);
  const after = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/review`, headers: { cookie: t.cookies } });
  assert.equal(after.json().feedback.strengths.length, 0);

  await app.close();
});

test('teacher can load the codebook and accept an AI suggestion with a corrected code', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const { t, studentId, padId } = await seed(app);

  // A pending suggestion is what the (Fable-built) coder will insert.
  const db = new DatabaseSync(dbPath);
  db.prepare(`
    INSERT INTO ai_literacy_suggestions (native_pad_id, document_version, start_offset, end_offset, quote, code, category, label, model, status)
    VALUES (?, 1, 0, 3, 'is', 'SV-AGREEMENT', 'grammar', 'Subject-verb agreement', 'test-model', 'pending')
  `).run(padId);
  const suggestionId = db.prepare('SELECT id FROM ai_literacy_suggestions WHERE native_pad_id = ?').get(padId).id;
  db.close();

  // Suggestions are hidden until accepted: none exist as annotations yet.
  const before = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/review`, headers: { cookie: t.cookies } });
  assert.equal(before.json().annotations.length, 0);
  assert.equal(before.json().suggestions.length, 1);

  const codebook = await app.inject({ method: 'GET', url: '/api/native/literacy-codes', headers: { cookie: t.cookies } });
  assert.equal(codebook.statusCode, 200);
  assert.equal(codebook.json().codes.length, 88);
  assert.ok(codebook.json().codes.some((code) => code.code === 'ARTICLE-MISSING' && code.family === 'Articles'));

  const accept = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/suggestions/${suggestionId}/accept`,
    payload: { code: 'PRESENT-3S-MISSING' },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(accept.statusCode, 201);
  assert.equal(accept.json().annotation.type, 'literacy_code');
  assert.equal(accept.json().annotation.metadata.code, 'PRESENT-3S-MISSING');
  assert.equal(accept.json().annotation.metadata.taxonomy_version, '2026-07-26');
  assert.equal(accept.json().annotation.metadata.analysis_model, 'test-model');

  // Now it is a real annotation and the profile has evidence.
  const after = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/review`, headers: { cookie: t.cookies } });
  assert.equal(after.json().annotations.length, 1);
  assert.equal(after.json().suggestions.length, 0);
  const profile = await app.inject({ method: 'GET', url: `/api/native/students/${studentId}/profile`, headers: { cookie: t.cookies } });
  assert.ok(profile.json().profile.literacy_issues.some((issue) => issue.code === 'PRESENT-3S-MISSING'));

  // Accepting again is a conflict.
  const again = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/suggestions/${suggestionId}/accept`,
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(again.statusCode, 409);

  await app.close();
});

test('rejecting a suggestion resolves it without creating a mark', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const { t, padId } = await seed(app);
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO ai_literacy_suggestions (native_pad_id, start_offset, end_offset, quote, code, category, status)
    VALUES (?, 0, 2, 'to', 'WW', 'surface', 'pending')`).run(padId);
  const sid = db.prepare('SELECT id FROM ai_literacy_suggestions WHERE native_pad_id = ?').get(padId).id;
  db.close();

  const reject = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/suggestions/${sid}/reject`,
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(reject.statusCode, 204);
  const review = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/review`, headers: { cookie: t.cookies } });
  assert.equal(review.json().annotations.length, 0);
  assert.equal(review.json().suggestions.length, 0);
  await app.close();
});

async function configureRubricAndScore(app, t, assignmentId, padId, score) {
  const rubric = await app.inject({ method: 'PUT', url: `/api/native/assignments/${assignmentId}/rubric`,
    headers: { cookie: t.cookies, 'X-CSRF-Token': t.csrf },
    payload: { criteria: [{ label: 'Evidence', bands: [0, 1, 2, 3, 4].map((v) => ({ score_value: v })) }] } });
  assert.equal(rubric.statusCode, 200);
  const criterionId = rubric.json().rubric.criteria[0].id;
  const scored = await app.inject({ method: 'PUT', url: `/api/native/pads/${padId}/rubric-scores`,
    headers: { cookie: t.cookies, 'X-CSRF-Token': t.csrf },
    payload: { scores: [{ criterion_id: criterionId, selected_score: score }] } });
  assert.equal(scored.statusCode, 200);
  return criterionId;
}

test('finishing marking appends a rubric score snapshot for history', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const { t, assignmentId, padId } = await seed(app);
  await configureRubricAndScore(app, t, assignmentId, padId, 3);

  const finish = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/finish-marking`,
    headers: { cookie: t.cookies, 'X-CSRF-Token': t.csrf } });
  assert.equal(finish.statusCode, 200);

  const db = new DatabaseSync(dbPath);
  const snap = db.prepare('SELECT * FROM score_snapshots WHERE native_pad_id = ? AND rubric_kind = ?').get(padId, 'internal');
  db.close();
  assert.ok(snap, 'a snapshot row should exist');
  assert.equal(snap.total, 3);
  assert.match(snap.scores_json, /Evidence/);

  await app.close();
});

test('teacher score fills the delta on a hidden AI grade estimate', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const { t, studentId, assignmentId, padId } = await seed(app);

  const rubric = await app.inject({ method: 'PUT', url: `/api/native/assignments/${assignmentId}/rubric`,
    headers: { cookie: t.cookies, 'X-CSRF-Token': t.csrf },
    payload: { criteria: [{ label: 'Evidence', bands: [0, 1, 2, 3, 4].map((v) => ({ score_value: v })) }] } });
  const criterionId = rubric.json().rubric.criteria[0].id;

  // The (Fable-built) marker profile will have written a hidden estimate.
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO ai_grade_estimates (native_pad_id, student_id, assignment_id, rubric_kind, criterion_id, ai_score, model)
    VALUES (?, ?, ?, 'internal', ?, 4, 'test-model')`).run(padId, studentId, assignmentId, criterionId);
  db.close();

  const scored = await app.inject({ method: 'PUT', url: `/api/native/pads/${padId}/rubric-scores`,
    headers: { cookie: t.cookies, 'X-CSRF-Token': t.csrf },
    payload: { scores: [{ criterion_id: criterionId, selected_score: 3 }] } });
  assert.equal(scored.statusCode, 200);

  const db2 = new DatabaseSync(dbPath);
  const est = db2.prepare('SELECT * FROM ai_grade_estimates WHERE native_pad_id = ? AND criterion_id = ?').get(padId, criterionId);
  db2.close();
  assert.equal(est.teacher_score, 3);
  assert.equal(est.delta, 1); // ai_score 4 - teacher 3

  await app.close();
});

test('greenpen rewrite links the new pad back to the original', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const { t, assignmentId, padId } = await seed(app, { greenPen: true });

  const rewrite = await app.inject({ method: 'POST', url: `/api/native/assignments/${assignmentId}/greenpen-rewrite`,
    headers: { cookie: t.cookies, 'X-CSRF-Token': t.csrf }, payload: { title: 'Rewrite round' } });
  assert.equal(rewrite.statusCode, 201);
  assert.ok(rewrite.json().copied_pads >= 1);

  const db = new DatabaseSync(dbPath);
  const rewritePad = db.prepare('SELECT id, rewrite_of_pad_id FROM native_pads WHERE rewrite_of_pad_id = ?').get(padId);
  db.close();
  assert.ok(rewritePad, 'a rewrite pad linked to the original should exist');
  assert.equal(rewritePad.rewrite_of_pad_id, padId);

  await app.close();
});
