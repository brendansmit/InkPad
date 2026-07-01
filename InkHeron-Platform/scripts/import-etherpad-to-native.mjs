#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, runMigrations } from '../src/db/migrate.js';
import { EtherpadService } from '../src/etherpad/api.js';

const EMPTY_DOC = '{"type":"doc","content":[]}';

function countWords(text) {
  const cleaned = String(text ?? '').replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '').trim();
  return cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeEtherpadText(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
}

function htmlDocumentForPlainText(text) {
  const paragraphs = normalizeEtherpadText(text).split(/\n{2,}/);
  const html = paragraphs
    .map((paragraph) => {
      const lines = paragraph.split('\n').map(escapeHtml).join('<br>');
      return `<p>${lines}</p>`;
    })
    .join('');
  return { type: 'html', html, text: normalizeEtherpadText(text) };
}

function parseSettings(settingsJson) {
  try {
    const parsed = JSON.parse(settingsJson || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function setAssignmentNative(db, assignment) {
  const settings = parseSettings(assignment.settings_json);
  settings.native_inkpad = true;
  db.prepare('UPDATE assignments SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), assignment.id);
}

function latestSubmissionAt(db, padId) {
  const row = db.prepare('SELECT submitted_at FROM submissions WHERE pad_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1').get(padId);
  return row?.submitted_at ?? null;
}

function loadRows(db, assignmentId) {
  return db.prepare(`
    SELECT
      p.id AS pad_id,
      p.student_id,
      p.assignment_id,
      p.etherpad_pad_id,
      p.state AS etherpad_state,
      s.display_name,
      s.username,
      np.id AS native_pad_id,
      np.plain_text AS native_plain_text,
      np.state AS native_state
    FROM pads p
    JOIN students s ON s.id = p.student_id
    LEFT JOIN native_pads np ON np.student_id = p.student_id AND np.assignment_id = p.assignment_id
    WHERE p.assignment_id = ?
    ORDER BY s.display_name COLLATE NOCASE, s.id
  `).all(assignmentId);
}

function insertRevision(db, nativePadId, documentJson, plainText, wordCount, version) {
  db.prepare(`
    INSERT INTO native_pad_revisions (native_pad_id, reason, document_json, plain_text, word_count, document_version)
    VALUES (?, 'manual', ?, ?, ?, ?)
  `).run(nativePadId, documentJson, plainText, wordCount, version);
}

function upsertNativePad(db, row, plainText, { overwrite }) {
  const documentJson = JSON.stringify(htmlDocumentForPlainText(plainText));
  const wordCount = countWords(plainText);
  const submittedAt = ['submitted', 'marked', 'green_pen_open', 'resubmitted'].includes(row.etherpad_state)
    ? latestSubmissionAt(db, row.pad_id)
    : null;
  const state = row.etherpad_state || 'writing';

  if (row.native_pad_id) {
    const existingText = String(row.native_plain_text ?? '');
    if (existingText.trim() && !overwrite) {
      return { action: 'skipped_existing', nativePadId: row.native_pad_id, wordCount };
    }
    db.prepare(`
      UPDATE native_pads
      SET state = ?, document_json = ?, plain_text = ?, word_count = ?, version = version + 1,
          submitted_at = COALESCE(?, submitted_at), updated_at = datetime('now')
      WHERE id = ?
    `).run(state, documentJson, plainText, wordCount, submittedAt, row.native_pad_id);
    const updated = db.prepare('SELECT id, version FROM native_pads WHERE id = ?').get(row.native_pad_id);
    insertRevision(db, updated.id, documentJson, plainText, wordCount, Number(updated.version ?? 1));
    return { action: existingText.trim() ? 'overwritten' : 'filled_empty', nativePadId: updated.id, wordCount };
  }

  const result = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, state, document_json, plain_text, word_count, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.student_id, row.assignment_id, state, documentJson, plainText, wordCount, submittedAt);
  const nativePadId = result.lastInsertRowid;
  insertRevision(db, nativePadId, documentJson, plainText, wordCount, 1);
  return { action: 'created', nativePadId, wordCount };
}

export async function importEtherpadAssignment({
  databasePath = process.env.INKHERON_DB_PATH ?? defaultDatabasePath(),
  assignmentId,
  apply = false,
  overwrite = false,
  flipAssignment = true,
  etherpadService = new EtherpadService({
    apiKey: process.env.ETHERPAD_API_KEY || readLocalEtherpadApiKey(),
    baseUrl: process.env.ETHERPAD_API_URL,
  }),
} = {}) {
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    throw new Error('assignmentId must be a positive integer');
  }

  runMigrations(databasePath);
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  try {
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId);
    if (!assignment) throw new Error(`assignment ${assignmentId} not found`);

    const rows = loadRows(db, assignmentId);
    const results = [];

    for (const row of rows) {
      try {
        const rawText = await etherpadService.getPadText(row.etherpad_pad_id);
        const plainText = normalizeEtherpadText(rawText);
        const sourceWordCount = countWords(plainText);
        const preview = plainText.slice(0, 140).replace(/\s+/g, ' ').trim();
        let action = 'dry_run';
        let nativePadId = row.native_pad_id ?? null;
        let targetWordCount = sourceWordCount;

        if (apply) {
          const imported = upsertNativePad(db, row, plainText, { overwrite });
          action = imported.action;
          nativePadId = imported.nativePadId;
          targetWordCount = imported.wordCount;
        }

        results.push({
          ok: true,
          action,
          student_id: row.student_id,
          student: row.display_name,
          username: row.username,
          pad_id: row.pad_id,
          native_pad_id: nativePadId,
          etherpad_pad_id: row.etherpad_pad_id,
          source_words: sourceWordCount,
          target_words: targetWordCount,
          preview,
        });
      } catch (error) {
        results.push({
          ok: false,
          action: 'error',
          student_id: row.student_id,
          student: row.display_name,
          username: row.username,
          pad_id: row.pad_id,
          etherpad_pad_id: row.etherpad_pad_id,
          error: error.message,
        });
      }
    }

    const failures = results.filter((result) => !result.ok);
    if (apply && failures.length === 0 && flipAssignment) {
      setAssignmentNative(db, assignment);
    }

    return {
      assignment_id: assignment.id,
      assignment_title: assignment.title,
      mode: apply ? 'apply' : 'dry_run',
      overwrite,
      flipped_assignment: apply && failures.length === 0 && flipAssignment,
      total: results.length,
      failed: failures.length,
      results,
    };
  } finally {
    db.close();
  }
}

function readLocalEtherpadApiKey() {
  const candidates = [
    path.join(process.cwd(), 'src', 'etherpad', 'APIKEY.txt'),
    path.join(process.cwd(), 'src', 'etherpad', 'APIKEY'),
    '/opt/etherpad-lite/APIKEY.txt',
    '/opt/etherpad-lite/APIKEY',
    '/opt/inkheron-platform/src/etherpad/APIKEY.txt',
  ];
  for (const candidate of candidates) {
    try {
      const value = fs.readFileSync(candidate, 'utf8').trim();
      if (value) return value;
    } catch (_) {}
  }
  return '';
}

function parseArgs(argv) {
  const args = {
    assignmentId: null,
    apply: false,
    overwrite: false,
    flipAssignment: true,
    databasePath: process.env.INKHERON_DB_PATH ?? defaultDatabasePath(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--assignment-id' || arg === '-a') {
      args.assignmentId = Number(argv[++index]);
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--overwrite') {
      args.overwrite = true;
    } else if (arg === '--no-flip') {
      args.flipAssignment = false;
    } else if (arg === '--db') {
      args.databasePath = argv[++index];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/import-etherpad-to-native.mjs --assignment-id 10
  node scripts/import-etherpad-to-native.mjs --assignment-id 10 --apply

Options:
  --assignment-id, -a  Assignment ID to import
  --apply             Write native pads and flip the assignment to Native InkPad
  --overwrite         Replace existing non-empty native pad content
  --no-flip           Do not set assignment settings.native_inkpad=true after import
  --db                SQLite database path, defaults to INKHERON_DB_PATH or data/inkheron.db

Dry-run is the default. Etherpad pads are never deleted or modified.`);
}

function printSummary(summary) {
  console.log(JSON.stringify({
    assignment_id: summary.assignment_id,
    assignment_title: summary.assignment_title,
    mode: summary.mode,
    overwrite: summary.overwrite,
    flipped_assignment: summary.flipped_assignment,
    total: summary.total,
    failed: summary.failed,
  }, null, 2));

  for (const result of summary.results) {
    if (result.ok) {
      console.log([
        result.action,
        `student=${result.student}`,
        `source_words=${result.source_words}`,
        `target_words=${result.target_words}`,
        `native_pad_id=${result.native_pad_id ?? 'none'}`,
        `preview="${result.preview}"`,
      ].join(' | '));
    } else {
      console.log([
        'error',
        `student=${result.student}`,
        `pad_id=${result.pad_id}`,
        `etherpad_pad_id=${result.etherpad_pad_id}`,
        result.error,
      ].join(' | '));
    }
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    const summary = await importEtherpadAssignment(args);
    printSummary(summary);
    process.exit(summary.failed ? 1 : 0);
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exit(1);
  }
}
