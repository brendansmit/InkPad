import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app.js';
import { renderNativeWriteView } from '../src/views/nativeWrite.js';
import { autoPromoteSuggestions } from '../src/routes/nativePads.js';

function temporaryDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-native-pads-'));
  return path.join(dir, 'inkheron.db');
}

async function createTeacherSession(app, { username = 'teacher', password = 'teacherpass123' } = {}) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username, display_name: 'Teacher', password },
  });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);

  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrfToken: login.json().user.csrf_token };
}

async function loginStudent(app, username, password) {
  const login = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrfToken: login.json().user.csrf_token };
}

function multipartPayload({ file }) {
  const boundary = `----inkheron-native-${Date.now()}`;
  const chunks = [
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`),
    Buffer.from(`Content-Type: ${file.contentType}\r\n\r\n`),
    Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body),
    Buffer.from('\r\n'),
    Buffer.from(`--${boundary}--\r\n`),
  ];
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function seedNativeAssignment(app, { enabled = true, greenPen = false, pasteMode = 'log', feedbackRelease } = {}) {
  const { cookies: teacherCookies, csrfToken: teacherCsrf } = await createTeacherSession(app);

  const classResponse = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'Grade 9' },
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  assert.equal(classResponse.statusCode, 201);
  const classId = classResponse.json().class.id;

  const studentResponse = await app.inject({
    method: 'POST',
    url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice Chen', password: 'correct horse', class_id: classId },
    headers: { 'X-CSRF-Token': teacherCsrf, cookie: teacherCookies },
  });
  assert.equal(studentResponse.statusCode, 201);

  const db = new DatabaseSync(app._databasePath);
  const settings = {
    type: 'essay',
    spellcheck: true,
    green_pen: greenPen,
    native_inkpad: enabled,
    paste_mode: pasteMode,
    prompt: 'Write one clear paragraph.',
  };
  if (feedbackRelease) settings.feedback_release = feedbackRelease;
  const result = db.prepare(`
    INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
    VALUES (?, 'Native essay', 'essay', ?, datetime('now', '-1 day'), datetime('now', '+7 days'))
  `).run(classId, JSON.stringify(settings));
  db.close();

  return {
    assignmentId: result.lastInsertRowid,
    teacherCookies,
    teacherCsrf,
  };
}

test('native pad routes stay hidden unless assignment opts in', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId } = await seedNativeAssignment(app, { enabled: false });
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const response = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'native_inkpad_not_enabled');
  await app.close();
});

test('student can create, autosave and submit a native pad', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().pad.state, 'writing');
  assert.equal(created.json().pad.word_count, 0);
  assert.equal(created.json().pad.version, 1);
  assert.equal(created.json().policy.paste_mode, 'log');
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Hello native pad' }] },
      plain_text: 'Hello native pad',
      expected_version: 1,
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().pad.word_count, 3);
  assert.equal(saved.json().pad.plain_text, 'Hello native pad');
  assert.equal(saved.json().pad.version, 2);

  const submitted = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/submit`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
  });
  assert.equal(submitted.statusCode, 201);
  assert.equal(submitted.json().pad.state, 'submitted');
  assert.equal(submitted.json().locked, true);

  const blockedSave = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: { document: { type: 'doc' }, plain_text: 'late edit' },
  });
  assert.equal(blockedSave.statusCode, 409);

  const revisions = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/revisions`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(revisions.statusCode, 200);
  assert.deepEqual(revisions.json().revisions.map(revision => revision.reason), ['create', 'autosave', 'submit']);

  await app.close();
});

test('native pads inherit assignment paste policy', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId } = await seedNativeAssignment(app, { pasteMode: 'block' });
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().policy.paste_mode, 'block');

  await app.close();
});

test('assignment settings update existing native pad paste policy', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app);
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;
  assert.equal(created.json().policy.paste_mode, 'log');

  const patched = await app.inject({
    method: 'PATCH',
    url: `/api/assignments/${assignmentId}`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { settings: { paste_mode: 'block', spellcheck: false, native_inkpad: true } },
  });
  assert.equal(patched.statusCode, 200);

  const policy = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/policy`,
    headers: { cookie: cookies },
  });
  assert.equal(policy.statusCode, 200);
  assert.equal(policy.json().policy.paste_mode, 'block');
  assert.equal(policy.json().policy.spellcheck_enabled, false);

  await app.close();
});

