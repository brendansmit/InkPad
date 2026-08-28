/**
 * Reviewing a green-pen rewrite: what changed from draft 1 has to be visible
 * without reading both essays side by side, and the grammar marks that were
 * copied over as reference must not clutter the final version.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-gpux-'));
  return path.join(dir, 'inkheron.db');
}

const DRAFT = 'She felt empathy of the problem and the speech was memorable.';
const REWRITE = 'She felt empathy for the problem and the speech was memorable.';

// Mark an essay, release it so a rewrite pad is seeded, then stand in for the
// student actually doing the rewrite.
async function seedRewrite(db, { rewriteText = REWRITE } = {}) {
  const app = await buildApp({ db, logger: false });
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const headers = { 'X-CSRF-Token': login.json().user.csrf_token, cookie: login.headers['set-cookie'] };

  const classId = (await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers })).json().class.id;
  await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'cathy', display_name: 'Cathy', password: 'pass12345', class_id: classId }, headers });
  const assignmentId = (await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', settings: { green_pen: true } }, headers })).json().assignment.id;

  const studentLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'cathy', password: 'pass12345' } });
  const padId = (await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: studentLogin.headers['set-cookie'] } })).json().pad.id;
  db.prepare("UPDATE native_pads SET state = 'marked', plain_text = ?, version = 1 WHERE id = ?").run(DRAFT, padId);

  // 'of' should be 'for': the mark the rewrite is meant to fix.
  await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/annotations`,
    payload: {
      type: 'literacy_code', start_offset: 17, end_offset: 19, selected_text: 'of', body: '',
      metadata: { code: 'WW', category: 'surface', label: 'Wrong word' }, document_version: 1,
    }, headers });

  const released = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/release-feedback`, headers });
  assert.equal(released.statusCode, 200);

  const rewritePadId = db.prepare('SELECT id FROM native_pads WHERE rewrite_of_pad_id = ?').get(padId).id;
  db.prepare('UPDATE native_pads SET plain_text = ? WHERE id = ?').run(rewriteText, rewritePadId);

  return { app, headers, padId, rewritePadId };
}

function review(app, headers, padId) {
  return app.inject({ method: 'GET', url: `/api/native/pads/${padId}/review`, headers })
    .then((res) => res.json());
}

test('a rewrite pad review carries the diff against draft 1', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, padId, rewritePadId } = await seedRewrite(db);

  const data = await review(app, headers, rewritePadId);
  const comparison = data.draft_comparison;
  assert.ok(comparison, 'the rewrite review includes a draft comparison');
  assert.equal(comparison.original_pad_id, padId);

  const inserted = comparison.segments.filter((s) => s.type === 'insert').map((s) => s.text).join('');
  const deleted = comparison.segments.filter((s) => s.type === 'delete').map((s) => s.text).join('');
  assert.match(inserted, /for/, 'the corrected word shows as inserted');
  assert.match(deleted, /of/, 'the word it replaced shows as deleted');
  assert.equal(comparison.stats.words_added, 1);
  assert.equal(comparison.stats.words_removed, 1);

  await app.close();
});

test('the compact review the page actually loads still carries the diff', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, rewritePadId } = await seedRewrite(db);

  const res = await app.inject({
    method: 'GET', url: `/api/native/pads/${rewritePadId}/review?compact=1`, headers,
  });
  assert.ok(res.json().draft_comparison, 'compact mode is what the review page requests');

  await app.close();
});

test('an ordinary essay review has no draft comparison', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, padId } = await seedRewrite(db);

  const data = await review(app, headers, padId);
  assert.equal(data.draft_comparison, null, 'the original draft has nothing to compare against');
  assert.equal(data.pad.rewrite_of_pad_id, null);

  await app.close();
});

test('a rewrite whose original was deleted degrades instead of erroring', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, padId, rewritePadId } = await seedRewrite(db);

  db.prepare('DELETE FROM native_annotations WHERE native_pad_id = ?').run(padId);
  db.prepare('DELETE FROM native_pads WHERE id = ?').run(padId);

  const res = await app.inject({ method: 'GET', url: `/api/native/pads/${rewritePadId}/review`, headers });
  assert.equal(res.statusCode, 200, 'the review still loads');
  assert.equal(res.json().draft_comparison, null);

  await app.close();
});

test('the review flags a rewrite pad so the page can hide its marks', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, padId, rewritePadId } = await seedRewrite(db);

  const data = await review(app, headers, rewritePadId);
  assert.equal(data.pad.rewrite_of_pad_id, padId, 'the pad announces it is a rewrite');
  // Since 2026-08-29 no literacy mark is copied onto a rewrite at all, so
  // there is nothing for the page to hide and nothing left carrying the
  // draft's stale offsets.
  assert.equal(
    data.annotations.filter((a) => a.type === 'literacy_code').length,
    0,
    'no copied marks reach the rewrite'
  );

  await app.close();
});

test('the tally counts the draft errors and any new ones, and waits for the check to say what was fixed', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, padId, rewritePadId } = await seedRewrite(db);

  // A new slip made while rewriting: 'for' is text the student produced, so it
  // sits on changed text.
  const start = REWRITE.indexOf('for');
  await app.inject({ method: 'POST', url: `/api/native/pads/${rewritePadId}/annotations`,
    payload: {
      type: 'literacy_code', start_offset: start, end_offset: start + 3, selected_text: 'for', body: '',
      metadata: { code: 'Prep', category: 'grammar', label: 'Preposition' }, document_version: 1,
    }, headers });
  // A mark on text carried over unchanged is the draft's error surviving, and
  // must not be counted again as new.
  const carried = REWRITE.indexOf('memorable');
  await app.inject({ method: 'POST', url: `/api/native/pads/${rewritePadId}/annotations`,
    payload: {
      type: 'literacy_code', start_offset: carried, end_offset: carried + 9, selected_text: 'memorable', body: '',
      metadata: { code: 'WW', category: 'surface', label: 'Wrong word' }, document_version: 1,
    }, headers });

  const before = await review(app, headers, rewritePadId);
  assert.deepEqual(before.rewrite_error_tally, { original: 1, fixed: null, introduced: 1, scored: false },
    'fixed is unknown until the check has run');

  // Stand in for the implementation scorer having run.
  db.prepare(`
    INSERT INTO implementation_scores (rewrite_pad_id, original_pad_id, student_id, addressed_json, meaningful, summary, model)
    VALUES (?, ?, (SELECT student_id FROM native_pads WHERE id = ?), ?, 1, '', 'fake/model')
  `).run(rewritePadId, padId, rewritePadId, JSON.stringify({ codes: [{ code: 'WW', addressed: true }] }));

  const after = await review(app, headers, rewritePadId);
  assert.deepEqual(after.rewrite_error_tally, { original: 1, fixed: 1, introduced: 1, scored: true });

  await app.close();
});

test('an ordinary essay has no tally', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, padId } = await seedRewrite(db);
  const data = await review(app, headers, padId);
  assert.equal(data.rewrite_error_tally, null);
  await app.close();
});
