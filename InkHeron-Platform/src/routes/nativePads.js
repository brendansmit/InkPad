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
const MAX_RUBRIC_LABEL_LENGTH = 120;
const MAX_RUBRIC_DESCRIPTION_LENGTH = 1200;
const ANNOTATION_TYPES = new Set(['general_comment', 'inline_comment', 'literacy_code', 'highlight']);
const PASTE_MODES = new Set(['allow', 'log', 'block']);
const DEFAULT_RUBRIC = [
  { label: 'Thesis', description: 'Clear central idea and control of argument.', weight: 1 },
  { label: 'Evidence', description: 'Relevant examples, quotations or details.', weight: 1 },
  { label: 'Commentary', description: 'Explanation of how evidence supports the idea.', weight: 1 },
  { label: 'Organisation', description: 'Logical sequencing, paragraphing and transitions.', weight: 1 },
  { label: 'Language control', description: 'Sentence control, grammar and word choice.', weight: 1 },
];

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

function normalizeRubricText(value, maxLength, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : fallback;
  return text.slice(0, maxLength);
}

function normalizeHalfScore(value, field) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || !Number.isInteger(score * 2)) {
    const error = new Error(`${field}_must_be_half_step_score`);
    error.statusCode = 400;
    throw error;
  }
  return score;
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

function publicRubricScore(row) {
  return {
    criterion_id: row.criterion_id,
    selected_score: Number(row.selected_score),
    note: row.note ?? '',
    updated_by_teacher_id: row.updated_by_teacher_id ?? null,
    updated_at: row.updated_at,
  };
}

