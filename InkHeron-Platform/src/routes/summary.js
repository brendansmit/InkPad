/**
 * Read only summary for outside tools.
 *
 * Cadence, the teaching calendar, needs to know how much marking is actually waiting:
 * how many students have handed a piece of work in, and how many of those have been
 * marked. It is a different app on a different machine, so it cannot have a teacher
 * session and it must not have one.
 *
 * So this is one route, one method, counts only. It carries a bearer token that is
 * separate from every other credential in the platform, it never returns a student
 * name, a word, a mark or a piece of text, and it writes nothing. If the token leaks,
 * what leaks is a list of assignment titles and some tallies.
 *
 * The token lives in INKHERON_SUMMARY_TOKEN on the droplet, per rule 8. With no token
 * set the route refuses to answer at all rather than answering to anybody.
 *
 * Demo and ghost students are excluded from every count, per rule 1.
 */
import crypto from 'node:crypto';
import { realStudentsWhere } from '../db/realStudents.js';

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 200;

/** The states a native pad can be in, in lifecycle order. */
const PAD_STATES = ['writing', 'submitted', 'marked', 'green_pen_open', 'resubmitted'];

function emptyStates() {
  return Object.fromEntries(PAD_STATES.map(state => [state, 0]));
}

function configuredToken() {
  return (process.env.INKHERON_SUMMARY_TOKEN ?? '').trim();
}

