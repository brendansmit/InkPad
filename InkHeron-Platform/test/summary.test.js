import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-summary-'));
  return path.join(dir, 'inkheron.db');
}

const TOKEN = 'a-long-random-summary-token-for-tests';

async function teacherHeaders(app) {
  await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  return { 'X-CSRF-Token': login.json().user.csrf_token, cookie: login.headers['set-cookie'] };
}

/** A class, some students and one essay assignment, with pads in known states. */
async function seed(app, db) {
  const h = await teacherHeaders(app);
  const classId = (await app.inject({ method: 'POST', url: '/api/classes', payload: { name: 'G12 EAP' }, headers: h })).json().class.id;

  const students = {};
  for (const name of ['ana', 'ben', 'cai', 'dee', 'demo', 'ghost']) {
    const made = await app.inject({ method: 'POST', url: '/api/students',
      payload: { username: name, display_name: name, password: 'pass12345', class_id: classId }, headers: h });
    students[name] = made.json().student.id;
  }
  db.prepare('UPDATE students SET is_demo = 1 WHERE id = ?').run(students.demo);
  db.prepare('UPDATE students SET is_ghost = 1 WHERE id = ?').run(students.ghost);

  const assignmentId = (await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Cause and effect essay' }, headers: h })).json().assignment.id;
  db.prepare('UPDATE assignments SET due_at = ? WHERE id = ?').run('2026-09-04', assignmentId);

  /* Everybody opens a pad, including the two accounts that must never be counted. */
  const pads = {};
  for (const name of Object.keys(students)) {
    const sLogin = await app.inject({ method: 'POST', url: '/api/login', payload: { username: name, password: 'pass12345' } });
    const pad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
      headers: { cookie: sLogin.headers['set-cookie'] } });
    pads[name] = pad.json().pad.id;
  }
  const setState = (name, state) => db.prepare('UPDATE native_pads SET state = ? WHERE id = ?').run(state, pads[name]);
  setState('ana', 'submitted');
  setState('ben', 'submitted');
  setState('cai', 'marked');
  setState('dee', 'writing');
  setState('demo', 'submitted');
  setState('ghost', 'marked');

  return { h, classId, assignmentId, students, pads };
}

test('the summary refuses to answer with no token configured', async () => {
  delete process.env.INKHERON_SUMMARY_TOKEN;
  const app = await buildApp({ db: openDatabase(tmpDb()), logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/summary/assignments',
    headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, 'summary_not_configured');
  await app.close();
});

test('a wrong or missing token gets the same answer, and it is no', async () => {
  process.env.INKHERON_SUMMARY_TOKEN = TOKEN;
  const app = await buildApp({ db: openDatabase(tmpDb()), logger: false });

  const none = await app.inject({ method: 'GET', url: '/api/summary/assignments' });
  assert.equal(none.statusCode, 401);

  const wrong = await app.inject({ method: 'GET', url: '/api/summary/assignments',
    headers: { authorization: 'Bearer not-the-token' } });
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.json(), none.json(), 'wrong and missing are indistinguishable');

  /* A teacher session is not a summary token. This route has one door. */
  const h = await teacherHeaders(app);
  const session = await app.inject({ method: 'GET', url: '/api/summary/assignments', headers: h });
  assert.equal(session.statusCode, 401);

  const shorter = await app.inject({ method: 'GET', url: '/api/summary/assignments',
    headers: { authorization: 'Bearer a' } });
  assert.equal(shorter.statusCode, 401, 'a short guess does not crash the length comparison');

  await app.close();
});

