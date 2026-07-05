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

test('feedback_release defaults to immediate and is validated when given', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;

  const noSettings = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'No settings given' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const defaults = JSON.parse(noSettings.json().assignment.settings_json);
  assert.equal(defaults.feedback_release, 'immediate');
  assert.equal(noSettings.json().assignment.feedback_released_at, null);

  const batch = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Batch essay', settings: { feedback_release: 'batch' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const chosen = JSON.parse(batch.json().assignment.settings_json);
  assert.equal(chosen.feedback_release, 'batch');

  const invalid = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Bad value', settings: { feedback_release: 'whenever' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const fallback = JSON.parse(invalid.json().assignment.settings_json);
  assert.equal(fallback.feedback_release, 'immediate');

  await app.close();
});

test('release-feedback stamps feedback_released_at once and is idempotent', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Batch essay', settings: { feedback_release: 'batch' } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = created.json().assignment.id;
  assert.equal(created.json().assignment.feedback_released_at, null);

  const released = await app.inject({ method: 'POST', url: `/api/assignments/${assignmentId}/release-feedback`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(released.statusCode, 200);
  assert.equal(released.json().released, true);

  const after = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}`,
    headers: { cookie: teacher.cookies } });
  const firstStamp = after.json().assignment.feedback_released_at;
  assert.ok(firstStamp);

  const releasedAgain = await app.inject({ method: 'POST', url: `/api/assignments/${assignmentId}/release-feedback`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  assert.equal(releasedAgain.statusCode, 200);

  const afterAgain = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}`,
    headers: { cookie: teacher.cookies } });
  assert.equal(afterAgain.json().assignment.feedback_released_at, firstStamp);

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
  assert.match(csv.body, /"Student name","Username","Status","Submitted at","Score","Score max","Exam score","Exam score max","Grade state","Paste flag","Paste count"/);
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

