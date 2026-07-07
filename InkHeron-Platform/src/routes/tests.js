import path from 'node:path';
import { realStudentsWhere } from '../db/realStudents.js';
import { extractDocxText, extractPdfText } from '../feedback/assets.js';
import { callChat } from '../services/openRouter.js';
import { readDoerIntent } from '../services/settingsStore.js';
import { parseJsonArraySalvage } from '../services/literacyCoder.js';

const QUESTION_KINDS = new Set(['mcq', 'srq', 'frq']);
const FOCUS_KINDS = new Set(['blur', 'focus']);
const TEST_SECTION_KINDS = new Set(['mcq', 'srq', 'frq']);
const ACTIVITY_EVENTS = new Set([
  'rules_acknowledged',
  'fullscreen_enter',
  'fullscreen_exit',
  'visibility_hidden',
  'visibility_visible',
  'window_blur',
  'window_focus',
  'copy_attempt',
  'paste_attempt',
  'context_menu_attempt',
  'question_focus',
  'question_time',
  'answer_input',
  'idle_timeout',
  'flag_review',
  'unflag_review',
  'manual_submit_prompt',
  'autosubmit_warning',
]);
const WARNING_EVENTS = new Set([
  'fullscreen_exit',
  'visibility_hidden',
  'window_blur',
  'copy_attempt',
  'paste_attempt',
  'context_menu_attempt',
  'idle_timeout',
]);
const TIMER_GRACE_SECONDS = 30;
const MAX_BULK_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function parseDbDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = /[zZ]$|[+-]\d\d:?\d\d$/.test(text)
    ? new Date(text)
    : new Date(text.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

function requirePositiveInteger(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`${field} must be a positive integer`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value ?? '');
  } catch (_) {
    return fallback;
  }
}

function extractJsonArray(raw) {
  const text = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
  const start = text.indexOf('[');
  if (start < 0) return [];
  const end = text.lastIndexOf(']');
  const slice = end > start ? text.slice(start, end + 1) : text.slice(start);
  return parseJsonArraySalvage(slice) ?? [];
}

function parseSettings(row) {
  return parseJson(row?.settings_json, {});
}

function normalizePoints(value) {
  const points = Number(value ?? 1);
  if (!Number.isFinite(points) || points < 0 || !Number.isInteger(points * 2)) {
    const err = new Error('points_must_be_half_step_score');
    err.statusCode = 400;
    throw err;
  }
  return points;
}

function normalizeTags(value, fallback = []) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === 'string' && value.trim() ? value.split(',') : fallback);
  const tags = [];
  const seen = new Set();
  for (const item of raw) {
    const tag = String(item ?? '').trim().slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 10) break;
  }
  return tags;
}

function cleanImportText(value, limit = 50000) {
  return String(value ?? '').trim().slice(0, limit);
}

function normalizeConfidence(value, fallback = '') {
  const text = String(value ?? fallback ?? '').trim().toLowerCase();
  if (['high', 'medium', 'low', 'uncertain'].includes(text)) return text;
  return fallback;
}

function sourceExcerptFor(rawText, promptText) {
  const source = cleanImportText(rawText, 50000);
  if (!source) return '';
  const prompt = String(promptText ?? '').trim();
  const needle = prompt.slice(0, Math.min(40, prompt.length)).toLowerCase();
  const lower = source.toLowerCase();
  const index = needle ? lower.indexOf(needle) : -1;
  if (index >= 0) return source.slice(Math.max(0, index - 180), Math.min(source.length, index + 520)).trim();
  return source.slice(0, 700).trim();
}

function questionFingerprint(promptText, optionsJson) {
  const prompt = String(promptText ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const options = parseJson(optionsJson, [])
    .map((option) => String(option ?? '').toLowerCase().replace(/\s+/g, ' ').trim());
  return JSON.stringify({ prompt, options });
}

function findDuplicateQuestionId(db, item) {
  const fingerprint = questionFingerprint(item.promptText, item.optionsJson);
  const rows = db.prepare(`
    SELECT id, prompt_text, options_json
    FROM test_questions
    WHERE kind = 'mcq' AND is_archived = 0
    ORDER BY id
  `).all();
  const match = rows.find((row) => questionFingerprint(row.prompt_text, row.options_json) === fingerprint);
  return match?.id ?? null;
}

function normalizeQuestionInput(body, existing = {}) {
  const kind = String(body?.kind ?? existing.kind ?? '').trim();
  if (!QUESTION_KINDS.has(kind)) {
    const err = new Error('invalid_question_kind');
    err.statusCode = 400;
    throw err;
  }
  const promptText = String(body?.prompt_text ?? existing.prompt_text ?? '').trim();
  if (!promptText) {
    const err = new Error('prompt_text_required');
    err.statusCode = 400;
    throw err;
  }

  let options = null;
  let answerIndex = null;
  let modelAnswer = null;
  if (kind === 'mcq') {
    options = Array.isArray(body?.options)
      ? body.options.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 8)
      : parseJson(existing.options_json, []);
    if (!Array.isArray(options) || options.length < 2) {
      const err = new Error('mcq_needs_options');
      err.statusCode = 400;
      throw err;
    }
    answerIndex = Number(body?.answer_index ?? existing.answer_index);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
      const err = new Error('invalid_answer_index');
      err.statusCode = 400;
      throw err;
    }
  } else if (kind === 'srq') {
    modelAnswer = String(body?.model_answer ?? existing.model_answer ?? '').trim() || null;
  }

  const existingTags = normalizeTags(parseJson(existing.tags_json, []), existing.tag ? [existing.tag] : []);
  const tagFallback = body?.tag ? [body.tag] : existingTags;
  const tags = normalizeTags(body?.tags, tagFallback);

  return {
    kind,
    promptText,
    optionsJson: options ? JSON.stringify(options) : null,
    answerIndex,
    modelAnswer,
    points: normalizePoints(body?.points ?? existing.points ?? 1),
    topic: String(body?.topic ?? existing.topic ?? '').trim().slice(0, 80),
    tags,
    tagsJson: JSON.stringify(tags),
    tag: tags[0] ?? '',
  };
}

function normalizeBulkMcqItem(item, index = 0, sourceText = '', defaults = {}) {
  const promptText = String(item?.prompt_text ?? item?.prompt ?? '').trim();
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => String(option ?? '').trim()).filter(Boolean).slice(0, 8)
    : [];
  if (!promptText || options.length < 2) {
    const err = new Error(`invalid_bulk_question_${index + 1}`);
    err.statusCode = 400;
    throw err;
  }
  const rawAnswer = item?.answer_index;
  const answerIndex = rawAnswer === null || rawAnswer === undefined || rawAnswer === ''
    ? null
    : (Number.isInteger(Number(rawAnswer)) ? Number(rawAnswer) : null);
  return {
    kind: 'mcq',
    promptText,
    optionsJson: JSON.stringify(options),
    answerIndex: answerIndex !== null && answerIndex >= 0 && answerIndex < options.length ? answerIndex : null,
    modelAnswer: null,
    points: normalizePoints(item?.points ?? 1),
    topic: String(item?.topic ?? '').trim().slice(0, 80),
    tags: normalizeTags(item?.tags, []),
    answerSource: cleanImportText(item?.answer_source ?? item?.answer_source_label ?? defaults.answerSource, 120),
    importConfidence: normalizeConfidence(item?.confidence ?? item?.import_confidence, defaults.importConfidence),
    sourceExcerpt: cleanImportText(item?.source_excerpt ?? '', 1000) || sourceExcerptFor(sourceText, promptText),
  };
}

