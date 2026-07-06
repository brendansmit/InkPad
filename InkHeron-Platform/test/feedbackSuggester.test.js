import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { suggestFeedbackItems } from '../src/services/feedbackSuggester.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-feedbacksuggester-'));
  return path.join(dir, 'inkheron.db');
}

const ESSAY = 'Losing the game taught me that practice matters more than talent. I is proud of how the team recieved this lesson.';

function doerResponse(overrides = {}) {
  return {
    model: 'fake/doer-model',
    choices: [{ message: { content: JSON.stringify({
      strengths: [
        { title: 'Clear personal lesson', explanation: 'The essay states what the loss taught you in the first sentence.' },
      ],
      targets: [
        { title: 'Fix subject verb agreement', explanation: 'You wrote "I is proud" where the rubric expects standard grammar.', try_now_prompt: 'Reread each sentence and check the verb matches "I".' },
      ],
      ...overrides,
    }) } }],
  };
}

function checkerResponse(verdicts) {
  return {
    model: 'fake/checker-model',
    choices: [{ message: { content: JSON.stringify(verdicts) } }],
  };
}

function fakeChat({ doer = doerResponse(), checker = checkerResponse([]) } = {}) {
  return (db, { intent }) => Promise.resolve(intent.includes('gemini') ? checker : doer);
}

async function seedPad(db) {
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
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: { prompt: 'Write about a lesson you learned from losing.' } },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const assignmentId = created.json().assignment.id;

  const criterionId = db.prepare(`
    INSERT INTO assignment_rubric_criteria (assignment_id, label, description, rubric_kind, sort_order)
    VALUES (?, 'Ideas', 'Quality of the personal reflection', 'internal', 0)
  `).run(assignmentId).lastInsertRowid;
  db.prepare(`
    INSERT INTO assignment_rubric_bands (criterion_id, score_value, label, descriptor, sort_order)
    VALUES (?, 3, 'Strong', 'Clear, well developed reflection', 3)
  `).run(criterionId);

  db.prepare(`
    INSERT INTO student_literacy_issue_stats (student_id, code, category, label, evidence_count, open_count, resolved_count)
    VALUES (?, 'Gra', 'grammar', 'Grammar', 5, 4, 1)
  `).run(studentId);

  const padId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'submitted', '{}', ?, 20, 1)
  `).run(studentId, assignmentId, ESSAY).lastInsertRowid;

  return { app, padId, studentId, assignmentId };
}

test('suggestFeedbackItems writes strengths and targets, targets keep try_now_prompt', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(db);

  const result = await suggestFeedbackItems(db, { padId }, { chat: fakeChat() });
  assert.equal(result.status, 'ok');

  const rows = db.prepare('SELECT * FROM ai_feedback_item_suggestions WHERE native_pad_id = ? ORDER BY kind ASC').all(padId);
  assert.equal(rows.length, 2);
  const strength = rows.find((r) => r.kind === 'strength');
  const target = rows.find((r) => r.kind === 'target');
  assert.match(strength.title, /Clear personal lesson/);
  assert.equal(strength.try_now_prompt, '');
  assert.match(target.title, /subject verb agreement/);
  assert.match(target.try_now_prompt, /Reread each sentence/);
  assert.equal(strength.status, 'pending');
  assert.equal(strength.model, 'fake/doer-model');

  await app.close();
});

function seedFeedbackTable(db, title, strengths, targets) {
  const parsed = {
    strengths: strengths.map((t, i) => ({ id: 'strength_' + i, title: t, explanation: t + ' explained' })),
    targets: targets.map((t, i) => ({ id: 'target_' + i, title: t, explanation: t + ' explained' })),
  };
  return db.prepare(`
    INSERT INTO feedback_assets (kind, title, parsed_json)
    VALUES ('strength_target', ?, ?)
  `).run(title, JSON.stringify(parsed)).lastInsertRowid;
}

test('the doer prompt carries the chosen feedback bank, and switching the table changes what is sent', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, assignmentId } = await seedPad(db);

  const bankA = seedFeedbackTable(db, 'Bank A', ['Alpha strength'], ['Alpha target']);
  const bankB = seedFeedbackTable(db, 'Bank B', ['Beta strength'], ['Beta target']);
  db.prepare('UPDATE assignments SET settings_json = ? WHERE id = ?')
    .run(JSON.stringify({ prompt: 'Write about a lesson.', feedback_tables: ['asset:' + bankA, 'asset:' + bankB] }), assignmentId);

  let sentToDoer = '';
  const capture = (db2, { intent, messages }) => {
    if (!intent.includes('gemini')) sentToDoer = messages.map((m) => m.content).join('\n');
    return Promise.resolve(intent.includes('gemini') ? checkerResponse([]) : doerResponse());
  };

  // Default (no applied table) uses the first configured bank, not the second.
  await suggestFeedbackItems(db, { padId }, { chat: capture });
  assert.match(sentToDoer, /Alpha strength/);
  assert.match(sentToDoer, /Alpha target/);
  assert.doesNotMatch(sentToDoer, /Beta strength/);

  // Switch the pad to bank B and re-run: now bank B items are sent.
  db.prepare('UPDATE native_pads SET applied_feedback_table = ? WHERE id = ?').run('asset:' + bankB, padId);
  await suggestFeedbackItems(db, { padId }, { chat: capture });
  assert.match(sentToDoer, /Beta strength/);
  assert.doesNotMatch(sentToDoer, /Alpha strength/);

  // 'all' merges both banks into the prompt.
  db.prepare('UPDATE native_pads SET applied_feedback_table = ? WHERE id = ?').run('all', padId);
  await suggestFeedbackItems(db, { padId }, { chat: capture });
  assert.match(sentToDoer, /Alpha strength/);
  assert.match(sentToDoer, /Beta strength/);

  await app.close();
});

test('re-run clears prior pending suggestions instead of duplicating them', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(db);

  await suggestFeedbackItems(db, { padId }, { chat: fakeChat() });
  await suggestFeedbackItems(db, { padId }, { chat: fakeChat() });

  const count = db.prepare("SELECT COUNT(*) AS n FROM ai_feedback_item_suggestions WHERE native_pad_id = ? AND status = 'pending'").get(padId);
  assert.equal(count.n, 2);

  await app.close();
});

test('a checker-flagged unsupported item is dropped', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(db);

  await suggestFeedbackItems(db, { padId }, {
    chat: fakeChat({ checker: checkerResponse([{ index: 0, supported: false, confidence: 0.9 }]) }),
  });

  const rows = db.prepare('SELECT * FROM ai_feedback_item_suggestions WHERE native_pad_id = ?').all(padId);
  assert.equal(rows.length, 1, 'the flagged strength (index 0) was dropped, the target survived');
  assert.equal(rows[0].kind, 'target');

  await app.close();
});

test('checker failure is non-fatal and keeps the doer output', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(db);

  const chat = (db2, { intent }) => intent.includes('gemini')
    ? Promise.reject(new Error('openrouter_api_key not set'))
    : Promise.resolve(doerResponse());

  const result = await suggestFeedbackItems(db, { padId }, { chat });
  assert.equal(result.status, 'ok');
  const rows = db.prepare('SELECT * FROM ai_feedback_item_suggestions WHERE native_pad_id = ?').all(padId);
  assert.equal(rows.length, 2);

  await app.close();
});

test('empty essay text skips without calling the model', async () => {
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
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: {} },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const assignmentId = created.json().assignment.id;
  const padId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'writing', '{}', '', 0, 1)
  `).run(studentId, assignmentId).lastInsertRowid;

  let called = false;
  const result = await suggestFeedbackItems(db, { padId }, { chat: () => { called = true; return Promise.resolve(doerResponse()); } });
  assert.equal(result.status, 'skipped');
  assert.equal(called, false, 'model must not be called for a pad with no text');

  await app.close();
});

