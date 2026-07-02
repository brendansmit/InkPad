import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-asgn-'));
  return path.join(dir, 'inkheron.db');
}

test('teacher assignment forms are native-only and expose outside paste policy', () => {
  const newAssignment = fs.readFileSync(path.join(process.cwd(), 'public/teacher/new-assignment.html'), 'utf8');
  const assignments = fs.readFileSync(path.join(process.cwd(), 'public/teacher/assignments.html'), 'utf8');
  assert.doesNotMatch(newAssignment, /Use Native InkPad|Etherpad fallback|id="fNativeInkpad"/);
  assert.doesNotMatch(assignments, /Use Native InkPad|keep this assignment on Etherpad|id="eNativeInkpad"/);
  assert.match(newAssignment, /id="fPasteMode"/);
  assert.match(assignments, /id="ePasteMode"/);
  // Two strengths/targets tables and two rubric slots
  assert.match(newAssignment, /id="fFeedbackTable1"/);
  assert.match(newAssignment, /id="fFeedbackTable2"/);
  assert.match(assignments, /id="eFeedbackTable1"/);
  assert.match(assignments, /id="eFeedbackTable2"/);
  assert.match(newAssignment, /id="fRubricTemplate1"/);
  assert.match(newAssignment, /id="fRubricTemplate2"/);
  assert.match(assignments, /id="eRubricTemplate1"/);
  assert.match(assignments, /id="eRubricTemplate2"/);
  assert.match(newAssignment, /fetch\('\/api\/feedback-assets'\)/);
  assert.match(assignments, /fetch\('\/api\/feedback-assets'\)/);
  // No "create default rubric" option any more
  assert.doesNotMatch(newAssignment, /id="fCreateRubric"/);
  assert.doesNotMatch(assignments, /id="eCreateRubric"/);
  assert.doesNotMatch(newAssignment, /Create default rubric/);
  // Second rubric slot uses the secondary-rubric endpoint
  assert.match(newAssignment, /secondary-rubric/);
  assert.match(assignments, /secondary-rubric/);
  // AP exam estimate is auto-applied for AP Lang classes
  assert.match(newAssignment, /exam-rubric/);
  assert.match(assignments, /exam-rubric/);
  assert.match(newAssignment, /isApLangName/);
  assert.match(assignments, /isApLangName/);
  assert.match(newAssignment, /api\/native\/assignments\/\$\{item\.id\}\/\$\{slotUrl\}/);
  assert.match(assignments, /api\/native\/assignments\/\$\{ga\.id\}\/\$\{slotUrl\}/);
  assert.match(newAssignment, /Controls paste from outside the InkPad screen/);
  assert.match(assignments, /Controls paste from outside the InkPad screen/);
});

async function setupTeacher(app) {
  const setup = await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

async function setupStudent(app, { cookies: tCookies, csrf: tCsrf }, classId, student = {}) {
  const username = student.username ?? 'alice';
  const displayName = student.display_name ?? 'Alice';
  const password = student.password ?? 'pass12345';
  const res = await app.inject({ method: 'POST', url: '/api/students',
    payload: { username, display_name: displayName, password, class_id: classId },
    headers: { 'X-CSRF-Token': tCsrf, cookie: tCookies } });
  assert.equal(res.statusCode, 201);
  const login = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username, password } });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token, student: res.json().student };
}

test('teacher can create an assignment with settings_json', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);

  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'Grade 9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const res = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: {
      class_id: classId, title: 'First essay', type: 'essay',
      settings: { submit_behaviour: 'draft', spellcheck: true, green_pen: true, feedback_table: 'default' },
      opens_at: '2026-01-01T00:00:00Z', due_at: '2026-12-31T23:59:59Z',
    },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  assert.equal(res.statusCode, 201);
  const { assignment } = res.json();
  assert.equal(assignment.title, 'First essay');
  assert.equal(assignment.class_id, classId);
  const settings = JSON.parse(assignment.settings_json);
  assert.equal(settings.submit_behaviour, 'draft');
  assert.equal(settings.word_count, true);
  assert.equal(settings.paste_detection, true);
  assert.equal(settings.paste_mode, 'log');
  assert.deepEqual(settings.feedback_tables, ['default']);
  assert.equal(settings.green_pen, true);

  await app.close();
});

