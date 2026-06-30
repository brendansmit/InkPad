import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderNativeWriteView } from '../views/nativeWrite.js';

const __filename = fileURLToPath(import.meta.url);
const __routesDir = path.dirname(__filename);
const PASSAGES_DIR = path.join(__routesDir, '..', '..', 'data', 'passages');
const EMPTY_DOC = '{"type":"doc","content":[]}';
const EMPTY_META = '{}';
const MAX_PLAIN_TEXT_LENGTH = 200000;
const MAX_DOCUMENT_JSON_LENGTH = 1000000;
const MAX_COMMENT_LENGTH = 8000;
const ANNOTATION_TYPES = new Set(['general_comment', 'inline_comment', 'literacy_code', 'highlight']);
const PASTE_MODES = new Set(['allow', 'log', 'block']);

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

function normalizeComment(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > MAX_COMMENT_LENGTH) {
    const error = new Error('comment_too_large');
    error.statusCode = 413;
    throw error;
  }
  return text;
}

function normalizeMetadata(value) {
  const metadata = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return JSON.stringify(metadata);
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
    version: Number(row.version ?? 1),
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at ?? null,
  };
}

function publicPolicy(row) {
  return {
    paste_mode: row.paste_mode,
    spellcheck_enabled: row.spellcheck_enabled === 1,
    updated_at: row.updated_at,
    updated_by_teacher_id: row.updated_by_teacher_id ?? null,
  };
}

