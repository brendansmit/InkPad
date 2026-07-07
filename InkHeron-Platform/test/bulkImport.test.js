import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-bulk-'));
  return path.join(dir, 'inkheron.db');
}

async function setupTeacher(app) {
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' },
  });
  assert.equal(setup.statusCode, 201);
  const login = await app.inject({
    method: 'POST',
    url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' },
  });
  assert.equal(login.statusCode, 200);
  return { cookies: login.headers['set-cookie'], csrf: login.json().user.csrf_token };
}

async function createClass(app, teacher) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/classes',
    payload: { name: 'Grade 9' },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(res.statusCode, 201);
  return res.json().class.id;
}

async function createQuestion(app, teacher, payload = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tests/questions',
    payload: {
      kind: 'mcq',
      prompt_text: 'Starter question?',
      options: ['A', 'B'],
      answer_index: 0,
      points: 1,
      ...payload,
    },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(res.statusCode, 201);
  return res.json().question;
}

async function createAssignment(app, teacher, classId, questionId) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tests/assignments',
    payload: {
      class_id: classId,
      title: 'Quiz',
      sections: [{ kind: 'mcq', title: 'MCQ', question_ids: [questionId] }],
    },
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
  });
  assert.equal(res.statusCode, 201);
  return res.json().assignment;
}

function multipartPayload({ fields = {}, file }) {
  const boundary = `----inkheron-${Date.now()}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\n`));
  chunks.push(Buffer.from(`Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`));
  chunks.push(Buffer.from(`Content-Type: ${file.contentType}\r\n\r\n`));
  chunks.push(Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body));
  chunks.push(Buffer.from('\r\n'));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

test('structured CSV bulk import creates rows and appends to quiz section', async () => {
  const app = await buildApp({ databasePath: tmpDb() });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const starter = await createQuestion(app, teacher);
  const assignment = await createAssignment(app, teacher, classId, starter.id);
  const csv = [
    'prompt,optionA,optionB,optionC,optionD,answer,points,topic,tags',
    '"What is 2+2?",3,4,5,6,B,1,Arithmetic,"addition;basics"',
    '"Which word is a noun?",Run,Blue,Teacher,Quickly,3,2,Grammar,"parts of speech"',
  ].join('\n');
  const body = multipartPayload({
    fields: { assignment_id: assignment.id },
    file: { fieldName: 'file', filename: 'questions.csv', contentType: 'text/csv', body: csv },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/tests/questions/bulk-import',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf, 'content-type': body.contentType },
    payload: body.payload,
  });
  assert.equal(res.statusCode, 201);
  const json = res.json();
  assert.equal(json.created.length, 2);
  assert.equal(json.added_to_quiz, 2);
  assert.deepEqual(json.needs_answer, []);
  assert.equal(json.created[0].topic, 'Arithmetic');
  assert.deepEqual(json.created[0].tags, ['addition', 'basics']);

  const review = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/review`,
    headers: { cookie: teacher.cookies },
  });
  assert.equal(review.statusCode, 200);
  assert.deepEqual(review.json().sections[0].question_ids, [starter.id, ...json.created.map((q) => q.id)]);
  await app.close();
});

test('loose text import uses injected chat and flags missing answers without inventing them', async () => {
  let seenIntent = '';
  const chat = async (_db, { intent }) => {
    seenIntent = intent;
    return {
      model: 'fake',
      choices: [{
        message: {
          content: JSON.stringify([
            { prompt_text: 'What does the metaphor suggest?', options: ['Speed', 'Fear', 'Calm'], answer_index: null, topic: 'Figurative Language', tags: ['metaphor'] },
          ]),
        },
      }],
    };
  };
  const app = await buildApp({ databasePath: tmpDb(), chat });
  const teacher = await setupTeacher(app);
  const classId = await createClass(app, teacher);
  const starter = await createQuestion(app, teacher);
  const assignment = await createAssignment(app, teacher, classId, starter.id);

  const res = await app.inject({
    method: 'POST',
    url: '/api/tests/questions/bulk-import',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf },
    payload: {
      raw_text: '1. What does the metaphor suggest? A Speed B Fear C Calm',
      description: 'AP language practice',
      assignment_id: assignment.id,
    },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(seenIntent, 'deepseek chat v3');
  const json = res.json();
  assert.equal(json.created.length, 1);
  assert.equal(json.created[0].answer_index, null);
  assert.deepEqual(json.needs_answer, [json.created[0].id]);

  const review = await app.inject({
    method: 'GET',
    url: `/api/tests/${assignment.id}/review`,
    headers: { cookie: teacher.cookies },
  });
  assert.deepEqual(review.json().sections[0].question_ids, [starter.id, json.created[0].id]);
  await app.close();
});