test('native autosave rejects stale document versions', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const firstSave = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'First save' }] },
      plain_text: 'First save',
      expected_version: 1,
    },
  });
  assert.equal(firstSave.statusCode, 200);
  assert.equal(firstSave.json().pad.version, 2);

  const staleSave = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Stale overwrite' }] },
      plain_text: 'Stale overwrite',
      expected_version: 1,
    },
  });
  assert.equal(staleSave.statusCode, 409);
  assert.equal(staleSave.json().error, 'version_conflict');
  assert.equal(staleSave.json().pad.plain_text, 'First save');
  assert.equal(staleSave.json().pad.version, 2);

  await app.close();
});

test('teacher can review native pad, add comments and change live paste policy', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Sentence one. Sentence two.' }] },
      plain_text: 'Sentence one. Sentence two.',
    },
  });
  assert.equal(saved.statusCode, 200);

  const policy = await app.inject({
    method: 'PUT',
    url: `/api/native/pads/${padId}/policy`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { paste_mode: 'block', spellcheck_enabled: false },
  });
  assert.equal(policy.statusCode, 200);
  assert.equal(policy.json().policy.paste_mode, 'block');
  assert.equal(policy.json().policy.spellcheck_enabled, false);

  const studentPolicy = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/policy`,
    headers: { cookie: cookies },
  });
  assert.equal(studentPolicy.statusCode, 200);
  assert.equal(studentPolicy.json().policy.paste_mode, 'block');

  const pasteEvent = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/paste-event`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: { length: 24, input_type: 'paste' },
  });
  assert.equal(pasteEvent.statusCode, 201);

  const general = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { type: 'general_comment', body: 'Good control overall.' },
  });
  assert.equal(general.statusCode, 201);
  assert.equal(general.json().annotation.type, 'general_comment');
  assert.equal(general.json().annotation.body, 'Good control overall.');

  const inline = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      type: 'inline_comment',
      start_offset: 0,
      end_offset: 12,
      selected_text: 'Sentence one',
      body: 'Make this opening more specific.',
      metadata: { tone: 'teacher' },
    },
  });
  assert.equal(inline.statusCode, 201);
  assert.equal(inline.json().annotation.type, 'inline_comment');
  assert.equal(inline.json().annotation.document_version, 2);

  const updatedInline = await app.inject({
    method: 'PATCH',
    url: `/api/native/annotations/${inline.json().annotation.id}`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { resolved: true },
  });
  assert.equal(updatedInline.statusCode, 200);
  assert.equal(updatedInline.json().annotation.resolved, true);

  const code = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      type: 'literacy_code',
      start_offset: 14,
      end_offset: 26,
      selected_text: 'Sentence two',
      body: 'Evidence needs explanation.',
      metadata: { code: 'EV', category: 'Evidence', label: 'Evidence' },
    },
  });
  assert.equal(code.statusCode, 201);
  assert.equal(code.json().annotation.type, 'literacy_code');
  assert.equal(code.json().annotation.metadata.code, 'EV');

  const profileAfterCode = await app.inject({
    method: 'GET',
    url: `/api/native/students/${created.json().pad.student_id}/profile`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(profileAfterCode.statusCode, 200);
  assert.equal(profileAfterCode.json().profile.literacy_issues[0].code, 'EV');
  assert.equal(profileAfterCode.json().profile.literacy_issues[0].open_count, 1);
  assert.equal(profileAfterCode.json().profile.recent_evidence[0].selected_text, 'Sentence two');
  assert.equal(profileAfterCode.json().profile.recent_evidence[0].essay_type, 'other');
  assert.equal(profileAfterCode.json().profile.recent_evidence[0].supervision, 'in_class');

  const resolvedCode = await app.inject({
    method: 'PATCH',
    url: `/api/native/annotations/${code.json().annotation.id}`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { resolved: true },
  });
  assert.equal(resolvedCode.statusCode, 200);

  const highlight = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      type: 'highlight',
      start_offset: 0,
      end_offset: 8,
      selected_text: 'Sentence',
      body: 'Strong start.',
    },
  });
  assert.equal(highlight.statusCode, 201);
  assert.equal(highlight.json().annotation.type, 'highlight');

  // Teachers can delete an annotation outright (sidebar comment list).
  const disposable = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      type: 'inline_comment',
      start_offset: 14,
      end_offset: 26,
      selected_text: 'Sentence two',
      body: 'Delete me.',
    },
  });
  assert.equal(disposable.statusCode, 201);
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/api/native/annotations/${disposable.json().annotation.id}`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
  });
  assert.equal(deleted.statusCode, 204);
  const deletedAgain = await app.inject({
    method: 'DELETE',
    url: `/api/native/annotations/${disposable.json().annotation.id}`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
  });
  assert.equal(deletedAgain.statusCode, 404);

  const review = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/review`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(review.statusCode, 200);
  assert.equal(review.json().pad.plain_text, 'Sentence one. Sentence two.');
  assert.equal(review.json().policy.paste_mode, 'block');
  assert.equal(review.json().paste_events.length, 1);
  assert.deepEqual(review.json().annotations.map(annotation => annotation.type), ['general_comment', 'inline_comment', 'literacy_code', 'highlight']);
  assert.ok(review.json().feedback_options.targets.some(target => target.id === 'develop_explanation'));
  assert.equal(review.json().student_profile.literacy_issues[0].resolved_count, 1);
  assert.equal(review.json().student_profile.literacy_issues[0].open_count, 0);
  assert.equal(review.json().assignment.essay_type, 'other');
  assert.equal(review.json().assignment.supervision, 'in_class');

  const compactReview = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/review?compact=1`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(compactReview.statusCode, 200);
  assert.equal(compactReview.json().pad.plain_text, 'Sentence one. Sentence two.');
  assert.equal(compactReview.json().annotations.length, 4);
  assert.equal(compactReview.json().revisions, undefined);
  assert.equal(compactReview.json().comparison, undefined);
  assert.equal(compactReview.json().student_profile, undefined);
  assert.equal(compactReview.json().feedback_options, undefined);

  await app.close();
});

test('teacher can configure and score a native rubric with half steps', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app);
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const rubric = await app.inject({
    method: 'PUT',
    url: `/api/native/assignments/${assignmentId}/rubric`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      criteria: [
        {
          label: 'Evidence',
          description: 'Use relevant examples.',
          weight: 1,
          bands: [
            { score_value: 0, label: '0', descriptor: 'Missing' },
            { score_value: 1, label: '1', descriptor: 'Limited' },
            { score_value: 2, label: '2', descriptor: 'Developing' },
            { score_value: 3, label: '3', descriptor: 'Secure' },
            { score_value: 4, label: '4', descriptor: 'Strong' },
          ],
        },
      ],
    },
  });
  assert.equal(rubric.statusCode, 200);
  assert.equal(rubric.json().rubric.criteria.length, 1);
  const criterionId = rubric.json().rubric.criteria[0].id;

  const scored = await app.inject({
    method: 'PUT',
    url: `/api/native/pads/${padId}/rubric-scores`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      scores: [{ criterion_id: criterionId, selected_score: 3.5, note: 'Strong evidence but explanation is thin.' }],
    },
  });
  assert.equal(scored.statusCode, 200);
  assert.equal(scored.json().scores[0].selected_score, 3.5);

  const invalid = await app.inject({
    method: 'PUT',
    url: `/api/native/pads/${padId}/rubric-scores`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      scores: [{ criterion_id: criterionId, selected_score: 3.25, note: 'Invalid score.' }],
    },
  });
  assert.equal(invalid.statusCode, 400);

  const review = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/review`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(review.statusCode, 200);
  assert.equal(review.json().rubric.criteria[0].label, 'Evidence');
  assert.equal(review.json().rubric.scores[0].selected_score, 3.5);
  assert.equal(review.json().rubric.scores[0].note, 'Strong evidence but explanation is thin.');

  await app.close();
});

