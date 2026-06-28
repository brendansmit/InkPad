import { EtherpadService } from '../etherpad/api.js';
import { renderWriteView } from '../views/write.js';
import { renderLockedView } from '../views/locked.js';
import { renderGreenPenView } from '../views/greenPen.js';
import { notifyTeacher } from '../services/serverChan.js';
import { feedbackLibrary, feedbackOptionMap } from '../feedback/library.js';

function requirePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`${field} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

async function resolveAssignmentAndStudent(db, assignmentId, studentId) {
  const assignment = db.prepare(
    'SELECT id, class_id, title, type, settings_json, opens_at, due_at FROM assignments WHERE id = ?'
  ).get(assignmentId);
  if (!assignment) {
    const err = new Error('assignment_not_found');
    err.statusCode = 404;
    throw err;
  }
  const student = db.prepare('SELECT id, display_name, class_id FROM students WHERE id = ?').get(studentId);
  if (!student || student.class_id !== assignment.class_id) {
    const err = new Error('forbidden');
    err.statusCode = 403;
    throw err;
  }
  return { assignment, student };
}

async function provisionPad(db, service, { assignment, student }) {
  const studentId = student.id;
  const assignmentId = assignment.id;

  let pad = db.prepare('SELECT id, etherpad_pad_id, state FROM pads WHERE student_id = ? AND assignment_id = ?').get(studentId, assignmentId);

  if (!pad) {
    const etherpadPadId = await service.createAssignmentPad(
      assignment.class_id,
      assignmentId,
      studentId,
      ''
    );
    const result = db.prepare(`
      INSERT INTO pads (student_id, assignment_id, etherpad_pad_id, state)
      VALUES (?, ?, ?, 'writing')
    `).run(studentId, assignmentId, etherpadPadId);
    pad = { id: result.lastInsertRowid, etherpad_pad_id: etherpadPadId, state: 'writing' };
  }

  return pad;
}

// Auto-lock a draft pad that has passed its due date.
// Creates a submission row so the teacher can see the work.
function applyDueDateLock(db, pad, assignment) {
  const now = new Date().toISOString();
  if (!assignment.due_at || assignment.due_at > now) return false;
  if (pad.state !== 'writing') return false;

  db.prepare("UPDATE pads SET state = 'submitted' WHERE id = ?").run(pad.id);
  db.prepare("INSERT OR IGNORE INTO submissions (pad_id, submitted_at) VALUES (?, ?)").run(pad.id, now);
  pad.state = 'submitted';
  return true;
}

function parseAssignmentSettings(settingsJson) {
  try {
    return JSON.parse(settingsJson ?? '{}');
  } catch (_) {
    return {};
  }
}

function publicFeedback(row) {
  return {
    id: row.id,
    kind: row.kind,
    key: row.feedback_key,
    title: row.title,
    explanation: row.explanation,
  };
}

function selectedFeedbackRows(db, submissionId) {
  if (!submissionId) return [];
  return db.prepare(`
    SELECT id, kind, feedback_key, title, explanation
    FROM submission_feedback
    WHERE submission_id = ?
    ORDER BY kind ASC, id ASC
  `).all(submissionId).map(publicFeedback);
}

function publicCode(row) {
  return {
    id: row.id,
    start_offset: row.start_offset,
    end_offset: row.end_offset,
    code: row.code,
    category: row.category,
    label: row.label ?? null,
  };
}

function selectedCodeRows(db, submissionId) {
  if (!submissionId) return [];
  return db.prepare(`
    SELECT id, start_offset, end_offset, code, category, label
    FROM submission_codes
    WHERE submission_id = ?
    ORDER BY start_offset ASC, end_offset ASC, id ASC
  `).all(submissionId).map(publicCode);
}

function previousTargetRows(db, pad) {
  const rows = db.prepare(`
    SELECT sf.id,
           sf.kind,
           sf.feedback_key,
           sf.title,
           sf.explanation,
           a.id AS assignment_id,
           a.title AS assignment_title
    FROM submission_feedback sf
    JOIN submissions sub ON sub.id = sf.submission_id
    JOIN pads p ON p.id = sub.pad_id
    JOIN assignments a ON a.id = p.assignment_id
    WHERE p.student_id = ?
      AND a.class_id = ?
      AND a.id != ?
      AND sf.kind = 'target'
      AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
    ORDER BY a.created_at DESC, a.id DESC, sf.id ASC
  `).all(
    pad.student_id,
    pad.class_id,
    pad.assignment_id,
    pad.assignment_created_at,
    pad.assignment_created_at,
    pad.assignment_id
  );
  if (!rows.length) return [];
  const assignmentId = rows[0].assignment_id;
  return rows
    .filter(row => row.assignment_id === assignmentId)
    .map(row => ({
      ...publicFeedback(row),
      assignment_id: row.assignment_id,
      assignment_title: row.assignment_title,
    }));
}

function normalizeFeedbackSelection(value) {
  return Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string'))] : [];
}

function replaceFeedback(db, submissionId, { strengths, targets }) {
  const strengthMap = feedbackOptionMap('strength');
  const targetMap = feedbackOptionMap('target');
  const selectedStrengths = normalizeFeedbackSelection(strengths);
  const selectedTargets = normalizeFeedbackSelection(targets);
  const invalid = [
    ...selectedStrengths.filter(id => !strengthMap.has(id)),
    ...selectedTargets.filter(id => !targetMap.has(id)),
  ];
  if (invalid.length) {
    const err = new Error('invalid_feedback_key');
    err.statusCode = 400;
    throw err;
  }

  const insert = db.prepare(`
    INSERT INTO submission_feedback (submission_id, kind, feedback_key, title, explanation)
    VALUES (?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM submission_feedback WHERE submission_id = ?').run(submissionId);
    for (const id of selectedStrengths) {
      const item = strengthMap.get(id);
      insert.run(submissionId, 'strength', item.id, item.title, item.explanation);
    }
    for (const id of selectedTargets) {
      const item = targetMap.get(id);
      insert.run(submissionId, 'target', item.id, item.title, item.explanation);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return selectedFeedbackRows(db, submissionId);
}

function cleanCodeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSubmissionCodes(value) {
  if (!Array.isArray(value)) {
    const err = new Error('codes_required');
    err.statusCode = 400;
    throw err;
  }

  return value.map((item) => {
    const start = Number(item?.start_offset);
    const end = Number(item?.end_offset);
    const code = cleanCodeText(item?.code);
    const category = cleanCodeText(item?.category);
    const label = cleanCodeText(item?.label) || null;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      const err = new Error('invalid_code_span');
      err.statusCode = 400;
      throw err;
    }
    if (!code || !category) {
      const err = new Error('invalid_code_metadata');
      err.statusCode = 400;
      throw err;
    }
    return { start, end, code, category, label };
  });
}