function loadAssignmentRubric(db, assignmentId) {
  const criteria = db.prepare(`
    SELECT *
    FROM assignment_rubric_criteria
    WHERE assignment_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(assignmentId);
  if (!criteria.length) return { criteria: [] };

  const bandRows = db.prepare(`
    SELECT b.*
    FROM assignment_rubric_bands b
    JOIN assignment_rubric_criteria c ON c.id = b.criterion_id
    WHERE c.assignment_id = ?
    ORDER BY b.sort_order ASC, b.score_value ASC, b.id ASC
  `).all(assignmentId);
  const bandsByCriterion = new Map();
  for (const band of bandRows) {
    const list = bandsByCriterion.get(band.criterion_id) ?? [];
    list.push({
      id: band.id,
      score_value: Number(band.score_value),
      label: band.label ?? '',
      descriptor: band.descriptor ?? '',
    });
    bandsByCriterion.set(band.criterion_id, list);
  }

  return {
    criteria: criteria.map((criterion) => ({
      id: criterion.id,
      assignment_id: criterion.assignment_id,
      label: criterion.label,
      description: criterion.description ?? '',
      weight: Number(criterion.weight ?? 1),
      sort_order: Number(criterion.sort_order ?? 0),
      bands: bandsByCriterion.get(criterion.id) ?? [],
    })),
  };
}

function loadRubricScores(db, padId) {
  return db.prepare(`
    SELECT *
    FROM native_rubric_scores
    WHERE native_pad_id = ?
    ORDER BY criterion_id ASC
  `).all(padId).map(publicRubricScore);
}

function normalizeRubricCriteria(body) {
  const source = Array.isArray(body?.criteria) && body.criteria.length ? body.criteria : DEFAULT_RUBRIC;
  if (source.length > 20) {
    const error = new Error('too_many_rubric_criteria');
    error.statusCode = 400;
    throw error;
  }

  return source.map((item, index) => {
    const label = normalizeRubricText(item?.label, MAX_RUBRIC_LABEL_LENGTH, DEFAULT_RUBRIC[index]?.label || `Criterion ${index + 1}`);
    if (!label) {
      const error = new Error('rubric_label_required');
      error.statusCode = 400;
      throw error;
    }
    const weight = Number(item?.weight ?? 1);
    if (!Number.isFinite(weight) || weight <= 0) {
      const error = new Error('invalid_rubric_weight');
      error.statusCode = 400;
      throw error;
    }
    const bands = Array.isArray(item?.bands) && item.bands.length
      ? item.bands
      : [0, 1, 2, 3, 4, 5].map((score) => ({ score_value: score, label: String(score), descriptor: '' }));
    return {
      label,
      description: normalizeRubricText(item?.description, MAX_RUBRIC_DESCRIPTION_LENGTH),
      weight,
      sortOrder: Number.isInteger(Number(item?.sort_order)) ? Number(item.sort_order) : index,
      bands: bands.slice(0, 20).map((band, bandIndex) => ({
        scoreValue: normalizeHalfScore(band?.score_value ?? band?.score ?? bandIndex, 'rubric_band_score'),
        label: normalizeRubricText(band?.label, MAX_RUBRIC_LABEL_LENGTH, String(band?.score_value ?? band?.score ?? bandIndex)),
        descriptor: normalizeRubricText(band?.descriptor, MAX_RUBRIC_DESCRIPTION_LENGTH),
        sortOrder: Number.isInteger(Number(band?.sort_order)) ? Number(band.sort_order) : bandIndex,
      })),
    };
  });
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

  app.put('/api/native/assignments/:assignmentId/rubric',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = db.prepare('SELECT id, settings_json FROM assignments WHERE id = ?').get(assignmentId);
      if (!assignment || !nativeEnabled(assignment)) return reply.code(404).send({ error: 'assignment_not_found' });
      const criteria = normalizeRubricCriteria(request.body);

      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM assignment_rubric_criteria WHERE assignment_id = ?').run(assignmentId);
        const insertCriterion = db.prepare(`
          INSERT INTO assignment_rubric_criteria (assignment_id, label, description, weight, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `);
        const insertBand = db.prepare(`
          INSERT INTO assignment_rubric_bands (criterion_id, score_value, label, descriptor, sort_order)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const criterion of criteria) {
          const result = insertCriterion.run(assignmentId, criterion.label, criterion.description, criterion.weight, criterion.sortOrder);
          for (const band of criterion.bands) {
            insertBand.run(result.lastInsertRowid, band.scoreValue, band.label, band.descriptor, band.sortOrder);
          }
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return { rubric: loadAssignmentRubric(db, assignmentId) };
    }
  );

  app.put('/api/native/pads/:padId/rubric-scores',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = loadTeacherNativePad(db, padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      const rubric = loadAssignmentRubric(db, pad.assignment_id);
      const allowedCriteria = new Set(rubric.criteria.map((criterion) => criterion.id));
      if (!allowedCriteria.size) return reply.code(409).send({ error: 'rubric_not_configured' });
      const scores = Array.isArray(request.body?.scores) ? request.body.scores : [];
      if (!scores.length) return reply.code(400).send({ error: 'scores_required' });

      const upsert = db.prepare(`
        INSERT INTO native_rubric_scores (native_pad_id, criterion_id, selected_score, note, updated_by_teacher_id, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(native_pad_id, criterion_id) DO UPDATE SET
          selected_score = excluded.selected_score,
          note = excluded.note,
          updated_by_teacher_id = excluded.updated_by_teacher_id,
          updated_at = datetime('now')
      `);
      for (const item of scores) {
        const criterionId = requirePositiveInteger(item?.criterion_id, 'criterion_id');
        if (!allowedCriteria.has(criterionId)) return reply.code(400).send({ error: 'invalid_criterion_id' });
        const selectedScore = normalizeHalfScore(item?.selected_score, 'selected_score');
        const note = normalizeComment(item?.note);
        upsert.run(padId, criterionId, selectedScore, note, request.session.user.id);
      }
      logTeacherEvent(db, padId, request.session.user.id, 'rubric_scores_saved', { count: scores.length });
      return { scores: loadRubricScores(db, padId) };
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
      const rubric = loadAssignmentRubric(db, pad.assignment_id);
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
        rubric: {
          criteria: rubric.criteria,
          scores: loadRubricScores(db, padId),
        },
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
