import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { generateProfileSummary } from '../src/services/profileSummarizer.js';
import { recordStyleMetrics } from '../src/services/styleMetrics.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-profilesum-'));
  return path.join(dir, 'inkheron.db');
}

function doerResponse(overrides = {}) {
  return {
    model: 'fake/doer-model',
    choices: [{ message: { content: JSON.stringify({
      writing_summary: 'You often miss subject verb agreement and mix up spelling. Watch these in your next essays.',
      voice_summary: 'Your sentences run long with heavy coordination and you write in a personal, I-heavy register.',
      targets: [
        { title: 'Fix subject verb agreement', explanation: 'Check each verb matches its subject before you submit.' },
      ],
      ...overrides,
    }) } }],
  };
}

function checkerResponse(overrides = {}) {
  return {
    model: 'fake/checker-model',
    choices: [{ message: { content: JSON.stringify({
      writing_summary: { supported: true, confidence: 0.9 },
      voice_summary: { supported: true, confidence: 0.9 },
      targets: { supported: true, confidence: 0.9 },
      ...overrides,
    }) } }],
  };
}

function fakeChat({ doer = doerResponse(), checker = checkerResponse() } = {}) {
  return (db, { intent }) => Promise.resolve(intent.includes('gemini') ? checker : doer);
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
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: cls.json().class.id },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const studentId = studentRes.json().student.id;
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: {} },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const assignmentId = created.json().assignment.id;

  const padId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'marked', '{}', 'They is playing outside and she recieved the ball.', 10, 2)
  `).run(studentId, assignmentId).lastInsertRowid;

  db.prepare(`
    INSERT INTO student_literacy_issue_stats (student_id, code, category, label, evidence_count, open_count, resolved_count)
    VALUES (?, 'Gra', 'grammar', 'Grammar', 5, 4, 1)
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
    INSERT INTO native_feedback_items (native_pad_id, kind, title, explanation)
    VALUES (?, 'target', 'Vary sentence openers', 'You start too many sentences with the subject.')
  `).run(padId);
  db.prepare(`
    INSERT INTO score_snapshots (native_pad_id, student_id, assignment_id, rubric_kind, scores_json, total, pad_state)
    VALUES (?, ?, ?, 'internal', '[]', 4, 'marked')
  `).run(padId, studentId, assignmentId);

  const pad = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
  recordStyleMetrics(db, { padId: pad.id });

  return { app, studentId, padId };
}

test('generateProfileSummary writes grounded summary fields and upserts the profile row', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const result = await generateProfileSummary(db, { studentId }, { chat: fakeChat() });
  assert.equal(result.status, 'ok');

  const row = db.prepare('SELECT * FROM student_writing_profiles WHERE student_id = ?').get(studentId);
  assert.ok(row, 'profile row was inserted');
  assert.match(row.writing_summary, /subject verb agreement/);
  assert.match(row.voice_summary, /coordination/);
  const targets = JSON.parse(row.targets_json);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].title, 'Fix subject verb agreement');

  await app.close();
});

test('re-run upserts the same profile row without duplicating it', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  await generateProfileSummary(db, { studentId }, { chat: fakeChat() });
  await generateProfileSummary(db, { studentId }, { chat: fakeChat() });

  const count = db.prepare('SELECT COUNT(*) AS n FROM student_writing_profiles WHERE student_id = ?').get(studentId);
  assert.equal(count.n, 1);

  await app.close();
});

test('a checker-flagged unsupported field is dropped to empty, not published', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  await generateProfileSummary(db, { studentId }, {
    chat: fakeChat({
      checker: checkerResponse({ voice_summary: { supported: false, confidence: 0.95 } }),
    }),
  });

  const row = db.prepare('SELECT * FROM student_writing_profiles WHERE student_id = ?').get(studentId);
  assert.match(row.writing_summary, /subject verb agreement/, 'supported field still published');
  assert.equal(row.voice_summary, '', 'unsupported field dropped to fallback');

  await app.close();
});

test('checker failure is non-fatal and keeps the doer output', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const chat = (db2, { intent }) => intent.includes('gemini')
    ? Promise.reject(new Error('openrouter_api_key not set'))
    : Promise.resolve(doerResponse());

  const result = await generateProfileSummary(db, { studentId }, { chat });
  assert.equal(result.status, 'ok');
  const row = db.prepare('SELECT * FROM student_writing_profiles WHERE student_id = ?').get(studentId);
  assert.match(row.writing_summary, /subject verb agreement/);

  await app.close();
});

test('empty evidence skips without calling the model', async () => {
  const db = openDatabase(tmpDb());
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
    payload: { username: 'bob', display_name: 'Bob', password: 'pass12345', class_id: cls.json().class.id },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const studentId = studentRes.json().student.id;

  let called = false;
  const result = await generateProfileSummary(db, { studentId }, { chat: () => { called = true; return Promise.resolve(doerResponse()); } });
  assert.equal(result.status, 'skipped');
  assert.equal(called, false, 'model must not be called when there is no evidence');
  const row = db.prepare('SELECT * FROM student_writing_profiles WHERE student_id = ?').get(studentId);
  assert.equal(row, undefined, 'no profile row written for a skip');

  await app.close();
});

test('model failure writes nothing and returns error status', async () => {
  const db = openDatabase(tmpDb());
  const { app, studentId } = await seedStudent(db);

  const result = await generateProfileSummary(db, { studentId },
    { chat: () => Promise.reject(new Error('openrouter_api_key not set')) });
  assert.equal(result.status, 'error');
  const row = db.prepare('SELECT * FROM student_writing_profiles WHERE student_id = ?').get(studentId);
  assert.equal(row, undefined, 'nothing written on doer failure');

  await app.close();
});