test('teacher can add AP exam estimate rubric alongside internal rubric', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app, { greenPen: true });
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const internal = await app.inject({
    method: 'PUT',
    url: `/api/native/assignments/${assignmentId}/rubric`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { criteria: [{ label: 'Internal voice', bands: [{ score_value: 0 }, { score_value: 1 }, { score_value: 2 }] }] },
  });
  assert.equal(internal.statusCode, 200);

  const exam = await app.inject({
    method: 'PUT',
    url: `/api/native/assignments/${assignmentId}/exam-rubric`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {},
  });
  assert.equal(exam.statusCode, 200);
  assert.deepEqual(exam.json().rubric.criteria.map(row => row.label), ['Thesis', 'Evidence and Commentary', 'Sophistication']);

  const internalCriterionId = internal.json().rubric.criteria[0].id;
  const examCriterionId = exam.json().rubric.criteria[1].id;

  const scoredInternal = await app.inject({
    method: 'PUT',
    url: `/api/native/pads/${padId}/rubric-scores`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { scores: [{ criterion_id: internalCriterionId, selected_score: 2, note: 'Strong internal score.' }] },
  });
  assert.equal(scoredInternal.statusCode, 200);

  const scoredExam = await app.inject({
    method: 'PUT',
    url: `/api/native/pads/${padId}/exam-rubric-scores`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { scores: [{ criterion_id: examCriterionId, selected_score: 3, note: 'AP evidence estimate.' }] },
  });
  assert.equal(scoredExam.statusCode, 200);

  const review = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/review`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(review.statusCode, 200);
  assert.equal(review.json().rubric.criteria[0].label, 'Internal voice');
  assert.equal(review.json().rubric.scores[0].selected_score, 2);
  assert.equal(review.json().exam_rubric.criteria[1].label, 'Evidence and Commentary');
  assert.equal(review.json().exam_rubric.scores[0].selected_score, 3);

  const feedback = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/feedback`,
    headers: { cookie: cookies },
  });
  assert.equal(feedback.statusCode, 200);
  assert.equal(feedback.json().exam_rubric.criteria[1].label, 'Evidence and Commentary');
  assert.equal(feedback.json().exam_rubric.scores[0].note, 'AP evidence estimate.');

  await app.close();
});

