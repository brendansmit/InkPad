import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { autoPromoteSuggestions, retractAiMarksForPad, retractAiFeedbackForPad } from '../src/routes/nativePads.js';
import { parseJsonArraySalvage } from '../src/services/literacyCoder.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-autoaccept-'));
  return path.join(dir, 'inkheron.db');
}

const PAD_TEXT = 'They is playing outside and she recieved the ball.';

async function seed(db) {
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
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: {} },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const sLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const pad = await app.inject({ method: 'GET',
    url: `/api/native/assignments/${created.json().assignment.id}/pad`,
    headers: { cookie: sLogin.headers['set-cookie'] } });
  const padId = pad.json().pad.id;
  db.prepare('UPDATE native_pads SET plain_text = ? WHERE id = ?').run(PAD_TEXT, padId);
  return { app, padId, csrf, cookies, studentId: studentRes.json().student.id };
}

function insertSuggestion(db, padId, { quote, start, end, code, checker }) {
  return db.prepare(`
    INSERT INTO ai_literacy_suggestions
      (native_pad_id, document_version, start_offset, end_offset, quote, code, category, label, model, checker_json, status)
    VALUES (?, 1, ?, ?, ?, ?, 'grammar', 'Grammar', 'fake/doer', ?, 'pending')
  `).run(padId, start, end, quote, code, JSON.stringify(checker)).lastInsertRowid;
}

test('confident findings auto-promote to marks, contested ones stay pending', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, studentId } = await seed(db);

  const confidentId = insertSuggestion(db, padId, { quote: 'is', start: 5, end: 7, code: 'Gra',
    checker: { verbatim: true, confidence: 0.92, flag: null } });
  insertSuggestion(db, padId, { quote: 'recieved', start: 36, end: 44, code: 'Sp',
    checker: { verbatim: true, confidence: 0.55, flag: null } });
  insertSuggestion(db, padId, { quote: 'playing', start: 8, end: 15, code: 'WW',
    checker: { verbatim: true, confidence: 0.9, flag: 'code_questioned' } });

  const result = autoPromoteSuggestions(db, padId);
  assert.equal(result.promoted, 1, 'only the flag-free high-confidence finding promotes');

  const promoted = db.prepare('SELECT * FROM ai_literacy_suggestions WHERE id = ?').get(confidentId);
  assert.equal(promoted.status, 'accepted');
  assert.ok(promoted.annotation_id);
  const annotation = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(promoted.annotation_id);
  assert.equal(annotation.type, 'literacy_code');
  assert.equal(annotation.teacher_id, null, 'auto marks carry no teacher id');
  assert.match(annotation.metadata_json, /ai_auto/);

  // Profile evidence and stats updated.
  const evidence = db.prepare('SELECT * FROM student_literacy_evidence WHERE annotation_id = ?').get(promoted.annotation_id);
  assert.equal(evidence.student_id, studentId);
  const stat = db.prepare("SELECT * FROM student_literacy_issue_stats WHERE student_id = ? AND code = 'Gra'").get(studentId);
  assert.equal(stat.evidence_count, 1);

  const stillPending = db.prepare("SELECT COUNT(*) AS n FROM ai_literacy_suggestions WHERE native_pad_id = ? AND status = 'pending'").get(padId);
  assert.equal(stillPending.n, 2);

  await app.close();
});

test('two overlapping findings both auto-promote and both appear in the review payload', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, csrf, cookies } = await seed(db);

  // A clause-level structure mark over "They is playing outside" and a
  // word-level grammar mark on "is" inside it. Both confident and flag-free.
  const clauseId = insertSuggestion(db, padId, { quote: 'They is playing outside', start: 0, end: 23, code: 'STR',
    checker: { verbatim: true, confidence: 0.9, flag: null } });
  const wordId = insertSuggestion(db, padId, { quote: 'is', start: 5, end: 7, code: 'Gra',
    checker: { verbatim: true, confidence: 0.92, flag: null } });

  const result = autoPromoteSuggestions(db, padId);
  assert.equal(result.promoted, 2, 'both overlapping findings promote, neither drops the other');

  const clauseAnn = db.prepare('SELECT annotation_id FROM ai_literacy_suggestions WHERE id = ?').get(clauseId).annotation_id;
  const wordAnn = db.prepare('SELECT annotation_id FROM ai_literacy_suggestions WHERE id = ?').get(wordId).annotation_id;
  assert.ok(clauseAnn && wordAnn);

  const review = await app.inject({ method: 'GET', url: `/api/native/pads/${padId}/review`,
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const lit = review.json().annotations.filter((a) => a.type === 'literacy_code');
  const clause = lit.find((a) => a.id === clauseAnn);
  const word = lit.find((a) => a.id === wordAnn);
  assert.ok(clause && word, 'both overlapping marks are in the review payload');
  // The word span sits strictly inside the clause span.
  assert.ok(clause.start_offset <= word.start_offset && word.end_offset <= clause.end_offset,
    'the word-level mark is nested inside the clause-level mark');

  await app.close();
});