function publicAnnotation(row) {
  return {
    id: row.id,
    native_pad_id: row.native_pad_id,
    teacher_id: row.teacher_id ?? null,
    type: row.type,
    start_offset: row.start_offset ?? null,
    end_offset: row.end_offset ?? null,
    selected_text: row.selected_text ?? '',
    body: row.body ?? '',
    metadata: JSON.parse(row.metadata_json || EMPTY_META),
    resolved: row.resolved === 1,
    document_version: Number(row.document_version ?? 1),
    created_at: row.created_at,
    updated_at: row.updated_at,
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
    INSERT INTO native_pad_revisions (native_pad_id, reason, document_json, plain_text, word_count, document_version)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(padId, reason, row.document_json, row.plain_text ?? '', Number(row.word_count ?? 0), Number(row.version ?? 1));
}

function ensurePolicy(db, padId, settings = {}, teacherId = null) {
  const existing = db.prepare('SELECT * FROM native_pad_policies WHERE native_pad_id = ?').get(padId);
  if (existing) return existing;
  const pasteMode = settings.paste_detection === false ? 'allow' : 'log';
  const spellcheck = settings.spellcheck === false ? 0 : 1;
  db.prepare(`
    INSERT INTO native_pad_policies (native_pad_id, paste_mode, spellcheck_enabled, updated_by_teacher_id)
    VALUES (?, ?, ?, ?)
  `).run(padId, pasteMode, spellcheck, teacherId);
  return db.prepare('SELECT * FROM native_pad_policies WHERE native_pad_id = ?').get(padId);
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
  ensurePolicy(db, pad.id, parseSettings(assignment.settings_json));
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

function loadTeacherNativePad(db, padId) {
  return db.prepare(`
    SELECT np.*,
           s.display_name AS student_name,
           s.username AS student_username,
           a.title AS assignment_title,
           a.type AS assignment_type,
           a.settings_json,
           a.due_at,
           c.id AS class_id,
           c.name AS class_name
    FROM native_pads np
    JOIN students s ON s.id = np.student_id
    JOIN assignments a ON a.id = np.assignment_id
    JOIN classes c ON c.id = a.class_id
    WHERE np.id = ?
  `).get(padId);
}

function logTeacherEvent(db, padId, teacherId, action, metadata = {}) {
  db.prepare(`
    INSERT INTO native_teacher_events (native_pad_id, teacher_id, action, metadata_json)
    VALUES (?, ?, ?, ?)
  `).run(padId, teacherId, action, normalizeMetadata(metadata));
}

function normalizeAnnotationInput(body, pad) {
  const type = String(body?.type ?? '');
  if (!ANNOTATION_TYPES.has(type)) {
    const error = new Error('invalid_annotation_type');
    error.statusCode = 400;
    throw error;
  }

  const start = body?.start_offset === null || body?.start_offset === undefined ? null : Number(body.start_offset);
  const end = body?.end_offset === null || body?.end_offset === undefined ? null : Number(body.end_offset);
  if (type !== 'general_comment' && (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start)) {
    const error = new Error('invalid_annotation_range');
    error.statusCode = 400;
    throw error;
  }
  return {
    type,
    start: type === 'general_comment' ? null : start,
    end: type === 'general_comment' ? null : end,
    selectedText: normalizePlainText(body?.selected_text).slice(0, 2000),
    body: normalizeComment(body?.body),
    metadataJson: normalizeMetadata(body?.metadata),
    documentVersion: Number.isInteger(Number(body?.document_version)) ? Number(body.document_version) : Number(pad.version ?? 1),
  };
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
      const policy = ensurePolicy(db, pad.id, parseSettings(assignment.settings_json));

      return { pad: publicNativePad(pad), policy: publicPolicy(policy) };
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
      const expectedVersion = request.body?.expected_version === undefined ? null : Number(request.body.expected_version);
      if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion !== Number(pad.version ?? 1))) {
        return reply.code(409).send({ error: 'version_conflict', pad: publicNativePad(pad) });
      }

      const documentJson = normalizeDocumentJson(request.body?.document);
      const plainText = normalizePlainText(request.body?.plain_text);
      const wordCount = countWords(plainText);

      db.prepare(`
        UPDATE native_pads
        SET document_json = ?, plain_text = ?, word_count = ?, version = version + 1, updated_at = datetime('now')
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
        SELECT id, reason, plain_text, word_count, document_version, created_at
        FROM native_pad_revisions
        WHERE native_pad_id = ?
        ORDER BY id ASC
      `).all(padId);
      return { revisions };
    }
  );

  app.get('/api/native/pads/:padId/policy',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadOwnedNativePad(db, padId, request.session.user.id);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const policy = ensurePolicy(db, padId);
      return { policy: publicPolicy(policy) };
    }
  );

  app.put('/api/native/pads/:padId/policy',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const pasteMode = String(request.body?.paste_mode ?? '');
      if (!PASTE_MODES.has(pasteMode)) return reply.code(400).send({ error: 'invalid_paste_mode' });
      const spellcheck = request.body?.spellcheck_enabled === false ? 0 : 1;
      ensurePolicy(db, padId, parseSettings(pad.settings_json), request.session.user.id);
      db.prepare(`
        UPDATE native_pad_policies
        SET paste_mode = ?, spellcheck_enabled = ?, updated_by_teacher_id = ?, updated_at = datetime('now')
        WHERE native_pad_id = ?
      `).run(pasteMode, spellcheck, request.session.user.id, padId);
      logTeacherEvent(db, padId, request.session.user.id, 'policy_changed', { paste_mode: pasteMode, spellcheck_enabled: spellcheck === 1 });
      const policy = db.prepare('SELECT * FROM native_pad_policies WHERE native_pad_id = ?').get(padId);
      return { policy: publicPolicy(policy) };
    }
  );

  app.post('/api/native/pads/:padId/paste-event',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadOwnedNativePad(db, padId, request.session.user.id);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const length = Number(request.body?.length);
      if (!Number.isFinite(length) || length < 1) return reply.code(400).send({ error: 'length_required' });
      const inputType = typeof request.body?.input_type === 'string' ? request.body.input_type : 'paste';
      db.prepare(`
        INSERT INTO native_paste_events (native_pad_id, length, input_type)
        VALUES (?, ?, ?)
      `).run(padId, Math.round(length), inputType);
      return reply.code(201).send({ ok: true });
    }
  );

  app.get('/api/native/pads/:padId/review',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const policy = ensurePolicy(db, padId, parseSettings(pad.settings_json));
      const annotations = db.prepare(`
        SELECT *
        FROM native_annotations
        WHERE native_pad_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(padId).map(publicAnnotation);
      const pasteEvents = db.prepare(`
        SELECT id, at, length, input_type
        FROM native_paste_events
        WHERE native_pad_id = ?
        ORDER BY at ASC, id ASC
      `).all(padId);
      const revisions = db.prepare(`
        SELECT id, reason, plain_text, word_count, document_version, created_at
        FROM native_pad_revisions
        WHERE native_pad_id = ?
        ORDER BY id ASC
      `).all(padId);
      return {
        pad: publicNativePad(pad),
        assignment: {
          id: pad.assignment_id,
          title: pad.assignment_title,
          type: pad.assignment_type,
          due_at: pad.due_at ?? null,
        },
        class: { id: pad.class_id, name: pad.class_name },
        student: { id: pad.student_id, display_name: pad.student_name, username: pad.student_username },
        policy: publicPolicy(policy),
        annotations,
        paste_events: pasteEvents,
        revisions,
      };
    }
  );

  app.post('/api/native/pads/:padId/annotations',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const annotation = normalizeAnnotationInput(request.body, pad);
      const result = db.prepare(`
        INSERT INTO native_annotations (
          native_pad_id, teacher_id, type, start_offset, end_offset, selected_text, body, metadata_json, document_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        padId,
        request.session.user.id,
        annotation.type,
        annotation.start,
        annotation.end,
        annotation.selectedText,
        annotation.body,
        annotation.metadataJson,
        annotation.documentVersion
      );
      logTeacherEvent(db, padId, request.session.user.id, 'annotation_created', { type: annotation.type });
      const row = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(result.lastInsertRowid);
      return reply.code(201).send({ annotation: publicAnnotation(row) });
    }
  );

  app.patch('/api/native/annotations/:annotationId',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const annotationId = requirePositiveInteger(request.params.annotationId, 'annotationId');
      const existing = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(annotationId);
      if (!existing) return reply.code(404).send({ error: 'annotation_not_found' });
      const body = request.body?.body !== undefined ? normalizeComment(request.body.body) : existing.body;
      const resolved = request.body?.resolved !== undefined ? (request.body.resolved ? 1 : 0) : existing.resolved;
      const metadataJson = request.body?.metadata !== undefined ? normalizeMetadata(request.body.metadata) : existing.metadata_json;
      db.prepare(`
        UPDATE native_annotations
        SET body = ?, resolved = ?, metadata_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(body, resolved, metadataJson, annotationId);
      logTeacherEvent(db, existing.native_pad_id, request.session.user.id, 'annotation_updated', { annotation_id: annotationId });
      const row = db.prepare('SELECT * FROM native_annotations WHERE id = ?').get(annotationId);
      return { annotation: publicAnnotation(row) };
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
      const policy = ensurePolicy(db, pad.id, settings);

      let passagePdf = false;
      try {
        await fs.promises.access(path.join(PASSAGES_DIR, `${assignmentId}.pdf`));
        passagePdf = true;
      } catch (_) {}

      return reply.type('text/html').send(renderNativeWriteView({
        title: assignment.title,
        assignmentId,
        pad: publicNativePad(pad),
        policy: publicPolicy(policy),
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
