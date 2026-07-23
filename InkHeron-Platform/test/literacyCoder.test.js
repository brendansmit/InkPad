import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import {
  parseLiteracyResponse, findQuoteSpan, codeCategory, splitParagraphs, runLiteracyAnalysis,
  detectSpellingVariant, spellingDirective,
} from '../src/services/literacyCoder.js';
import { verifyFindings } from '../src/services/checker.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-litcoder-'));
  return path.join(dir, 'inkheron.db');
}

const PARA_1 = 'They is playing outside and she recieved the ball.';
const PARA_2 = 'I think it was fun. Because she was tired.';
const PAD_TEXT = `${PARA_1}\n\n${PARA_2}`;

function chatResponse(content, model = 'fake/doer-model') {
  return { model, choices: [{ message: { content } }] };
}

// Fake OpenRouter: routes on intent. Doer answers per paragraph, Checker
// confirms everything as defensible.
function fakeChat(db, { intent, messages }) {
  const user = messages[messages.length - 1].content;
  if (intent.includes('gemini')) {
    const count = (user.match(/^\d+\./gm) ?? []).length;
    const verdicts = Array.from({ length: count }, (_, i) => ({ index: i, defensible: true, confidence: 0.9 }));
    return Promise.resolve(chatResponse(JSON.stringify(verdicts), 'fake/checker-model'));
  }
  if (user === PARA_1) {
    return Promise.resolve(chatResponse(JSON.stringify([
      { sentence: PARA_1, quote: 'is', code: 'Gra' },
      { sentence: PARA_1, quote: 'recieved', code: 'Sp' },
      { sentence: PARA_1, quote: 'recieved', code: 'Sp' }, // duplicate: must dedupe
      { sentence: PARA_1, quote: 'not in the text at all', code: 'WW' }, // unlocatable: must drop
    ])));
  }
  if (user === PARA_2) {
    return Promise.resolve(chatResponse(JSON.stringify([
      { sentence: 'Because she was tired.', quote: 'Because she was tired.', code: 'inc' },
    ])));
  }
  return Promise.resolve(chatResponse('[]'));
}

