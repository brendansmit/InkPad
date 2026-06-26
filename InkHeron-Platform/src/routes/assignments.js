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

  // ── Student routes ──────────────────────────────────────────────────────

  app.get('/api/student/assignments',
    { preValidation: [app.requireStudentSession] },
    async (request, reply) => {
      const studentId = request.session.user.id;
      const student = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId);
      if (!student) return reply.code(404).send({ error: 'student_not_found' });

      const now = new Date().toISOString();
      const rows = db.prepare(`
        SELECT a.*,
               p.id   AS pad_id,
               p.state AS pad_state,
               sub.id  AS submission_id,
               sub.submitted_at
        FROM assignments a
        LEFT JOIN pads p   ON p.assignment_id = a.id AND p.student_id = ?
        LEFT JOIN submissions sub ON sub.pad_id = p.id
        WHERE a.class_id = ?
        ORDER BY a.due_at ASC, a.opens_at ASC, a.created_at DESC
      `).all(studentId, student.class_id);

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