function replaceSubmissionCodes(db, submissionId, codes) {
  const normalized = normalizeSubmissionCodes(codes);
  const insert = db.prepare(`
    INSERT INTO submission_codes (submission_id, start_offset, end_offset, code, category, label)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM submission_codes WHERE submission_id = ?').run(submissionId);
    for (const item of normalized) {
      insert.run(submissionId, item.start, item.end, item.code, item.category, item.label);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return selectedCodeRows(db, submissionId);
}

function latestSubmissionForPad(db, padId) {
  return db.prepare(`
    SELECT *
    FROM submissions
    WHERE pad_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(padId);
}

export async function registerPadRoutes(app, { db, etherpadService }) {
  const service = etherpadService ?? new EtherpadService({ apiKey: process.env.ETHERPAD_API_KEY || 'unset' });

  /**
   * GET /api/assignments/:id/pad
   *
   * JSON endpoint: returns pad metadata and Etherpad session id.
   * Enforces opens_at (404 if not yet open) and due_at auto-lock.
   */
  app.get('/api/assignments/:id/pad',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.id, 'id');
      const studentId = request.session.user.id;

      const { assignment, student } = await resolveAssignmentAndStudent(db, assignmentId, studentId);

      const now = new Date().toISOString();
      if (assignment.opens_at && assignment.opens_at > now) {
        return reply.code(403).send({ error: 'not_open_yet' });
      }

      const pad = await provisionPad(db, service, { assignment, student });
      applyDueDateLock(db, pad, assignment);

      const groupId = await service.ensureClassGroup(assignment.class_id);
      const authorId = await service.ensureStudentAuthor(studentId, student.display_name);
      const session = await service.createSessionCookie(groupId, authorId);

      return {
        pad: {
          id: pad.id,
          etherpad_pad_id: pad.etherpad_pad_id,
          state: pad.state,
        },
        session_cookie: `sessionID=${session.sessionID}`,
        session_id: session.sessionID,
      };
    }
  );

  /**
   * GET /write/:assignmentId
   *
   * Student write view. Enforces opens_at and due_at. For locked pads
   * (exam submitted or past due_at) renders the locked view. Otherwise
   * sets the Etherpad session cookie and renders the write shell.
   */
  app.get('/write/:assignmentId',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const studentId = request.session.user.id;

      const { assignment, student } = await resolveAssignmentAndStudent(db, assignmentId, studentId);

      const now = new Date().toISOString();

      // Step 4.2 — not yet open
      if (assignment.opens_at && assignment.opens_at > now) {
        return reply.code(403).send({ error: 'not_open_yet' });
      }

      const pad = await provisionPad(db, service, { assignment, student });

      // Step 4.4 — due-date auto-lock
      applyDueDateLock(db, pad, assignment);

      const settings = parseAssignmentSettings(assignment.settings_json);

      // Step 4.3 — locked views
      if (pad.state === 'marked' || pad.state === 'resubmitted') {
        return reply.type('text/html').send(renderLockedView({ title: assignment.title, reason: 'marked' }));
      }
      if (pad.state === 'submitted' && settings.submit_behaviour === 'exam') {
        return reply.type('text/html').send(renderLockedView({ title: assignment.title, reason: 'exam' }));
      }
      if (pad.state === 'submitted' && assignment.due_at && assignment.due_at < now) {
        return reply.type('text/html').send(renderLockedView({ title: assignment.title, reason: 'due' }));
      }

      const groupId = await service.ensureClassGroup(assignment.class_id);
      const authorId = await service.ensureStudentAuthor(studentId, student.display_name);
      const session = await service.createSessionCookie(groupId, authorId);

      reply.header('Set-Cookie', `sessionID=${session.sessionID}; Path=/; SameSite=Lax; HttpOnly`);

      if (pad.state === 'green_pen_open') {
        const submission = latestSubmissionForPad(db, pad.id);
        const text = await service.getPadText(pad.etherpad_pad_id);
        return reply.type('text/html').send(renderGreenPenView({
          title: assignment.title,
          etherpadPadId: pad.etherpad_pad_id,
          padId: pad.id,
          csrfToken: request.session.csrfToken ?? '',
          text,
          codes: selectedCodeRows(db, submission?.id),
          feedback: selectedFeedbackRows(db, submission?.id),
        }));
      }

      return reply.type('text/html').send(renderWriteView({
        title: assignment.title,
        dueAt: assignment.due_at,
        spellcheck: settings.spellcheck !== false,
        pasteBlock: settings.paste_block === true,
        etherpadPadId: pad.etherpad_pad_id,
        padId: pad.id,
        padState: pad.state,
        csrfToken: request.session.csrfToken ?? '',
      }));
    }
  );

  /**
   * POST /api/pads/:padId/paste-event
   *
   * Records a paste event detected by the ep_inkheron_paste plugin.
   * The plugin runs inside the Etherpad iframe and postMessages to the
   * wrapper shell; the shell's JS calls this endpoint with the student's
   * auth cookie and CSRF token.
   */
  app.post('/api/pads/:padId/paste-event',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const studentId = request.session.user.id;

      const pad = db.prepare('SELECT id FROM pads WHERE id = ? AND student_id = ?').get(padId, studentId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });

      const { length, input_type } = request.body ?? {};
      if (typeof length !== 'number' || length < 1) {
        return reply.code(400).send({ error: 'length_required' });
      }

      db.prepare(
        "INSERT INTO paste_events (pad_id, at, length, input_type) VALUES (?, datetime('now'), ?, ?)"
      ).run(padId, Math.round(length), input_type ?? 'insertFromPaste');

      return reply.code(201).send({ ok: true });
    }
  );

  app.get('/api/pads/:padId/review',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = db.prepare(`
        SELECT p.id,
               p.state,
               p.etherpad_pad_id,
               p.created_at AS pad_created_at,
               s.id AS student_id,
               s.display_name AS student_name,
               s.username,
               a.id AS assignment_id,
               a.title AS assignment_title,
               a.type AS assignment_type,
               a.created_at AS assignment_created_at,
               a.due_at,
               c.id AS class_id,
               c.name AS class_name,
               sub.id AS submission_id,
               sub.submitted_at,
               sub.is_graded,
               sub.released AS submission_released,
               g.id AS grade_id,
               g.score,
               g.released AS grade_released,
               g.graded_at
        FROM pads p
        JOIN students s ON s.id = p.student_id
        JOIN assignments a ON a.id = p.assignment_id
        JOIN classes c ON c.id = a.class_id
        LEFT JOIN (
          SELECT sub_inner.*
          FROM submissions sub_inner
          JOIN (
            SELECT pad_id, MAX(id) AS latest_id
            FROM submissions
            GROUP BY pad_id
          ) latest ON latest.latest_id = sub_inner.id
        ) sub ON sub.pad_id = p.id
        LEFT JOIN grades g ON g.submission_id = sub.id
        WHERE p.id = ?
      `).get(padId);

      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });

      const pasteEvents = db.prepare(`
        SELECT id, at, length, input_type
        FROM paste_events
        WHERE pad_id = ?
        ORDER BY at ASC, id ASC
      `).all(padId);
      const codes = selectedCodeRows(db, pad.submission_id);
      const feedback = selectedFeedbackRows(db, pad.submission_id);
      const previousTargets = previousTargetRows(db, pad);

      const text = await service.getPadText(pad.etherpad_pad_id);

      return {
        pad: {
          id: pad.id,
          state: pad.state,
          etherpad_pad_id: pad.etherpad_pad_id,
          created_at: pad.pad_created_at,
        },
        assignment: {
          id: pad.assignment_id,
          title: pad.assignment_title,
          type: pad.assignment_type,
          due_at: pad.due_at ?? null,
        },
        class: { id: pad.class_id, name: pad.class_name },
        student: { id: pad.student_id, display_name: pad.student_name, username: pad.username },
        submission: pad.submission_id ? {
          id: pad.submission_id,
          submitted_at: pad.submitted_at,
          is_graded: Boolean(pad.is_graded),
          released: Boolean(pad.submission_released),
        } : null,
        grade: pad.grade_id ? {
          id: pad.grade_id,
          score: pad.score,
          released: Boolean(pad.grade_released),
          graded_at: pad.graded_at,
        } : null,
        paste_events: pasteEvents,
        codes,
        feedback,
        feedback_options: feedbackLibrary,
        previous_targets: previousTargets,
        text,
      };
    }
  );

  app.post('/api/submissions/:submissionId/feedback',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const submissionId = requirePositiveInteger(request.params.submissionId, 'submissionId');
      const submission = db.prepare('SELECT id FROM submissions WHERE id = ?').get(submissionId);
      if (!submission) return reply.code(404).send({ error: 'submission_not_found' });

      const feedback = replaceFeedback(db, submissionId, {
        strengths: request.body?.strengths,
        targets: request.body?.targets,
      });
      return { feedback };
    }
  );

  app.post('/api/submissions/:submissionId/codes',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const submissionId = requirePositiveInteger(request.params.submissionId, 'submissionId');
      const submission = db.prepare('SELECT id FROM submissions WHERE id = ?').get(submissionId);
      if (!submission) return reply.code(404).send({ error: 'submission_not_found' });

      const codes = replaceSubmissionCodes(db, submissionId, request.body?.codes);
      return { codes };
    }
  );

  app.post('/api/submissions/:submissionId/grade',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const submissionId = requirePositiveInteger(request.params.submissionId, 'submissionId');
      const score = Number(request.body?.score);
      if (!Number.isFinite(score) || score < 0) {
        return reply.code(400).send({ error: 'score_required' });
      }

      const submission = db.prepare(`
        SELECT sub.id, p.id AS pad_id
        FROM submissions sub
        JOIN pads p ON p.id = sub.pad_id
        WHERE sub.id = ?
      `).get(submissionId);
      if (!submission) return reply.code(404).send({ error: 'submission_not_found' });

      const existing = db.prepare('SELECT id FROM grades WHERE submission_id = ?').get(submissionId);
      if (existing) {
        db.prepare(`
          UPDATE grades
          SET score = ?, released = 0, graded_at = datetime('now')
          WHERE submission_id = ?
        `).run(score, submissionId);
      } else {
        db.prepare('INSERT INTO grades (submission_id, score, released) VALUES (?, ?, 0)').run(submissionId, score);
      }
      db.prepare('UPDATE submissions SET is_graded = 1, released = 0 WHERE id = ?').run(submissionId);
      db.prepare("UPDATE pads SET state = 'marked' WHERE id = ?").run(submission.pad_id);

      const grade = db.prepare('SELECT id, score, released, graded_at FROM grades WHERE submission_id = ?').get(submissionId);
      return {
        grade: {
          id: grade.id,
          score: grade.score,
          released: Boolean(grade.released),
          graded_at: grade.graded_at,
        },
      };
    }
  );

  app.post('/api/submissions/:submissionId/finish-marking',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const submissionId = requirePositiveInteger(request.params.submissionId, 'submissionId');
      const submission = db.prepare(`
        SELECT sub.id,
               p.id AS pad_id,
               p.state AS pad_state,
               a.settings_json
        FROM submissions sub
        JOIN pads p ON p.id = sub.pad_id
        JOIN assignments a ON a.id = p.assignment_id
        WHERE sub.id = ?
      `).get(submissionId);
      if (!submission) return reply.code(404).send({ error: 'submission_not_found' });

      const settings = parseAssignmentSettings(submission.settings_json);
      const nextState = settings.green_pen === true ? 'green_pen_open' : 'marked';
      db.prepare('UPDATE submissions SET is_graded = 1 WHERE id = ?').run(submissionId);
      db.prepare('UPDATE pads SET state = ? WHERE id = ?').run(nextState, submission.pad_id);
      return { pad: { id: submission.pad_id, state: nextState } };
    }
  );

  app.get('/api/pads/:padId/timeslider',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const pad = db.prepare(`
        SELECT p.id, p.etherpad_pad_id, a.class_id
        FROM pads p
        JOIN assignments a ON a.id = p.assignment_id
        WHERE p.id = ?
      `).get(padId);
      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });

      const groupId = await service.ensureClassGroup(pad.class_id);
      const authorId = await service.ensureTeacherAuthor(
        request.session.user.id,
        request.session.user.display_name
      );
      const session = await service.createSessionCookie(groupId, authorId);
      reply.header('Set-Cookie', `sessionID=${session.sessionID}; Path=/; SameSite=Lax; HttpOnly`);
      return reply.redirect(`/p/${encodeURIComponent(pad.etherpad_pad_id)}/timeslider?embed=1`);
    }
  );

  /**
   * POST /api/pads/:padId/submit
   *
   * Student submits their work. Transitions writing → submitted.
   * Creates a submissions row and fires a Server酱 WeChat notification.
   * Exam pads are terminal (locked forever). Draft pads stay editable until due_at.
   */
  app.post('/api/pads/:padId/submit',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const studentId = request.session.user.id;

      const pad = db.prepare(`
        SELECT p.id, p.state, p.assignment_id,
               a.settings_json, a.title AS assignment_title,
               st.display_name AS student_name
        FROM pads p
        JOIN assignments a ON a.id = p.assignment_id
        JOIN students st ON st.id = p.student_id
        WHERE p.id = ? AND p.student_id = ?
      `).get(padId, studentId);

      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (pad.state !== 'writing') return reply.code(409).send({ error: 'already_submitted' });

      const settings = parseAssignmentSettings(pad.settings_json);

      db.prepare("UPDATE pads SET state = 'submitted' WHERE id = ?").run(padId);
      const result = db.prepare(
        "INSERT INTO submissions (pad_id, submitted_at) VALUES (?, datetime('now'))"
      ).run(padId);

      notifyTeacher(db, {
        studentName: pad.student_name,
        assignmentTitle: pad.assignment_title,
      }).catch(() => {});

      return reply.code(201).send({
        pad: { id: padId, state: 'submitted' },
        submission: { id: result.lastInsertRowid },
        locked: settings.submit_behaviour === 'exam',
      });
    }
  );

  /**
   * POST /api/pads/:padId/resubmit
   *
   * Student resends a revised green-pen draft. Transitions
   * green_pen_open -> resubmitted, records a fresh submission row and locks
   * the pad until the teacher reopens it.
   */
  app.post('/api/pads/:padId/resubmit',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const padId = requirePositiveInteger(request.params.padId, 'padId');
      const studentId = request.session.user.id;

      const pad = db.prepare(`
        SELECT p.id,
               p.state,
               a.title AS assignment_title,
               st.display_name AS student_name
        FROM pads p
        JOIN assignments a ON a.id = p.assignment_id
        JOIN students st ON st.id = p.student_id
        WHERE p.id = ? AND p.student_id = ?
      `).get(padId, studentId);

      if (!pad) return reply.code(404).send({ error: 'pad_not_found' });
      if (pad.state !== 'green_pen_open') return reply.code(409).send({ error: 'not_open_for_resubmit' });

      db.prepare("UPDATE pads SET state = 'resubmitted' WHERE id = ?").run(padId);
      const result = db.prepare(
        "INSERT INTO submissions (pad_id, submitted_at) VALUES (?, datetime('now'))"
      ).run(padId);

      await notifyTeacher(db, {
        studentName: pad.student_name,
        assignmentTitle: pad.assignment_title,
        action: 'resubmitted work',
      }).catch(() => {});

      return reply.code(201).send({
        pad: { id: padId, state: 'resubmitted' },
        submission: { id: result.lastInsertRowid },
        locked: true,
      });
    }
  );
}
