import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { scoreRewrite, diffVerdict, tokenize } from '../src/services/implementationScorer.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-implscore-'));
  return path.join(dir, 'inkheron.db');
}

const ORIGINAL = 'They is playing outside. The game was fun and the game was long.';
const GOOD_REWRITE = 'They are playing outside. The game was fun and it lasted a long time.';
const COSMETIC_REWRITE = 'they is playing outside, the game was fun and the game was long';

function judgeResponse({ addressed = [true, true], meaningful = true } = {}) {
  return {
    model: 'fake/judge-model',
    choices: [{ message: { content: JSON.stringify({
      items: addressed.map((a, i) => ({ index: i, addressed: a, note: a ? 'fixed' : 'unchanged' })),
      meaningful,
      summary: 'The student fixed the verb and reworded the repetition.',
    }) } }],
  };
}

async function seedPads(db, { rewriteText }) {
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
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: { green_pen: true } },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const assignmentId = created.json().assignment.id;

  const originalId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'marked', '{}', ?, 12, 2)
  `).run(studentId, assignmentId, ORIGINAL).lastInsertRowid;

  db.prepare(`
    INSERT INTO native_annotations (native_pad_id, type, start_offset, end_offset, selected_text, body, metadata_json)
    VALUES (?, 'literacy_code', 5, 7, 'is', '', '{"code":"SV-AGREEMENT","category":"grammar","label":"Subject–verb agreement: singular/plural mismatch"}')
  `).run(originalId);
  db.prepare(`
    INSERT INTO native_annotations (native_pad_id, type, start_offset, end_offset, selected_text, body)
    VALUES (?, 'inline_comment', 25, 64, 'The game was fun and the game was long.', 'You repeat the game. Reword one of them.')
  `).run(originalId);
  db.prepare(`
    INSERT INTO native_feedback_items (native_pad_id, kind, title, explanation)
    VALUES (?, 'target', 'Vary your vocabulary', 'Avoid repeating the same noun in one sentence.')
  `).run(originalId);

  // A second assignment slot for the rewrite pad (UNIQUE student+assignment).
  const created2 = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay rewrite', settings: {} },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const rewriteId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version, rewrite_of_pad_id)
    VALUES (?, ?, 'resubmitted', '{}', ?, 14, 2, ?)
  `).run(studentId, created2.json().assignment.id, rewriteText, originalId).lastInsertRowid;

  return { app, originalId, rewriteId, studentId };
}

test('diffVerdict separates substantive from cosmetic change', () => {
  const same = diffVerdict(ORIGINAL, ORIGINAL);
  assert.equal(same.has_substantive_change, false);
  assert.equal(same.cosmetic_ratio, 1);

  const cosmetic = diffVerdict(ORIGINAL, COSMETIC_REWRITE);
  assert.equal(cosmetic.has_substantive_change, false, 'case and punctuation shuffling is not substantive');
  assert.ok(cosmetic.cosmetic_ratio > 0.9);

  const real = diffVerdict(ORIGINAL, GOOD_REWRITE);
  assert.equal(real.has_substantive_change, true);
  assert.ok(real.cosmetic_ratio < 0.5);

  assert.deepEqual(tokenize('Hello, World!', { normalize: true }), ['hello', 'world']);
});

test('scoreRewrite upserts a verdict merging diff evidence with the AI judgement', async () => {
  const db = openDatabase(tmpDb());
  const { app, originalId, rewriteId, studentId } = await seedPads(db, { rewriteText: GOOD_REWRITE });

  let judgePrompt = '';
  const result = await scoreRewrite(db, { rewritePadId: rewriteId },
    { chat: (_db, { messages }) => {
      judgePrompt = messages.at(-1).content;
      return Promise.resolve(judgeResponse({ addressed: [true, true, true], meaningful: true }));
    } });
  assert.equal(result.status, 'ok');
  assert.match(judgePrompt, /SV-AGREEMENT: Subject/);

  const row = db.prepare('SELECT * FROM implementation_scores WHERE rewrite_pad_id = ?').get(rewriteId);
  assert.equal(row.original_pad_id, originalId);
  assert.equal(row.student_id, studentId);
  assert.equal(row.meaningful, 1);
  assert.equal(row.model, 'fake/judge-model');
  assert.ok(row.cosmetic_ratio < 0.5);
  const verdict = JSON.parse(row.addressed_json);
  assert.equal(verdict.codes.length, 1);
  assert.equal(verdict.codes[0].code, 'SV-AGREEMENT');
  assert.equal(verdict.codes[0].addressed, true, 'flagged "is" changed and AI agrees');
  assert.equal(verdict.targets.length, 1);
  assert.equal(verdict.targets[0].addressed, true);
  assert.equal(verdict.inline_comments_total, 1);
  assert.equal(verdict.inline_comments_addressed, 1);

  // Re-run upserts, no duplicate rows.
  await scoreRewrite(db, { rewritePadId: rewriteId },
    { chat: () => Promise.resolve(judgeResponse({ addressed: [true, true, true], meaningful: true })) });
  const count = db.prepare('SELECT COUNT(*) AS n FROM implementation_scores WHERE rewrite_pad_id = ?').get(rewriteId);
  assert.equal(count.n, 1);

  await app.close();
});

