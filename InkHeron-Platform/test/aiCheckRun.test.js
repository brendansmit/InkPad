/**
 * The batch "Run check" job.
 *
 * Submitting triggers no AI any more, so this is the only thing that marks a
 * class. A class is twenty minutes of model calls, longer than any proxy holds
 * a request open, and the teacher wants to start it and close the tab. So the
 * POST only starts the run and the work continues in the server process,
 * writing progress to ai_check_runs for the page to poll.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { failInterruptedCheckRuns } from '../src/routes/nativeReanalyze.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-checkrun-'));
  return path.join(dir, 'inkheron.db');
}

const TEXT = 'She felt empathy of the problem and the speech was memorable.';

async function seedClass(db, { students = ['cathy', 'dan'] } = {}) {
  const app = await buildApp({ db, logger: false });
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const headers = { 'X-CSRF-Token': login.json().user.csrf_token, cookie: login.headers['set-cookie'] };

  const classId = (await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers })).json().class.id;
  const assignmentId = (await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Essay', settings: {} }, headers })).json().assignment.id;

  const padIds = [];
  for (const username of students) {
    const studentId = (await app.inject({ method: 'POST', url: '/api/students',
      payload: { username, display_name: username, password: 'pass12345', class_id: classId },
      headers })).json().student.id;
    padIds.push(db.prepare(`
      INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
      VALUES (?, ?, 'submitted', '{}', ?, 11, 1)
    `).run(studentId, assignmentId, TEXT).lastInsertRowid);
  }
  return { app, headers, assignmentId, padIds };
}

function setKey(db) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('openrouter_api_key', 'sk-or-test') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
}

async function waitForRun(app, headers, assignmentId) {
  for (let i = 0; i < 100; i++) {
    const res = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/check`, headers });
    const run = res.json().run;
    if (run && run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the run never finished');
}

test('starting a check returns immediately and the work finishes in the background', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, assignmentId, padIds } = await seedClass(db);
  setKey(db);

  const started = await app.inject({ method: 'POST', url: `/api/native/assignments/${assignmentId}/check`, headers });
  assert.equal(started.statusCode, 202, 'accepted, not waited on');
  const run = started.json().run;
  assert.equal(run.status, 'running');
  assert.equal(run.total, padIds.length, 'the total is known up front so progress can be shown');
  assert.equal(run.completed, 0);

  const finished = await waitForRun(app, headers, assignmentId);
  assert.equal(finished.status, 'done');
  assert.equal(finished.completed, padIds.length, 'every pad was walked');
  assert.equal(finished.per_pad.length, padIds.length);
  assert.ok(finished.per_pad.every((p) => p.student_name), 'each row names the student, for the summary');
  assert.ok(finished.finished_at);

  await app.close();
});

test('progress survives the teacher closing the page, because it lives in the database', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, assignmentId } = await seedClass(db);
  setKey(db);

  await app.inject({ method: 'POST', url: `/api/native/assignments/${assignmentId}/check`, headers });
  await waitForRun(app, headers, assignmentId);

  // A fresh session, as though the teacher came back later on another device.
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const later = { 'X-CSRF-Token': login.json().user.csrf_token, cookie: login.headers['set-cookie'] };
  const res = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/check`, headers: later });
  assert.equal(res.json().run.status, 'done');

  await app.close();
});

test('a second check cannot be started while one is running', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, assignmentId } = await seedClass(db);
  setKey(db);

  await app.inject({ method: 'POST', url: `/api/native/assignments/${assignmentId}/check`, headers });
  const second = await app.inject({ method: 'POST', url: `/api/native/assignments/${assignmentId}/check`, headers });
  // Either the first run had already finished, or the second is refused. What
  // must never happen is two runs marking the same class at once.
  if (second.statusCode !== 202) {
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error, 'already_running');
  }
  await waitForRun(app, headers, assignmentId);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM ai_check_runs WHERE assignment_id = ? AND status = 'running'").get(assignmentId).n,
    0
  );

  await app.close();
});

test('a check with no key and a check with nothing submitted are both refused', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, assignmentId, padIds } = await seedClass(db);

  const noKey = await app.inject({ method: 'POST', url: `/api/native/assignments/${assignmentId}/check`, headers });
  assert.equal(noKey.statusCode, 400);
  assert.equal(noKey.json().error, 'no_key');

  setKey(db);
  db.prepare(`UPDATE native_pads SET state = 'writing' WHERE id IN (${padIds.join(',')})`).run();
  const nothing = await app.inject({ method: 'POST', url: `/api/native/assignments/${assignmentId}/check`, headers });
  assert.equal(nothing.statusCode, 400);
  assert.equal(nothing.json().error, 'nothing_to_check');

  await app.close();
});

test('a run killed by a restart is reported as interrupted, not as still running', async () => {
  const db = openDatabase(tmpDb());
  const { app, headers, assignmentId } = await seedClass(db);

  db.prepare("INSERT INTO ai_check_runs (assignment_id, total, completed, status) VALUES (?, 30, 12, 'running')").run(assignmentId);
  const swept = failInterruptedCheckRuns(db);
  assert.equal(swept.interrupted, 1);

  const res = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/check`, headers });
  const run = res.json().run;
  assert.equal(run.status, 'interrupted');
  assert.equal(run.completed, 12, 'how far it got is still visible');
  assert.match(run.error, /restarted/);

  await app.close();
});
