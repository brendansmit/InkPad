/**
 * When a green-pen rewrite pad is created it is seeded with COPIES of the
 * teacher's marks, each stamped with `source_annotation_id`. The copy is the
 * one the student actually looks at while rewriting, so retracting the original
 * has to take the copy with it. It did not: a teacher who deleted a bogus mark
 * would watch it stay on the student's screen (found 2026-07-29 after
 * retracting a student's marks and checking whether she could still see them).
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

// Marks an essay, releases feedback so the rewrite pad is seeded from it, and
// returns the original mark plus its copy on the rewrite pad.
async function seedRewriteWithCopiedMark(db) {
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
  const annotationId = mark.json().annotation.id;

  const released = await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/release-feedback`, headers });
  assert.equal(released.statusCode, 200);

  const copies = db.prepare(
    "SELECT id, native_pad_id FROM native_annotations WHERE json_extract(metadata_json, '$.source_annotation_id') = ?"
  ).all(annotationId);
  assert.equal(copies.length, 1, 'the rewrite pad was seeded with a copy of the mark');

  return { app, headers, padId, annotationId, copyId: copies[0].id, db };
}

function countAnnotations(db, ids) {
  return db.prepare(`SELECT COUNT(*) AS n FROM native_annotations WHERE id IN (${ids.join(',')})`).get().n;
}

test('deleting a mark also removes the copy the student sees on their rewrite', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, annotationId, copyId } = await seedRewriteWithCopiedMark(db);

  const res = await app.inject({ method: 'DELETE', url: `/api/native/annotations/${annotationId}`, headers });
  assert.equal(res.statusCode, 204);

  assert.equal(countAnnotations(db, [annotationId]), 0, 'the original is gone');
  assert.equal(countAnnotations(db, [copyId]), 0, 'the copy on the rewrite pad went with it');

  await app.close();
});

test('unrelated marks on the rewrite pad survive the cascade', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, annotationId, copyId } = await seedRewriteWithCopiedMark(db);

  const rewritePadId = db.prepare('SELECT native_pad_id FROM native_annotations WHERE id = ?').get(copyId).native_pad_id;
  const ownMark = db.prepare(`
    INSERT INTO native_annotations (native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, document_version)
    VALUES (?, NULL, 'literacy_code', 40, 46, 'speech', '', '{"code":"Sp","category":"surface","label":"Spelling"}', 1)
  `).run(rewritePadId).lastInsertRowid;

  await app.inject({ method: 'DELETE', url: `/api/native/annotations/${annotationId}`, headers });

  assert.equal(countAnnotations(db, [copyId]), 0, 'the copy went');
  assert.equal(countAnnotations(db, [ownMark]), 1, 'a mark made on the rewrite itself stays');

  await app.close();
});

test('disagreeing with an auto-applied AI mark clears its copy too', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, padId, annotationId, copyId } = await seedRewriteWithCopiedMark(db);

  // Back the mark with the AI suggestion it would have been promoted from.
  const suggestionId = db.prepare(`
    INSERT INTO ai_literacy_suggestions
      (native_pad_id, code, category, label, quote, start_offset, end_offset, status, annotation_id, checker_json, document_version, model)
    VALUES (?, 'WW', 'surface', 'Wrong word', 'of', 17, 19, 'accepted', ?, '{}', 1, 'fake/model')
  `).run(padId, annotationId).lastInsertRowid;

  const res = await app.inject({ method: 'POST',
    url: `/api/native/pads/${padId}/suggestions/${suggestionId}/disagree`, headers });
  assert.equal(res.statusCode, 204);

  assert.equal(countAnnotations(db, [annotationId]), 0, 'the original is retracted');
  assert.equal(countAnnotations(db, [copyId]), 0, 'and so is the copy on the rewrite');

  await app.close();
});