test('native review uses selected saved feedback table', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app);
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const asset = await app.inject({
    method: 'POST',
    url: '/api/feedback-assets',
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      kind: 'strength_target',
      title: 'Personal statement table',
      assignment_type: 'Personal statement',
      content_text: 'Strengths\n- Specific voice: The writing sounds personal.\n\nTargets\n- Add concrete detail: Use one exact moment.',
    },
  });
  assert.equal(asset.statusCode, 201);

  const db = new DatabaseSync(databasePath);
  const assignment = db.prepare('SELECT settings_json FROM assignments WHERE id = ?').get(assignmentId);
  const settings = JSON.parse(assignment.settings_json);
  settings.feedback_table = `asset:${asset.json().asset.id}`;
  db.prepare('UPDATE assignments SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), assignmentId);
  db.close();

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);

  const review = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${created.json().pad.id}/review`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(review.statusCode, 200);
  assert.equal(review.json().feedback_options.strengths[0].title, 'Specific voice');
  assert.equal(review.json().feedback_options.targets[0].title, 'Add concrete detail');

  await app.close();
});

test('teacher can export native backups and import recovered student work', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Original native work' }] },
      plain_text: 'Original native work',
    },
  });
  assert.equal(saved.statusCode, 200);

  const recoveryOnly = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/import-text`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { plain_text: 'Recovered pasted work', replace_current: false },
  });
  assert.equal(recoveryOnly.statusCode, 200);
  assert.equal(recoveryOnly.json().pad.plain_text, 'Original native work');

  const uploadBody = multipartPayload({
    file: { fieldName: 'file', filename: 'recovered.txt', contentType: 'text/plain', body: 'Uploaded recovered work' },
  });
  const replaceFromFile = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/import-file?replace_current=true`,
    headers: {
      cookie: teacherCookies,
      'X-CSRF-Token': teacherCsrf,
      'Content-Type': uploadBody.contentType,
    },
    payload: uploadBody.payload,
  });
  assert.equal(replaceFromFile.statusCode, 200);
  assert.equal(replaceFromFile.json().pad.plain_text, 'Uploaded recovered work');
  assert.equal(replaceFromFile.json().pad.version, 3);

  const revisions = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/revisions`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(revisions.statusCode, 200);
  assert.deepEqual(revisions.json().revisions.map(revision => revision.reason), ['create', 'autosave', 'manual', 'manual']);
  assert.equal(revisions.json().revisions.at(-2).plain_text, 'Recovered pasted work');
  assert.equal(revisions.json().revisions.at(-1).plain_text, 'Uploaded recovered work');

  const backup = await app.inject({
    method: 'GET',
    url: `/api/native/backups/export?assignment_id=${assignmentId}`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(backup.statusCode, 200);
  assert.match(backup.headers['content-disposition'], /inkheron-native-backup-assignment/);
  assert.equal(backup.json().pad_count, 1);
  assert.equal(backup.json().pads[0].pad.plain_text, 'Uploaded recovered work');
  assert.equal(backup.json().pads[0].revisions.length, 4);
  assert.equal(backup.json().pads[0].student.display_name, 'Alice Chen');

  await app.close();
});

