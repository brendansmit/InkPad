import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { openDatabase } from './db/database.js';
import { registerIdentityRoutes } from './routes/identity.js';
import { registerAuth } from './routes/auth.js';
import { registerPadRoutes } from './routes/pads.js';
import { registerNativePadRoutes } from './routes/nativePads.js';
import { registerAssignmentRoutes } from './routes/assignments.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerSettingsTestRoutes } from './routes/settingsTests.js';
import { registerLibraryRoutes } from './routes/library.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
const defaultLibraryUploadsDir = path.join(__dirname, '..', 'data', 'eap-library', 'uploads');

function defaultDatabasePath() {
  return path.join(__dirname, '..', 'data', 'inkheron.db');
}

export async function buildApp(options = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? process.env.INKHERON_TRUST_PROXY === 'true',
  });
  const databasePath = options.databasePath ?? process.env.INKHERON_DB_PATH ?? defaultDatabasePath();
  const libraryUploadsDir = options.libraryUploadsDir ?? process.env.EAP_LIBRARY_UPLOADS_DIR ?? defaultLibraryUploadsDir;
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

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1,
    },
  });

  fs.mkdirSync(libraryUploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: libraryUploadsDir,
    prefix: '/library/uploads/',
    decorateReply: false,
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
  await registerSettingsTestRoutes(app, { db });
  await registerLibraryRoutes(app, { db, uploadsDir: libraryUploadsDir });
  await registerPadRoutes(app, { db, etherpadService: options.etherpadService, padSuffixGenerator: options.padSuffixGenerator });
  await registerNativePadRoutes(app, { db });

  app.get('/login', async (_request, reply) => reply.sendFile('login.html', publicDir));
  app.get('/student/change-password', async (_request, reply) => reply.sendFile('student-change-password.html', publicDir));
  app.get('/teacher-login', async (_request, reply) => reply.sendFile('teacher-login.html', publicDir));
  app.get('/teacher', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/index.html', publicDir));
  app.get('/teacher/students', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/students.html', publicDir));
  app.get('/teacher/assignments', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/assignments.html', publicDir));
  app.get('/teacher/review', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/review.html', publicDir));
  app.get('/teacher/timeslider', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/timeslider.html', publicDir));
  app.get('/teacher/new-assignment', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/new-assignment.html', publicDir));
  app.get('/teacher/settings', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/settings.html', publicDir));
  app.get('/student', async (_request, reply) => reply.sendFile('student-dashboard.html', publicDir));
  app.get('/library', async (_request, reply) => reply.sendFile('eap-library.html', publicDir));
  app.get('/library/admin', async (_request, reply) => reply.sendFile('eap-library-admin.html', publicDir));
  app.get('/', async (_request, reply) => reply.sendFile('index.html', publicDir));

  return app;
}