async function seedPad(dbPath, db) {
  const app = await buildApp({ db, logger: false });
  const setup = await app.inject({ method: 'POST', url: '/api/setup/teacher',
    payload: { username: 'teacher', display_name: 'Teacher', password: 'teacherpass123' } });
  assert.ok(setup.statusCode === 201 || setup.statusCode === 403);
  const login = await app.inject({ method: 'POST', url: '/api/teacher/login',
    payload: { username: 'teacher', password: 'teacherpass123' } });
  const csrf = login.json().user.csrf_token;
  const cookies = login.headers['set-cookie'];
  const cls = await app.inject({ method: 'POST', url: '/api/classes',
    payload: { name: 'G9' }, headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  await app.inject({ method: 'POST', url: '/api/students',
    payload: { username: 'alice', display_name: 'Alice', password: 'pass12345', class_id: cls.json().class.id },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const created = await app.inject({ method: 'POST', url: '/api/assignments',
    payload: { class_id: cls.json().class.id, title: 'Essay', settings: {} },
    headers: { 'X-CSRF-Token': csrf, cookie: cookies } });
  const sLogin = await app.inject({ method: 'POST', url: '/api/login',
    payload: { username: 'alice', password: 'pass12345' } });
  const pad = await app.inject({ method: 'GET',
    url: `/api/native/assignments/${created.json().assignment.id}/pad`,
    headers: { cookie: sLogin.headers['set-cookie'] } });
  assert.equal(pad.statusCode, 200);
  const padId = pad.json().pad.id;
  db.prepare('UPDATE native_pads SET plain_text = ?, version = 3 WHERE id = ?').run(PAD_TEXT, padId);
  return { app, padId };
}

test('parseLiteracyResponse filters junk, invalid codes and think tags', () => {
  const good = parseLiteracyResponse('<think>musing</think>```json\n[{"sentence":"A b.","quote":"b","code":"Sp"},{"sentence":"A b.","quote":"b","code":"NOTACODE"},{"quote":"b","code":"Sp"}]\n```');
  assert.equal(good.length, 1);
  assert.deepEqual(good[0], { sentence: 'A b.', quote: 'b', code: 'Sp' });
  assert.deepEqual(parseLiteracyResponse('no json here'), []);
  assert.deepEqual(parseLiteracyResponse('[{broken'), []);
});

test('findQuoteSpan finds whole-word spans inside the right sentence', () => {
  const span = findQuoteSpan(PARA_1, PARA_1, 'is');
  assert.equal(PARA_1.slice(span.start, span.end), 'is');
  assert.equal(span.start, 5, 'matches the standalone "is", not the one inside "playing"');
  assert.equal(findQuoteSpan(PARA_1, PARA_1, 'zebra'), null);
});

test('splitParagraphs returns non-blank runs with absolute offsets', () => {
  const paras = splitParagraphs(PAD_TEXT);
  assert.equal(paras.length, 2);
  assert.equal(paras[0].text, PARA_1);
  assert.equal(paras[1].text, PARA_2);
  assert.equal(PAD_TEXT.slice(paras[1].offset, paras[1].offset + PARA_2.length), PARA_2);
});

test('verifyFindings drops nothing itself but marks non-verbatim findings', async () => {
  const findings = [
    { start_offset: 5, end_offset: 7, quote: 'is', code: 'Gra' },
    { start_offset: 0, end_offset: 4, quote: 'XXXX', code: 'Sp' },
  ];
  const out = await verifyFindings({}, { padPlainText: PARA_1, findings },
    { chat: () => Promise.resolve(chatResponse('[{"index":0,"defensible":true,"confidence":0.8}]')) });
  assert.equal(out[0].checker.verbatim, true);
  assert.equal(out[0].checker.confidence, 0.8);
  assert.equal(out[1].checker.verbatim, false);
  assert.equal(out[1].checker.flag, 'not_verbatim');
});

test('verifyFindings survives a failing checker model', async () => {
  const findings = [{ start_offset: 5, end_offset: 7, quote: 'is', code: 'Gra' }];
  const out = await verifyFindings({}, { padPlainText: PARA_1, findings },
    { chat: () => Promise.reject(new Error('no key')) });
  assert.equal(out[0].checker.verbatim, true);
  assert.equal(out[0].checker.flag, 'checker_unavailable');
});

test('runLiteracyAnalysis writes pending suggestions with correct absolute offsets', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(tmpDb(), db);

  const result = await runLiteracyAnalysis(db, { padId }, { chat: fakeChat });
  assert.equal(result.status, 'ok');
  assert.equal(result.written, 3, 'duplicate and unlocatable findings dropped');

  const rows = db.prepare('SELECT * FROM ai_literacy_suggestions WHERE native_pad_id = ? ORDER BY start_offset').all(padId);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.status, 'pending');
    assert.equal(row.document_version, 3);
    assert.equal(PAD_TEXT.slice(row.start_offset, row.end_offset), row.quote, 'quote matches pad slice exactly');
    assert.equal(row.model, 'fake/doer-model');
    assert.equal(JSON.parse(row.checker_json).verbatim, true);
  }
  const codes = rows.map((r) => r.code);
  assert.deepEqual(codes, ['Gra', 'Sp', 'inc']);
  assert.equal(rows[2].category, 'grammar');
  assert.ok(rows[2].start_offset > PARA_1.length, 'second-paragraph offset is absolute, not paragraph-relative');

  // Re-run replaces pending rows instead of duplicating them.
  const again = await runLiteracyAnalysis(db, { padId }, { chat: fakeChat });
  assert.equal(again.written, 3);
  const recount = db.prepare('SELECT COUNT(*) AS n FROM ai_literacy_suggestions WHERE native_pad_id = ?').get(padId);
  assert.equal(recount.n, 3);

  await app.close();
});

test('runLiteracyAnalysis is a clean no-op when the model call fails', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(tmpDb(), db);

  const result = await runLiteracyAnalysis(db, { padId },
    { chat: () => Promise.reject(new Error('openrouter_api_key not set')) });
  assert.equal(result.status, 'error');
  assert.equal(result.written, 0);
  const count = db.prepare('SELECT COUNT(*) AS n FROM ai_literacy_suggestions WHERE native_pad_id = ?').get(padId);
  assert.equal(count.n, 0);

  await app.close();
});