test('essay_type and supervision default when absent and are validated when given', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const noSettings = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'No settings given' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const defaults = JSON.parse(noSettings.json().assignment.settings_json);
  assert.equal(defaults.essay_type, 'other');
  assert.equal(defaults.supervision, 'in_class');

  const valid = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Argumentative essay',
      settings: { essay_type: 'argumentative', supervision: 'mixed' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const chosen = JSON.parse(valid.json().assignment.settings_json);
  assert.equal(chosen.essay_type, 'argumentative');
  assert.equal(chosen.supervision, 'mixed');

  const invalid = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Bad values',
      settings: { essay_type: 'not_a_real_type', supervision: 'unsupervised' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const fallback = JSON.parse(invalid.json().assignment.settings_json);
  assert.equal(fallback.essay_type, 'other');
  assert.equal(fallback.supervision, 'in_class');

  await app.close();
});

test('word_count and paste_detection are always true regardless of input', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const res = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Test', settings: { word_count: false, paste_detection: false } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(res.statusCode, 201);
  const settings = JSON.parse(res.json().assignment.settings_json);
  assert.equal(settings.word_count, true);
  assert.equal(settings.paste_detection, true);
  assert.equal(settings.paste_mode, 'log');

  await app.close();
});

test('teacher can list, update and delete assignments', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Draft essay' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const id = created.json().assignment.id;

  const list = await app.inject({ method: 'GET', url: `/api/assignments?class_id=${classId}`,
    headers: { cookie: teacher.cookies } });
  assert.equal(list.json().assignments.length, 1);

  const updated = await app.inject({ method: 'PATCH', url: `/api/assignments/${id}`,
    payload: { title: 'Updated essay' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(updated.json().assignment.title, 'Updated essay');

  const deleted = await app.inject({ method: 'DELETE', url: `/api/assignments/${id}`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(deleted.statusCode, 204);

  await app.close();
});

test('student cannot create or list teacher assignments', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const student = await setupStudent(app, teacher, classId);

  const tryCreate = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Hack' },
    headers: { 'X-CSRF-Token': student.csrf, cookie: student.cookies } });
  assert.equal(tryCreate.statusCode, 403);

  await app.close();
});

test('student sees own assignments with correct statuses', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  // upcoming assignment (future opens_at)
  await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Coming soon',
      opens_at: '2099-01-01T00:00:00Z', due_at: '2099-12-31T23:59:59Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  // open assignment (past opens_at, future due_at)
  await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Open now',
      opens_at: '2020-01-01T00:00:00Z', due_at: '2099-12-31T23:59:59Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  // closed assignment (past due_at)
  await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Closed',
      opens_at: '2020-01-01T00:00:00Z', due_at: '2020-06-01T00:00:00Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  const archived = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Archived',
      opens_at: '2020-01-01T00:00:00Z', due_at: '2099-12-31T23:59:59Z' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  await app.inject({ method: 'POST', url: `/api/assignments/${archived.json().assignment.id}/archive`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  const student = await setupStudent(app, teacher, classId);
  const res = await app.inject({ method: 'GET', url: '/api/student/assignments',
    headers: { cookie: student.cookies } });
  assert.equal(res.statusCode, 200);

  const { assignments } = res.json();
  assert.equal(assignments.length, 3);
  const byTitle = Object.fromEntries(assignments.map(a => [a.title, a]));
  assert.equal(byTitle['Coming soon'].status, 'upcoming');
  assert.equal(byTitle['Open now'].status, 'not_started');
  assert.equal(byTitle['Closed'].status, 'closed');
  assert.equal(byTitle.Archived, undefined);

  await app.close();
});

test('student assignment API links native assignments to native writer', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;
  const student = await setupStudent(app, teacher, classId);

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Native essay', settings: { native_inkpad: true } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(created.statusCode, 201);
  const assignmentId = created.json().assignment.id;

  const res = await app.inject({ method: 'GET', url: '/api/student/assignments',
    headers: { cookie: student.cookies } });
  assert.equal(res.statusCode, 200);
  const assignment = res.json().assignments.find(item => item.id === assignmentId);
  assert.equal(assignment.native_inkpad, true);
  assert.equal(assignment.write_url, `/native/write/${assignmentId}`);
  assert.equal(assignment.pad_id, null);

  await app.close();
});

test('all assignments are native InkPad, even when native_inkpad:false is requested', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Default native', settings: { prompt: 'Write clearly.' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(created.statusCode, 201);
  assert.equal(JSON.parse(created.json().assignment.settings_json).native_inkpad, true);

  // A request to opt out of native is ignored; there is no Etherpad path any more.
  const optOut = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Tried to opt out', settings: { native_inkpad: false } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(optOut.statusCode, 201);
  const optOutId = optOut.json().assignment.id;
  assert.equal(JSON.parse(optOut.json().assignment.settings_json).native_inkpad, true);

  const patched = await app.inject({ method: 'PATCH', url: `/api/assignments/${optOutId}`,
    payload: { settings: { prompt: 'Updated prompt.' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(patched.statusCode, 200);
  const settings = JSON.parse(patched.json().assignment.settings_json);
  assert.equal(settings.native_inkpad, true);
  assert.equal(settings.prompt, 'Updated prompt.');

  await app.close();
});

test('editing assignment settings preserves hidden native InkPad flag', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Native edit', settings: { native_inkpad: true, prompt: 'Old prompt' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = created.json().assignment.id;

  const patched = await app.inject({ method: 'PATCH', url: `/api/assignments/${assignmentId}`,
    payload: { settings: { prompt: 'New prompt', spellcheck: false } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(patched.statusCode, 200);
  const settings = JSON.parse(patched.json().assignment.settings_json);
  assert.equal(settings.native_inkpad, true);
  assert.equal(settings.prompt, 'New prompt');
  assert.equal(settings.spellcheck, false);

  await app.close();
});

test('teacher dashboard links native pads to native review with paste evidence', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;
  const alice = await setupStudent(app, teacher, classId, { username: 'alice', display_name: 'Alice' });

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Native dashboard', settings: { native_inkpad: true } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = created.json().assignment.id;

  const opened = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: alice.cookies } });
  assert.equal(opened.statusCode, 200);
  const nativePadId = opened.json().pad.id;

  const paste = await app.inject({ method: 'POST', url: `/api/native/pads/${nativePadId}/paste-event`,
    payload: { length: 33, input_type: 'paste' },
    headers: { 'X-CSRF-Token': alice.csrf, cookie: alice.cookies } });
  assert.equal(paste.statusCode, 201);

  const dashboard = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/dashboard`,
    headers: { cookie: teacher.cookies } });
  assert.equal(dashboard.statusCode, 200);
  const row = dashboard.json().students.find(student => student.username === 'alice');
  assert.equal(row.pad_id, nativePadId);
  assert.equal(row.review_url, `/teacher/native-review?pad_id=${nativePadId}`);
  assert.equal(row.status, 'writing');
  assert.equal(row.paste_flag, true);
  assert.equal(row.paste_count, 1);
  assert.equal(row.paste_total_length, 33);

  const csv = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/export.csv`,
    headers: { cookie: teacher.cookies } });
  assert.equal(csv.statusCode, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /assignment-/);
  assert.match(csv.body, /"Student name","Username","Status","Submitted at","Grade","Grade state","Paste flag","Paste count"/);
  assert.match(csv.body, /"Alice","alice","writing"/);
  assert.match(csv.body, /"yes","1"/);

  await app.close();
});