test('teacher can return native feedback and student can view it', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app, { greenPen: true });
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Feedback text sample.' }] },
      plain_text: 'Feedback text sample.',
    },
  });
  assert.equal(saved.statusCode, 200);

  const submitted = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/submit`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
  });
  assert.equal(submitted.statusCode, 201);

  const general = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { type: 'general_comment', body: 'Clear improvement target.' },
  });
  assert.equal(general.statusCode, 201);

  const inline = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      type: 'inline_comment',
      start_offset: 0,
      end_offset: 8,
      selected_text: 'Feedback',
      body: 'Explain this more clearly.',
    },
  });
  assert.equal(inline.statusCode, 201);

  const returned = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/finish-marking`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
  });
  assert.equal(returned.statusCode, 200);
  assert.equal(returned.json().pad.state, 'marked');
  const rewriteAssignmentId = returned.json().rewrite_assignment.id;

  const dashboard = await app.inject({
    method: 'GET',
    url: '/api/student/assignments',
    headers: { cookie: cookies },
  });
  assert.equal(dashboard.statusCode, 200);
  const assignment = dashboard.json().assignments.find(item => item.id === assignmentId);
  assert.equal(assignment.status, 'marked');
  const rewriteOnDashboard = dashboard.json().assignments.find(item => item.id === rewriteAssignmentId);
  assert.ok(rewriteOnDashboard, 'the separate rewrite assignment appears on the student dashboard');
  assert.match(rewriteOnDashboard.title, /rewrite/i);
  assert.equal(assignment.feedback_url, `/native/feedback/${assignmentId}`);
  assert.equal(assignment.write_url, `/native/write/${assignmentId}`);

  const feedback = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/feedback`,
    headers: { cookie: cookies },
  });
  assert.equal(feedback.statusCode, 200);
  assert.equal(feedback.json().pad.plain_text, 'Feedback text sample.');
  assert.equal(feedback.json().assignment.green_pen, true);
  assert.equal(feedback.json().rewrite_url, `/native/write/${assignmentId}`);
  assert.deepEqual(feedback.json().annotations.map(annotation => annotation.type), ['general_comment', 'inline_comment']);

  // The rewrite happens in the SEPARATE assignment: alice's pad there is seeded
  // with her essay and the teacher marks copied as reference.
  const rewritePad = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${rewriteAssignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(rewritePad.statusCode, 200);
  const rewritePadId = rewritePad.json().pad.id;
  assert.equal(rewritePad.json().pad.plain_text, 'Feedback text sample.');

  const rewriteSaved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${rewritePadId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Feedback text sample. Revised ending.' }] },
      plain_text: 'Feedback text sample. Revised ending.',
      expected_version: 1,
    },
  });
  assert.equal(rewriteSaved.statusCode, 200);

  const resubmitted = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${rewritePadId}/submit`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
  });
  assert.equal(resubmitted.statusCode, 201);
  assert.equal(resubmitted.json().pad.state, 'submitted');

  // Teacher grades the rewrite independently: its review shows the revised text.
  const rewriteReview = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${rewritePadId}/review`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(rewriteReview.statusCode, 200);
  assert.equal(rewriteReview.json().pad.plain_text, 'Feedback text sample. Revised ending.');

  const page = await app.inject({
    method: 'GET',
    url: `/native/feedback/${assignmentId}`,
    headers: { cookie: cookies },
  });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Open green pen and fix/);
  assert.match(page.body, /api\/native\/assignments/);
  assert.match(page.body, /toggle-check/);
  assert.match(page.body, /Your targets/);

  await app.close();
});

test('batch feedback_release holds feedback and green pen rewrite until teacher releases', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app, { greenPen: true, feedbackRelease: 'batch' });
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  const padId = created.json().pad.id;

  await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Batch release sample.' }] },
      plain_text: 'Batch release sample.',
    },
  });
  const submitted = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/submit`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
  });
  assert.equal(submitted.statusCode, 201);

  const finished = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/finish-marking`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
  });
  assert.equal(finished.statusCode, 200);
  assert.equal(finished.json().pad.state, 'marked');
  assert.equal(finished.json().rewrite_assignment, null, 'batch mode does not create the rewrite until release');

  // Feedback is held: friendly gate, no feedback/annotations leaked.
  const heldFeedback = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/feedback`,
    headers: { cookie: cookies },
  });
  assert.equal(heldFeedback.statusCode, 200);
  assert.equal(heldFeedback.json().feedback_released, false);
  assert.ok(!('feedback' in heldFeedback.json()));
  assert.ok(!('annotations' in heldFeedback.json()));

  // The green-pen rewrite assignment does not exist yet: nothing is released.
  const heldDashboard = await app.inject({
    method: 'GET',
    url: '/api/student/assignments',
    headers: { cookie: cookies },
  });
  assert.ok(!heldDashboard.json().assignments.some(a => /rewrite/i.test(a.title)),
    'no rewrite assignment before release');

  // Teacher releases feedback for the assignment.
  const released = await app.inject({
    method: 'POST',
    url: `/api/assignments/${assignmentId}/release-feedback`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
  });
  assert.equal(released.statusCode, 200);
  assert.equal(released.json().released, true);
  assert.ok(released.json().rewrite_assignment, 'release creates the rewrite assignment');
  const rewriteAssignmentId = released.json().rewrite_assignment.id;

  const openFeedback = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/feedback`,
    headers: { cookie: cookies },
  });
  assert.equal(openFeedback.statusCode, 200);
  assert.equal(openFeedback.json().feedback_released, true);
  assert.equal(openFeedback.json().pad.plain_text, 'Batch release sample.');

  // After release the rewrite assignment is live and alice can write in it.
  const rewritePad = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${rewriteAssignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(rewritePad.statusCode, 200);
  const rewritePadId = rewritePad.json().pad.id;
  assert.equal(rewritePad.json().pad.plain_text, 'Batch release sample.');

  const openSave = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${rewritePadId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Batch release sample. Revised.' }] },
      plain_text: 'Batch release sample. Revised.',
      expected_version: 1,
    },
  });
  assert.equal(openSave.statusCode, 200);

  await app.close();
});

test('immediate feedback_release (default) is unaffected by the batch gate', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app, { greenPen: true });
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  const padId = created.json().pad.id;

  await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'Immediate release sample.' }] },
      plain_text: 'Immediate release sample.',
    },
  });
  await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/submit`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
  });
  await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/finish-marking`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
  });

  const feedback = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/feedback`,
    headers: { cookie: cookies },
  });
  assert.equal(feedback.statusCode, 200);
  assert.equal(feedback.json().feedback_released, true);

  const writePage = await app.inject({
    method: 'GET',
    url: `/native/write/${assignmentId}`,
    headers: { cookie: cookies },
  });
  assert.equal(writePage.statusCode, 200);

  await app.close();
});