test('counts are per assignment, and demo and ghost accounts are not in them', async () => {
  process.env.INKHERON_SUMMARY_TOKEN = TOKEN;
  const db = openDatabase(tmpDb());
  const app = await buildApp({ db, logger: false });
  const { assignmentId } = await seed(app, db);

  const res = await app.inject({ method: 'GET', url: '/api/summary/assignments',
    headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');

  const body = res.json();
  assert.equal(body.count, 1);
  const a = body.assignments[0];
  assert.equal(a.id, assignmentId);
  assert.equal(a.title, 'Cause and effect essay');
  assert.equal(a.type, 'essay');
  assert.equal(a.due_at, '2026-09-04');
  assert.equal(a.class_name, 'G12 EAP');
  assert.equal(a.is_archived, false);

  assert.equal(a.students, 4, 'six accounts, four real students');
  assert.deepEqual(a.by_state, { writing: 1, submitted: 2, marked: 1, green_pen_open: 0, resubmitted: 0 });
  assert.equal(a.not_started, 0);
  assert.equal(a.handed_in, 3);
  assert.equal(a.marked, 1);
  assert.equal(a.to_mark, 2);

  /* Rule 6: this leaves the droplet, so it carries no student and no writing. */
  const text = JSON.stringify(body).toLowerCase();
  for (const leak of ['ana', 'ben', 'cai', 'dee', 'plain_text', 'display_name']) {
    assert.ok(!text.includes(leak), `payload leaks ${leak}`);
  }

  await app.close();
});

test('a student who has not opened the work counts as not started', async () => {
  process.env.INKHERON_SUMMARY_TOKEN = TOKEN;
  const db = openDatabase(tmpDb());
  const app = await buildApp({ db, logger: false });
  const { pads, students } = await seed(app, db);
  db.prepare('DELETE FROM native_pads WHERE id = ?').run(pads.dee);

  const a = (await app.inject({ method: 'GET', url: '/api/summary/assignments',
    headers: { authorization: `Bearer ${TOKEN}` } })).json().assignments[0];
  assert.equal(a.students, 4);
  assert.equal(a.not_started, 1);
  assert.equal(a.by_state.writing, 0);
  assert.equal(a.handed_in, 3);
  assert.ok(students.dee);

  await app.close();
});

test('a named roster replaces the class, and green pen work is not waiting on anybody', async () => {
  process.env.INKHERON_SUMMARY_TOKEN = TOKEN;
  const db = openDatabase(tmpDb());
  const app = await buildApp({ db, logger: false });
  const { assignmentId, students, pads } = await seed(app, db);

  /* Only two students are on it now, one of them a demo account that still must not count. */
  const add = db.prepare('INSERT INTO assignment_students (assignment_id, student_id) VALUES (?, ?)');
  add.run(assignmentId, students.ana);
  add.run(assignmentId, students.cai);
  add.run(assignmentId, students.demo);
  db.prepare("UPDATE native_pads SET state = 'green_pen_open' WHERE id = ?").run(pads.cai);

  const a = (await app.inject({ method: 'GET', url: '/api/summary/assignments',
    headers: { authorization: `Bearer ${TOKEN}` } })).json().assignments[0];
  assert.equal(a.students, 2, 'the override table is the roster');
  assert.deepEqual(a.by_state, { writing: 0, submitted: 1, marked: 0, green_pen_open: 1, resubmitted: 0 });
  assert.equal(a.handed_in, 2);
  assert.equal(a.marked, 1, 'a rewrite that is open was marked');
  assert.equal(a.to_mark, 1, 'and is not waiting on the teacher again until it comes back');

  await app.close();
});

test('archived work is out unless it is asked for, and class_id and limit filter', async () => {
  process.env.INKHERON_SUMMARY_TOKEN = TOKEN;
  const db = openDatabase(tmpDb());
  const app = await buildApp({ db, logger: false });
  const { h, classId, assignmentId } = await seed(app, db);

  const other = (await app.inject({ method: 'POST', url: '/api/classes', payload: { name: 'G11 EAP' }, headers: h })).json().class.id;
  await app.inject({ method: 'POST', url: '/api/assignments', payload: { class_id: other, title: 'Other class work' }, headers: h });
  db.prepare('UPDATE assignments SET is_archived = 1 WHERE id = ?').run(assignmentId);

  const auth = { authorization: `Bearer ${TOKEN}` };
  const live = (await app.inject({ method: 'GET', url: '/api/summary/assignments', headers: auth })).json();
  assert.equal(live.count, 1);
  assert.equal(live.assignments[0].title, 'Other class work');

  const all = (await app.inject({ method: 'GET', url: '/api/summary/assignments?include_archived=1', headers: auth })).json();
  assert.equal(all.count, 2);
  assert.ok(all.assignments.some(x => x.is_archived === true));

  const mine = (await app.inject({ method: 'GET', url: `/api/summary/assignments?class_id=${classId}&include_archived=1`, headers: auth })).json();
  assert.equal(mine.count, 1);
  assert.equal(mine.assignments[0].class_id, classId);

  const capped = (await app.inject({ method: 'GET', url: '/api/summary/assignments?include_archived=1&limit=1', headers: auth })).json();
  assert.equal(capped.count, 1);

  const junk = (await app.inject({ method: 'GET', url: '/api/summary/assignments?limit=nonsense&class_id=nonsense', headers: auth })).json();
  assert.equal(junk.count, 1, 'a query it cannot read falls back to the defaults');

  await app.close();
});

test('an empty platform answers with an empty list rather than an error', async () => {
  process.env.INKHERON_SUMMARY_TOKEN = TOKEN;
  const app = await buildApp({ db: openDatabase(tmpDb()), logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/summary/assignments',
    headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().assignments, []);
  assert.equal(res.json().count, 0);
  assert.ok(res.json().generated_at);
  await app.close();
});
