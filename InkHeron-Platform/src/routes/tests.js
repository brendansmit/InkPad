import { realStudentsWhere } from '../db/realStudents.js';

const QUESTION_KINDS = new Set(['mcq', 'srq', 'frq']);
const FOCUS_KINDS = new Set(['blur', 'focus']);
const TEST_SECTION_KINDS = new Set(['mcq', 'srq', 'frq']);
const TIMER_GRACE_SECONDS = 30;

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

  return {
    kind,
    promptText,
    optionsJson: options ? JSON.stringify(options) : null,
    answerIndex,
    modelAnswer,
    points: normalizePoints(body?.points ?? existing.points ?? 1),
    tag: String(body?.tag ?? existing.tag ?? '').trim().slice(0, 80),
  };
}

function teacherQuestion(row) {
  return {
    id: row.id,
    kind: row.kind,
    prompt_text: row.prompt_text,
    options: parseJson(row.options_json, []),
    answer_index: row.answer_index ?? null,
    model_answer: row.model_answer ?? null,
    points: Number(row.points ?? 0),
    tag: row.tag ?? '',
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

function secondsRemaining(assignment, attempt, date = new Date()) {
  if (!attempt?.seconds_allowed) return null;
  const started = parseDbDate(attempt.started_at);
  if (!started) return null;
  const due = new Date(started.getTime() + Number(attempt.seconds_allowed) * 1000);
  return Math.max(0, Math.ceil((due.getTime() - date.getTime()) / 1000));
}

function canWriteAttempt(assignment, attempt, date = new Date()) {
  if (!attempt || attempt.submitted_at) return false;
  const dueAt = parseDbDate(assignment.due_at);
  if (dueAt && dueAt.getTime() < date.getTime()) return false;
  if (!attempt.seconds_allowed) return true;
  const started = parseDbDate(attempt.started_at);
  if (!started) return false;
  const closesAt = started.getTime() + (Number(attempt.seconds_allowed) + TIMER_GRACE_SECONDS) * 1000;
  return closesAt >= date.getTime();
}

function requireWritableAttempt(assignment, attempt) {
  if (!canWriteAttempt(assignment, attempt)) {
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

function publicAttempt(assignment, attempt) {
  return {
    id: attempt.id,
    assignment_id: attempt.assignment_id,
    started_at: attempt.started_at,
    submitted_at: attempt.submitted_at ?? null,
    seconds_allowed: attempt.seconds_allowed ?? null,
    seconds_remaining: secondsRemaining(assignment, attempt),
  };
}

function studentTestPayload(db, assignment, studentId, attempt) {
  const config = testConfig(assignment);
  const responses = attempt ? responseMap(db, attempt.id) : new Map();
  const sections = config.sections.map((section, sectionIndex) => ({
    kind: section.kind,
    title: section.title,
    passage_text: section.passage_text ?? '',
    questions: shuffledSectionQuestions(section, studentId, sectionIndex, config.shuffle).map((questionId) => {
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
    attempt: attempt ? publicAttempt(assignment, attempt) : null,
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
      attempt: attempt ? publicAttempt(assignment, attempt) : null,
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

export async function registerTestRoutes(app, { db }) {
  app.get('/api/tests/questions',
    { preValidation: [app.requireTeacherSession] },
    async (request) => {
      const kind = QUESTION_KINDS.has(request.query.kind) ? request.query.kind : null;
      const tag = String(request.query.tag ?? '').trim();
      const archived = request.query.archived === '1' ? 1 : 0;
      const clauses = ['is_archived = ?'];
      const params = [archived];
      if (kind) {
        clauses.push('kind = ?');
        params.push(kind);
      }
      if (tag) {
        clauses.push('tag = ?');
        params.push(tag);
      }
      const rows = db.prepare(`
        SELECT * FROM test_questions
        WHERE ${clauses.join(' AND ')}
        ORDER BY updated_at DESC, id DESC
      `).all(...params);
      return { questions: rows.map(teacherQuestion) };
    }
  );

  app.post('/api/tests/questions',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const q = normalizeQuestionInput(request.body);
      const result = db.prepare(`
        INSERT INTO test_questions
          (kind, prompt_text, options_json, answer_index, model_answer, points, tag)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(q.kind, q.promptText, q.optionsJson, q.answerIndex, q.modelAnswer, q.points, q.tag);
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
            model_answer = ?, points = ?, tag = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(q.kind, q.promptText, q.optionsJson, q.answerIndex, q.modelAnswer, q.points, q.tag, id);
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
      return reply.code(201).send(studentTestPayload(db, assignment, request.session.user.id, attempt));
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
      requireWritableAttempt(assignment, attempt);
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
      return { saved: true };
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
      requireWritableAttempt(assignment, attempt);
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
        attempt: publicAttempt(assignment, updated),
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
