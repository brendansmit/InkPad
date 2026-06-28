function requirePositiveInteger(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`${field} must be a positive integer`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function publicAssignment(row) {
  return {
    id: row.id,
    class_id: row.class_id,
    title: row.title,
    type: row.type,
    settings_json: row.settings_json,
    opens_at: row.opens_at ?? null,
    due_at: row.due_at ?? null,
    created_at: row.created_at,
  };
}

function buildSettingsJson(settings = {}, type = 'essay') {
  const base = {
    type,
    submit_behaviour: settings.submit_behaviour ?? 'draft',
    spellcheck: settings.spellcheck !== false,
    word_count: true,
    paste_detection: true,
    green_pen: settings.green_pen === true,
  };
  if (type === 'test') {
    base.shuffle = settings.shuffle !== false;
    base.pooling = settings.pooling ?? 'off';
    base.focus_warning = settings.focus_warning !== false;
    base.timer_minutes = settings.timer_minutes ?? null;
  }
  if (settings.prompt) base.prompt = String(settings.prompt).slice(0, 4000);
  return JSON.stringify(base);
}

function deriveStatus(row, now) {
  if (row.opens_at && row.opens_at > now) return 'upcoming';
  if (!row.pad_id) {
    if (row.due_at && row.due_at < now) return 'closed';
    return 'not_started';
  }
  const state = row.pad_state;
  if (state === 'resubmitted') return 'resubmitted';
  if (state === 'green_pen_open') return 'needs_rewrite';
  if (state === 'marked') return 'marked';
  if (state === 'submitted') return 'submitted';
  if (row.due_at && row.due_at < now) return 'closed';
  return 'in_progress';
}

function deriveTeacherStatus(row) {
  if (row.grade_released || row.submission_released) return 'released';
  if (row.grade_id || row.is_graded || row.pad_state === 'marked') return 'marked';
  if (!row.pad_id) return 'not_started';
  if (row.pad_state === 'submitted') return 'submitted';
  return row.pad_state ?? 'writing';
}

function publicDashboardRow(row) {
  const status = deriveTeacherStatus(row);
  return {
    student_id: row.student_id,
    display_name: row.display_name,
    username: row.username,
    pad_id: row.pad_id ?? null,
    status,
    submitted_at: row.submitted_at ?? null,
    paste_flag: Number(row.paste_count ?? 0) > 0,
    paste_count: Number(row.paste_count ?? 0),
    paste_total_length: Number(row.paste_total_length ?? 0),
    latest_paste_at: row.latest_paste_at ?? null,
    score: row.score ?? null,
    grade_released: Boolean(row.grade_released),
    grade_state: row.grade_id ? (row.grade_released ? 'released' : 'held') : null,
  };
}

function sortDashboardRows(rows, sort) {
  const byName = (a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' });
  const byStatus = (a, b) => a.status.localeCompare(b.status) || byName(a, b);
  const bySubmitted = (a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '') || byName(a, b);
  const byPaste = (a, b) => Number(b.paste_flag) - Number(a.paste_flag) || b.paste_count - a.paste_count || byName(a, b);

  if (sort === 'status') return rows.sort(byStatus);
  if (sort === 'submitted_at') return rows.sort(bySubmitted);
  if (sort === 'paste') return rows.sort(byPaste);
  return rows.sort(byName);
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

// Returns all dashboard rows for an assignment, honouring the assignment_students
// override table when populated.
function fetchDashboardRows(db, assignmentId, classId) {
  const overrideCount = db.prepare(
    'SELECT COUNT(*) AS n FROM assignment_students WHERE assignment_id = ?'
  ).get(assignmentId).n;

  const joinClause = overrideCount > 0
    ? `JOIN assignment_students ast ON ast.student_id = s.id AND ast.assignment_id = ${assignmentId}`
    : `JOIN students _cls ON _cls.id = s.id AND s.class_id = ${classId}`;
  // (second branch uses a self-join trick so the SQL shape stays identical)

  return db.prepare(`
    SELECT s.id AS student_id,
           s.display_name,
           s.username,
           p.id AS pad_id,
           p.state AS pad_state,
           sub.id AS submission_id,
           sub.submitted_at,
           sub.is_graded,
           sub.released AS submission_released,
           g.id AS grade_id,
           g.score,
           g.released AS grade_released,
           paste.paste_count,
           paste.paste_total_length,
           paste.latest_paste_at
    FROM students s
    ${joinClause}
    LEFT JOIN pads p ON p.student_id = s.id AND p.assignment_id = ?
    LEFT JOIN (
      SELECT sub_inner.*
      FROM submissions sub_inner
      JOIN (SELECT pad_id, MAX(id) AS latest_id FROM submissions GROUP BY pad_id) latest
        ON latest.latest_id = sub_inner.id
    ) sub ON sub.pad_id = p.id
    LEFT JOIN grades g ON g.submission_id = sub.id
    LEFT JOIN (
      SELECT pad_id,
             COUNT(*) AS paste_count,
             COALESCE(SUM(length), 0) AS paste_total_length,
             MAX(at) AS latest_paste_at
      FROM paste_events GROUP BY pad_id
    ) paste ON paste.pad_id = p.id
    ORDER BY s.display_name COLLATE NOCASE
  `).all(assignmentId);
}

export async function registerAssignmentRoutes(app, { db }) {
  // ── Teacher routes ──────────────────────────────────────────────────────

  app.post('/api/assignments',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const { class_id, title, type = 'essay', settings = {}, opens_at, due_at } = request.body ?? {};
      if (!class_id || !title?.trim()) {
        return reply.code(400).send({ error: 'class_id and title are required' });
      }
      if (!['essay', 'test'].includes(type)) {
        return reply.code(400).send({ error: 'type must be essay or test' });
      }
      const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(class_id);
      if (!cls) return reply.code(404).send({ error: 'class_not_found' });

      const settings_json = buildSettingsJson(settings, type);
      const result = db.prepare(`
        INSERT INTO assignments (class_id, title, type, settings_json, opens_at, due_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(class_id, title.trim(), type, settings_json, opens_at ?? null, due_at ?? null);

      const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(result.lastInsertRowid);
      return reply.code(201).send({ assignment: publicAssignment(assignment) });
    }
  );

  app.get('/api/assignments',
    { preValidation: [app.requireTeacherSession] },
    async (request) => {
      const { class_id } = request.query;
      const rows = class_id
        ? db.prepare('SELECT * FROM assignments WHERE class_id = ? ORDER BY due_at ASC, created_at DESC').all(class_id)
        : db.prepare('SELECT * FROM assignments ORDER BY due_at ASC, created_at DESC').all();
      return { assignments: rows.map(publicAssignment) };
    }
  );

  app.get('/api/assignments/:id',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });
      return { assignment: publicAssignment(assignment) };
    }
  );

  app.get('/api/assignments/:id/dashboard',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const assignment = db.prepare(`
        SELECT a.*, c.name AS class_name
        FROM assignments a
        JOIN classes c ON c.id = a.class_id
        WHERE a.id = ?
      `).get(id);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });

      const rows = fetchDashboardRows(db, id, assignment.class_id);

      const statusFilter = request.query.status;
      const pasteFilter = request.query.paste;
      let students = rows.map(publicDashboardRow);
      if (statusFilter && statusFilter !== 'all') {
        students = students.filter(student => student.status === statusFilter);
      }
      if (pasteFilter === 'flagged') students = students.filter(student => student.paste_flag);
      if (pasteFilter === 'clear') students = students.filter(student => !student.paste_flag);

      return {
        assignment: publicAssignment(assignment),
        class: { id: assignment.class_id, name: assignment.class_name },
        students: sortDashboardRows(students, request.query.sort),
      };
    }
  );

  app.get('/api/assignments/:id/export.csv',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const assignment = db.prepare(`
        SELECT a.*, c.name AS class_name
        FROM assignments a
        JOIN classes c ON c.id = a.class_id
        WHERE a.id = ?
      `).get(id);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });

      const rows = fetchDashboardRows(db, id, assignment.class_id).map(publicDashboardRow);

      const header = ['Student name', 'Username', 'Status', 'Submitted at', 'Grade', 'Grade state', 'Paste flag', 'Paste count'];
      const lines = [
        header.map(csvCell).join(','),
        ...sortDashboardRows(rows, 'student').map(row => [
          row.display_name,
          row.username,
          row.status,
          row.submitted_at,
          row.score,
          row.grade_state,
          row.paste_flag ? 'yes' : 'no',
          row.paste_count,
        ].map(csvCell).join(',')),
      ];

      const filename = `assignment-${assignment.id}-export.csv`;
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return lines.join('\n');
    }
  );

  app.patch('/api/assignments/:id',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'assignment_not_found' });

      const { title, opens_at, due_at, settings } = request.body ?? {};
      const newTitle = title !== undefined ? title.trim() : existing.title;
      const newOpensAt = opens_at !== undefined ? opens_at : existing.opens_at;
      const newDueAt = due_at !== undefined ? due_at : existing.due_at;
      const newSettings = settings !== undefined
        ? buildSettingsJson(settings, existing.type)
        : existing.settings_json;

      db.prepare(`
        UPDATE assignments SET title = ?, opens_at = ?, due_at = ?, settings_json = ? WHERE id = ?
      `).run(newTitle, newOpensAt ?? null, newDueAt ?? null, newSettings, id);

      const updated = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
      return { assignment: publicAssignment(updated) };
    }
  );

  app.post('/api/assignments/:id/release-grades',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const assignment = db.prepare('SELECT id FROM assignments WHERE id = ?').get(id);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });

      db.exec('BEGIN');
      try {
        db.prepare(`
          UPDATE grades
          SET released = 1
          WHERE submission_id IN (
            SELECT sub.id
            FROM submissions sub
            JOIN pads p ON p.id = sub.pad_id
            WHERE p.assignment_id = ?
          )
        `).run(id);
        db.prepare(`
          UPDATE submissions
          SET released = 1
          WHERE id IN (
            SELECT sub.id
            FROM submissions sub
            JOIN pads p ON p.id = sub.pad_id
            WHERE p.assignment_id = ?
          )
          AND is_graded = 1
        `).run(id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      const released = db.prepare(`
        SELECT COUNT(*) AS count
        FROM grades g
        JOIN submissions sub ON sub.id = g.submission_id
        JOIN pads p ON p.id = sub.pad_id
        WHERE p.assignment_id = ? AND g.released = 1
      `).get(id);
      return { released: released.count };
    }
  );

  app.delete('/api/assignments/:id',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const existing = db.prepare('SELECT id FROM assignments WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'assignment_not_found' });
      db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
      return reply.code(204).send();
    }
  );

  // ── Per-assignment student management ──────────────────────────────────

  // GET /api/assignments/:id/students
  // Returns effective student list plus all available students (for the picker).
  app.get('/api/assignments/:id/students',
    { preValidation: [app.requireTeacherSession] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const assignment = db.prepare('SELECT id, class_id FROM assignments WHERE id = ?').get(id);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });

      const overrideRows = db.prepare(
        'SELECT student_id FROM assignment_students WHERE assignment_id = ?'
      ).all(id).map(r => r.student_id);
      const isCustom = overrideRows.length > 0;
      const includedSet = new Set(overrideRows);

      // All students across all classes for the picker.
      const allStudents = db.prepare(`
        SELECT s.id, s.display_name, s.username, s.class_id, c.name AS class_name
        FROM students s JOIN classes c ON c.id = s.class_id
        ORDER BY c.name COLLATE NOCASE, s.display_name COLLATE NOCASE
      `).all();

      return {
        mode: isCustom ? 'custom' : 'class',
        included: isCustom ? [...includedSet] : null,
        students: allStudents.map(s => ({
          ...s,
          included: isCustom ? includedSet.has(s.id) : s.class_id === assignment.class_id,
        })),
      };
    }
  );

  // PUT /api/assignments/:id/students
  // body: { student_ids: [1,2,3] } — replaces override list.
  // body: { student_ids: null }    — clears back to class-wide default.
  app.put('/api/assignments/:id/students',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const assignment = db.prepare('SELECT id FROM assignments WHERE id = ?').get(id);
      if (!assignment) return reply.code(404).send({ error: 'assignment_not_found' });

      const { student_ids } = request.body ?? {};

      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM assignment_students WHERE assignment_id = ?').run(id);
        if (Array.isArray(student_ids) && student_ids.length > 0) {
          const insert = db.prepare(
            'INSERT OR IGNORE INTO assignment_students (assignment_id, student_id) VALUES (?, ?)'
          );
          for (const sid of student_ids) {
            const n = Number(sid);
            if (Number.isInteger(n) && n > 0) insert.run(id, n);
          }
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }

      const count = db.prepare(
        'SELECT COUNT(*) AS n FROM assignment_students WHERE assignment_id = ?'
      ).get(id).n;
      return { mode: count > 0 ? 'custom' : 'class', count };
    }
  );

  // ── Student routes ──────────────────────────────────────────────────────

  app.get('/api/student/assignments',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const studentId = request.session.user.id;
      const student = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId);
      if (!student) return reply.code(404).send({ error: 'student_not_found' });

      const now = new Date().toISOString();
      // Include assignments where:
      // (a) class default applies (no override rows) and student is in the class, OR
      // (b) student is explicitly listed in assignment_students.
      const rows = db.prepare(`
        SELECT DISTINCT a.*,
               p.id   AS pad_id,
               p.state AS pad_state,
               sub.id  AS submission_id,
               sub.submitted_at
        FROM assignments a
        LEFT JOIN pads p ON p.assignment_id = a.id AND p.student_id = ?
        LEFT JOIN submissions sub ON sub.pad_id = p.id
        WHERE (
          -- class-wide default: no override rows and student is in the class
          (NOT EXISTS (SELECT 1 FROM assignment_students ast WHERE ast.assignment_id = a.id)
           AND a.class_id = ?)
          OR
          -- explicit inclusion
          EXISTS (SELECT 1 FROM assignment_students ast WHERE ast.assignment_id = a.id AND ast.student_id = ?)
        )
        ORDER BY a.due_at ASC, a.opens_at ASC, a.created_at DESC
      `).all(studentId, student.class_id, studentId);

      return {
        assignments: rows.map(row => ({
          ...publicAssignment(row),
          status: deriveStatus(row, now),
          pad_id: row.pad_id ?? null,
        })),
      };
    }
  );
}