function presentedToken(request) {
  const header = request.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

/**
 * Compare on the digests rather than the strings. timingSafeEqual throws when the two
 * buffers differ in length, and the length of the real token is not something a caller
 * should be able to measure by guessing.
 */
function sameToken(presented, configured) {
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(configured).digest();
  return crypto.timingSafeEqual(a, b);
}

function clampLimit(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function isTruthy(raw) {
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export async function registerSummaryRoutes(app, { db }) {
  function requireSummaryToken(request, reply, done) {
    const configured = configuredToken();
    if (!configured) {
      return reply.code(503).send({ error: 'summary_not_configured' });
    }
    const presented = presentedToken(request);
    /* one answer for missing, malformed and wrong, so a caller learns nothing by trying */
    if (!presented || !sameToken(presented, configured)) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    done();
  }

  const real = realStudentsWhere('s');

  /* Who is on this assignment. Rows in assignment_students mean that table IS the
     roster; with none, everybody in the class is on it. */
  const overrideCount = db.prepare(
    'SELECT COUNT(*) AS n FROM assignment_students WHERE assignment_id = ?',
  );
  const rosterOverride = db.prepare(`
    SELECT COUNT(*) AS n
    FROM assignment_students ast
    JOIN students s ON s.id = ast.student_id
    WHERE ast.assignment_id = ? AND ${real}
  `);
  const rosterClass = db.prepare(`
    SELECT COUNT(*) AS n FROM students s WHERE s.class_id = ? AND ${real}
  `);

  const padsOverride = db.prepare(`
    SELECT p.state AS state, COUNT(*) AS n
    FROM native_pads p
    JOIN students s ON s.id = p.student_id
    JOIN assignment_students ast
      ON ast.student_id = p.student_id AND ast.assignment_id = p.assignment_id
    WHERE p.assignment_id = ? AND ${real}
    GROUP BY p.state
  `);
  const padsClass = db.prepare(`
    SELECT p.state AS state, COUNT(*) AS n
    FROM native_pads p
    JOIN students s ON s.id = p.student_id
    WHERE p.assignment_id = ? AND s.class_id = ? AND ${real}
    GROUP BY p.state
  `);

  /* A test attempt is finished when it has been handed in, and marked when nothing in
     it is still waiting for a score. Multiple choice scores itself on the way in, so
     what is left unscored is the writing a person has to read. */
  const attemptsOverride = db.prepare(`
    SELECT
      SUM(CASE WHEN a.submitted_at IS NULL THEN 1 ELSE 0 END) AS started,
      SUM(CASE WHEN a.submitted_at IS NOT NULL AND (
        SELECT COUNT(*) FROM test_responses r
        WHERE r.attempt_id = a.id AND r.is_correct IS NULL AND r.points_awarded IS NULL
      ) = 0 THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN a.submitted_at IS NOT NULL AND (
        SELECT COUNT(*) FROM test_responses r
        WHERE r.attempt_id = a.id AND r.is_correct IS NULL AND r.points_awarded IS NULL
      ) > 0 THEN 1 ELSE 0 END) AS waiting
    FROM test_attempts a
    JOIN students s ON s.id = a.student_id
    JOIN assignment_students ast
      ON ast.student_id = a.student_id AND ast.assignment_id = a.assignment_id
    WHERE a.assignment_id = ? AND ${real}
  `);
  const attemptsClass = db.prepare(`
    SELECT
      SUM(CASE WHEN a.submitted_at IS NULL THEN 1 ELSE 0 END) AS started,
      SUM(CASE WHEN a.submitted_at IS NOT NULL AND (
        SELECT COUNT(*) FROM test_responses r
        WHERE r.attempt_id = a.id AND r.is_correct IS NULL AND r.points_awarded IS NULL
      ) = 0 THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN a.submitted_at IS NOT NULL AND (
        SELECT COUNT(*) FROM test_responses r
        WHERE r.attempt_id = a.id AND r.is_correct IS NULL AND r.points_awarded IS NULL
      ) > 0 THEN 1 ELSE 0 END) AS waiting
    FROM test_attempts a
    JOIN students s ON s.id = a.student_id
    WHERE a.assignment_id = ? AND s.class_id = ? AND ${real}
  `);

  function countsFor(row) {
    const overridden = overrideCount.get(row.id).n > 0;
    const students = overridden
      ? rosterOverride.get(row.id).n
      : rosterClass.get(row.class_id).n;

    const byState = emptyStates();
    if (row.type === 'test') {
      const t = (overridden ? attemptsOverride : attemptsClass).get(
        ...(overridden ? [row.id] : [row.id, row.class_id]),
      );
      byState.writing = t?.started ?? 0;
      byState.submitted = t?.waiting ?? 0;
      byState.marked = t?.done ?? 0;
    } else {
      const rows = overridden
        ? padsOverride.all(row.id)
        : padsClass.all(row.id, row.class_id);
      for (const r of rows) {
        if (r.state in byState) byState[r.state] = r.n;
      }
    }

    const started = PAD_STATES.reduce((sum, state) => sum + byState[state], 0);
    /* Everything past writing has been handed in at least once. A green pen rewrite
       was marked and given back, so it is not waiting on anybody until it comes in
       again as resubmitted. */
    const handedIn = started - byState.writing;
    return {
      students,
      not_started: Math.max(0, students - started),
      handed_in: handedIn,
      marked: byState.marked + byState.green_pen_open,
      to_mark: byState.submitted + byState.resubmitted,
      by_state: byState,
    };
  }

  app.get('/api/summary/assignments', { preValidation: [requireSummaryToken] }, async (request, reply) => {
    const query = request.query ?? {};
    const limit = clampLimit(query.limit);
    const classId = Number.parseInt(query.class_id ?? '', 10);
    const includeArchived = isTruthy(query.include_archived);

    const where = [];
    const params = [];
    if (!includeArchived) where.push('a.is_archived = 0');
    if (Number.isFinite(classId)) {
      where.push('a.class_id = ?');
      params.push(classId);
    }

    const rows = db.prepare(`
      SELECT a.id, a.title, a.type, a.class_id, c.name AS class_name,
             a.opens_at, a.due_at, a.is_archived
      FROM assignments a
      LEFT JOIN classes c ON c.id = a.class_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY COALESCE(a.due_at, a.opens_at, a.created_at) DESC, a.id DESC
      LIMIT ?
    `).all(...params, limit);

    /* Nothing here is worth a stale copy of, and it is about real students. */
    reply.header('Cache-Control', 'no-store');

    return {
      generated_at: new Date().toISOString(),
      count: rows.length,
      assignments: rows.map(row => ({
        id: row.id,
        title: row.title,
        type: row.type,
        class_id: row.class_id,
        class_name: row.class_name ?? null,
        opens_at: row.opens_at ?? null,
        due_at: row.due_at ?? null,
        is_archived: Boolean(row.is_archived),
        ...countsFor(row),
      })),
    };
  });
}
