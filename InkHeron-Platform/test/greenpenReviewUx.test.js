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
  // The copied reference marks still exist in the payload; hiding them is the
  // page's job, so the teacher can still reach them if ever needed.
  assert.ok(
    data.annotations.some((a) => a.type === 'literacy_code'),
    'the copied marks are still stored and served'
  );

  await app.close();
});
