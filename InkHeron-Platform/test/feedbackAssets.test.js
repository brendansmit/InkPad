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

function multipartPayload({ file }) {
  const boundary = `----inkheron-feedback-${Date.now()}`;
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

function makeStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, bodyValue] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const body = Buffer.isBuffer(bodyValue) ? bodyValue : Buffer.from(bodyValue);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(filename.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, filename, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, filename);
    offset += local.length + filename.length + body.length;
  }
  const body = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, central, eocd]);
}

function makeDocx(text) {
  return makeStoredZip({
    '[Content_Types].xml': '<Types></Types>',
    'word/document.xml': `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  });
}

function makePdf(text) {
  return Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 44 >> stream
BT /F1 24 Tf 100 700 Td (${text}) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer << /Root 1 0 R /Size 6 >>
startxref
405
%%EOF`);
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

test('teacher can extract feedback upload text from docx and pdf', async () => {
  const app = await buildApp({ databasePath: tmpDb(), logger: false });
  const teacher = await setupTeacher(app);

  const docxBody = multipartPayload({
    file: {
      fieldName: 'file',
      filename: 'rubric.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: makeDocx('DOCX rubric target text'),
    },
  });
  const docx = await app.inject({
    method: 'POST',
    url: '/api/feedback-assets/extract',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf, 'content-type': docxBody.contentType },
    payload: docxBody.payload,
  });
  assert.equal(docx.statusCode, 200);
  assert.match(docx.json().text, /DOCX rubric target text/);

  const pdfBody = multipartPayload({
    file: {
      fieldName: 'file',
      filename: 'rubric.pdf',
      contentType: 'application/pdf',
      body: makePdf('PDF rubric text'),
    },
  });
  const pdf = await app.inject({
    method: 'POST',
    url: '/api/feedback-assets/extract',
    headers: { cookie: teacher.cookies, 'X-CSRF-Token': teacher.csrf, 'content-type': pdfBody.contentType },
    payload: pdfBody.payload,
  });
  assert.equal(pdf.statusCode, 200);
  assert.match(pdf.json().text, /PDF rubric text/);

  await app.close();
});
