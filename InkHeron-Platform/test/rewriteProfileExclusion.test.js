/**
 * A green-pen rewrite is corrected work, not a sample of how the student
 * writes unaided: they have the marked original in front of them and have
 * looked up how to fix each error. Marking still happens ON the rewrite, but
 * what reaches the long-term record is deliberately narrow.
 *
 * The stylometric fingerprint excludes rewrites outright (teacher decision,
 * 2026-07-29): scaffolded phrasing says nothing about natural voice.
 *
 * The grammar profile takes a rewrite mark ONLY where it sits on text the
 * student changed or added (2026-08-28). Text they carried over unchanged is
 * the original error surviving, and a correction of something already flagged
 * would count the same error twice; a genuinely new slip made while rewriting
 * lands on changed text and does count.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { recordStyleMetrics } from '../src/services/styleMetrics.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-rewriteprofile-'));
  return path.join(dir, 'inkheron.db');
}

const TEXT = 'They is playing outside today. The game was fun and the game was long.';

// The rewrite as the student actually handed it back: 'is' fixed to 'are' and
// the repeated 'game' varied to 'match'. Everything else is carried over.
const REWRITTEN = 'They are playing outside today. The game was fun and the match was long.';

async function seed(db, { rewriteText = TEXT } = {}) {
  const app = await buildApp({ db, logger: false });
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const csrf = login.json().user.csrf_token;
  const cookies = login.headers['set-cookie'];
  const headers = { 'X-CSRF-Token': csrf, cookie: cookies };

  const classId = (await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers })).json().class.id;
  const studentId = (await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: classId },
    headers })).json().student.id;
  const essayId = (await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', settings: { green_pen: true } }, headers })).json().assignment.id;
  const rewriteAssignmentId = (await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay rewrite', settings: {} }, headers })).json().assignment.id;

  const originalPadId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'marked', '{}', ?, 14, 2)
  `).run(studentId, essayId, TEXT).lastInsertRowid;
  const rewritePadId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version, rewrite_of_pad_id)
    VALUES (?, ?, 'submitted', '{}', ?, 14, 2, ?)
  `).run(studentId, rewriteAssignmentId, rewriteText, originalPadId).lastInsertRowid;

  return { app, headers, studentId, originalPadId, rewritePadId };
}

function addLiteracyMark(app, headers, padId) {
  return app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    payload: {
      type: 'literacy_code',
      start_offset: 5,
      end_offset: 7,
      selected_text: 'is',
      body: '',
      metadata: { code: 'SV-AGREEMENT', category: 'grammar', label: 'Subject-verb agreement' },
      document_version: 2,
    },
    headers,
  });
}

test('a literacy mark on the original essay feeds the profile', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, studentId, originalPadId } = await seed(db);

  const res = await addLiteracyMark(app, headers, originalPadId);
  assert.equal(res.statusCode, 201);

  const evidence = db.prepare(
    'SELECT COUNT(*) AS n FROM student_literacy_evidence WHERE student_id = ?'
  ).get(studentId).n;
  assert.equal(evidence, 1);

  const stat = db.prepare(
    'SELECT evidence_count FROM student_literacy_issue_stats WHERE student_id = ? AND code = ?'
  ).get(studentId, 'SV-AGREEMENT');
  assert.equal(stat?.evidence_count, 1);

  await app.close();
});

test('the same mark on a green-pen rewrite is stored but never reaches the profile', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, studentId, rewritePadId } = await seed(db);

  const res = await addLiteracyMark(app, headers, rewritePadId);
  assert.equal(res.statusCode, 201, 'the mark itself is still created for the teacher');

  const annotations = db.prepare(
    "SELECT COUNT(*) AS n FROM native_annotations WHERE native_pad_id = ? AND type = 'literacy_code'"
  ).get(rewritePadId).n;
  assert.equal(annotations, 1, 'the teacher can still see the mark on the rewrite');

  const evidence = db.prepare(
    'SELECT COUNT(*) AS n FROM student_literacy_evidence WHERE student_id = ?'
  ).get(studentId).n;
  assert.equal(evidence, 0, 'no profile evidence from a rewrite');

  const stats = db.prepare(
    'SELECT COUNT(*) AS n FROM student_literacy_issue_stats WHERE student_id = ?'
  ).get(studentId).n;
  assert.equal(stats, 0, 'no issue stats from a rewrite');

  await app.close();
});

// Mark an arbitrary quote wherever it appears in the pad's text.
function markQuote(app, headers, padId, text, quote, meta) {
  const start = text.indexOf(quote);
  assert.ok(start >= 0, `"${quote}" is in the text under test`);
  return app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    payload: {
      type: 'literacy_code',
      start_offset: start,
      end_offset: start + quote.length,
      selected_text: quote,
      body: '',
      metadata: meta,
      document_version: 2,
    },
    headers,
  });
}

const TENSE = { code: 'TENSE', category: 'grammar', label: 'Tense' };

test('a new slip on text the student rewrote does reach the profile', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, studentId, rewritePadId } = await seed(db, { rewriteText: REWRITTEN });

  // 'are' is text the student produced themselves while rewriting.
  const res = await markQuote(app, headers, rewritePadId, REWRITTEN, 'are', TENSE);
  assert.equal(res.statusCode, 201);

  const stat = db.prepare(
    'SELECT evidence_count FROM student_literacy_issue_stats WHERE student_id = ? AND code = ?'
  ).get(studentId, 'TENSE');
  assert.equal(stat?.evidence_count, 1, 'a mistake made while rewriting is real evidence');

  await app.close();
});

test('a mark on text carried over unchanged stays out of the profile', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, studentId, rewritePadId } = await seed(db, { rewriteText: REWRITTEN });

  // 'playing outside' is untouched from draft 1, so a mark there is the
  // original error surviving, not a new one.
  const res = await markQuote(app, headers, rewritePadId, REWRITTEN, 'playing outside', TENSE);
  assert.equal(res.statusCode, 201, 'the mark is still created');

  const evidence = db.prepare(
    'SELECT COUNT(*) AS n FROM student_literacy_evidence WHERE student_id = ?'
  ).get(studentId).n;
  assert.equal(evidence, 0, 'carried-over text is not new evidence');

  await app.close();
});

test('editing the rewrite drops evidence for a mark no longer on changed text', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, studentId, rewritePadId } = await seed(db, { rewriteText: REWRITTEN });

  const created = await markQuote(app, headers, rewritePadId, REWRITTEN, 'are', TENSE);
  const annotationId = created.json().annotation.id;
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM student_literacy_evidence WHERE annotation_id = ?').get(annotationId).n,
    1
  );

  // The rewrite goes back to the draft's wording, so nothing at that span is
  // the student's own writing any more.
  db.prepare("UPDATE native_pads SET plain_text = ?, version = 3, updated_at = datetime('now','+1 second') WHERE id = ?")
    .run(TEXT, rewritePadId);
  await app.inject({
    method: 'PATCH',
    url: `/api/native/annotations/${annotationId}`,
    payload: { body: 'still wrong' },
    headers,
  });

  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM student_literacy_evidence WHERE annotation_id = ?').get(annotationId).n,
    0,
    'the evidence follows the text it was based on'
  );
  const stat = db.prepare(
    'SELECT evidence_count FROM student_literacy_issue_stats WHERE student_id = ? AND code = ?'
  ).get(studentId, 'TENSE');
  assert.equal(stat?.evidence_count ?? 0, 0, 'the stat is recomputed too');

  await app.close();
});

test('style metrics record the original essay and skip the rewrite', async () => {
  const db = openDatabase(tmpDb());
  const { app, originalPadId, rewritePadId } = await seed(db);

  assert.equal(recordStyleMetrics(db, { padId: originalPadId }).status, 'ok');
  const skipped = recordStyleMetrics(db, { padId: rewritePadId });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.reason, 'rewrite');

  const rows = db.prepare('SELECT native_pad_id FROM style_metrics').all();
  assert.deepEqual(rows.map((r) => r.native_pad_id), [originalPadId]);

  await app.close();
});
