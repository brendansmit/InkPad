import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import AdmZip from 'adm-zip';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';

test('teacher review page exposes all essay download formats and states', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public/teacher/native-review.html'), 'utf8');
  assert.match(html, /Raw submission/);
  assert.match(html, /Commented and reviewed/);
  assert.match(html, /Individual DOCX/);
  assert.match(html, /All essays - DOCX ZIP/);
  assert.match(html, /All essays - compiled PDF/);
  assert.match(html, /export\.docx\?state=/);
  assert.match(html, /export\.zip\?state=/);
  assert.match(html, /export\.pdf\?state=/);
});

function temporaryDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-essay-export-'));
  return path.join(dir, 'inkheron.db');
}

async function seed(app) {
  const setup = await app.inject({ method: 'POST', url: '/api/setup/teacher', payload: {
    username: 'teacher', display_name: 'Teacher', password: 'teacherpass123',
  } });
  assert.equal(setup.statusCode, 201);
  const teacherLogin = await app.inject({ method: 'POST', url: '/api/teacher/login', payload: {
    username: 'teacher', password: 'teacherpass123',
  } });
  const teacherCookie = teacherLogin.headers['set-cookie'];
  const csrf = teacherLogin.json().user.csrf_token;
  const cls = await app.inject({ method: 'POST', url: '/api/classes', headers: { cookie: teacherCookie, 'X-CSRF-Token': csrf }, payload: { name: 'EAP 1' } });
  const classId = cls.json().class.id;
  await app.inject({ method: 'POST', url: '/api/students', headers: { cookie: teacherCookie, 'X-CSRF-Token': csrf }, payload: {
    username: 'alice', display_name: 'Alice Chen', password: 'correct horse', class_id: classId,
  } });
  const db = new DatabaseSync(app._databasePath);
  const assignment = db.prepare(`
    INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
    VALUES (?, 'Personal Statement', 'essay', ?, datetime('now', '-1 day'), datetime('now', '+7 days'))
  `).run(classId, JSON.stringify({ native_inkpad: true, spellcheck: true, prompt: 'Write.' }));
  db.close();
  const studentLogin = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'alice', password: 'correct horse' } });
  const studentCookie = studentLogin.headers['set-cookie'];
  const studentCsrf = studentLogin.json().user.csrf_token;
  const created = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignment.lastInsertRowid}/pad`, headers: { cookie: studentCookie } });
  const padId = created.json().pad.id;
  await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/save`, headers: { cookie: studentCookie, 'X-CSRF-Token': studentCsrf }, payload: {
    document: { type: 'doc', content: [] }, plain_text: 'Original submitted sentence.', expected_version: 1,
  } });
  await app.inject({ method: 'POST', url: `/api/native/pads/${padId}/submit`, headers: { cookie: studentCookie, 'X-CSRF-Token': studentCsrf } });
  const reviewDb = new DatabaseSync(app._databasePath);
  reviewDb.prepare(`UPDATE native_pads SET plain_text = 'Reviewed current sentence.', word_count = 3 WHERE id = ?`).run(padId);
  reviewDb.prepare(`
    INSERT INTO native_annotations (native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, resolved, document_version)
    VALUES (?, 1, 'inline_comment', 0, 8, 'Reviewed', 'Use a more specific opening.', '{}', 0, 2)
  `).run(padId);
  reviewDb.prepare(`
    INSERT INTO native_feedback_items (native_pad_id, kind, title, explanation, source)
    VALUES (?, 'target', 'Add detail', 'Give one concrete example.', 'teacher')
  `).run(padId);
  reviewDb.close();
  return { teacherCookie, assignmentId: Number(assignment.lastInsertRowid), padId };
}

function docxXml(buffer, entry) {
  return new AdmZip(buffer).readAsText(entry);
}

function visibleText(xml) {
  return xml.replace(/<[^>]+>/g, '');
}

test('teacher downloads raw and reviewed individual DOCX files', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath(), logger: false });
  const { teacherCookie, padId } = await seed(app);

  const blocked = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/export.docx?state=raw` });
  assert.equal(blocked.statusCode, 401);

  const raw = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/export.docx?state=raw`, headers: { cookie: teacherCookie } });
  assert.equal(raw.statusCode, 200);
  assert.match(raw.headers['content-type'], /officedocument/);
  const rawXml = docxXml(raw.rawPayload, 'word/document.xml');
  assert.match(rawXml, /Original submitted sentence/);
  assert.doesNotMatch(rawXml, /Reviewed current sentence/);

  const reviewed = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/export.docx?state=reviewed`, headers: { cookie: teacherCookie } });
  assert.equal(reviewed.statusCode, 200);
  const reviewedZip = new AdmZip(reviewed.rawPayload);
  assert.match(visibleText(reviewedZip.readAsText('word/document.xml')), /Reviewed current sentence/);
  assert.match(reviewedZip.readAsText('word/document.xml'), /commentRangeStart/);
  assert.match(reviewedZip.readAsText('word/comments.xml'), /Use a more specific opening/);
  assert.match(reviewedZip.readAsText('word/document.xml'), /Review summary/);
  assert.match(reviewedZip.readAsText('word/document.xml'), /Add detail/);

  const invalid = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/export.docx?state=edited`, headers: { cookie: teacherCookie } });
  assert.equal(invalid.statusCode, 400);
  await app.close();
});

test('teacher downloads a DOCX ZIP and compiled PDF for an assignment', async () => {
  const app = await buildApp({ databasePath: temporaryDatabasePath(), logger: false });
  const { teacherCookie, assignmentId } = await seed(app);

  const zipped = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/export.zip?state=reviewed`, headers: { cookie: teacherCookie } });
  assert.equal(zipped.statusCode, 200);
  assert.match(zipped.headers['content-type'], /zip/);
  const zip = new AdmZip(zipped.rawPayload);
  const entries = zip.getEntries();
  assert.equal(entries.length, 1);
  assert.match(entries[0].entryName, /Alice Chen - reviewed\.docx/);
  assert.equal(entries[0].getData().subarray(0, 2).toString(), 'PK');

  const pdf = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/export.pdf?state=reviewed`, headers: { cookie: teacherCookie } });
  assert.equal(pdf.statusCode, 200);
  assert.match(pdf.headers['content-type'], /pdf/);
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.rawPayload.length > 1000);
  await app.close();
});
