import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-feedback-'));
  return path.join(dir, 'inkheron.db');
}

async function setupTeacher(app) {
  await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

test('teacher can manage feedback assets', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);

  const blocked = await app.inject({ method: 'GET', url: '/teacher/feedback' });
  assert.equal(blocked.statusCode, 401);

  const page = await app.inject({ method: 'GET', url: '/teacher/feedback', headers: { cookie: teacher.cookies } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Feedback/);
  assert.match(page.body, /api\/feedback-assets/);

  const feedback = await app.inject({
    method: 'POST',
    url: '/api/feedback-assets',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
    payload: {
      kind: 'strength_target',
      title: 'Personal statement table',
      assignment_type: 'Personal statement',
      content_text: 'Strengths\n- Clear voice: The statement sounds personal.\n\nTargets\n- Add evidence: Use one exact moment.',
    },
  });
  assert.equal(feedback.statusCode, 201);
  assert.equal(feedback.json().asset.parsed.strengths[0].title, 'Clear voice');
  assert.equal(feedback.json().asset.parsed.targets[0].title, 'Add evidence');

  const rubric = await app.inject({
    method: 'POST',
    url: '/api/feedback-assets',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
    payload: {
      kind: 'rubric',
      title: 'Personal statement rubric',
      assignment_type: 'Personal statement',
      content_text: JSON.stringify({
        criteria: [{
          label: 'Voice',
          description: 'Sounds specific and personal.',
          bands: [{ score_value: 0, label: '0', descriptor: 'Missing' }, { score_value: 1, label: '1', descriptor: 'Present' }],
        }],
      }),
    },
  });
  assert.equal(rubric.statusCode, 201);
  assert.equal(rubric.json().asset.parsed.criteria[0].label, 'Voice');

  const listed = await app.inject({ method: 'GET', url: '/api/feedback-assets', headers: { cookie: teacher.cookies } });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().assets.length, 2);

  const archived = await app.inject({
    method: 'DELETE',
    url: `/api/feedback-assets/${feedback.json().asset.id}`,
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(archived.statusCode, 204);

  const remaining = await app.inject({ method: 'GET', url: '/api/feedback-assets', headers: { cookie: teacher.cookies } });
  assert.deepEqual(remaining.json().assets.map(asset => asset.title), ['Personal statement rubric']);

  await app.close();
});
