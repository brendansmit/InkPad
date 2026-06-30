import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderNativeWriteView } from '../views/nativeWrite.js';

const __filename = fileURLToPath(import.meta.url);
const __routesDir = path.dirname(__filename);
const PASSAGES_DIR = path.join(__routesDir, '..', '..', 'data', 'passages');
const EMPTY_DOC = '{"type":"doc","content":[]}';
const MAX_PLAIN_TEXT_LENGTH = 200000;
const MAX_DOCUMENT_JSON_LENGTH = 1000000;

function requirePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`${field} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function parseSettings(settingsJson) {
  try {
    return JSON.parse(settingsJson ?? '{}');
  } catch (_) {
    return {};
  }
}

function nativeEnabled(assignment) {
  return parseSettings(assignment.settings_json).native_inkpad === true;
}

function countWords(text) {
  const normalized = String(text ?? '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function normalizeDocumentJson(value) {
  const fallback = { type: 'doc', content: [] };
  const doc = value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  const json = JSON.stringify(doc);
  if (json.length > MAX_DOCUMENT_JSON_LENGTH) {
    const error = new Error('document_too_large');
    error.statusCode = 413;
    throw error;
  }
  return json;
}

function normalizePlainText(value) {
  const text = typeof value === 'string' ? value : '';
  if (text.length > MAX_PLAIN_TEXT_LENGTH) {
    const error = new Error('plain_text_too_large');
    error.statusCode = 413;
    throw error;
  }
  return text;
}

function publicNativePad(row) {
  return {
    id: row.id,
    assignment_id: row.assignment_id,
    student_id: row.student_id,
    state: row.state,
    document: JSON.parse(row.document_json || EMPTY_DOC),
    plain_text: row.plain_text ?? '',
    word_count: Number(row.word_count ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at ?? null,
  };
}

async function resolveNativeAssignmentAndStudent(db, assignmentId, studentId) {
  const assignment = db.prepare(
    'SELECT id, class_id, title, type, settings_json, opens_at, due_at FROM assignments WHERE id = ?'
  ).get(assignmentId);
  if (!assignment) {
    const error = new Error('assignment_not_found');
    error.statusCode = 404;
    throw error;
  }
  if (!nativeEnabled(assignment)) {
    const error = new Error('native_inkpad_not_enabled');
    error.statusCode = 404;
    throw error;
  }

  const student = db.prepare('SELECT id, display_name, class_id FROM students WHERE id = ?').get(studentId);
  if (!student) {
    const error = new Error('forbidden');
    error.statusCode = 403;
    throw error;
  }

  const overrideCount = db.prepare(
    'SELECT COUNT(*) AS n FROM assignment_students WHERE assignment_id = ?'
  ).get(assignmentId).n;
  const allowed = overrideCount > 0
    ? !!db.prepare('SELECT 1 FROM assignment_students WHERE assignment_id = ? AND student_id = ?').get(assignmentId, studentId)
    : student.class_id === assignment.class_id;
  if (!allowed) {
    const error = new Error('forbidden');
    error.statusCode = 403;
    throw error;
  }

  return { assignment, student, settings: parseSettings(assignment.settings_json) };
}

function insertRevision(db, padId, reason, row) {
  db.prepare(`
    INSERT INTO native_pad_revisions (native_pad_id, reason, document_json, plain_text, word_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(padId, reason, row.document_json, row.plain_text ?? '', Number(row.word_count ?? 0));
}

function provisionNativePad(db, { assignment, student }) {
  let pad = db.prepare(
    'SELECT * FROM native_pads WHERE student_id = ? AND assignment_id = ?'
  ).get(student.id, assignment.id);
  if (pad) return pad;

  const result = db.prepare(`
    INSERT INTO native_pads (student_id, assignment_id, document_json, plain_text, word_count)
    VALUES (?, ?, ?, '', 0)
  `).run(student.id, assignment.id, EMPTY_DOC);
  pad = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(result.lastInsertRowid);
  insertRevision(db, pad.id, 'create', pad);
  return pad;
}

