import { EtherpadService } from '../etherpad/api.js';
import { renderWriteView } from '../views/write.js';
import { renderLockedView } from '../views/locked.js';
import { notifyTeacher } from '../services/serverChan.js';

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

      let settings = {};
      try { settings = JSON.parse(assignment.settings_json ?? '{}'); } catch (_) { /* ignore */ }

      // Step 4.3 — locked views
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
        text,
      };
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
      return reply.redirect(`/p/${encodeURIComponent(pad.etherpad_pad_id)}/timeslider`);
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

      let settings = {};
      try { settings = JSON.parse(pad.settings_json ?? '{}'); } catch (_) { /* ignore */ }

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
}
