// Teacher-only TOEFL writing-estimate routes.
//
// THE WALL (rule zero for this feature): nothing here may ever reach a
// student-facing payload, page or push. Every route requires a teacher
// session; POSTs also require a CSRF token. Same wall as ai_grade_estimates.
import { generateToeflEstimate } from '../services/toeflEstimator.js';

function requirePositiveInteger(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`${field} must be a positive integer`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function findStudent(db, studentId) {
  return db.prepare('SELECT id, display_name, class_id FROM students WHERE id = ?').get(studentId);
}

function latestEstimate(db, studentId) {
  return db.prepare(`
    SELECT id, integrated_band, discussion_band, scaled_low, scaled_high, confidence, rationale, model, created_at
    FROM toefl_estimates
    WHERE student_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(studentId) || null;
}

function estimateHistory(db, studentId) {
  return db.prepare(`
    SELECT id, integrated_band, discussion_band, scaled_low, scaled_high, confidence, rationale, model, created_at
    FROM toefl_estimates
    WHERE student_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 20
  `).all(studentId);
}

function knownScores(db, studentId) {
  return db.prepare(`
    SELECT id, writing_score, noted_at, created_at
    FROM known_toefl_scores
    WHERE student_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 20
  `).all(studentId);
}

export async function registerToeflRoutes(app, { db }) {
  // Latest estimate plus history and any teacher-entered real scores.
  app.get('/api/teacher/students/:studentId/toefl-estimate',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const studentId = requirePositiveInteger(request.params.studentId, 'studentId');
      const student = findStudent(db, studentId);
      if (!student) return reply.code(404).send({ error: 'student_not_found' });
      return {
        student: { id: student.id, display_name: student.display_name },
        latest: latestEstimate(db, studentId),
        history: estimateHistory(db, studentId),
        known_scores: knownScores(db, studentId),
      };
    }
  );

  // Generate a fresh estimate and store it (history is kept).
  app.post('/api/teacher/students/:studentId/toefl-estimate',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const studentId = requirePositiveInteger(request.params.studentId, 'studentId');
      const student = findStudent(db, studentId);
      if (!student) return reply.code(404).send({ error: 'student_not_found' });

      const result = await generateToeflEstimate(db, { studentId });
      if (result.status === 'skipped') {
        return reply.code(422).send({ error: 'not_enough_evidence', reason: result.reason ?? 'insufficient_essays' });
      }
      if (result.status !== 'ok') {
        return reply.code(502).send({ error: 'estimate_failed' });
      }
      return {
        latest: latestEstimate(db, studentId),
        history: estimateHistory(db, studentId),
        known_scores: knownScores(db, studentId),
      };
    }
  );

  // Record a real TOEFL writing score (0 to 30) the teacher has seen.
  app.post('/api/teacher/students/:studentId/toefl-known-score',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const studentId = requirePositiveInteger(request.params.studentId, 'studentId');
      const student = findStudent(db, studentId);
      if (!student) return reply.code(404).send({ error: 'student_not_found' });

      const score = Number(request.body?.writing_score);
      if (!Number.isInteger(score) || score < 0 || score > 30) {
        return reply.code(400).send({ error: 'writing_score_out_of_range' });
      }
      const notedAt = typeof request.body?.noted_at === 'string' && request.body.noted_at.trim()
        ? request.body.noted_at.trim().slice(0, 40)
        : null;

      db.prepare(`
        INSERT INTO known_toefl_scores (student_id, writing_score, noted_at)
        VALUES (?, ?, ?)
      `).run(studentId, score, notedAt);

      return reply.code(201).send({ known_scores: knownScores(db, studentId) });
    }
  );
}
