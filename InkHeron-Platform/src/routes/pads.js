import { EtherpadService } from '../etherpad/api.js';
import { renderWriteView } from '../views/write.js';

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
  const assignment = db.prepare('SELECT id, class_id, title, settings_json FROM assignments WHERE id = ?').get(assignmentId);
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

export async function registerPadRoutes(app, { db, etherpadService }) {
  const service = etherpadService ?? new EtherpadService({ apiKey: process.env.ETHERPAD_API_KEY || 'unset' });

  /**
   * GET /api/assignments/:id/pad
   *
   * JSON endpoint: returns pad metadata and Etherpad session id.
   * If no pad row exists yet, creates the Etherpad pad and stores it with state 'writing'.
   * Reuses the same pad on subsequent calls.
   */
  app.get('/api/assignments/:id/pad',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.id, 'id');
      const studentId = request.session.user.id;

      const { assignment, student } = await resolveAssignmentAndStudent(db, assignmentId, studentId);
      const pad = await provisionPad(db, service, { assignment, student });

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
   * Entry point for the student write view. Provisions (or reuses) the pad, mints an
   * Etherpad session, sets the sessionID cookie so Etherpad accepts the request, and
   * redirects to the pad URL. Etherpad and the wrapper share the same domain so the
   * cookie is visible to both.
   *
   * Step 3.4 will replace the redirect with a full wrapper-shell page.
   */
  app.get('/write/:assignmentId',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const assignmentId = requirePositiveInteger(request.params.assignmentId, 'assignmentId');
      const studentId = request.session.user.id;

      const { assignment, student } = await resolveAssignmentAndStudent(db, assignmentId, studentId);
      const pad = await provisionPad(db, service, { assignment, student });

      const groupId = await service.ensureClassGroup(assignment.class_id);
      const authorId = await service.ensureStudentAuthor(studentId, student.display_name);
      const session = await service.createSessionCookie(groupId, authorId);

      reply.header('Set-Cookie', `sessionID=${session.sessionID}; Path=/; SameSite=Lax; HttpOnly`);

      let settings = {};
      try { settings = JSON.parse(assignment.settings_json ?? '{}'); } catch (_) { /* ignore */ }

      return reply.type('text/html').send(renderWriteView({
        title: assignment.title,
        dueAt: assignment.due_at,
        spellcheck: settings.spellcheck !== false,
        etherpadPadId: pad.etherpad_pad_id,
      }));
    }
  );
}