test('disagree retracts an auto-accepted mark and its profile data', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, csrf, cookies, studentId } = await seed(db);

  const suggestionId = insertSuggestion(db, padId, { quote: 'is', start: 5, end: 7, code: 'Gra',
    checker: { verbatim: true, confidence: 0.92, flag: null } });
  autoPromoteSuggestions(db, padId);
  const before = db.prepare('SELECT annotation_id FROM ai_literacy_suggestions WHERE id = ?').get(suggestionId);
  assert.ok(before.annotation_id);

  const res = await app.inject({ method: 'POST',
    url: `/api/native/pads/${padId}/suggestions/${suggestionId}/disagree`,
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  assert.equal(res.statusCode, 204);

  const after = db.prepare('SELECT status, annotation_id FROM ai_literacy_suggestions WHERE id = ?').get(suggestionId);
  assert.equal(after.status, 'rejected');
  assert.equal(after.annotation_id, null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM native_annotations WHERE id = ?').get(before.annotation_id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM student_literacy_evidence WHERE annotation_id = ?').get(before.annotation_id).n, 0);
  const stat = db.prepare("SELECT evidence_count FROM student_literacy_issue_stats WHERE student_id = ? AND code = 'Gra'").get(studentId);
  assert.equal(stat?.evidence_count ?? 0, 0, 'stat recomputed to zero after retraction');

  // Disagree also dismisses a still-pending suggestion.
  const pendingId = insertSuggestion(db, padId, { quote: 'recieved', start: 36, end: 44, code: 'Sp',
    checker: { verbatim: true, confidence: 0.5, flag: null } });
  const res2 = await app.inject({ method: 'POST',
    url: `/api/native/pads/${padId}/suggestions/${pendingId}/disagree`,
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  assert.equal(res2.statusCode, 204);
  assert.equal(db.prepare('SELECT status FROM ai_literacy_suggestions WHERE id = ?').get(pendingId).status, 'rejected');

  await app.close();
});

test('parseJsonArraySalvage recovers a truncated findings array', () => {
  const full = '[{"a":1},{"a":2}]';
  assert.equal(parseJsonArraySalvage(full).length, 2);
  const truncated = '[{"sentence":"x","quote":"y","code":"Sp"},{"sentence":"x","quote":"z","co';
  const salvaged = parseJsonArraySalvage(truncated);
  assert.equal(salvaged.length, 1, 'keeps every complete object, drops the cut one');
  assert.equal(parseJsonArraySalvage('not json'), null);
});

test('MT findings never auto-promote regardless of checker confidence', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seed(db);

  const mtId = insertSuggestion(db, padId, { quote: 'is', start: 5, end: 7, code: 'MT',
    checker: { verbatim: true, confidence: 0.99, flag: null } });
  const result = autoPromoteSuggestions(db, padId);
  assert.equal(result.promoted, 0, 'manual-review code stays pending for the teacher');
  assert.equal(db.prepare('SELECT status FROM ai_literacy_suggestions WHERE id = ?').get(mtId).status, 'pending');

  await app.close();
});

test('sentenceAround expands to full sentence boundaries', async () => {
  const { sentenceAround } = await import('../src/services/checker.js');
  const text = 'First one here. They is playing outside today! And a third.';
  const at = text.indexOf('is');
  assert.equal(sentenceAround(text, at, at + 2), 'They is playing outside today!');
  assert.equal(sentenceAround('no punctuation at all', 3, 5), 'no punctuation at all');
});