test('dashboard shows rubric totals once scored and finish-marking releases them', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;
  const alice = await setupStudent(app, teacher, classId, { username: 'alice', display_name: 'Alice' });
  const bob = await setupStudent(app, teacher, classId, { username: 'bob', display_name: 'Bob' });

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Scored essay', settings: { native_inkpad: true } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = created.json().assignment.id;

  const rubric = await app.inject({ method: 'PUT', url: `/api/native/assignments/${assignmentId}/rubric`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    payload: { criteria: [
      { label: 'Ideas', bands: [{ score_value: 0 }, { score_value: 1 }, { score_value: 2 }, { score_value: 3 }] },
      { label: 'Organisation', bands: [{ score_value: 0 }, { score_value: 1 }, { score_value: 2 }] },
    ] } });
  assert.equal(rubric.statusCode, 200);
  const criteria = rubric.json().rubric.criteria;

  const alicePad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: alice.cookies } });
  const alicePadId = alicePad.json().pad.id;
  await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`, headers: { cookie: bob.cookies } });

  const scored = await app.inject({ method: 'PUT', url: `/api/native/pads/${alicePadId}/rubric-scores`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    payload: { scores: [
      { criterion_id: criteria[0].id, selected_score: 2 },
      { criterion_id: criteria[1].id, selected_score: 1 },
    ] } });
  assert.equal(scored.statusCode, 200);

  const beforeMarking = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/dashboard`,
    headers: { cookie: teacher.cookies } });
  const aliceBefore = beforeMarking.json().students.find(s => s.username === 'alice');
  assert.equal(aliceBefore.score, 3);
  assert.equal(aliceBefore.score_max, 5);
  assert.equal(aliceBefore.grade_state, 'held');
  assert.equal(aliceBefore.grade_released, false);
  const bobBefore = beforeMarking.json().students.find(s => s.username === 'bob');
  assert.equal(bobBefore.score, null);
  assert.equal(bobBefore.score_max, 5);

  await app.inject({ method: 'POST', url: `/api/native/pads/${alicePadId}/finish-marking`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  const afterMarking = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/dashboard`,
    headers: { cookie: teacher.cookies } });
  const aliceAfter = afterMarking.json().students.find(s => s.username === 'alice');
  assert.equal(aliceAfter.status, 'marked');
  assert.equal(aliceAfter.score, 3);
  assert.equal(aliceAfter.grade_state, 'released');
  assert.equal(aliceAfter.grade_released, true);

  const csv = await app.inject({ method: 'GET', url: `/api/assignments/${assignmentId}/export.csv`,
    headers: { cookie: teacher.cookies } });
  assert.match(csv.body, /"Alice","alice","marked",[^\n]*"3","5"/);

  await app.close();
});

test('AP Lang exam score shows on the dashboard only for AP Lang classes', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const apCls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'AP Lang Period 3' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const apClassId = apCls.json().class.id;
  const regularCls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const regularClassId = regularCls.json().class.id;

  const alice = await setupStudent(app, teacher, apClassId, { username: 'alice', display_name: 'Alice' });
  const bob = await setupStudent(app, teacher, regularClassId, { username: 'bob', display_name: 'Bob' });

  const apAssignment = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: apClassId, title: 'Timed write', settings: { native_inkpad: true } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const apAssignmentId = apAssignment.json().assignment.id;
  const regularAssignment = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: regularClassId, title: 'Regular essay', settings: { native_inkpad: true } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const regularAssignmentId = regularAssignment.json().assignment.id;

  const examRubric = await app.inject({ method: 'PUT', url: `/api/native/assignments/${apAssignmentId}/exam-rubric`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies }, payload: {} });
  assert.equal(examRubric.statusCode, 200);
  const examCriterionId = examRubric.json().rubric.criteria[0].id;

  const alicePad = await app.inject({ method: 'GET', url: `/api/native/assignments/${apAssignmentId}/pad`,
    headers: { cookie: alice.cookies } });
  const alicePadId = alicePad.json().pad.id;
  await app.inject({ method: 'PUT', url: `/api/native/pads/${alicePadId}/exam-rubric-scores`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    payload: { scores: [{ criterion_id: examCriterionId, selected_score: 4 }] } });

  await app.inject({ method: 'GET', url: `/api/native/assignments/${regularAssignmentId}/pad`,
    headers: { cookie: bob.cookies } });

  const apDashboard = await app.inject({ method: 'GET', url: `/api/assignments/${apAssignmentId}/dashboard`,
    headers: { cookie: teacher.cookies } });
  assert.equal(apDashboard.json().class.is_ap_lang, true);
  const aliceRow = apDashboard.json().students.find(s => s.username === 'alice');
  assert.equal(aliceRow.is_ap_lang, true);
  assert.equal(aliceRow.exam_score, 4);
  assert.ok(aliceRow.exam_score_max > 0);

  const regularDashboard = await app.inject({ method: 'GET', url: `/api/assignments/${regularAssignmentId}/dashboard`,
    headers: { cookie: teacher.cookies } });
  assert.equal(regularDashboard.json().class.is_ap_lang, false);
  const bobRow = regularDashboard.json().students.find(s => s.username === 'bob');
  assert.equal(bobRow.is_ap_lang, false);
  assert.equal(bobRow.exam_score, null);
  assert.equal(bobRow.exam_score_max, 0);

  await app.close();
});

test('export-to-admin sends only names and numbers, and excludes ghost/demo students', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;
  const alice = await setupStudent(app, teacher, classId, { username: 'alice', display_name: 'Alice' });
  const bob = await setupStudent(app, teacher, classId, { username: 'bob', display_name: 'Bob' });
  const ghost = await setupStudent(app, teacher, classId, { username: 'ghosty', display_name: 'Ghosty' });

  const raw = new DatabaseSync(dbPath);
  raw.prepare('UPDATE students SET is_ghost = 1 WHERE id = ?').run(ghost.student.id);
  raw.close();

  await app.inject({ method: 'PATCH', url: '/api/settings',
    payload: { admin_export_key: 'test-key-12345', admin_export_url: 'https://admin.example.test' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Scored essay', settings: { native_inkpad: true } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = created.json().assignment.id;

  const rubric = await app.inject({ method: 'PUT', url: `/api/native/assignments/${assignmentId}/rubric`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    payload: { criteria: [{ label: 'Ideas', bands: [{ score_value: 0 }, { score_value: 1 }, { score_value: 2 }] }] } });
  const criterionId = rubric.json().rubric.criteria[0].id;

  const alicePad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`, headers: { cookie: alice.cookies } });
  const ghostPad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`, headers: { cookie: ghost.cookies } });
  await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`, headers: { cookie: bob.cookies } });

  await app.inject({ method: 'PUT', url: `/api/native/pads/${alicePad.json().pad.id}/rubric-scores`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    payload: { scores: [{ criterion_id: criterionId, selected_score: 2 }] } });
  await app.inject({ method: 'PUT', url: `/api/native/pads/${ghostPad.json().pad.id}/rubric-scores`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    payload: { scores: [{ criterion_id: criterionId, selected_score: 1 }] } });

  let pushedBody = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).includes('/api/sync') && (!opts.method || opts.method === 'GET')) {
      return { ok: true, status: 200, json: async () => ({ assignments: [], students: [], scores: [] }) };
    }
    if (String(url).includes('/api/sync') && opts.method === 'POST') {
      pushedBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  try {
    const res = await app.inject({ method: 'POST', url: `/api/assignments/${assignmentId}/export-to-admin`,
      headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().exported, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(pushedBody);
  assert.equal(pushedBody.scores.length, 1);
  assert.equal(pushedBody.students.length, 1);
  assert.equal(pushedBody.students[0].english_name, 'Alice');
  assert.equal(pushedBody.assignments[0].name, 'Scored essay');
  assert.equal(pushedBody.assignments[0].class_filter, 'G9');
  const wholeBody = JSON.stringify(pushedBody);
  assert.doesNotMatch(wholeBody, /Ghosty/);
  assert.doesNotMatch(wholeBody, /\bBob\b/);
  assert.doesNotMatch(wholeBody, /ai|model|checker|suggestion/i);

  await app.close();
});

test('export-to-admin surfaces an upstream 401 as a friendly error, never throws', async () => {
  const dbPath = tmpDb();
  const app = await buildApp({ databasePath: dbPath, logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const classId = cls.json().class.id;
  const alice = await setupStudent(app, teacher, classId, { username: 'alice', display_name: 'Alice' });

  await app.inject({ method: 'PATCH', url: '/api/settings',
    payload: { admin_export_key: 'wrong-key', admin_export_url: 'https://admin.example.test' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });

  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: classId, title: 'Scored essay', settings: { native_inkpad: true } },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const assignmentId = created.json().assignment.id;

  const rubric = await app.inject({ method: 'PUT', url: `/api/native/assignments/${assignmentId}/rubric`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    payload: { criteria: [{ label: 'Ideas', bands: [{ score_value: 0 }, { score_value: 1 }] }] } });
  const criterionId = rubric.json().rubric.criteria[0].id;

  const alicePad = await app.inject({ method: 'GET', url: `/api/native/assignments/${assignmentId}/pad`, headers: { cookie: alice.cookies } });
  await app.inject({ method: 'PUT', url: `/api/native/pads/${alicePad.json().pad.id}/rubric-scores`,
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies },
    payload: { scores: [{ criterion_id: criterionId, selected_score: 1 }] } });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) });

  try {
    const res = await app.inject({ method: 'POST', url: `/api/assignments/${assignmentId}/export-to-admin`,
      headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /key/i);
  } finally {
    globalThis.fetch = originalFetch;
  }

  await app.close();
});

test('passage PDF upload accepts files over 1 MB (Fastify body limit regression)', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'PDF essay' },
    headers: { 'X-CSRF-Token': teacher.csrf, cookie: teacher.cookies } });
  const id = created.json().assignment.id;

  // ~2 MB payload: rejected with 413 before this fix (default 1 MB body limit).
  const twoMb = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2 * 1024 * 1024, 0x20)]);
  const upload = await app.inject({ method: 'PUT', url: `/api/assignments/${id}/passage-pdf`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf, 'Content-Type': 'application/pdf' },
    payload: twoMb });
  assert.equal(upload.statusCode, 200);

  const fetched = await app.inject({ method: 'GET', url: `/api/assignments/${id}/passage-pdf`,
    headers: { cookie: teacher.cookies } });
  assert.equal(fetched.statusCode, 200);
  assert.match(fetched.headers['content-type'], /application\/pdf/);

  // Oversized files are still rejected.
  const tooBig = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(12 * 1024 * 1024, 0x20)]);
  const rejected = await app.inject({ method: 'PUT', url: `/api/assignments/${id}/passage-pdf`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf, 'Content-Type': 'application/pdf' },
    payload: tooBig });
  assert.equal(rejected.statusCode, 413);

  await app.close();
});