test('student-facing feedback and marks never reveal AI as the source', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app, { greenPen: true });
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'doc', content: [{ type: 'text', text: 'They is playing outside.' }] },
      plain_text: 'They is playing outside.',
    },
  });
  assert.equal(saved.statusCode, 200);
  const submitted = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/submit`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
  });
  assert.equal(submitted.statusCode, 201);

  const raw = new DatabaseSync(databasePath);
  const itemResult = raw.prepare(`
    INSERT INTO native_feedback_items (native_pad_id, kind, title, source, sort_order)
    VALUES (?, 'target', 'Watch your verb agreement', 'ai', 0)
  `).run(padId);
  raw.prepare(`
    INSERT INTO ai_literacy_suggestions
      (native_pad_id, document_version, start_offset, end_offset, quote, code, category, label, model, checker_json, status)
    VALUES (?, 1, 5, 7, 'is', 'Gra', 'grammar', 'Grammar', 'fake/doer', ?, 'pending')
  `).run(padId, JSON.stringify({ verbatim: true, confidence: 0.9, flag: null }));
  const promoteResult = autoPromoteSuggestions(raw, padId);
  raw.close();
  assert.equal(promoteResult.promoted, 1);

  const finished = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/finish-marking`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
  });
  assert.equal(finished.statusCode, 200);
  assert.equal(finished.json().pad.state, 'marked');
  const rewriteAssignmentId = finished.json().rewrite_assignment.id;
  const rewritePad = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${rewriteAssignmentId}/pad`,
    headers: { cookie: cookies },
  });
  const rewritePadId = rewritePad.json().pad.id;

  const feedback = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/feedback`,
    headers: { cookie: cookies },
  });
  assert.equal(feedback.statusCode, 200);
  const feedbackBody = feedback.json();
  assert.equal(feedbackBody.annotations.find((a) => a.type === 'literacy_code').metadata.code, 'Gra');
  assert.equal(feedbackBody.feedback.targets[0].title, 'Watch your verb agreement');
  assert.doesNotMatch(JSON.stringify(feedbackBody), /"source"|ai_auto|ai_accepted|suggestion_id/);

  const toggle = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${rewritePadId}/feedback-items/${itemResult.lastInsertRowid}/toggle-check`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
  });
  assert.equal(toggle.statusCode, 200);
  assert.equal(toggle.json().item.student_checked, true);
  assert.doesNotMatch(JSON.stringify(toggle.json()), /"source"/);

  const teacherReview = await app.inject({
    method: 'GET',
    url: `/api/native/pads/${padId}/feedback-items`,
    headers: { cookie: teacherCookies },
  });
  assert.equal(teacherReview.statusCode, 200);
  assert.equal(teacherReview.json().feedback.targets[0].source, 'ai', 'teacher-facing view keeps the AI source tag');

  await app.close();
});

test('teacher can create a greenpen rewrite assignment from native work', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'html', html: '<p>Rewrite this draft.</p>', text: 'Rewrite this draft.' },
      plain_text: 'Rewrite this draft.',
      expected_version: 1,
    },
  });
  assert.equal(saved.statusCode, 200);

  const annotation = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/annotations`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: {
      type: 'inline_comment',
      start_offset: 0,
      end_offset: 7,
      selected_text: 'Rewrite',
      body: 'Develop the opening.',
    },
  });
  assert.equal(annotation.statusCode, 201);

  const rubric = await app.inject({
    method: 'PUT',
    url: `/api/native/assignments/${assignmentId}/rubric`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { criteria: [{ label: 'Ideas', bands: [{ score_value: 0 }, { score_value: 1 }] }] },
  });
  assert.equal(rubric.statusCode, 200);

  const rewrite = await app.inject({
    method: 'POST',
    url: `/api/native/assignments/${assignmentId}/greenpen-rewrite`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { title: 'Greenpen rewrite: Native essay' },
  });
  assert.equal(rewrite.statusCode, 201);
  assert.equal(rewrite.json().copied_pads, 1);
  assert.equal(rewrite.json().copied_annotations, 1);
  const rewriteAssignmentId = rewrite.json().assignment.id;
  assert.equal(rewrite.json().assignment.title, 'Greenpen rewrite: Native essay');

  const db = new DatabaseSync(databasePath);
  const copiedPad = db.prepare('SELECT * FROM native_pads WHERE assignment_id = ?').get(rewriteAssignmentId);
  assert.equal(copiedPad.plain_text, 'Rewrite this draft.');
  assert.equal(copiedPad.state, 'writing');
  const copiedAnnotation = db.prepare('SELECT * FROM native_annotations WHERE native_pad_id = ?').get(copiedPad.id);
  assert.equal(copiedAnnotation.body, 'Develop the opening.');
  assert.equal(JSON.parse(copiedAnnotation.metadata_json).source_assignment_id, assignmentId);
  const copiedRubric = db.prepare('SELECT label FROM assignment_rubric_criteria WHERE assignment_id = ?').get(rewriteAssignmentId);
  assert.equal(copiedRubric.label, 'Ideas');
  db.close();

  await app.close();
});

