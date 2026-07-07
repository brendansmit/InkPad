import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildCalibration } from '../src/services/promptCalibration.js';
import { runLiteracyAnalysis } from '../src/services/literacyCoder.js';

function bareDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE ai_literacy_suggestions (id INTEGER PRIMARY KEY, native_pad_id INTEGER, code TEXT, quote TEXT,
      status TEXT, resolved_at TEXT, document_version INTEGER DEFAULT 1, start_offset INTEGER DEFAULT 0,
      end_offset INTEGER DEFAULT 1, category TEXT DEFAULT '', label TEXT DEFAULT '', model TEXT DEFAULT '',
      checker_json TEXT DEFAULT '{}', annotation_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE native_annotations (id INTEGER PRIMARY KEY, native_pad_id INTEGER, type TEXT,
      metadata_json TEXT DEFAULT '{}', selected_text TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE native_teacher_events (id INTEGER PRIMARY KEY, native_pad_id INTEGER, teacher_id INTEGER,
      action TEXT, metadata_json TEXT DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE native_pads (id INTEGER PRIMARY KEY, plain_text TEXT, version INTEGER DEFAULT 1);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  `);
  return db;
}

test('buildCalibration turns rejects, hand-added marks and recodes into a capped prompt block', () => {
  const db = bareDb();
  assert.equal(buildCalibration(db), '', 'no signals means no block');

  db.prepare("INSERT INTO ai_literacy_suggestions (code, quote, status, resolved_at) VALUES ('Gra', 'the course CSP and CSA improves', 'rejected', datetime('now'))").run();
  db.prepare(`INSERT INTO native_annotations (type, metadata_json, selected_text) VALUES ('literacy_code', '{"code":"VT","source":"teacher"}', 'when I get older')`).run();
  db.prepare(`INSERT INTO native_teacher_events (action, metadata_json) VALUES ('annotation_updated', '{"annotation_id":1,"code_from":"Exp","code_to":"WW","quote":"similarity thinking way"}')`).run();

  const block = buildCalibration(db);
  assert.match(block, /CALIBRATION/);
  assert.match(block, /REJECTED/);
  assert.match(block, /the course CSP and CSA improves/);
  assert.match(block, /ADD marks/);
  assert.match(block, /VT: "when I get older"/);
  assert.match(block, /Exp -> WW \(1x\)/);
  // Un-recode events without code_from are ignored.
  db.prepare(`INSERT INTO native_teacher_events (action, metadata_json) VALUES ('annotation_updated', '{"annotation_id":2}')`).run();
  assert.match(buildCalibration(db), /Exp -> WW \(1x\)/);
});

test('the Doer system prompt carries the calibration block on a real run', async () => {
  const db = bareDb();
  db.prepare("INSERT INTO native_pads (id, plain_text) VALUES (7, 'They is playing outside.')").run();
  db.prepare("INSERT INTO ai_literacy_suggestions (code, quote, status, resolved_at) VALUES ('P', 'so called', 'rejected', datetime('now'))").run();

  let doerSystem = '';
  const chat = (d, { intent, messages }) => {
    if (!intent.includes('gemini')) doerSystem = messages[0].content;
    return Promise.resolve({ model: 'fake', choices: [{ message: { content: '[]' } }] });
  };
  await runLiteracyAnalysis(db, { padId: 7 }, { chat });
  assert.match(doerSystem, /CALIBRATION/);
  assert.match(doerSystem, /so called/);
});