function applyDueDateLock(db, pad, assignment) {
  const now = new Date().toISOString();
  if (!assignment.due_at || assignment.due_at > now) return false;
  if (pad.state !== 'writing') return false;
  db.prepare("UPDATE native_pads SET state = 'submitted', submitted_at = COALESCE(submitted_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(pad.id);
  pad.state = 'submitted';
  pad.submitted_at = pad.submitted_at ?? now;
  return true;
}

function loadOwnedNativePad(db, padId, studentId) {
  return db.prepare('SELECT * FROM native_pads WHERE id = ? AND student_id = ?').get(padId, studentId);
}

export async function registerNativePadRoutes(app, { db }) {
  app.get('/api/native/assignments/:id/pad',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.id, 'id');
      const studentId = request.session.user.id;
      const { assignment, student } = await resolveNativeAssignmentAndStudent(db, assignmentId, studentId);

      const now = new Date().toISOString();
      if (assignment.opens_at && assignment.opens_at > now) {
        return reply.code(403).send({ error: 'not_open_yet' });
      }

      const pad = provisionNativePad(db, { assignment, student });
      applyDueDateLock(db, pad, assignment);

      return { pad: publicNativePad(pad) };
    }
  );

  app.post('/api/native/pads/:padId/save',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const studentId = request.session.user.id;
      const pad = loadOwnedNativePad(db, padId, studentId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (pad.state !== 'writing' && pad.state !== 'green_pen_open') {
        return reply.code(409).send({ error: 'pad_locked' });
      }

      const documentJson = normalizeDocumentJson(request.body?.document);
      const plainText = normalizePlainText(request.body?.plain_text);
      const wordCount = countWords(plainText);

      db.prepare(`
        UPDATE native_pads
        SET document_json = ?, plain_text = ?, word_count = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(documentJson, plainText, wordCount, padId);

      const updated = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
      insertRevision(db, padId, 'autosave', updated);
      return { pad: publicNativePad(updated) };
    }
  );

  app.post('/api/native/pads/:padId/submit',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const studentId = request.session.user.id;
      const pad = loadOwnedNativePad(db, padId, studentId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (pad.state !== 'writing') return reply.code(409).send({ error: 'already_submitted' });

      db.prepare(`
        UPDATE native_pads
        SET state = 'submitted', submitted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(padId);
      const updated = db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
      insertRevision(db, padId, 'submit', updated);
      return reply.code(201).send({ pad: publicNativePad(updated), locked: true });
    }
  );

  app.get('/api/native/pads/:padId/revisions',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = db.prepare('SELECT id FROM native_pads WHERE id = ?').get(padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const revisions = db.prepare(`
        SELECT id, reason, plain_text, word_count, created_at
        FROM native_pad_revisions
        WHERE native_pad_id = ?
        ORDER BY id ASC
      `).all(padId);
      return { revisions };
    }
  );

  app.get('/native/write/:assignmentId',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const studentId = request.session.user.id;
      const { assignment, student, settings } = await resolveNativeAssignmentAndStudent(db, assignmentId, studentId);

      const now = new Date().toISOString();
      if (assignment.opens_at && assignment.opens_at > now) {
        return reply.code(403).send({ error: 'not_open_yet' });
      }

      const pad = provisionNativePad(db, { assignment, student });
      applyDueDateLock(db, pad, assignment);

      let passagePdf = false;
      try {
        await fs.promises.access(path.join(PASSAGES_DIR, `${assignmentId}.pdf`));
        passagePdf = true;
      } catch (_) {}

      return reply.type('text/html').send(renderNativeWriteView({
        title: assignment.title,
        assignmentId,
        pad: publicNativePad(pad),
        csrfToken: request.session.csrfToken ?? '',
        dueAt: assignment.due_at,
        spellcheck: settings.spellcheck !== false,
        prompt: settings.prompt || '',
        passageText: settings.passage_text || '',
        passagePdf,
      }));
    }
  );
}