test('native write view renders without touching Etherpad', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId } = await seedNativeAssignment(app);
  const { cookies } = await loginStudent(app, 'alice', 'correct horse');

  const response = await app.inject({
    method: 'GET',
    url: `/native/write/${assignmentId}`,
    headers: { cookie: cookies },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Native InkPad/);
  assert.match(response.body, /href="\/student">← Assignments/);
  assert.match(response.body, /Write one clear paragraph/);
  assert.match(response.body, /niw-editor-stage/);
  assert.match(response.body, /id="charCount"/);
  assert.match(response.body, /id="sentenceCount"/);
  assert.match(response.body, /id="readerResizer"/);
  assert.match(response.body, /id="sourcePanelResizer"/);
  assert.match(response.body, /Drag to resize panels/);
  assert.match(response.body, /id="saveBtn"/);
  assert.match(response.body, /id="zoomSlider"/);
  assert.match(response.body, /id="zoomSlider"[^>]+min="70"[^>]+max="150"/);
  assert.match(response.body, /zoom:var\(--editor-zoom\)/);
  assert.match(response.body, /id="lineNumbers"/);
  assert.match(response.body, /id="fontSizeSelect"/);
  assert.match(response.body, /function applyFontSize/);
  assert.match(response.body, /rememberEditorSelection/);
  assert.match(response.body, /data-command="undo"/);
  assert.match(response.body, /data-command="redo"/);
  assert.match(response.body, /data-command="indent"/);
  assert.match(response.body, /data-command="insertUnorderedList"/);
  assert.match(response.body, /data-command="justifyCenter"/);
  assert.match(response.body, /data-toggle-palette="textColorPalette"/);
  assert.match(response.body, /data-toggle-palette="highlightPalette"/);
  assert.match(response.body, /data-toggle-palette="sourceHighlightPalette"/);
  assert.match(response.body, /data-fore-color="#2f6f4e"/);
  assert.match(response.body, /data-hilite-color="#fff0a6"/);
  assert.match(response.body, /niw-align-icon center/);
  assert.match(response.body, /niw-doc-icon/);
  assert.match(response.body, /niw-glyph/);
  assert.match(response.body, /font-family:var\(--font\)/);
  assert.match(response.body, /type:'html'/);

  await app.close();
});

