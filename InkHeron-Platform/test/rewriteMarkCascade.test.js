/**
 * What a green-pen rewrite pad is seeded with, and what happens when the
 * teacher retracts a mark.
 *
 * Until 2026-08-29 the rewrite was seeded with COPIES of every mark, literacy
 * codes included. That is gone: a rewrite is the final version and is not
 * marked up again, and a copied mark still carried the DRAFT's offsets, so on
 * the rewritten text it pointed at whatever words had moved into those
 * positions. The student still sees every mark while writing, served from
 * /greenpen-context off the original pad. Comments and feedback items are
 * still copied, because the teacher needs them beside the rewrite to judge how
 * well the feedback was acted on.
 *
 * The cascade itself stays: historical pads created before this change still
 * carry copies, and retracting an original has to take those with it. That was
 * a real failure once (2026-07-29): a teacher deleted a bogus mark and watched
 * it stay on the student's screen.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-markcascade-'));
  return path.join(dir, 'inkheron.db');
}

const TEXT = 'She felt empathy of the problem and the speech was memorable.';

// Marks an essay with one literacy code and one inline comment, then releases
// feedback so the rewrite pad is seeded from it.
async function seedRewrite(db) {
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
  db.prepare("UPDATE native_pads SET state = 'marked', plain_text = ?, version = 1 WHERE id = ?").run(TEXT, padId);

  const mark = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/annotations`,
    payload: {
      type: 'literacy_code', start_offset: 17, end_offset: 19, selected_text: 'of', body: '',
      metadata: { code: 'WW', category: 'surface', label: 'Wrong word' }, document_version: 1,
    }, headers });
  assert.equal(mark.statusCode, 201);

  const comment = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/annotations`,
    payload: {
      type: 'inline_comment', start_offset: 40, end_offset: 46, selected_text: 'speech',
      body: 'Say which speech you mean.', metadata: {}, document_version: 1,
    }, headers });
  assert.equal(comment.statusCode, 201);

  const released = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/release-feedback`, headers });
  assert.equal(released.statusCode, 200);

  const rewritePadId = db.prepare('SELECT id FROM native_pads WHERE rewrite_of_pad_id = ?').get(padId).id;
  return { app, headers, padId, rewritePadId, markId: mark.json().annotation.id, commentId: comment.json().annotation.id };
}

function countAnnotations(db, ids) {
  return db.prepare(`SELECT COUNT(*) AS n FROM native_annotations WHERE id IN (${ids.join(',')})`).get().n;
}

test('a rewrite pad is seeded with the comments but not the literacy marks', async () => {
  const db = openDatabase(tmpDb());
  const { app, rewritePadId, markId, commentId } = await seedRewrite(db);

  const seeded = db.prepare(
    'SELECT type, json_extract(metadata_json, \'$.source_annotation_id\') AS src FROM native_annotations WHERE native_pad_id = ?'
  ).all(rewritePadId);

  assert.deepEqual(
    seeded.map((row) => row.type),
    ['inline_comment'],
    'the comment came across and the literacy mark did not'
  );
  assert.equal(seeded[0].src, commentId, 'the copied comment points back at the original');
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM native_annotations WHERE native_pad_id = ? AND type = 'literacy_code'").get(rewritePadId).n,
    0
  );
  assert.equal(countAnnotations(db, [markId]), 1, 'the mark on the draft itself is untouched');

  await app.close();
});

test('the student still sees every draft mark while rewriting', async () => {
  const db = openDatabase(tmpDb());
  const { app, rewritePadId } = await seedRewrite(db);

  const studentLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'cathy', password: 'pass12345' } });
  const res = await app.inject({ method: 'GET', url: `/api/native/pads/${rewritePadId}/greenpen-context`,
    headers: { cookie: studentLogin.headers['set-cookie'] } });

  assert.equal(res.statusCode, 200);
  const marks = res.json().marks;
  assert.equal(marks.length, 1, 'the mark is served off the original pad, not off a copy');
  assert.equal(marks[0].quote, 'of');
  assert.equal(marks[0].code, 'WW');

  await app.close();
});

test('retracting a mark still clears a historical copy on a rewrite pad', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, rewritePadId, markId } = await seedRewrite(db);

  // A pad created before 2026-08-29 carries copies. Stand one up by hand.
  const legacyCopy = db.prepare(`
    INSERT INTO native_annotations (native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, document_version)
    VALUES (?, NULL, 'literacy_code', 17, 19, 'of', '', ?, 1)
  `).run(rewritePadId, JSON.stringify({ code: 'WW', category: 'surface', label: 'Wrong word', source_annotation_id: markId })).lastInsertRowid;

  // A mark the teacher made on the rewrite itself must not be swept up.
  const ownMark = db.prepare(`
    INSERT INTO native_annotations (native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, document_version)
    VALUES (?, NULL, 'literacy_code', 40, 46, 'speech', '', '{"code":"Sp","category":"surface","label":"Spelling"}', 1)
  `).run(rewritePadId).lastInsertRowid;

  const res = await app.inject({ method: 'DELETE', url: `/api/native/annotations/${markId}`, headers });
  assert.equal(res.statusCode, 204);

  assert.equal(countAnnotations(db, [markId]), 0, 'the original is gone');
  assert.equal(countAnnotations(db, [legacyCopy]), 0, 'the legacy copy went with it');
  assert.equal(countAnnotations(db, [ownMark]), 1, 'a mark made on the rewrite itself stays');

  await app.close();
});

test('disagreeing with an auto-applied AI mark clears a historical copy too', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, padId, rewritePadId, markId } = await seedRewrite(db);

  const legacyCopy = db.prepare(`
    INSERT INTO native_annotations (native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, document_version)
    VALUES (?, NULL, 'literacy_code', 17, 19, 'of', '', ?, 1)
  `).run(rewritePadId, JSON.stringify({ code: 'WW', category: 'surface', label: 'Wrong word', source_annotation_id: markId })).lastInsertRowid;

  // Back the mark with the AI suggestion it would have been promoted from.
  const suggestionId = db.prepare(`
    INSERT INTO ai_literacy_suggestions
      (native_pad_id, code, category, label, quote, start_offset, end_offset, status, annotation_id, checker_json, document_version, model)
    VALUES (?, 'WW', 'surface', 'Wrong word', 'of', 17, 19, 'accepted', ?, '{}', 1, 'fake/model')
  `).run(padId, markId).lastInsertRowid;

  const res = await app.inject({ method: 'POST',
    url: `/api/native/pads/${padId}/suggestions/${suggestionId}/disagree`, headers });
  assert.equal(res.statusCode, 204);

  assert.equal(countAnnotations(db, [markId]), 0, 'the original is retracted');
  assert.equal(countAnnotations(db, [legacyCopy]), 0, 'and so is the copy on the rewrite');

  await app.close();
});
