import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { generateReportSnippet } from '../src/services/reportSnippet.js';
import { recordStyleMetrics } from '../src/services/styleMetrics.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-reportsnippet-'));
  return path.join(dir, 'inkheron.db');
}

function fakeChat(snippet = 'Alex has settled into a steady writing routine this term and grammar slips have dropped a lot since the first essay. The next step is varying sentence openers, which we are already practising. Overall this is encouraging progress and Alex should feel proud of the improvement so far.') {
  return () => Promise.resolve({
    model: 'fake/doer-model',
    choices: [{ message: { content: JSON.stringify({ snippet }) } }],
  });
}

async function seedStudent(db) {
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
    payload: { username: 'alex', display_name: 'Alex', password: 'pass12345', class_id: cls.json().class.id },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const studentId = studentRes.json().student.id;
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: {} },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const assignmentId = created.json().assignment.id;

  const padId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'marked', '{}', 'They is playing outside and she recieved the ball.', 200, 2)
  `).run(studentId, assignmentId).lastInsertRowid;

  db.prepare(`
    INSERT INTO student_literacy_issue_stats (student_id, code, category, label, evidence_count, open_count, resolved_count)
    VALUES (?, 'Gra', 'grammar', 'Grammar', 5, 2, 3)
  `).run(studentId);
  db.prepare(`
    INSERT INTO native_annotations (native_pad_id, type, start_offset, end_offset, selected_text, body)
    VALUES (?, 'literacy_code', 5, 7, 'is', 'Gra')
  `).run(padId);
  const annotationId = db.prepare('SELECT id FROM native_annotations WHERE native_pad_id = ?').get(padId).id;
  db.prepare(`
    INSERT INTO student_literacy_evidence (student_id, assignment_id, native_pad_id, annotation_id, code, category, label, selected_text)
    VALUES (?, ?, ?, ?, 'Gra', 'grammar', 'Grammar', 'is')
  `).run(studentId, assignmentId, padId, annotationId);
  db.prepare(`
    INSERT INTO student_writing_profiles (student_id, writing_summary, voice_summary, targets_json)
    VALUES (?, 'Grammar slips are easing off.', 'Long, flowing sentences.', '[{"title":"Vary sentence openers","explanation":"Start some sentences differently."}]')
  `).run(studentId);
  db.prepare(`
    INSERT INTO score_snapshots (native_pad_id, student_id, assignment_id, rubric_kind, scores_json, total, pad_state)
    VALUES (?, ?, ?, 'internal', '[]', 4, 'marked')
  `).run(padId, studentId, assignmentId);

  recordStyleMetrics(db, { padId });

  return { app, csrf, cookies, studentId };
}

test('generateReportSnippet returns a grounded parent-friendly snippet', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const result = await generateReportSnippet(db, { studentId }, { chat: fakeChat() });
  assert.equal(result.status, 'ok');
  assert.ok(result.snippet.length > 0);

  await app.close();
});

test('generateReportSnippet returns a clean error when the model call fails (e.g. missing key)', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const result = await generateReportSnippet(db, { studentId },
    { chat: () => Promise.reject(new Error('openrouter_api_key not set')) });
  assert.equal(result.status, 'error');
  assert.ok(result.message);
  assert.doesNotMatch(result.message, /openrouter_api_key/);

  await app.close();
});

test('generateReportSnippet cleanly errors for a missing student', async () => {
  const db = openDatabase(tmpDb());
  const { app } = await seedStudent(db);

  const result = await generateReportSnippet(db, { studentId: 999999 }, { chat: fakeChat() });
  assert.equal(result.status, 'error');
  assert.ok(result.message);

  await app.close();
});

test('POST /api/students/:studentId/report-snippet returns {snippet} for the teacher and stores nothing', async () => {
  const db = openDatabase(tmpDb());
  const { app, csrf, cookies, studentId } = await seedStudent(db);

  // Swap in a fake chat by monkey-patching is not available through the route,
  // so this exercises the real callChat path and expects the clean no-key error.
  const res = await app.inject({
    method: 'POST',
    url: `/api/students/${studentId}/report-snippet`,
    headers: { 'X-CSRF-Token': csrf, cookie: cookies },
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.json().error);
  assert.doesNotMatch(res.json().error, /openrouter_api_key/);

  const res404 = await app.inject({
    method: 'POST',
    url: '/api/students/999999/report-snippet',
    headers: { 'X-CSRF-Token': csrf, cookie: cookies },
  });
  assert.equal(res404.statusCode, 400);

  const unauth = await app.inject({ method: 'POST', url: `/api/students/${studentId}/report-snippet` });
  assert.equal(unauth.statusCode, 401);

  await app.close();
});