test('an untouched flagged span cannot be marked addressed even if the AI says so', async () => {
  const db = openDatabase(tmpDb());
  // Rewrite keeps "They is playing" verbatim but changes the second sentence.
  const partial = 'They is playing outside. The match was fun and it lasted a long time.';
  const { app, rewriteId } = await seedPads(db, { rewriteText: partial });

  await scoreRewrite(db, { rewritePadId: rewriteId },
    { chat: () => Promise.resolve(judgeResponse({ addressed: [true, true, true], meaningful: true })) });
  const verdict = JSON.parse(db.prepare('SELECT addressed_json FROM implementation_scores WHERE rewrite_pad_id = ?').get(rewriteId).addressed_json);
  assert.equal(verdict.codes[0].addressed, false, 'diff layer vetoes the AI on the unchanged span');

  await app.close();
});

test('a cosmetic rewrite is never meaningful even if the AI says so', async () => {
  const db = openDatabase(tmpDb());
  const { app, rewriteId } = await seedPads(db, { rewriteText: COSMETIC_REWRITE });

  await scoreRewrite(db, { rewritePadId: rewriteId },
    { chat: () => Promise.resolve(judgeResponse({ addressed: [true, true, true], meaningful: true })) });
  const row = db.prepare('SELECT meaningful, cosmetic_ratio FROM implementation_scores WHERE rewrite_pad_id = ?').get(rewriteId);
  assert.equal(row.meaningful, 0);
  assert.ok(row.cosmetic_ratio > 0.9);

  await app.close();
});

test('scoreRewrite skips pads without a rewrite link and survives model failure', async () => {
  const db = openDatabase(tmpDb());
  const { app, originalId, rewriteId } = await seedPads(db, { rewriteText: GOOD_REWRITE });

  const skipped = await scoreRewrite(db, { rewritePadId: originalId }, { chat: () => Promise.resolve(judgeResponse()) });
  assert.equal(skipped.status, 'skipped');

  const failed = await scoreRewrite(db, { rewritePadId: rewriteId },
    { chat: () => Promise.reject(new Error('openrouter_api_key not set')) });
  assert.equal(failed.status, 'error');
  const count = db.prepare('SELECT COUNT(*) AS n FROM implementation_scores').get();
  assert.equal(count.n, 0, 'nothing written on failure');

  await app.close();
});

test('review endpoint surfaces the implementation score on a scored rewrite', async () => {
  const db = openDatabase(tmpDb());
  const { app, originalId, rewriteId } = await seedPads(db, { rewriteText: GOOD_REWRITE });
  await scoreRewrite(db, { rewritePadId: rewriteId },
    { chat: () => Promise.resolve(judgeResponse({ addressed: [true, true, true], meaningful: true })) });

  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const cookies = login.headers['set-cookie'];

  const review = await app.inject({ method: 'GET', url: `/api/native/pads/${rewriteId}/review`, headers: { cookie: cookies } });
  const impl = review.json().implementation_score;
  assert.ok(impl, 'implementation score present on rewrite review');
  assert.equal(impl.original_pad_id, originalId);
  assert.equal(impl.meaningful, true);
  assert.equal(impl.codes_total, 1);
  assert.equal(impl.codes_addressed, 1);
  assert.equal(impl.targets_total, 1);

  const original = await app.inject({ method: 'GET', url: `/api/native/pads/${originalId}/review`, headers: { cookie: cookies } });
  assert.equal(original.json().implementation_score, null, 'no score card on a non-rewrite pad');

  await app.close();
});