test('native write view embeds PDF reference inside contained scroll panel', () => {
  const html = renderNativeWriteView({
    title: 'PDF essay',
    assignmentId: 42,
    pad: {
      id: 7,
      state: 'writing',
      word_count: 0,
      plain_text: '',
      version: 1,
      document: { type: 'html', html: '', text: '' },
    },
    policy: { paste_mode: 'log', spellcheck_enabled: true },
    csrfToken: 'csrf',
    dueAt: null,
    spellcheck: true,
    prompt: 'Read the PDF.',
    passageText: '',
    passagePdf: true,
  });

  assert.match(html, /id="pdfFrame"/);
  assert.match(html, /id="pdfPages"/);
  assert.match(html, /id="pdfZoomSlider"[^>]+min="75"[^>]+max="175"/);
  // PDF.js render path with a selectable text layer and text-level marks
  assert.match(html, /pdfjs\/pdf\.min\.mjs/);
  assert.match(html, /new pdfjsLib\.TextLayer/);
  assert.match(html, /const pdfBaseUrl = '\/api\/assignments\/42\/passage-pdf'/);
  assert.match(html, /pdfjsLib\.getDocument\(pdfBaseUrl\)/);
  assert.match(html, /data-pdf-mark="underline"/);
  assert.match(html, /data-pdf-mark="highlight"/);
  assert.match(html, /\.niw-pdf-frame\{[^}]*overflow:auto/);
  // No browser-native PDF iframe any more
  assert.doesNotMatch(html, /id="pdfEmbed"/);
});

test('teacher can return a native pad for revision after the deadline', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { assignmentId, teacherCookies, teacherCsrf } = await seedNativeAssignment(app);
  const { cookies, csrfToken } = await loginStudent(app, 'alice', 'correct horse');

  const created = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignmentId}/pad`,
    headers: { cookie: cookies },
  });
  assert.equal(created.statusCode, 200);
  const padId = created.json().pad.id;

  const db = new DatabaseSync(databasePath);
  db.prepare("UPDATE assignments SET due_at = datetime('now', '-1 day') WHERE id = ?").run(assignmentId);
  db.close();

  const returned = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/return-revision`,
    headers: { cookie: teacherCookies, 'X-CSRF-Token': teacherCsrf },
    payload: { note: 'Revise this section.' },
  });
  assert.equal(returned.statusCode, 200);
  assert.equal(returned.json().pad.state, 'writing');
  assert.equal(returned.json().returned_for_revision, true);

  const writePage = await app.inject({
    method: 'GET',
    url: `/native/write/${assignmentId}`,
    headers: { cookie: cookies },
  });
  assert.equal(writePage.statusCode, 200);
  assert.match(writePage.body, /Submit/);

  const saved = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/save`,
    headers: { cookie: cookies, 'X-CSRF-Token': csrfToken },
    payload: {
      document: { type: 'html', html: '<p>Revision after deadline.</p>', text: 'Revision after deadline.' },
      plain_text: 'Revision after deadline.',
      expected_version: 1,
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().pad.plain_text, 'Revision after deadline.');

  await app.close();
});

test('teacher native review page is served behind teacher auth', async () => {
  const databasePath = temporaryDatabasePath();
  const app = await buildApp({ databasePath, logger: false });
  const { teacherCookies } = await seedNativeAssignment(app);

  const blocked = await app.inject({
    method: 'GET',
    url: '/teacher/native-review',
  });
  assert.equal(blocked.statusCode, 401);

  const page = await app.inject({
    method: 'GET',
    url: '/teacher/native-review',
    headers: { cookie: teacherCookies },
  });
  assert.equal(page.statusCode, 200);
  // Redesigned review page (direction-d): assert its real structure and wiring.
  assert.match(page.body, /InkHeron - Review/);
  assert.match(page.body, /api\/native\/pads/);
  assert.match(page.body, /literacy_code/);
  assert.match(page.body, /Auto-marked/);
  assert.match(page.body, /Needs you/);
  assert.match(page.body, /feedback-suggestions/);
  assert.match(page.body, /\/disagree/);
  assert.match(page.body, /rubric-scores/);
  assert.match(page.body, /exam-rubric-scores/);
  assert.match(page.body, /inline_comment/);
  assert.match(page.body, /Finish marking/);
  assert.match(page.body, /finish-marking/);

  await app.close();
});