test('runLiteracyAnalysis skips empty pads without calling the model', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(tmpDb(), db);
  db.prepare("UPDATE native_pads SET plain_text = '' WHERE id = ?").run(padId);

  let calls = 0;
  const result = await runLiteracyAnalysis(db, { padId }, { chat: () => { calls++; return Promise.resolve(chatResponse('[]')); } });
  assert.equal(result.status, 'skipped');
  assert.equal(calls, 0);

  await app.close();
});

test('checker always flags the least-confident ~10% of a real batch for review', async () => {
  const text = 'aa bb cc dd ee ff gg hh';
  const findings = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff'].map((quote, i) => ({
    start_offset: i * 3, end_offset: i * 3 + 2, quote, code: 'Sp',
  }));
  // Checker rubber-stamps: everything 0.9 except one 0.8.
  const verdicts = findings.map((_, i) => ({ index: i, defensible: true, confidence: i === 3 ? 0.8 : 0.9 }));
  const out = await verifyFindings({}, { padPlainText: text, findings },
    { chat: () => Promise.resolve(chatResponse(JSON.stringify(verdicts))) });
  const flagged = out.filter((f) => f.checker.flag === 'least_confident');
  assert.equal(flagged.length, 1, 'ceil(6 * 0.1) = 1 finding forced into the contested pile');
  assert.equal(flagged[0].quote, 'dd', 'the lowest-confidence finding is the one flagged');

  // Tiny batches (tests, short paragraphs) are exempt from the quota.
  const small = await verifyFindings({}, { padPlainText: text, findings: findings.slice(0, 2) },
    { chat: () => Promise.resolve(chatResponse(JSON.stringify(verdicts.slice(0, 2)))) });
  assert.ok(small.every((f) => f.checker.flag !== 'least_confident'));

  // A confident batch (every finding >= 0.9) flags nothing extra: the teacher
  // should not have to re-review things the checker was sure of.
  const allConfident = findings.map((_, i) => ({ index: i, defensible: true, confidence: 0.9 }));
  const confident = await verifyFindings({}, { padPlainText: text, findings },
    { chat: () => Promise.resolve(chatResponse(JSON.stringify(allConfident))) });
  assert.ok(confident.every((f) => f.checker.flag !== 'least_confident'),
    'six 0.9s produce zero least_confident flags');
});

test('detectSpellingVariant reads a consistently British essay as british', () => {
  const text = 'The colour of our neighbourhood theatre is a favourite. We organised the programme and recognised the behaviour.';
  assert.equal(detectSpellingVariant(text), 'british');
});

test('detectSpellingVariant reads a consistently American essay as american', () => {
  const text = 'The color of our neighborhood theater is a favorite. We organized the program and recognized the behavior.';
  assert.equal(detectSpellingVariant(text), 'american');
});

test('detectSpellingVariant returns null when there is no clear signal', () => {
  assert.equal(detectSpellingVariant('The dog ran across the field and jumped the fence.'), null);
});

test('spellingDirective tells the marker to accept the dominant variant and flag only deviations', () => {
  const british = spellingDirective('british');
  assert.match(british, /British/);
  assert.match(british, /never flag them as Sp/);
  assert.equal(spellingDirective(null), '');
});

test('runLiteracyAnalysis injects the detected spelling standard into the system prompt', async () => {
  const db = openDatabase(tmpDb());
  const { app, padId } = await seedPad(tmpDb(), db);
  db.prepare('UPDATE native_pads SET plain_text = ? WHERE id = ?')
    .run('The colour of the theatre was a favourite. We organised and recognised the behaviour of our neighbours.', padId);

  let seenSystem = '';
  const chat = (_db, { messages }) => {
    seenSystem = messages[0].content;
    return Promise.resolve({ model: 'fake', choices: [{ message: { content: '[]' } }] });
  };
  await runLiteracyAnalysis(db, { padId }, { chat });
  assert.match(seenSystem, /SPELLING STANDARD/);
  assert.match(seenSystem, /British/);

  await app.close();
});
