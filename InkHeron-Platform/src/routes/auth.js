import crypto from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { hashPassword, verifyPassword } from '../auth/passwords.js';

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function publicUser(row, type) {
  return {
    id: row.id,
    type,
    username: row.username,
    display_name: row.display_name,
    must_change_password: Boolean(row.must_change_password),
  };
}

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function makeSqliteStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`);
  // Prune expired rows on startup.
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

  return {
    get(sid, cb) {
      try {
        const row = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?').get(sid);
        if (!row || row.expires_at < Date.now()) return cb(null, null);
        cb(null, JSON.parse(row.data));
      } catch (e) { cb(e); }
    },
    set(sid, session, cb) {
      try {
        const expires = Date.now() + SESSION_MAX_AGE_MS;
        db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)')
          .run(sid, JSON.stringify(session), expires);
        cb(null);
      } catch (e) { cb(e); }
    },
    destroy(sid, cb) {
      try {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        cb(null);
      } catch (e) { cb(e); }
    },
  };
}

export async function registerAuth(app, { db }) {
  const secret = process.env.INKHERON_SESSION_SECRET;
  if (!secret) {
    app.log.warn('INKHERON_SESSION_SECRET is not set; using a development secret. Set it in production.');
  }

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: secret ?? 'inkheron-dev-secret-replace-before-deployment',
    store: makeSqliteStore(db),
    cookie: {
      secure: process.env.INKHERON_SESSION_SECURE === 'true',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    },
    saveUninitialized: false,
  });

  app.decorate('requireStudentSession', function requireStudentSession(request, reply, done) {
    if (!request.session?.user) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    if (request.session.user.type !== 'student') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    done();
  });

  app.decorate('requireTeacherSession', function requireTeacherSession(request, reply, done) {
    if (!request.session?.user) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    if (request.session.user.type !== 'teacher') {
      return reply.code(403).send({ error: 'forbidden' });
    }
    done();
  });

  app.decorate('requireCsrfToken', function requireCsrfToken(request, reply, done) {
    const token = request.headers['x-csrf-token'];
    if (!token || !request.session?.csrfToken || token !== request.session.csrfToken) {
      return reply.code(403).send({ error: 'invalid_csrf_token' });
    }
    done();
  });

  function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function attachUserWithCsrf(user, csrfToken) {
    return { ...user, csrf_token: csrfToken };
  }

  function sessionCsrfToken(session) {
    if (!session.csrfToken) {
      session.csrfToken = generateCsrfToken();
    }
    return session.csrfToken;
  }

  app.post('/api/login', async (request, reply) => {
    const username = cleanText(request.body?.username);
    const password = typeof request.body?.password === 'string' ? request.body.password : '';

    if (!username || !password) {
      return reply.code(400).send({ error: 'username_and_password_required' });
    }

    const student = db.prepare(`
      SELECT id, username, display_name, password_hash, must_change_password
      FROM students
      WHERE LOWER(username) = LOWER(?)
    `).get(username);

    if (!student || !(await verifyPassword(password, student.password_hash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const user = publicUser(student, 'student');
    request.session.user = user;
    const csrfToken = sessionCsrfToken(request.session);

    return { user: attachUserWithCsrf(user, csrfToken) };
  });

  app.post('/api/teacher/login', async (request, reply) => {
    const username = cleanText(request.body?.username);
    const password = typeof request.body?.password === 'string' ? request.body.password : '';

    if (!username || !password) {
      return reply.code(400).send({ error: 'username_and_password_required' });
    }

    const teacher = db.prepare(`
      SELECT id, username, display_name, password_hash
      FROM teachers
      WHERE username = ?
    `).get(username);

    if (!teacher || !(await verifyPassword(password, teacher.password_hash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const user = publicUser(teacher, 'teacher');
    request.session.user = user;
    const csrfToken = sessionCsrfToken(request.session);

    return { user: attachUserWithCsrf(user, csrfToken) };
  });

  app.post('/api/setup/teacher', async (request, reply) => {
    const existing = db.prepare('SELECT COUNT(*) as count FROM teachers').get();
    if (existing.count > 0) {
      return reply.code(403).send({ error: 'teacher_already_exists' });
    }

    const username = cleanText(request.body?.username) || 'teacher';
    const displayName = cleanText(request.body?.display_name) || 'Teacher';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';

    if (password.length < 8) {
      return reply.code(400).send({ error: 'password_too_short' });
    }

    const passwordHash = await hashPassword(password);
    const result = db.prepare(`
      INSERT INTO teachers (username, display_name, password_hash)
      VALUES (?, ?, ?)
    `).run(username, displayName, passwordHash);

    const row = db.prepare('SELECT id, username, display_name FROM teachers WHERE id = ?').get(result.lastInsertRowid);
    return reply.code(201).send({ teacher: row });
  });

  app.post('/api/teachers',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request, reply) => {
      const username = cleanText(request.body?.username);
      const displayName = cleanText(request.body?.display_name);
      const password = typeof request.body?.password === 'string' ? request.body.password : '';

      if (!username) return reply.code(400).send({ error: 'username_required' });
      if (!displayName) return reply.code(400).send({ error: 'display_name_required' });
      if (password.length < 8) return reply.code(400).send({ error: 'password_too_short' });

      const passwordHash = await hashPassword(password);
      try {
        const result = db.prepare(`
          INSERT INTO teachers (username, display_name, password_hash)
          VALUES (?, ?, ?)
        `).run(username, displayName, passwordHash);

        const row = db.prepare('SELECT id, username, display_name FROM teachers WHERE id = ?').get(result.lastInsertRowid);
        return reply.code(201).send({ teacher: row });
      } catch (error) {
        if (error.message?.includes('UNIQUE constraint failed')) {
          return reply.code(409).send({ error: 'duplicate' });
        }
        throw error;
      }
    }
  );

  app.post('/api/logout',
    { preValidation: [app.requireCsrfToken] },
    async (request, reply) => {
      if (request.session) {
        request.session.destroy();
      }
      return reply.code(204).send();
    }
  );

  app.get('/api/me', async (request, reply) => {
    if (!request.session?.user) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    const csrfToken = sessionCsrfToken(request.session);
    return { user: attachUserWithCsrf(request.session.user, csrfToken) };
  });

  app.post('/api/students/me/password',
    { preValidation: [app.requireStudentSession, app.requireCsrfToken] },
    async (request, reply) => {
      const user = request.session.user;
      const currentPassword = typeof request.body?.current_password === 'string' ? request.body.current_password : '';
      const newPassword = typeof request.body?.new_password === 'string' ? request.body.new_password : '';

      if (newPassword.length < 8) {
        return reply.code(400).send({ error: 'password_too_short' });
      }

      if (!user.must_change_password) {
        if (!currentPassword) {
          return reply.code(400).send({ error: 'current_password_required' });
        }
        const row = db.prepare('SELECT password_hash FROM students WHERE id = ?').get(user.id);
        if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
          return reply.code(401).send({ error: 'invalid_current_password' });
        }
      }

      const newHash = await hashPassword(newPassword);
      db.prepare(`
        UPDATE students
        SET password_hash = ?, must_change_password = 0
        WHERE id = ?
      `).run(newHash, user.id);

      request.session.user.must_change_password = false;

      return { success: true };
    }
  );
}
