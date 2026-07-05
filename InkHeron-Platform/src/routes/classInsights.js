// Class-level read model for the teacher "Class insights" page.
//
// Every aggregate here EXCLUDES demo and ghost accounts via the shared
// realStudents helper (CLAUDE.md hard rule 1). The page it feeds drives lesson
// planning, so the headline numbers are "how many students share this problem"
// rather than raw totals. A fresh class returns friendly empties, never NaN.
import { realStudentsWhere } from '../db/realStudents.js';

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isApLangClassName(name) {
  return /\bap\b[\s._-]*lang/i.test(String(name || ''));
}

function round(n, dp = 1) {
  const f = 10 ** dp;
  return Math.round(Number(n) * f) / f;
}

function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch (_) { return fallback; }
}

export async function registerClassInsightsRoutes(app, { db }) {
  app.get('/api/classes/:classId/insights',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const classId = toPositiveInt(request.params.classId);
      if (!classId) return reply.code(400).send({ error: 'invalid_class_id' });
      const cls = db.prepare('SELECT id, name FROM classes WHERE id = ?').get(classId);
      if (!cls) return reply.code(404).send({ error: 'class_not_found' });

      const students = db.prepare(
        `SELECT id, display_name, username FROM students
         WHERE class_id = ? AND ${realStudentsWhere()} ORDER BY display_name COLLATE NOCASE`
      ).all(classId);
      const studentCount = students.length;

      // Per-pad errors and word counts for every real student, oldest first.
      const padRows = db.prepare(`
        SELECT np.id AS pad_id, np.student_id, np.word_count, np.created_at,
               (SELECT COUNT(*) FROM student_literacy_evidence e WHERE e.native_pad_id = np.id) AS errors
        FROM native_pads np
        JOIN students s ON s.id = np.student_id
        WHERE np.student_id IN (SELECT id FROM students WHERE class_id = ? AND ${realStudentsWhere()})
          AND np.word_count > 0
        ORDER BY np.student_id ASC, np.created_at ASC, np.id ASC
      `).all(classId);

      const totalWords = padRows.reduce((sum, p) => sum + Number(p.word_count || 0), 0);
      const totalErrors = padRows.reduce((sum, p) => sum + Number(p.errors || 0), 0);

      // Recurring codes: students affected (open issue) and class rate per 100 words.
      const codeRows = db.prepare(`
        SELECT sis.code, sis.category, sis.label,
               COUNT(DISTINCT CASE WHEN sis.open_count > 0 THEN sis.student_id END) AS students_affected,
               COUNT(DISTINCT sis.student_id) AS students_seen,
               SUM(sis.evidence_count) AS total_evidence
        FROM student_literacy_issue_stats sis
        WHERE sis.student_id IN (SELECT id FROM students WHERE class_id = ? AND ${realStudentsWhere()})
        GROUP BY sis.code, sis.category
        ORDER BY students_affected DESC, total_evidence DESC
      `).all(classId).map((r) => ({
        code: r.code,
        category: r.category,
        label: r.label,
        students_affected: Number(r.students_affected || 0),
        students_seen: Number(r.students_seen || 0),
        per_100: totalWords ? round((Number(r.total_evidence || 0) / totalWords) * 100, 2) : 0,
      }));

      // err/100 trend by essay index, averaged across students.
      const byStudent = new Map();
      for (const p of padRows) {
        const list = byStudent.get(p.student_id) || [];
        list.push(p.word_count ? (Number(p.errors) / Number(p.word_count)) * 100 : 0);
        byStudent.set(p.student_id, list);
      }
      const maxLen = Math.max(0, ...[...byStudent.values()].map((l) => l.length));
      const errTrend = [];
      for (let i = 0; i < maxLen; i++) {
        const vals = [...byStudent.values()].map((l) => l[i]).filter((v) => v != null);
        if (!vals.length) continue;
        errTrend.push({ essay_index: i + 1, mean_err_per_100: round(vals.reduce((a, b) => a + b, 0) / vals.length, 1), students: vals.length });
      }

      // Green-pen class fix rate from implementation_scores addressed_json.
      const implRows = db.prepare(`
        SELECT addressed_json FROM implementation_scores
        WHERE student_id IN (SELECT id FROM students WHERE class_id = ? AND ${realStudentsWhere()})
      `).all(classId);
      let fixed = 0; let flagged = 0;
      for (const row of implRows) {
        const a = safeParse(row.addressed_json, null);
        if (!a) continue;
        const codes = Array.isArray(a.codes) ? a.codes : [];
        const targets = Array.isArray(a.targets) ? a.targets : [];
        fixed += codes.filter((c) => c.addressed).length + targets.filter((t) => t.addressed).length + Number(a.inline_comments_addressed || 0);
        flagged += codes.length + targets.length + Number(a.inline_comments_total || 0);
      }
      const greenPen = { rewrites: implRows.length, fixed, flagged, fix_rate: flagged ? round((fixed / flagged) * 100, 0) : null };

      // Rubric: average internal total per assignment over time.
      const rubricTrend = db.prepare(`
        SELECT ss.assignment_id, a.title, AVG(ss.total) AS avg_total, COUNT(*) AS n, MIN(ss.recorded_at) AS first_at
        FROM score_snapshots ss
        JOIN assignments a ON a.id = ss.assignment_id
        WHERE ss.rubric_kind = 'internal'
          AND ss.student_id IN (SELECT id FROM students WHERE class_id = ? AND ${realStudentsWhere()})
        GROUP BY ss.assignment_id
        ORDER BY first_at ASC
      `).all(classId).map((r) => ({ assignment_id: r.assignment_id, title: r.title, avg_total: round(r.avg_total, 1), students: Number(r.n) }));

      // Marker profile: only from scored (teacher-marked) estimates.
      const markerRows = db.prepare(`
        SELECT g.rubric_kind, g.criterion_id, c.label,
               AVG(g.delta) AS mean_delta, COUNT(*) AS n
        FROM ai_grade_estimates g
        LEFT JOIN assignment_rubric_criteria c ON c.id = g.criterion_id
        WHERE g.teacher_score IS NOT NULL
          AND g.student_id IN (SELECT id FROM students WHERE class_id = ? AND ${realStudentsWhere()})
        GROUP BY g.rubric_kind, g.criterion_id
        ORDER BY g.rubric_kind ASC, ABS(AVG(g.delta)) DESC
      `).all(classId);
      const markerDeltaCount = markerRows.reduce((s, r) => s + Number(r.n), 0);
      const markerProfile = {
        ready: markerDeltaCount >= 10,
        delta_count: markerDeltaCount,
        rows: markerRows.map((r) => ({ rubric_kind: r.rubric_kind, criterion_id: r.criterion_id, label: r.label || ('Criterion ' + r.criterion_id), mean_delta: round(r.mean_delta, 2), count: Number(r.n) })),
      };

      // Per-student mini-rows.
      const issueByStudent = db.prepare(`
        SELECT student_id, code, open_count, evidence_count
        FROM student_literacy_issue_stats
        WHERE student_id IN (SELECT id FROM students WHERE class_id = ? AND ${realStudentsWhere()})
        ORDER BY open_count DESC, evidence_count DESC
      `).all(classId);
      const topCodeByStudent = new Map();
      for (const r of issueByStudent) if (!topCodeByStudent.has(r.student_id)) topCodeByStudent.set(r.student_id, r.code);
      const padsByStudent = new Map();
      for (const p of padRows) {
        const list = padsByStudent.get(p.student_id) || [];
        list.push(p);
        padsByStudent.set(p.student_id, list);
      }
      const perStudent = students.map((s) => {
        const pads = padsByStudent.get(s.id) || [];
        const last = pads[pads.length - 1];
        const errLatest = last && last.word_count ? round((Number(last.errors) / Number(last.word_count)) * 100, 1) : null;
        return {
          student_id: s.id,
          display_name: s.display_name,
          essays: pads.length,
          err_per_100_latest: errLatest,
          top_code: topCodeByStudent.get(s.id) || null,
        };
      });

      return {
        class: { id: cls.id, name: cls.name, is_ap_lang: isApLangClassName(cls.name), student_count: studentCount },
        totals: { words: totalWords, errors: totalErrors, err_per_100: totalWords ? round((totalErrors / totalWords) * 100, 1) : 0 },
        recurring_codes: codeRows,
        err_trend: errTrend,
        green_pen: greenPen,
        rubric_trend: rubricTrend,
        marker_profile: markerProfile,
        per_student: perStudent,
      };
    }
  );
}