function teacherQuestion(row) {
  const parsedTags = normalizeTags(parseJson(row.tags_json, []), []);
  const tags = parsedTags.length ? parsedTags : normalizeTags(row.tag ? [row.tag] : [], []);
  if (row.tag && !tags.some((tag) => tag.toLowerCase() === String(row.tag).toLowerCase())) {
    tags.unshift(String(row.tag).trim().slice(0, 40));
  }
  return {
    id: row.id,
    kind: row.kind,
    prompt_text: row.prompt_text,
    options: parseJson(row.options_json, []),
    answer_index: row.answer_index ?? null,
    model_answer: row.model_answer ?? null,
    points: Number(row.points ?? 0),
    tag: row.tag ?? '',
    topic: row.topic ?? '',
    tags,
    origin_assignment_id: row.origin_assignment_id ?? null,
    answer_source: row.answer_source ?? '',
    import_confidence: row.import_confidence ?? '',
    source_excerpt: row.import_source_excerpt ?? '',
    has_source: Boolean(row.import_source_text),
    duplicate_of_question_id: row.duplicate_of_question_id ?? null,
    is_archived: row.is_archived === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function studentQuestion(row, studentId) {
  const base = {
    id: row.id,
    kind: row.kind,
    prompt_text: row.prompt_text,
    points: Number(row.points ?? 0),
    tag: row.tag ?? '',
  };
  if (row.kind === 'mcq') {
    base.options = shuffledOptions(row, studentId).map((item) => ({
      index: item.index,
      text: item.text,
    }));
  }
  return base;
}

function loadQuestion(db, id) {
  return db.prepare('SELECT * FROM test_questions WHERE id = ?').get(id);
}

function loadTestAssignment(db, assignmentId) {
  return db.prepare('SELECT * FROM assignments WHERE id = ? AND type = ? AND is_archived = 0')
    .get(assignmentId, 'test');
}

function ensureTeacherTestAssignment(db, assignmentId) {
  const assignment = loadTestAssignment(db, assignmentId);
  if (!assignment) {
    const err = new Error('test_assignment_not_found');
    err.statusCode = 404;
    throw err;
  }
  return assignment;
}

function loadStudentTestAssignment(db, assignmentId, studentId) {
  return db.prepare(`
    SELECT a.*
    FROM assignments a
    JOIN students s ON s.id = ?
    WHERE a.id = ? AND a.type = 'test' AND a.is_archived = 0
      AND (
        (NOT EXISTS (SELECT 1 FROM assignment_students ast WHERE ast.assignment_id = a.id)
          AND a.class_id = s.class_id)
        OR EXISTS (
          SELECT 1 FROM assignment_students ast
          WHERE ast.assignment_id = a.id AND ast.student_id = s.id
        )
      )
  `).get(studentId, assignmentId);
}

function ensureStudentTestAssignment(db, assignmentId, studentId) {
  const assignment = loadStudentTestAssignment(db, assignmentId, studentId);
  if (!assignment) {
    const err = new Error('test_assignment_not_found');
    err.statusCode = 404;
    throw err;
  }
  const now = nowIso();
  if (assignment.opens_at && assignment.opens_at > now) {
    const err = new Error('not_open_yet');
    err.statusCode = 403;
    throw err;
  }
  return assignment;
}

function testConfig(assignment) {
  const settings = parseSettings(assignment);
  const test = settings.test && typeof settings.test === 'object' ? settings.test : {};
  return {
    sections: Array.isArray(test.sections) ? test.sections : [],
    timer_minutes: Number.isFinite(Number(test.timer_minutes ?? settings.timer_minutes))
      ? Number(test.timer_minutes ?? settings.timer_minutes)
      : null,
    shuffle: test.shuffle ?? settings.shuffle ?? true,
    focus_warning: test.focus_warning ?? settings.focus_warning ?? true,
    reveal_answers: test.reveal_answers === true,
  };
}

function normalizeSections(db, sections) {
  const output = [];
  let frqCount = 0;
  for (const raw of Array.isArray(sections) ? sections : []) {
    const kind = String(raw?.kind ?? '').trim();
    if (!TEST_SECTION_KINDS.has(kind)) {
      const err = new Error('invalid_section_kind');
      err.statusCode = 400;
      throw err;
    }
    const ids = Array.isArray(raw.question_ids)
      ? raw.question_ids.map((id) => requirePositiveInteger(id, 'question_id'))
      : [];
    if (kind === 'frq') {
      frqCount += 1;
      if (frqCount > 1 || ids.length > 1) {
        const err = new Error('only_one_frq_question');
        err.statusCode = 400;
        throw err;
      }
    }
    for (const id of ids) {
      const question = loadQuestion(db, id);
      if (!question || question.kind !== kind || question.is_archived === 1) {
        const err = new Error('section_question_invalid');
        err.statusCode = 400;
        throw err;
      }
    }
    output.push({
      kind,
      title: String(raw?.title ?? kind.toUpperCase()).trim().slice(0, 120),
      passage_text: String(raw?.passage_text ?? '').trim().slice(0, 30000),
      shuffle: raw?.shuffle !== false,
      question_ids: ids,
    });
  }
  if (!output.length) {
    const err = new Error('sections_required');
    err.statusCode = 400;
    throw err;
  }
  return output;
}

function buildTestSettings(body) {
  const timer = Number(body?.timer_minutes);
  const timerMinutes = Number.isFinite(timer) && timer > 0 ? Math.floor(timer) : null;
  const shuffle = body?.shuffle !== false;
  const focusWarning = body?.focus_warning !== false;
  return {
    type: 'test',
    submit_behaviour: 'exam',
    spellcheck: true,
    word_count: true,
    paste_detection: true,
    paste_mode: 'log',
    green_pen: body?.green_pen === true,
    native_inkpad: true,
    essay_type: String(body?.essay_type ?? 'synthesis').trim() || 'synthesis',
    supervision: 'in_class',
    feedback_release: 'batch',
    shuffle,
    pooling: 'off',
    focus_warning: focusWarning,
    timer_minutes: timerMinutes,
    test: {
      sections: body.sections,
      timer_minutes: timerMinutes,
      shuffle,
      focus_warning: focusWarning,
      reveal_answers: body?.reveal_answers === true,
    },
  };
}

function updateAssignmentSections(db, assignment, sections) {
  const settings = parseSettings(assignment);
  settings.test = settings.test && typeof settings.test === 'object' ? settings.test : {};
  settings.test.sections = normalizeSections(db, sections);
  db.prepare('UPDATE assignments SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), assignment.id);
  return settings.test.sections;
}

function appendQuestionIdsToAssignment(db, assignmentId, questionIds, sectionIndex = null) {
  if (!questionIds.length) return { added: 0, sections: [] };
  const assignment = ensureTeacherTestAssignment(db, assignmentId);
  const sections = testConfig(assignment).sections.map((section) => ({
    ...section,
    question_ids: [...(section.question_ids ?? [])],
  }));
  const questions = questionIds.map((id) => {
    const question = loadQuestion(db, id);
    if (!question || question.is_archived === 1) {
      const err = new Error('question_not_found');
      err.statusCode = 404;
      throw err;
    }
    return question;
  });
  const kindSet = new Set(questions.map((question) => question.kind));
  if (kindSet.size !== 1) {
    const err = new Error('mixed_question_kinds_need_section');
    err.statusCode = 400;
    throw err;
  }
  const kind = questions[0].kind;
  let targetIndex = sectionIndex === null || sectionIndex === undefined || sectionIndex === ''
    ? sections.findIndex((section) => section.kind === kind)
    : Number(sectionIndex);
  if (!Number.isInteger(targetIndex) || targetIndex < 0) {
    const err = new Error('invalid_section_index');
    err.statusCode = 400;
    throw err;
  }
  if (targetIndex >= sections.length) {
    if (sectionIndex !== null && sectionIndex !== undefined && sectionIndex !== '') {
      const err = new Error('invalid_section_index');
      err.statusCode = 400;
      throw err;
    }
    sections.push({ kind, title: kind.toUpperCase(), passage_text: '', question_ids: [] });
    targetIndex = sections.length - 1;
  }
  const target = sections[targetIndex];
  if (target.kind !== kind) {
    const err = new Error('section_kind_mismatch');
    err.statusCode = 400;
    throw err;
  }
  const existing = new Set(target.question_ids ?? []);
  let added = 0;
  for (const id of questionIds) {
    if (existing.has(id)) continue;
    target.question_ids.push(id);
    existing.add(id);
    added += 1;
  }
  const normalized = updateAssignmentSections(db, assignment, sections);
  return { added, sections: normalized };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => String(item).trim()));
}

function csvHeaderMap(row) {
  return new Map(row.map((cell, index) => [String(cell ?? '').trim().toLowerCase(), index]));
}

function isStructuredCsv(text) {
  const [header] = parseCsv(text);
  if (!header) return false;
  const map = csvHeaderMap(header);
  return map.has('prompt') && map.has('optiona') && map.has('optionb') && map.has('answer');
}

function csvValue(row, headers, name) {
  const index = headers.get(name.toLowerCase());
  return index === undefined ? '' : String(row[index] ?? '').trim();
}

function parseAnswer(value, optionCount) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const letter = text.match(/^[A-H]$/i);
  if (letter) return letter[0].toUpperCase().charCodeAt(0) - 65;
  const number = Number(text);
  if (Number.isInteger(number)) return number - 1;
  const parsed = Number.parseInt(text, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= optionCount ? parsed - 1 : null;
}

function parseStructuredCsvQuestions(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = csvHeaderMap(rows[0]);
  return rows.slice(1).map((row, index) => {
    const options = ['optiona', 'optionb', 'optionc', 'optiond', 'optione', 'optionf', 'optiong', 'optionh']
      .map((name) => csvValue(row, headers, name))
      .filter(Boolean);
    const answerIndex = parseAnswer(csvValue(row, headers, 'answer'), options.length);
    return normalizeBulkMcqItem({
      prompt_text: csvValue(row, headers, 'prompt'),
      options,
      answer_index: answerIndex,
      points: csvValue(row, headers, 'points') || 1,
      topic: csvValue(row, headers, 'topic'),
      tags: normalizeTags(csvValue(row, headers, 'tags').split(/[;,]/), []),
      answer_source: csvValue(row, headers, 'answer') ? 'CSV answer column' : '',
      confidence: csvValue(row, headers, 'answer') ? 'high' : 'uncertain',
      source_excerpt: row.map((cell) => String(cell ?? '')).join(', '),
    }, index, text, { answerSource: 'CSV answer column', importConfidence: answerIndex === null ? 'uncertain' : 'high' });
  });
}

async function parseLooseMcqQuestions(db, text, description, chat) {
  const result = await chat(db, {
    intent: readDoerIntent(db),
    messages: [
      {
        role: 'system',
        content: `You convert a teacher's raw multiple-choice questions into structured JSON. Return ONLY a JSON array. Each item: { prompt_text, options: [..2-8..], answer_index (0-based; null if the correct answer is not marked), topic (2-4 word subject label), tags (1-4 short labels), answer_source, confidence, source_excerpt }. For answer_source, use labels like "answer detected from final key", "answer detected from explicit line", "answer detected from bold", "answer detected from underline", "answer detected from highlight", "answer detected from circle" or "answer uncertain". confidence must be high, medium, low or uncertain. Never invent a correct answer. Infer topic and tags from the question content and this teacher description: ${String(description ?? '')}`,
      },
      { role: 'user', content: String(text ?? '').slice(0, 50000) },
    ],
    maxTokens: 8000,
    temperature: 0.1,
  });
  return extractJsonArray(result?.choices?.[0]?.message?.content ?? '')
    .map((item, index) => normalizeBulkMcqItem(item, index, text, {
      answerSource: item?.answer_index === null || item?.answer_index === undefined ? 'answer uncertain' : 'answer detected by AI',
      importConfidence: item?.answer_index === null || item?.answer_index === undefined ? 'uncertain' : 'medium',
    }));
}

async function readBulkImportRequest(request) {
  if (!request.isMultipart()) {
    return {
      fields: request.body ?? {},
      text: String(request.body?.raw_text ?? '').trim(),
      filename: '',
      fileKind: '',
    };
  }
  const fields = {};
  let file = null;
  for await (const part of request.parts()) {
    if (part.file) {
      const chunks = [];
      let size = 0;
      for await (const chunk of part.file) {
        size += chunk.length;
        if (size > MAX_BULK_IMPORT_FILE_BYTES) {
          part.file.resume();
          const err = new Error('file_too_large');
          err.statusCode = 413;
          throw err;
        }
        chunks.push(chunk);
      }
      file = {
        filename: part.filename || '',
        mimeType: part.mimetype || '',
        buffer: Buffer.concat(chunks),
      };
    } else {
      fields[part.fieldname] = part.value;
    }
  }
  if (!file) {
    return { fields, text: String(fields.raw_text ?? '').trim(), filename: '', fileKind: '' };
  }
  const ext = path.extname(file.filename).toLowerCase();
  if (ext === '.csv') {
    return { fields, text: file.buffer.toString('utf8').replace(/^\uFEFF/, '').trim(), filename: file.filename, fileKind: 'csv' };
  }
  if (ext === '.txt' || /^text\//.test(file.mimeType)) {
    return { fields, text: file.buffer.toString('utf8').replace(/^\uFEFF/, '').trim(), filename: file.filename, fileKind: 'txt' };
  }
  if (ext === '.docx' || file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return { fields, text: extractDocxText(file.buffer), filename: file.filename, fileKind: 'docx' };
  }
  if (ext === '.pdf' || file.mimeType === 'application/pdf') {
    return { fields, text: await extractPdfText(file.buffer), filename: file.filename, fileKind: 'pdf' };
  }
  const err = new Error('unsupported_file_type');
  err.statusCode = 400;
  throw err;
}

function insertOrGetAttempt(db, assignment, studentId) {
  const config = testConfig(assignment);
  const secondsAllowed = config.timer_minutes ? config.timer_minutes * 60 : null;
  db.prepare(`
    INSERT OR IGNORE INTO test_attempts (assignment_id, student_id, seconds_allowed)
    VALUES (?, ?, ?)
  `).run(assignment.id, studentId, secondsAllowed);
  return db.prepare('SELECT * FROM test_attempts WHERE assignment_id = ? AND student_id = ?')
    .get(assignment.id, studentId);
}

function loadAttempt(db, assignmentId, studentId) {
  return db.prepare('SELECT * FROM test_attempts WHERE assignment_id = ? AND student_id = ?')
    .get(assignmentId, studentId);
}

function loadAttemptById(db, attemptId) {
  return db.prepare(`
    SELECT ta.*, a.type AS assignment_type
    FROM test_attempts ta
    JOIN assignments a ON a.id = ta.assignment_id
    WHERE ta.id = ? AND a.type = 'test'
  `).get(attemptId);
}

function loadAssignmentControl(db, assignmentId) {
  return db.prepare('SELECT * FROM test_assignment_controls WHERE assignment_id = ?').get(assignmentId) ?? {
    assignment_id: assignmentId,
    paused_at: null,
    pause_total_seconds: 0,
  };
}

function timerDateForControl(control, date = new Date()) {
  const paused = parseDbDate(control?.paused_at);
  return paused ?? date;
}

function timerPauseSeconds(control) {
  return Number(control?.pause_total_seconds ?? 0);
}

function rawSecondsRemaining(db, assignment, attempt, date = new Date()) {
  if (!attempt?.seconds_allowed) return null;
  const started = parseDbDate(attempt.started_at);
  if (!started) return null;
  const control = loadAssignmentControl(db, assignment.id);
  const effectiveNow = timerDateForControl(control, date);
  const allowed = Number(attempt.seconds_allowed)
    + Number(attempt.extra_seconds ?? 0)
    + timerPauseSeconds(control);
  const due = new Date(started.getTime() + allowed * 1000);
  return Math.ceil((due.getTime() - effectiveNow.getTime()) / 1000);
}

function secondsRemaining(db, assignment, attempt, date = new Date()) {
  const seconds = rawSecondsRemaining(db, assignment, attempt, date);
  return seconds === null ? null : Math.max(0, seconds);
}

function canWriteAttempt(db, assignment, attempt, date = new Date()) {
  if (!attempt || attempt.submitted_at) return false;
  const dueAt = parseDbDate(assignment.due_at);
  if (dueAt && dueAt.getTime() < date.getTime()) return false;
  const unlockedUntil = parseDbDate(attempt.unlocked_until);
  if (unlockedUntil && unlockedUntil.getTime() >= date.getTime()) return true;
  if (!attempt.seconds_allowed) return true;
  const started = parseDbDate(attempt.started_at);
  if (!started) return false;
  const seconds = rawSecondsRemaining(db, assignment, attempt, date);
  return seconds !== null && seconds >= -TIMER_GRACE_SECONDS;
}

function requireWritableAttempt(db, assignment, attempt) {
  if (!canWriteAttempt(db, assignment, attempt)) {
    const err = new Error('attempt_locked');
    err.statusCode = 409;
    throw err;
  }
}

function questionIdsForAssignment(db, assignment, kind = null) {
  const ids = [];
  for (const section of testConfig(assignment).sections) {
    if (kind && section.kind !== kind) continue;
    for (const id of section.question_ids ?? []) ids.push(id);
  }
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM test_questions WHERE id IN (${placeholders})`).all(...ids)
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

function responseMap(db, attemptId) {
  const rows = db.prepare('SELECT * FROM test_responses WHERE attempt_id = ?').all(attemptId);
  return new Map(rows.map((row) => [row.question_id, row]));
}

function shuffledOptions(question, studentId) {
  const options = parseJson(question.options_json, []).map((text, index) => ({ index, text }));
  let seed = ((Number(studentId) * 7919) + Number(question.id)) >>> 0;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

function shuffledSectionQuestions(section, studentId, sectionIndex, shuffle) {
  const questions = [...(section.question_ids ?? [])];
  if (!shuffle || section.kind === 'frq' || questions.length <= 1) return questions;
  let seed = ((Number(studentId) * 104729) + Number(sectionIndex)) >>> 0;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let i = questions.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return questions;
}

function publicAttempt(db, assignment, attempt) {
  const control = loadAssignmentControl(db, assignment.id);
  return {
    id: attempt.id,
    assignment_id: attempt.assignment_id,
    started_at: attempt.started_at,
    submitted_at: attempt.submitted_at ?? null,
    rules_acknowledged_at: attempt.rules_acknowledged_at ?? null,
    last_activity_at: attempt.last_activity_at ?? null,
    seconds_allowed: attempt.seconds_allowed ?? null,
    extra_seconds: Number(attempt.extra_seconds ?? 0),
    seconds_remaining: secondsRemaining(db, assignment, attempt),
    paused: Boolean(control.paused_at),
    unlocked_until: attempt.unlocked_until ?? null,
    sound_disabled: attempt.sound_disabled === 1,
    pulse_disabled: attempt.pulse_disabled === 1,
  };
}

function studentTestPayload(db, assignment, studentId, attempt) {
  const config = testConfig(assignment);
  const responses = attempt ? responseMap(db, attempt.id) : new Map();
  const sections = config.sections.map((section, sectionIndex) => ({
    kind: section.kind,
    title: section.title,
    passage_text: section.passage_text ?? '',
    shuffle: section.shuffle !== false,
    questions: shuffledSectionQuestions(section, studentId, sectionIndex, section.shuffle !== false && config.shuffle !== false).map((questionId) => {
      const question = loadQuestion(db, questionId);
      const response = responses.get(questionId);
      return {
        ...studentQuestion(question, studentId),
        response: response ? parseJson(response.answer_json, null) : null,
      };
    }),
  }));
  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      due_at: assignment.due_at ?? null,
      feedback_released_at: assignment.feedback_released_at ?? null,
    },
    attempt: attempt ? publicAttempt(db, assignment, attempt) : null,
    submitted: Boolean(attempt?.submitted_at),
    results_released: Boolean(assignment.feedback_released_at),
    timer_minutes: config.timer_minutes,
    focus_warning: config.focus_warning,
    sections,
  };
}

function scoreMcqResponses(db, assignment, attemptId) {
  const mcqs = questionIdsForAssignment(db, assignment, 'mcq');
  const selectResponse = db.prepare('SELECT * FROM test_responses WHERE attempt_id = ? AND question_id = ?');
  const upsert = db.prepare(`
    INSERT INTO test_responses (attempt_id, question_id, answer_json, is_correct, points_awarded, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(attempt_id, question_id) DO UPDATE SET
      is_correct = excluded.is_correct,
      points_awarded = excluded.points_awarded,
      updated_at = datetime('now')
  `);
  for (const question of mcqs) {
    const response = selectResponse.get(attemptId, question.id);
    const answer = parseJson(response?.answer_json, null);
    const chosen = Number(answer?.chosen_index);
    const isCorrect = Number.isInteger(chosen) && chosen === Number(question.answer_index);
    upsert.run(
      attemptId,
      question.id,
      response?.answer_json ?? JSON.stringify({ chosen_index: null }),
      isCorrect ? 1 : 0,
      isCorrect ? Number(question.points ?? 0) : 0
    );
  }
}

async function submitFrqPad(app, db, assignment, request) {
  const hasFrq = testConfig(assignment).sections.some((section) => section.kind === 'frq' && section.question_ids.length);
  if (!hasFrq) return null;
  const getPad = await app.inject({
    method: 'GET',
    url: `/api/native/assignments/${assignment.id}/pad`,
    headers: { cookie: request.headers.cookie ?? '' },
  });
  if (getPad.statusCode !== 200) return null;
  const padId = getPad.json().pad.id;
  const submit = await app.inject({
    method: 'POST',
    url: `/api/native/pads/${padId}/submit`,
    headers: {
      cookie: request.headers.cookie ?? '',
      'X-CSRF-Token': request.session.csrfToken ?? '',
    },
  });
  if (submit.statusCode === 201 || submit.statusCode === 409) {
    return db.prepare('SELECT * FROM native_pads WHERE id = ?').get(padId);
  }
  return null;
}

function responseTotals(db, attemptId, kind) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(COALESCE(r.points_awarded, 0)), 0) AS earned,
           COALESCE(SUM(q.points), 0) AS possible
    FROM test_questions q
    JOIN test_responses r ON r.question_id = q.id AND r.attempt_id = ?
    WHERE q.kind = ?
  `).get(attemptId, kind);
  return { earned: Number(row?.earned ?? 0), possible: Number(row?.possible ?? 0) };
}

function rubricTotalForPad(db, padId) {
  if (!padId) return 0;
  const row = db.prepare(`
    SELECT COALESCE(SUM(selected_score), 0) AS total
    FROM native_rubric_scores
    WHERE native_pad_id = ?
  `).get(padId);
  return Number(row?.total ?? 0);
}

function releaseGatedResults(db, assignment, attempt, studentId) {
  if (!attempt?.submitted_at) {
    const err = new Error('attempt_not_submitted');
    err.statusCode = 403;
    throw err;
  }
  if (!assignment.feedback_released_at) {
    const err = new Error('results_not_released');
    err.statusCode = 403;
    throw err;
  }
  const config = testConfig(assignment);
  const responses = responseMap(db, attempt.id);
  let totalEarned = 0;
  let totalPossible = 0;
  const sections = config.sections.map((section) => {
    let earned = 0;
    let possible = 0;
    const questions = section.question_ids.map((questionId) => {
      const question = loadQuestion(db, questionId);
      const response = responses.get(questionId);
      const pointsAwarded = Number(response?.points_awarded ?? 0);
      earned += pointsAwarded;
      possible += Number(question.points ?? 0);
      const item = {
        id: question.id,
        kind: question.kind,
        points: Number(question.points ?? 0),
        points_awarded: pointsAwarded,
        answer: response ? parseJson(response.answer_json, null) : null,
      };
      if (question.kind === 'mcq') {
        item.is_correct = response?.is_correct === 1;
        if (config.reveal_answers) item.correct_index = question.answer_index;
      }
      return item;
    });
    totalEarned += earned;
    totalPossible += possible;
    return { kind: section.kind, title: section.title, passage_text: section.passage_text ?? '', earned, possible, questions };
  });
  const pad = db.prepare('SELECT id FROM native_pads WHERE assignment_id = ? AND student_id = ?')
    .get(assignment.id, studentId);
  const frqRubricTotal = rubricTotalForPad(db, pad?.id);
  return {
    assignment: { id: assignment.id, title: assignment.title },
    sections,
    total: {
      earned: totalEarned + frqRubricTotal,
      possible: totalPossible,
      frq_rubric: frqRubricTotal,
    },
  };
}

function loadReviewRows(db, assignment) {
  const roster = db.prepare(`
    SELECT DISTINCT s.id, s.display_name, s.username
    FROM students s
    WHERE ${realStudentsWhere('s')}
      AND (
        (s.class_id = ? AND NOT EXISTS (
          SELECT 1 FROM assignment_students ast WHERE ast.assignment_id = ?
        ))
        OR EXISTS (
          SELECT 1 FROM assignment_students ast
          WHERE ast.assignment_id = ? AND ast.student_id = s.id
        )
      )
    ORDER BY s.display_name COLLATE NOCASE
  `).all(assignment.class_id, assignment.id, assignment.id);
  const questions = questionIdsForAssignment(db, assignment);
  const questionById = new Map(questions.map((q) => [q.id, q]));
  return roster.map((student) => {
    const attempt = loadAttempt(db, assignment.id, student.id);
    const responses = attempt ? db.prepare(`
      SELECT r.*, q.kind, q.prompt_text, q.points, q.model_answer, q.answer_index, q.options_json
      FROM test_responses r
      JOIN test_questions q ON q.id = r.question_id
      WHERE r.attempt_id = ?
      ORDER BY q.id
    `).all(attempt.id) : [];
    const byKind = { mcq: responseTotals(db, attempt?.id ?? 0, 'mcq'), srq: responseTotals(db, attempt?.id ?? 0, 'srq') };
    const pad = db.prepare('SELECT id FROM native_pads WHERE assignment_id = ? AND student_id = ?')
      .get(assignment.id, student.id);
    const frqRubricTotal = rubricTotalForPad(db, pad?.id);
    return {
      student,
      attempt: attempt ? publicAttempt(db, assignment, attempt) : null,
      totals: {
        mcq: byKind.mcq.earned,
        mcq_possible: questions.filter((q) => q.kind === 'mcq').reduce((sum, q) => sum + Number(q.points ?? 0), 0),
        srq: byKind.srq.earned,
        srq_possible: questions.filter((q) => q.kind === 'srq').reduce((sum, q) => sum + Number(q.points ?? 0), 0),
        frq_rubric: frqRubricTotal,
        total: byKind.mcq.earned + byKind.srq.earned + frqRubricTotal,
      },
      responses: responses.map((row) => ({
        id: row.id,
        question_id: row.question_id,
        kind: row.kind,
        prompt_text: row.prompt_text,
        answer: parseJson(row.answer_json, null),
        is_correct: row.is_correct ?? null,
        points: Number(row.points ?? 0),
        points_awarded: row.points_awarded === null ? null : Number(row.points_awarded),
        model_answer: row.model_answer ?? null,
        answer_index: row.answer_index ?? null,
        options: parseJson(row.options_json, []),
      })),
      frq: {
        pad_id: pad?.id ?? null,
        review_url: pad?.id ? `/teacher/native-review?pad_id=${pad.id}` : null,
        question: questions.find((q) => q.kind === 'frq') ? teacherQuestion(questionById.get(questions.find((q) => q.kind === 'frq').id)) : null,
      },
    };
  });
}

function normalizeActivityMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  return JSON.stringify(value).slice(0, 4000);
}