test('teacher assignment dashboard filters by status and paste flag', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const alice = await setupStudent(app, teacher, classId, { username: 'alice', display_name: 'Alice' });
  const bob = await setupStudent(app, teacher, classId, { username: 'bob', display_name: 'Bob' });

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Filter essay', settings: { native_inkpad: true } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = created.json().assignment.id;

  const alicePad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: alice.cookies } });
  const paste = await app.inject({ method: 'POST', url: `/api/native/pads/${alicePad.json().pad.id}/paste-event`,
    payload: { length: 20, input_type: 'paste' },
    headers: { 'X-CSRF-Token': alice.csrf, cookie: alice.cookies } });
  assert.equal(paste.statusCode, 201);
  const bobPad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: bob.cookies } });

  const db = new DatabaseSync(dbPath);
  try {
    db.prepare("UPDATE native_pads SET state = 'marked' WHERE id = ?").run(bobPad.json().pad.id);
  } finally {
    db.close();
  }

  const flagged = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/dashboard?paste=flagged`,
    headers: { cookie: teacher.cookies } });
  assert.deepEqual(flagged.json().students.map(student => student.username), ['alice']);

  const marked = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/dashboard?status=marked`,
    headers: { cookie: teacher.cookies } });
  assert.deepEqual(marked.json().students.map(student => student.username), ['bob']);

  await app.close();
});