test('retractAiMarksForPad replaces a previous run instead of stacking, and rejected findings stay vetoed', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, studentId } = await seed(db);

  // First run: two confident findings promote to marks.
  insertSuggestion(db, padId, { quote: 'is', start: 5, end: 7, code: 'Gra',
    checker: { verbatim: true, confidence: 0.92, flag: null } });
  const spId = insertSuggestion(db, padId, { quote: 'recieved', start: 36, end: 44, code: 'Sp',
    checker: { verbatim: true, confidence: 0.9, flag: null } });
  autoPromoteSuggestions(db, padId);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM native_annotations WHERE native_pad_id = ? AND type = 'literacy_code'").get(padId).n, 2);

  // Teacher disagrees with the Sp mark.
  db.prepare('DELETE FROM native_annotations WHERE id = (SELECT annotation_id FROM ai_literacy_suggestions WHERE id = ?)').run(spId);
  db.prepare("UPDATE ai_literacy_suggestions SET status = 'rejected', annotation_id = NULL WHERE id = ?").run(spId);

  // Second run: retract, then the model re-finds both errors.
  retractAiMarksForPad(db, padId);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM native_annotations WHERE native_pad_id = ? AND type = 'literacy_code'").get(padId).n, 0,
    'previous AI marks are gone before the new run promotes');
  const stat = db.prepare("SELECT * FROM student_literacy_issue_stats WHERE student_id = ? AND code = 'Gra'").get(studentId);
  assert.ok(!stat || stat.evidence_count === 0, 'profile stat recomputed after retraction');

  insertSuggestion(db, padId, { quote: 'is', start: 5, end: 7, code: 'Gra',
    checker: { verbatim: true, confidence: 0.92, flag: null } });
  insertSuggestion(db, padId, { quote: 'recieved', start: 36, end: 44, code: 'Sp',
    checker: { verbatim: true, confidence: 0.9, flag: null } });
  const second = autoPromoteSuggestions(db, padId);
  assert.equal(second.promoted, 1, 'the rejected Sp finding stays vetoed; only Gra promotes');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM native_annotations WHERE native_pad_id = ? AND type = 'literacy_code'").get(padId).n, 1,
    'no Gra.Gra stacking after a re-run');

  await app.close();
});

test('retractAiFeedbackForPad clears AI strengths and targets but never teacher-written items', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, csrf, cookies } = await seed(db);

  const insertFeedbackSuggestion = (kind, title) => db.prepare(`
    INSERT INTO ai_feedback_item_suggestions
      (native_pad_id, kind, title, explanation, try_now_prompt, model, checker_json, status)
    VALUES (?, ?, ?, 'Because.', '', 'fake/doer', '{}', 'pending')
  `).run(padId, kind, title).lastInsertRowid;

  const acceptedId = insertFeedbackSuggestion('strength', 'Clear thesis');
  const rejectedId = insertFeedbackSuggestion('target', 'Vary sentence openings');
  insertFeedbackSuggestion('target', 'Use linking words');

  const accept = await app.inject({ method: 'POST',
    url: `/api/native/pads/${padId}/feedback-suggestions/${acceptedId}/accept`,
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  assert.equal(accept.statusCode, 201);
  await app.inject({ method: 'POST',
    url: `/api/native/pads/${padId}/feedback-suggestions/${rejectedId}/reject`,
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });

  const teacherItem = await app.inject({ method: 'POST',
    url: `/api/native/pads/${padId}/feedback-items`,
    payload: { kind: 'target', title: 'Check subject-verb agreement' },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  assert.equal(teacherItem.statusCode, 201);

  const result = retractAiFeedbackForPad(db, padId);
  assert.equal(result.retracted, 1, 'the accepted AI item is removed');

  const items = db.prepare('SELECT source, title FROM native_feedback_items WHERE native_pad_id = ?').all(padId);
  assert.equal(items.length, 1, 'only the teacher-written item survives');
  assert.equal(items[0].source, 'teacher');
  assert.equal(items[0].title, 'Check subject-verb agreement');

  const suggestions = db.prepare('SELECT status FROM ai_feedback_item_suggestions WHERE native_pad_id = ?').all(padId);
  assert.equal(suggestions.length, 1, 'pending and accepted suggestions are cleared');
  assert.equal(suggestions[0].status, 'rejected', 'the rejection stays on record');

  await app.close();
});

test('rejecting a placed mark via DELETE cleans evidence and marks a linked suggestion rejected', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId, csrf, cookies, studentId } = await seed(db);

  const suggestionId = insertSuggestion(db, padId, { quote: 'is', start: 5, end: 7, code: 'Gra',
    checker: { verbatim: true, confidence: 0.92, flag: null } });
  autoPromoteSuggestions(db, padId);
  const annId = db.prepare('SELECT annotation_id FROM ai_literacy_suggestions WHERE id = ?').get(suggestionId).annotation_id;

  const res = await app.inject({ method: 'DELETE', url: `/api/native/annotations/${annId}`,
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  assert.equal(res.statusCode, 204);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM native_annotations WHERE id = ?').get(annId).n, 0);
  assert.equal(db.prepare('SELECT status FROM ai_literacy_suggestions WHERE id = ?').get(suggestionId).status, 'rejected');
  const stat = db.prepare("SELECT evidence_count FROM student_literacy_issue_stats WHERE student_id = ? AND code = 'Gra'").get(studentId);
  assert.equal(stat?.evidence_count ?? 0, 0);

  await app.close();
});