function recordActivityEvent(db, attempt, eventType, body = {}) {
  if (!ACTIVITY_EVENTS.has(eventType)) {
    const err = new Error('invalid_activity_event');
    err.statusCode = 400;
    throw err;
  }
  const questionId = body?.question_id === undefined || body?.question_id === null || body?.question_id === ''
    ? null
    : requirePositiveInteger(body.question_id, 'question_id');
  const sectionIndex = body?.section_index === undefined || body?.section_index === null || body?.section_index === ''
    ? null
    : Number(body.section_index);
  if (sectionIndex !== null && (!Number.isInteger(sectionIndex) || sectionIndex < 0)) {
    const err = new Error('invalid_section_index');
    err.statusCode = 400;
    throw err;
  }
  const result = db.prepare(`
    INSERT INTO test_activity_events
      (attempt_id, assignment_id, student_id, question_id, section_index, event_type, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    attempt.id,
    attempt.assignment_id,
    attempt.student_id,
    questionId,
    sectionIndex,
    eventType,
    normalizeActivityMetadata(body?.metadata)
  );
  db.prepare('UPDATE test_attempts SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?').run(attempt.id);
  return db.prepare('SELECT * FROM test_activity_events WHERE id = ?').get(result.lastInsertRowid);
}

function warningWhere() {
  return WARNING_EVENTS.size ? `event_type IN (${[...WARNING_EVENTS].map(() => '?').join(',')})` : '0';
}

function liveMonitorRows(db, assignment) {
  const reviewRows = loadReviewRows(db, assignment);
  const warningSql = warningWhere();
  const latestEvent = db.prepare(`
    SELECT * FROM test_activity_events
    WHERE attempt_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `);
  const latestQuestion = db.prepare(`
    SELECT e.question_id, q.prompt_text
    FROM test_activity_events e
    LEFT JOIN test_questions q ON q.id = e.question_id
    WHERE e.attempt_id = ? AND e.event_type = 'question_focus' AND e.question_id IS NOT NULL
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `);
  const warningCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM test_activity_events
    WHERE attempt_id = ? AND excused_at IS NULL AND ${warningSql}
  `);
  const excusedCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM test_activity_events
    WHERE attempt_id = ? AND excused_at IS NOT NULL AND ${warningSql}
  `);
  const latestWarning = db.prepare(`
    SELECT * FROM test_activity_events
    WHERE attempt_id = ? AND excused_at IS NULL AND ${warningSql}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `);
  const answerCount = db.prepare('SELECT COUNT(*) AS count FROM test_responses WHERE attempt_id = ?');
  return reviewRows.map((row) => {
    const attempt = row.attempt ? db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(row.attempt.id) : null;
    const latest = attempt ? latestEvent.get(attempt.id) : null;
    const current = attempt ? latestQuestion.get(attempt.id) : null;
    const warningParams = attempt ? [attempt.id, ...WARNING_EVENTS] : [];
    const warning = attempt ? latestWarning.get(...warningParams) : null;
    return {
      student: row.student,
      attempt: attempt ? publicAttempt(db, assignment, attempt) : null,
      status: !attempt ? 'not_started' : (attempt.submitted_at ? 'submitted' : 'in_progress'),
      current_question: current ? {
        id: current.question_id,
        prompt_text: current.prompt_text ?? '',
      } : null,
      answered_count: attempt ? Number(answerCount.get(attempt.id)?.count ?? 0) : 0,
      warning_count: attempt ? Number(warningCount.get(...warningParams)?.count ?? 0) : 0,
      excused_warning_count: attempt ? Number(excusedCount.get(...warningParams)?.count ?? 0) : 0,
      latest_event: latest ? {
        id: latest.id,
        event_type: latest.event_type,
        question_id: latest.question_id ?? null,
        section_index: latest.section_index ?? null,
        created_at: latest.created_at,
      } : null,
      latest_warning: warning ? {
        id: warning.id,
        event_type: warning.event_type,
        question_id: warning.question_id ?? null,
        section_index: warning.section_index ?? null,
        created_at: warning.created_at,
      } : null,
    };
  });
}

function teacherId(request) {
  return request.session?.user?.id ?? null;
}

export async function registerTestRoutes(app, { db, chat = callChat }) {
  app.get('/api/tests/questions',
    { preValidation: [app.requireTeacherSession] },
    async (request) => {
      const kind = QUESTION_KINDS.has(request.query.kind) ? request.query.kind : null;
      const tag = String(request.query.tag ?? '').trim();
      const topic = String(request.query.topic ?? '').trim();
      const search = String(request.query.q ?? '').trim();
      const archived = request.query.archived === '1' ? 1 : 0;
      const clauses = ['is_archived = ?'];
      const params = [archived];
      const inAssignment = request.query.in_assignment
        ? ensureTeacherTestAssignment(db, requirePositiveInteger(request.query.in_assignment, 'in_assignment'))
        : null;
      if (inAssignment) {
        const ids = [];
        for (const section of testConfig(inAssignment).sections) {
          for (const id of section.question_ids ?? []) ids.push(id);
        }
        if (!ids.length) return { questions: [] };
        clauses.push(`id IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      }
      if (kind) {
        clauses.push('kind = ?');
        params.push(kind);
      }
      if (tag) {
        clauses.push('tag = ?');
        params.push(tag);
      }
      if (topic) {
        clauses.push('LOWER(topic) = LOWER(?)');
        params.push(topic);
      }
      if (search) {
        clauses.push('prompt_text LIKE ? COLLATE NOCASE');
        params.push(`%${search}%`);
      }
      const rows = db.prepare(`
        SELECT * FROM test_questions
        WHERE ${clauses.join(' AND ')}
        ORDER BY updated_at DESC, id DESC
      `).all(...params);
      return { questions: rows.map(teacherQuestion) };
    }
  );

  app.get('/api/tests/topics',
    { preValidation: [app.requireTeacherSession] },
    async () => {
      const rows = db.prepare(`
        SELECT DISTINCT topic
        FROM test_questions
        WHERE is_archived = 0 AND topic != ''
        ORDER BY topic COLLATE NOCASE
      `).all();
      return { topics: rows.map((row) => row.topic) };
    }
  );

  app.post('/api/tests/questions',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const q = normalizeQuestionInput(request.body);
      const result = db.prepare(`
        INSERT INTO test_questions
          (kind, prompt_text, options_json, answer_index, model_answer, points, tag, topic, tags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(q.kind, q.promptText, q.optionsJson, q.answerIndex, q.modelAnswer, q.points, q.tag, q.topic, q.tagsJson);
      return reply.code(201).send({ question: teacherQuestion(loadQuestion(db, result.lastInsertRowid)) });
    }
  );

  app.put('/api/tests/questions/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const existing = loadQuestion(db, id);
      if (!existing) return reply.code(404).send({ error: 'question_not_found' });
      const q = normalizeQuestionInput(request.body, existing);
      db.prepare(`
        UPDATE test_questions
        SET kind = ?, prompt_text = ?, options_json = ?, answer_index = ?,
            model_answer = ?, points = ?, tag = ?, topic = ?, tags_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(q.kind, q.promptText, q.optionsJson, q.answerIndex, q.modelAnswer, q.points, q.tag, q.topic, q.tagsJson, id);
      return { question: teacherQuestion(loadQuestion(db, id)) };
    }
  );

  app.post('/api/tests/questions/:id/archive',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const existing = loadQuestion(db, id);
      if (!existing) return reply.code(404).send({ error: 'question_not_found' });
      const next = existing.is_archived === 1 ? 0 : 1;
      db.prepare('UPDATE test_questions SET is_archived = ?, updated_at = datetime(\'now\') WHERE id = ?').run(next, id);
      return { is_archived: next === 1 };
    }
  );

  app.get('/api/tests/questions/:id/source',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const question = loadQuestion(db, id);
      if (!question) return reply.code(404).send({ error: 'question_not_found' });
      return {
        question_id: question.id,
        prompt_text: question.prompt_text,
        answer_source: question.answer_source ?? '',
        import_confidence: question.import_confidence ?? '',
        source_excerpt: question.import_source_excerpt ?? '',
        source_text: question.import_source_text ?? '',
        duplicate_of_question_id: question.duplicate_of_question_id ?? null,
      };
    }
  );

  app.post('/api/tests/questions/bulk-import',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const input = await readBulkImportRequest(request);
      const rawText = input.text;
      if (!rawText) return reply.code(400).send({ error: 'raw_text_or_file_required' });
      const kind = String(input.fields?.kind ?? 'mcq').trim();
      if (kind !== 'mcq') return reply.code(400).send({ error: 'only_mcq_bulk_import_supported' });
      const assignmentId = input.fields?.assignment_id ? requirePositiveInteger(input.fields.assignment_id, 'assignment_id') : null;
      const sectionIndex = input.fields?.section_index === undefined || input.fields?.section_index === ''
        ? null
        : Number(input.fields.section_index);
      if (sectionIndex !== null && (!Number.isInteger(sectionIndex) || sectionIndex < 0)) {
        return reply.code(400).send({ error: 'invalid_section_index' });
      }
      const description = String(input.fields?.description ?? '');
      const warnings = [];
      const parsed = input.fileKind === 'csv' || isStructuredCsv(rawText)
        ? parseStructuredCsvQuestions(rawText)
        : await parseLooseMcqQuestions(db, rawText, description, chat);
      if (!parsed.length) return reply.code(400).send({ error: 'no_questions_found' });

      const createdIds = [];
      db.exec('BEGIN');
      try {
        const insert = db.prepare(`
          INSERT INTO test_questions
            (kind, prompt_text, options_json, answer_index, model_answer, points, tag, topic, tags_json,
             origin_assignment_id, import_source_text, import_source_excerpt, answer_source, import_confidence,
             duplicate_of_question_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of parsed) {
          const tagsJson = JSON.stringify(item.tags);
          const duplicateId = findDuplicateQuestionId(db, item);
          const confidence = item.answerIndex === null
            ? 'uncertain'
            : normalizeConfidence(item.importConfidence, input.fileKind === 'csv' ? 'high' : 'medium');
          const answerSource = item.answerSource || (item.answerIndex === null ? 'answer uncertain' : (input.fileKind === 'csv' ? 'CSV answer column' : 'answer detected by AI'));
          const result = insert.run(
            'mcq',
            item.promptText,
            item.optionsJson,
            item.answerIndex,
            null,
            item.points,
            item.tags[0] ?? '',
            item.topic,
            tagsJson,
            assignmentId,
            cleanImportText(rawText, 50000),
            item.sourceExcerpt,
            answerSource,
            confidence,
            duplicateId
          );
          if (duplicateId) warnings.push(`Question ${result.lastInsertRowid} may duplicate question ${duplicateId}.`);
          createdIds.push(result.lastInsertRowid);
        }
        let addedToQuiz = 0;
        if (assignmentId) {
          addedToQuiz = appendQuestionIdsToAssignment(db, assignmentId, createdIds, sectionIndex).added;
        }
        db.exec('COMMIT');
        const created = createdIds.map((id) => teacherQuestion(loadQuestion(db, id)));
        return reply.code(201).send({
          created,
          added_to_quiz: addedToQuiz,
          needs_answer: created.filter((question) => question.answer_index === null).map((question) => question.id),
          warnings,
        });
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  );

  app.post('/api/tests/assignments/:id/append-questions',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const assignmentId = requirePositiveInteger(request.params.id, 'id');
      const questionIds = Array.isArray(request.body?.question_ids)
        ? request.body.question_ids.map((id) => requirePositiveInteger(id, 'question_id'))
        : [];
      if (!questionIds.length) {
        const err = new Error('question_ids_required');
        err.statusCode = 400;
        throw err;
      }
      const sectionIndex = request.body?.section_index === undefined || request.body?.section_index === ''
        ? null
        : Number(request.body.section_index);
      db.exec('BEGIN');
      try {
        const result = appendQuestionIdsToAssignment(db, assignmentId, questionIds, sectionIndex);
        db.exec('COMMIT');
        const assignment = ensureTeacherTestAssignment(db, assignmentId);
        return { added: result.added, sections: result.sections, assignment };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  );

  app.post('/api/tests/assignments',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const classId = requirePositiveInteger(request.body?.class_id, 'class_id');
      const title = String(request.body?.title ?? '').trim();
      if (!title) return reply.code(400).send({ error: 'title_required' });
      const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
      if (!cls) return reply.code(404).send({ error: 'class_not_found' });
      const sections = normalizeSections(db, request.body?.sections);
      const settings = buildTestSettings({ ...request.body, sections });
      const result = db.prepare(`
        INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
        VALUES (?, ?, 'test', ?, ?, ?)
      `).run(classId, title, JSON.stringify(settings), request.body?.opens_at ?? null, request.body?.due_at ?? null);
      const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(result.lastInsertRowid);
      return reply.code(201).send({ assignment });
    }
  );

  app.get('/api/tests/:assignmentId/review',
    { preValidation: [app.requireTeacherSession] },
    async (request) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureTeacherTestAssignment(db, assignmentId);
      return {
        assignment,
        sections: testConfig(assignment).sections,
        rows: loadReviewRows(db, assignment),
      };
    }
  );

  app.get('/api/tests/:assignmentId/live',
    { preValidation: [app.requireTeacherSession] },
    async (request) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureTeacherTestAssignment(db, assignmentId);
      const control = loadAssignmentControl(db, assignment.id);
      return {
        assignment,
        control: {
          paused: Boolean(control.paused_at),
          paused_at: control.paused_at ?? null,
          pause_total_seconds: Number(control.pause_total_seconds ?? 0),
        },
        generated_at: nowIso(),
        rows: liveMonitorRows(db, assignment),
      };
    }
  );

  app.post('/api/tests/:assignmentId/pause',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureTeacherTestAssignment(db, assignmentId);
      db.prepare(`
        INSERT INTO test_assignment_controls (assignment_id, paused_at, updated_by_teacher_id)
        VALUES (?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(assignment_id) DO UPDATE SET
          paused_at = COALESCE(test_assignment_controls.paused_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP,
          updated_by_teacher_id = excluded.updated_by_teacher_id
      `).run(assignment.id, teacherId(request));
      return { control: loadAssignmentControl(db, assignment.id) };
    }
  );

  app.post('/api/tests/:assignmentId/resume',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureTeacherTestAssignment(db, assignmentId);
      const control = loadAssignmentControl(db, assignment.id);
      const pausedAt = parseDbDate(control.paused_at);
      const additional = pausedAt ? Math.max(0, Math.ceil((Date.now() - pausedAt.getTime()) / 1000)) : 0;
      db.prepare(`
        INSERT INTO test_assignment_controls
          (assignment_id, paused_at, pause_total_seconds, updated_by_teacher_id)
        VALUES (?, NULL, ?, ?)
        ON CONFLICT(assignment_id) DO UPDATE SET
          paused_at = NULL,
          pause_total_seconds = test_assignment_controls.pause_total_seconds + ?,
          updated_at = CURRENT_TIMESTAMP,
          updated_by_teacher_id = excluded.updated_by_teacher_id
      `).run(assignment.id, additional, teacherId(request), additional);
      return { control: loadAssignmentControl(db, assignment.id) };
    }
  );

  app.post('/api/tests/attempts/:attemptId/add-time',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const attemptId = requirePositiveInteger(request.params.attemptId, 'attemptId');
      const minutes = Number(request.body?.minutes ?? 0);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        const err = new Error('minutes_required');
        err.statusCode = 400;
        throw err;
      }
      const attempt = loadAttemptById(db, attemptId);
      if (!attempt) {
        const err = new Error('attempt_not_found');
        err.statusCode = 404;
        throw err;
      }
      db.prepare('UPDATE test_attempts SET extra_seconds = extra_seconds + ? WHERE id = ?')
        .run(Math.ceil(minutes * 60), attempt.id);
      const assignment = ensureTeacherTestAssignment(db, attempt.assignment_id);
      return { attempt: publicAttempt(db, assignment, db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attempt.id)) };
    }
  );

  app.post('/api/tests/attempts/:attemptId/unlock',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const attemptId = requirePositiveInteger(request.params.attemptId, 'attemptId');
      const minutes = Number(request.body?.minutes ?? 15);
      const reason = String(request.body?.reason ?? '').trim().slice(0, 300);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        const err = new Error('minutes_required');
        err.statusCode = 400;
        throw err;
      }
      const attempt = loadAttemptById(db, attemptId);
      if (!attempt) {
        const err = new Error('attempt_not_found');
        err.statusCode = 404;
        throw err;
      }
      db.prepare(`
        UPDATE test_attempts
        SET submitted_at = NULL,
            unlocked_until = datetime('now', ?),
            unlock_reason = ?,
            extra_seconds = extra_seconds + ?
        WHERE id = ?
      `).run(`+${Math.ceil(minutes)} minutes`, reason, Math.ceil(minutes * 60), attempt.id);
      const assignment = ensureTeacherTestAssignment(db, attempt.assignment_id);
      return { attempt: publicAttempt(db, assignment, db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attempt.id)) };
    }
  );

  app.post('/api/tests/attempts/:attemptId/accessibility',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const attemptId = requirePositiveInteger(request.params.attemptId, 'attemptId');
      const attempt = loadAttemptById(db, attemptId);
      if (!attempt) {
        const err = new Error('attempt_not_found');
        err.statusCode = 404;
        throw err;
      }
      db.prepare('UPDATE test_attempts SET sound_disabled = ?, pulse_disabled = ? WHERE id = ?')
        .run(request.body?.sound_disabled === true ? 1 : 0, request.body?.pulse_disabled === true ? 1 : 0, attempt.id);
      const assignment = ensureTeacherTestAssignment(db, attempt.assignment_id);
      return { attempt: publicAttempt(db, assignment, db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attempt.id)) };
    }
  );

  app.post('/api/tests/attempts/:attemptId/force-submit',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const attemptId = requirePositiveInteger(request.params.attemptId, 'attemptId');
      const attempt = loadAttemptById(db, attemptId);
      if (!attempt) {
        const err = new Error('attempt_not_found');
        err.statusCode = 404;
        throw err;
      }
      const assignment = ensureTeacherTestAssignment(db, attempt.assignment_id);
      scoreMcqResponses(db, assignment, attempt.id);
      db.prepare(`
        UPDATE test_attempts
        SET submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
            force_submitted_at = COALESCE(force_submitted_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `).run(attempt.id);
      return { attempt: publicAttempt(db, assignment, db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attempt.id)) };
    }
  );

  app.post('/api/tests/activity-events/:eventId/excuse',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const eventId = requirePositiveInteger(request.params.eventId, 'eventId');
      const event = db.prepare('SELECT * FROM test_activity_events WHERE id = ?').get(eventId);
      if (!event) return reply.code(404).send({ error: 'event_not_found' });
      const reason = String(request.body?.reason ?? '').trim().slice(0, 300);
      db.prepare(`
        UPDATE test_activity_events
        SET excused_at = CURRENT_TIMESTAMP,
            excused_by_teacher_id = ?,
            excuse_reason = ?
        WHERE id = ?
      `).run(teacherId(request), reason, event.id);
      return { event: db.prepare('SELECT * FROM test_activity_events WHERE id = ?').get(event.id) };
    }
  );

  app.put('/api/tests/responses/:responseId/score',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const responseId = requirePositiveInteger(request.params.responseId, 'responseId');
      const response = db.prepare(`
        SELECT r.*, q.kind, q.points
        FROM test_responses r JOIN test_questions q ON q.id = r.question_id
        WHERE r.id = ?
      `).get(responseId);
      if (!response) return reply.code(404).send({ error: 'response_not_found' });
      if (response.kind !== 'srq') return reply.code(400).send({ error: 'only_srq_can_be_scored_here' });
      const score = normalizePoints(request.body?.points_awarded);
      if (score > Number(response.points ?? 0)) return reply.code(400).send({ error: 'score_above_question_points' });
      db.prepare(`
        UPDATE test_responses
        SET points_awarded = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(score, responseId);
      return { response: db.prepare('SELECT * FROM test_responses WHERE id = ?').get(responseId) };
    }
  );

  app.post('/api/tests/:assignmentId/start',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureStudentTestAssignment(db, assignmentId, request.session.user.id);
      const attempt = insertOrGetAttempt(db, assignment, request.session.user.id);
      db.prepare('UPDATE test_attempts SET last_activity_at = COALESCE(last_activity_at, CURRENT_TIMESTAMP) WHERE id = ?')
        .run(attempt.id);
      return reply.code(201).send(studentTestPayload(db, assignment, request.session.user.id, attempt));
    }
  );

  app.post('/api/tests/:assignmentId/acknowledge-rules',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureStudentTestAssignment(db, assignmentId, request.session.user.id);
      const attempt = insertOrGetAttempt(db, assignment, request.session.user.id);
      db.prepare(`
        UPDATE test_attempts
        SET rules_acknowledged_at = COALESCE(rules_acknowledged_at, CURRENT_TIMESTAMP),
            last_activity_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(attempt.id);
      const updated = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attempt.id);
      recordActivityEvent(db, updated, 'rules_acknowledged', { metadata: { version: 1 } });
      return reply.code(201).send(studentTestPayload(db, assignment, request.session.user.id, updated));
    }
  );

  app.get('/api/tests/:assignmentId/take',
    { preValidation: [app.requireStudentSession] },
    async (request) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureStudentTestAssignment(db, assignmentId, request.session.user.id);
      const attempt = loadAttempt(db, assignment.id, request.session.user.id);
      return studentTestPayload(db, assignment, request.session.user.id, attempt);
    }
  );

  app.put('/api/tests/:assignmentId/answers/:questionId',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const questionId = requirePositiveInteger(request.params.questionId, 'questionId');
      const assignment = ensureStudentTestAssignment(db, assignmentId, request.session.user.id);
      const attempt = loadAttempt(db, assignment.id, request.session.user.id);
      if (!attempt) return reply.code(409).send({ error: 'attempt_not_started' });
      requireWritableAttempt(db, assignment, attempt);
      const allowed = new Set(questionIdsForAssignment(db, assignment).map((q) => q.id));
      if (!allowed.has(questionId)) return reply.code(404).send({ error: 'question_not_in_test' });
      const question = loadQuestion(db, questionId);
      if (question.kind === 'frq') return reply.code(400).send({ error: 'frq_uses_native_pad' });
      let answer;
      if (question.kind === 'mcq') {
        const chosen = Number(request.body?.chosen_index);
        const options = parseJson(question.options_json, []);
        if (!Number.isInteger(chosen) || chosen < 0 || chosen >= options.length) {
          return reply.code(400).send({ error: 'invalid_choice' });
        }
        answer = { chosen_index: chosen };
      } else {
        answer = { text: String(request.body?.text ?? '').slice(0, 4000) };
      }
      db.prepare(`
        INSERT INTO test_responses (attempt_id, question_id, answer_json, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(attempt_id, question_id) DO UPDATE SET
          answer_json = excluded.answer_json,
          updated_at = datetime('now')
      `).run(attempt.id, question.id, JSON.stringify(answer));
      recordActivityEvent(db, attempt, 'answer_input', {
        question_id: question.id,
        metadata: { kind: question.kind },
      });
      return { saved: true };
    }
  );

  app.post('/api/tests/:assignmentId/activity',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureStudentTestAssignment(db, assignmentId, request.session.user.id);
      const attempt = loadAttempt(db, assignment.id, request.session.user.id);
      if (!attempt) return reply.code(409).send({ error: 'attempt_not_started' });
      const questionId = request.body?.question_id === undefined || request.body?.question_id === null || request.body?.question_id === ''
        ? null
        : requirePositiveInteger(request.body.question_id, 'question_id');
      if (questionId !== null) {
        const allowed = new Set(questionIdsForAssignment(db, assignment).map((q) => q.id));
        if (!allowed.has(questionId)) return reply.code(404).send({ error: 'question_not_in_test' });
      }
      const eventType = String(request.body?.event_type ?? '');
      const event = recordActivityEvent(db, attempt, eventType, {
        question_id: questionId,
        section_index: request.body?.section_index,
        metadata: request.body?.metadata,
      });
      return reply.code(201).send({ event });
    }
  );

  app.post('/api/tests/:assignmentId/focus-event',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureStudentTestAssignment(db, assignmentId, request.session.user.id);
      const attempt = loadAttempt(db, assignment.id, request.session.user.id);
      if (!attempt) return reply.code(409).send({ error: 'attempt_not_started' });
      const kind = String(request.body?.kind ?? '');
      if (!FOCUS_KINDS.has(kind)) return reply.code(400).send({ error: 'invalid_focus_kind' });
      db.prepare('INSERT INTO test_focus_events (attempt_id, kind) VALUES (?, ?)').run(attempt.id, kind);
      recordActivityEvent(db, attempt, kind === 'blur' ? 'window_blur' : 'window_focus', {});
      return reply.code(201).send({ recorded: true });
    }
  );

  app.post('/api/tests/:assignmentId/submit',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureStudentTestAssignment(db, assignmentId, request.session.user.id);
      const attempt = loadAttempt(db, assignment.id, request.session.user.id);
      if (!attempt) return reply.code(409).send({ error: 'attempt_not_started' });
      requireWritableAttempt(db, assignment, attempt);
      scoreMcqResponses(db, assignment, attempt.id);
      const frqPad = await submitFrqPad(app, db, assignment, request);
      db.prepare(`
        UPDATE test_attempts
        SET submitted_at = COALESCE(submitted_at, datetime('now'))
        WHERE id = ?
      `).run(attempt.id);
      const updated = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attempt.id);
      return reply.code(201).send({
        submitted: true,
        attempt: publicAttempt(db, assignment, updated),
        frq_pad_id: frqPad?.id ?? null,
      });
    }
  );

  app.get('/api/tests/:assignmentId/results',
    { preValidation: [app.requireStudentSession] },
    async (request) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const assignment = ensureStudentTestAssignment(db, assignmentId, request.session.user.id);
      const attempt = loadAttempt(db, assignment.id, request.session.user.id);
      return releaseGatedResults(db, assignment, attempt, request.session.user.id);
    }
  );
}
