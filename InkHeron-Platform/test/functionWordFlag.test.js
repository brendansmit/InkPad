/**
 * A real student had every "of" in her essay come back as a "Wrong word"
 * error, auto-applied by the coder at high confidence (2026-07-29). A
 * wrong-word code asserts the student picked the wrong VOCABULARY item, which
 * is not a claim that can be made about a bare preposition or article: if one
 * of those really is wrong the taxonomy has a dedicated code for it. So a
 * word-choice code on a lone function word never auto-applies. It stays
 * pending for the teacher, like any other contested finding.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../src/db/database.js';
import { autoPromoteSuggestions, isBareFunctionWordFlag } from '../src/routes/nativePads.js';

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkheron-funcword-'));
  return openDatabase(path.join(dir, 'inkheron.db'));
}

test('a word-choice code on a bare function word is recognised as a miscoding', () => {
  assert.equal(isBareFunctionWordFlag('WW', 'of'), true);
  assert.equal(isBareFunctionWordFlag('WW', ' Of '), true, 'case and padding do not matter');
  assert.equal(isBareFunctionWordFlag('WW', 'of,'), true, 'trailing punctuation does not matter');
  assert.equal(isBareFunctionWordFlag('WORD-CLASS', 'the'), true);
});

test('real wrong-word finds are untouched', () => {
  assert.equal(isBareFunctionWordFlag('WW', 'affect'), false, 'a content word');
  assert.equal(isBareFunctionWordFlag('WW', 'of the'), false, 'a phrase, not a bare word');
  assert.equal(isBareFunctionWordFlag('WW', ''), false);
  assert.equal(isBareFunctionWordFlag('PREP-WRONG', 'of'), false, 'the dedicated preposition code still applies');
  assert.equal(isBareFunctionWordFlag('Sp', 'of'), false, 'spelling is not a word-choice claim');
});

function seedPad(db) {
  db.prepare("INSERT INTO classes (name) VALUES ('G9')").run();
  const studentId = db.prepare(
    "INSERT INTO students (username, display_name, password_hash, class_id) VALUES ('cathy', 'Cathy', 'x', 1)"
  ).run().lastInsertRowid;
  const assignmentId = db.prepare(
    "INSERT INTO assignments (class_id, title, type, settings_json) VALUES (1, 'Essay', 'essay', '{}')"
  ).run().lastInsertRowid;
  return db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, version)
    VALUES (?, ?, 'submitted', '{}', 'She felt empathy of the problem and it was diffrent.', 10, 2)
  `).run(studentId, assignmentId).lastInsertRowid;
}

function addSuggestion(db, padId, { code, quote, start, end }) {
  return db.prepare(`
    INSERT INTO ai_literacy_suggestions
      (native_pad_id, code, category, label, quote, start_offset, end_offset, status, checker_json, document_version, model)
    VALUES (?, ?, 'surface', ?, ?, ?, ?, 'pending', ?, 2, 'fake/model')
  `).run(padId, code, code, quote, start, end,
    JSON.stringify({ verbatim: true, flag: null, confidence: 0.95 })).lastInsertRowid;
}

test('the coder cannot auto-apply "Wrong word" on "of", but a genuine find still lands', () => {
  const db = tmpDb();
  const padId = seedPad(db);
  const ofId = addSuggestion(db, padId, { code: 'WW', quote: 'of', start: 18, end: 20 });
  const spellingId = addSuggestion(db, padId, { code: 'Sp', quote: 'diffrent', start: 42, end: 50 });

  const result = autoPromoteSuggestions(db, padId);
  assert.equal(result.promoted, 1, 'only the spelling error was promoted');

  const statuses = new Map(db.prepare(
    'SELECT id, status FROM ai_literacy_suggestions WHERE native_pad_id = ?'
  ).all(padId).map((r) => [r.id, r.status]));
  assert.equal(statuses.get(ofId), 'pending', 'the bogus "of" find waits for the teacher');
  assert.equal(statuses.get(spellingId), 'accepted');

  const marks = db.prepare(
    "SELECT selected_text FROM native_annotations WHERE native_pad_id = ? AND type = 'literacy_code'"
  ).all(padId).map((r) => r.selected_text);
  assert.deepEqual(marks, ['diffrent'], 'no "of" mark reached the student feedback');
});
