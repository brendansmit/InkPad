import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { openDatabase } from './db/database.js';
import { registerIdentityRoutes } from './routes/identity.js';
import { registerAuth } from './routes/auth.js';
import { registerPadRoutes } from './routes/pads.js';
import { registerAssignmentRoutes } from './routes/assignments.js';
import { registerSettingsRoutes } from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

function defaultDatabasePath() {
  return path.join(__dirname, '..', 'data', 'inkheron.db');
}

export async function buildApp(options = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? process.env.INKHERON_TRUST_PROXY === 'true',
  });
  const databasePath = options.databasePath ?? process.env.INKHERON_DB_PATH ?? defaultDatabasePath();
  const db = options.db ?? openDatabase(databasePath);
  app._databasePath = databasePath;

  app.addHook('onClose', async () => {
    db.close();
  });

  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/assets/',
    index: false,
  });

  app.get('/healthz', async () => ({
    ok: true,
    service: 'inkheron-wrapper',
  }));

  app.setErrorHandler(async (error, _request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'validation_error', message: error.message });
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) app.log.error(error);
    return reply.code(statusCode).send({ error: error.message ?? 'internal_error' });
  });

  await registerAuth(app, { db });
  await registerIdentityRoutes(app, { db });
  await registerAssignmentRoutes(app, { db });
  await registerSettingsRoutes(app, { db });
  await registerPadRoutes(app, { db, etherpadService: options.etherpadService });

  app.get('/login', async (_request, reply) => reply.sendFile('login.html', publicDir));
  app.get('/student/change-password', async (_request, reply) => reply.sendFile('student-change-password.html', publicDir));
  app.get('/teacher-login', async (_request, reply) => reply.sendFile('teacher-login.html', publicDir));
  app.get('/teacher', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/index.html', publicDir));
  app.get('/teacher/students', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/students.html', publicDir));
  app.get('/teacher/assignments', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/assignments.html', publicDir));
  app.get('/teacher/review', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/review.html', publicDir));
  app.get('/', async (_request, reply) => reply.sendFile('index.html', publicDir));

  return app;
}
