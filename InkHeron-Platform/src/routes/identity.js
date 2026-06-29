import { hashPassword, generateTempPassword } from '../auth/passwords.js';

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requirePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`${field} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

function publicClass(row) {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
  };
}

function publicStudent(row) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    class_id: row.class_id,
    created_at: row.created_at,
    must_change_password: Boolean(row.must_change_password),
  };
}

function sqliteErrorReply(error, reply) {
  if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE constraint failed')) {
    return reply.code(409).send({ error: 'duplicate' });
  }
  if (error.code?.startsWith('ERR_SQLITE_CONSTRAINT') || error.message?.includes('constraint failed')) {
    return reply.code(400).send({ error: 'constraint_failed' });
  }
  throw error;
}

export async function registerIdentityRoutes(app, { db }) {
  app.get('/api/classes',
    { preValidation: [app.requireTeacherSession] },
    async () => {
      const rows = db.prepare('SELECT id, name, created_at FROM classes ORDER BY name COLLATE NOCASE').all();
      return { classes: rows.map(publicClass) };
    }
  );

  app.post('/api/classes',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const name = cleanText(request.body?.name);
      if (!name) return reply.code(400).send({ error: 'name_required' });

      const result = db.prepare('INSERT INTO classes (name) VALUES (?)').run(name);
      const row = db.prepare('SELECT id, name, created_at FROM classes WHERE id = ?').get(result.lastInsertRowid);
      return reply.code(201).send({ class: publicClass(row) });
    }
  );

  app.patch('/api/classes/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const name = cleanText(request.body?.name);
      if (!name) return reply.code(400).send({ error: 'name_required' });

      const result = db.prepare('UPDATE classes SET name = ? WHERE id = ?').run(name, id);
      if (result.changes === 0) return reply.code(404).send({ error: 'not_found' });

      const row = db.prepare('SELECT id, name, created_at FROM classes WHERE id = ?').get(id);
      return { class: publicClass(row) };
    }
  );

  app.delete('/api/classes/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      try {
        const result = db.prepare('DELETE FROM classes WHERE id = ?').run(id);
        if (result.changes === 0) return reply.code(404).send({ error: 'not_found' });
        return reply.code(204).send();
      } catch (error) {
        return sqliteErrorReply(error, reply);
      }
    }
  );

  app.get('/api/students',
    { preValidation: [app.requireTeacherSession] },
    async (request) => {
      const classId = request.query.class_id ? requirePositiveInteger(request.query.class_id, 'class_id') : null;
      const rows = classId
        ? db.prepare(`
            SELECT id, username, display_name, class_id, created_at, must_change_password
            FROM students
            WHERE class_id = ?
            ORDER BY display_name COLLATE NOCASE
          `).all(classId)
        : db.prepare(`
            SELECT id, username, display_name, class_id, created_at, must_change_password
            FROM students
            ORDER BY display_name COLLATE NOCASE
          `).all();

      return { students: rows.map(publicStudent) };
    }
  );

  app.post('/api/students',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const username = cleanText(request.body?.username);
      const displayName = cleanText(request.body?.display_name);
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      const classId = requirePositiveInteger(request.body?.class_id, 'class_id');

      if (!username) return reply.code(400).send({ error: 'username_required' });
      if (!displayName) return reply.code(400).send({ error: 'display_name_required' });
      if (password.length < 8) return reply.code(400).send({ error: 'password_too_short' });

      const passwordHash = await hashPassword(password);
      try {
        const result = db.prepare(`
          INSERT INTO students (username, display_name, password_hash, class_id, must_change_password)
          VALUES (?, ?, ?, ?, 1)
        `).run(username, displayName, passwordHash, classId);

        const row = db.prepare(`
          SELECT id, username, display_name, class_id, created_at, must_change_password
          FROM students
          WHERE id = ?
        `).get(result.lastInsertRowid);

        return reply.code(201).send({ student: publicStudent(row) });
      } catch (error) {
        return sqliteErrorReply(error, reply);
      }
    }
  );

  app.patch('/api/students/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const existing = db.prepare('SELECT id FROM students WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const updates = [];
      const values = [];

      if (request.body?.username !== undefined) {
        const username = cleanText(request.body.username);
        if (!username) return reply.code(400).send({ error: 'username_required' });
        updates.push('username = ?');
        values.push(username);
      }

      if (request.body?.display_name !== undefined) {
        const displayName = cleanText(request.body.display_name);
        if (!displayName) return reply.code(400).send({ error: 'display_name_required' });
        updates.push('display_name = ?');
        values.push(displayName);
      }

      if (request.body?.class_id !== undefined) {
        updates.push('class_id = ?');
        values.push(requirePositiveInteger(request.body.class_id, 'class_id'));
      }

      if (request.body?.password !== undefined) {
        const password = typeof request.body.password === 'string' ? request.body.password : '';
        if (password.length < 8) return reply.code(400).send({ error: 'password_too_short' });
        updates.push('password_hash = ?');
        values.push(await hashPassword(password));
      }

      if (updates.length > 0) {
        try {
          db.prepare(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`).run(...values, id);
        } catch (error) {
          return sqliteErrorReply(error, reply);
        }
      }

      const row = db.prepare(`
        SELECT id, username, display_name, class_id, created_at, must_change_password
        FROM students
        WHERE id = ?
      `).get(id);
      return { student: publicStudent(row) };
    }
  );

  app.delete('/api/students/:id',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const result = db.prepare('DELETE FROM students WHERE id = ?').run(id);
      if (result.changes === 0) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    }
  );

  app.patch('/api/students/:id/reset-password',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const id = requirePositiveInteger(request.params.id, 'id');
      const existing = db.prepare('SELECT id, username FROM students WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const tempPassword = 'ChangeMe1';
      const passwordHash = await hashPassword(tempPassword);
      db.prepare(`
        UPDATE students
        SET password_hash = ?, must_change_password = 1
        WHERE id = ?
      `).run(passwordHash, id);

      return {
        student: { id, username: existing.username },
        temp_password: tempPassword,
      };
    }
  );
}