test('model failure writes nothing and returns error status', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(db);

  const result = await suggestFeedbackItems(db, { padId },
    { chat: () => Promise.reject(new Error('openrouter_api_key not set')) });
  assert.equal(result.status, 'error');
  const count = db.prepare('SELECT COUNT(*) AS n FROM ai_feedback_item_suggestions WHERE native_pad_id = ?').get(padId);
  assert.equal(count.n, 0, 'nothing written on doer failure');

  await app.close();
});

// ── Endpoint tests ─────────────────────────────────────────────────────────

async function teacherSession(app) {
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

async function seedRoutePad(app) {
  const t = await teacherSession(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const classId = cls.json().class.id;
  const studentRes = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', settings: {} },
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  const assignmentId = created.json().assignment.id;
  const sLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const pad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: sLogin.headers['set-cookie'] } });
  return { t, padId: pad.json().pad.id };
}

test('accepting a feedback suggestion promotes it to a real feedback item', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const { t, padId } = await seedRoutePad(app);

  const db = new DatabaseSync(dbPath);
  db.prepare(`
    INSERT INTO ai_feedback_item_suggestions (native_pad_id, kind, title, explanation, try_now_prompt, model, status)
    VALUES (?, 'target', 'Vary sentence openers', 'Too many sentences start with the subject.', 'Rewrite paragraph one.', 'test-model', 'pending')
  `).run(padId);
  const suggestionId = db.prepare('SELECT id FROM ai_feedback_item_suggestions WHERE native_pad_id = ?').get(padId).id;
  db.close();

  const list = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/feedback-suggestions`, headers: { cookie: t.cookies } });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().suggestions.length, 1);

  const accept = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-suggestions/${suggestionId}/accept`,
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(accept.statusCode, 201);
  assert.equal(accept.json().item.kind, 'target');
  assert.equal(accept.json().item.source, 'ai');

  const review = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/feedback-items`, headers: { cookie: t.cookies } });
  assert.equal(review.json().feedback.targets.length, 1);
  assert.equal(review.json().feedback.targets[0].source, 'ai');

  const after = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/feedback-suggestions`, headers: { cookie: t.cookies } });
  assert.equal(after.json().suggestions.length, 0);

  const again = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-suggestions/${suggestionId}/accept`,
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(again.statusCode, 409);

  await app.close();
});

test('rejecting a feedback suggestion resolves it without creating a feedback item', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const { t, padId } = await seedRoutePad(app);

  const db = new DatabaseSync(dbPath);
  db.prepare(`
    INSERT INTO ai_feedback_item_suggestions (native_pad_id, kind, title, status)
    VALUES (?, 'strength', 'Strong opening', 'pending')
  `).run(padId);
  const suggestionId = db.prepare('SELECT id FROM ai_feedback_item_suggestions WHERE native_pad_id = ?').get(padId).id;
  db.close();

  const reject = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-suggestions/${suggestionId}/reject`,
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(reject.statusCode, 204);

  const items = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/feedback-items`, headers: { cookie: t.cookies } });
  assert.equal(items.json().feedback.strengths.length, 0);

  const list = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/feedback-suggestions`, headers: { cookie: t.cookies } });
  assert.equal(list.json().suggestions.length, 0);

  await app.close();
});

test('a suggestion for another pad returns 404', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const { t, padId } = await seedRoutePad(app);

  const wrong = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/feedback-suggestions/999999/accept`,
    headers: { 'X-CSRF-Token': t.csrf, cookie: t.cookies } });
  assert.equal(wrong.statusCode, 404);

  await app.close();
});
