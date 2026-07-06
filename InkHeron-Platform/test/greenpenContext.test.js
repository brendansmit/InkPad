import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-gpctx-'));
  return path.join(dir, 'inkheron.db');
}

const ORIGINAL = 'They is playing outside. The game was fun and the game was long.';

async function seed(db) {
  const app = await buildApp({ db, logger: false });
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const csrf = login.json().user.csrf_token;
  const cookies = login.headers['set-cookie'];
  const h = { 'X-CSRF-Token': csrf, cookie: cookies };
  const cls = await app.inject({ method: 'POST', url: '/api/classes', payload: { name: 'G9' }, headers: h });
  const alice = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: cls.json().class.id }, headers: h });
  await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'bob', display_name: 'Bob', password: 'pass12345', class_id: cls.json().class.id }, headers: h });
  const a1 = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: { green_pen: true, feedback_release: 'immediate' } }, headers: h });
  const a2 = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay rewrite', settings: { feedback_release: 'immediate' } }, headers: h });
  const studentId = alice.json().student.id;

  const originalId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'green_pen_open', '{}', ?, 14, 2)
  `).run(studentId, a1.json().assignment.id, ORIGINAL).lastInsertRowid;
  db.prepare(`
    INSERT INTO native_annotations (native_pad_id, type, start_offset, end_offset, selected_text, body, metadata_json)
    VALUES (?, 'literacy_code', 5, 7, 'is', '', '{"code":"Gra","category":"grammar","label":"Grammar"}')
  `).run(originalId);
  db.prepare(`
    INSERT INTO native_annotations (native_pad_id, type, start_offset, end_offset, selected_text, body)
    VALUES (?, 'inline_comment', 25, 64, 'The game was fun and the game was long.', 'You repeat the game.')
  `).run(originalId);
  db.prepare(`
    INSERT INTO native_feedback_items (native_pad_id, kind, title, explanation, try_now_prompt)
    VALUES (?, 'target', 'Vary vocabulary', 'Avoid repeating a noun.', 'Reword one game.')
  `).run(originalId);
  const rewriteId = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version, rewrite_of_pad_id)
    VALUES (?, ?, 'writing', '{}', ?, 14, 1, ?)
  `).run(studentId, a2.json().assignment.id, ORIGINAL, originalId).lastInsertRowid;

  const aliceLogin = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'alice', password: 'pass12345' } });
  const bobLogin = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'bob', password: 'pass12345' } });
  return { app, originalId, rewriteId,
    alice: { cookie: aliceLogin.headers['set-cookie'] },
    bob: { cookie: bobLogin.headers['set-cookie'] } };
}

test('greenpen-context returns category-only marks, feedback and comments for the owner', async () => {
  const db = openDatabase(tmpDb());
  const { app, originalId, rewriteId, alice, bob } = await seed(db);

  const res = await app.inject({ method: 'GET', url: `/api/native/pads/${rewriteId}/greenpen-context`, headers: { cookie: alice.cookie } });
  assert.equal(res.statusCode, 200);
  const ctx = res.json();
  assert.equal(ctx.original_pad_id, originalId);
  assert.equal(ctx.marks.length, 1);
  assert.equal(ctx.marks[0].quote, 'is');
  assert.equal(ctx.marks[0].category, 'grammar');
  assert.equal(ctx.marks[0].context_before, 'They ');
  assert.ok(ctx.marks[0].context_after.startsWith(' playing'));
  assert.equal(ctx.feedback.targets.length, 1);
  assert.equal(ctx.feedback.targets[0].student_checked, false);
  assert.equal(ctx.comments.length, 1);
  assert.equal(ctx.comments[0].kind, 'inline_comment');

  // Another student cannot read it; a non-rewrite pad 404s.
  const stranger = await app.inject({ method: 'GET', url: `/api/native/pads/${rewriteId}/greenpen-context`, headers: { cookie: bob.cookie } });
  assert.equal(stranger.statusCode, 404);
  const notRewrite = await app.inject({ method: 'GET', url: `/api/native/pads/${originalId}/greenpen-context`, headers: { cookie: alice.cookie } });
  assert.equal(notRewrite.statusCode, 404);

  await app.close();
});

test('write view for a rewrite pad includes the green pen panel and engine', async () => {
  const db = openDatabase(tmpDb());
  const { app, rewriteId, alice } = await seed(db);
  const assignmentId = db.prepare('SELECT assignment_id FROM native_pads WHERE id = ?').get(rewriteId).assignment_id;

  const page = await app.inject({ method: 'GET', url: `/native/write/${assignmentId}`, headers: { cookie: alice.cookie } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /gpCard/);
  assert.match(page.body, /greenpen-context/);
  assert.match(page.body, /const GREENPEN = true/);

  // A normal (non-rewrite) assignment write view has no green pen panel.
  const otherAssignment = db.prepare('SELECT assignment_id FROM native_pads WHERE rewrite_of_pad_id IS NULL LIMIT 1').get().assignment_id;
  const normal = await app.inject({ method: 'GET', url: `/native/write/${otherAssignment}`, headers: { cookie: alice.cookie } });
  assert.equal(normal.statusCode, 200);
  assert.match(normal.body, /const GREENPEN = false/);
  assert.doesNotMatch(normal.body, /gpCard/);

  await app.close();
});
