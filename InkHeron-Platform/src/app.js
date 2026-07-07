import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { openDatabase } from './db/database.js';
import { registerIdentityRoutes } from './routes/identity.js';
import { registerAuth } from './routes/auth.js';
import { registerNativePadRoutes } from './routes/nativePads.js';
import { registerNativeReanalyzeRoutes } from './routes/nativeReanalyze.js';
import { registerClassInsightsRoutes } from './routes/classInsights.js';
import { registerAssignmentRoutes } from './routes/assignments.js';
import { registerTestRoutes } from './routes/tests.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerSettingsTestRoutes } from './routes/settingsTests.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerFeedbackAssetRoutes } from './routes/feedbackAssets.js';

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

  // Heavy vendored assets (the 1.2 MB PDF.js worker, fonts) never change per
  // deploy, so cache them for a year and immutable. Once a browser has them
  // it never touches the network for them again, which matters on slow or
  // flaky school networks where re-fetching a big file on every pad load can
  // intermittently fail. The app's own HTML/CSS/JS is left to revalidate
  // (default) so deploys are picked up immediately.
  const IMMUTABLE_ASSET = /([/\\]static[/\\]pdfjs[/\\]|\.woff2?$|\.ttf$|\.otf$)/i;
  // cacheControl:false so @fastify/static does not force max-age=0; we set the
  // header ourselves per file. Immutable assets get a year; everything else
  // keeps revalidate-on-every-load so deploys are picked up immediately.
  const setStaticHeaders = (res, filePath) => {
    res.setHeader(
      'Cache-Control',
      IMMUTABLE_ASSET.test(filePath) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'
    );
  };

  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/assets/',
    index: false,
    cacheControl: false,
    setHeaders: setStaticHeaders,
  });

  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/static/',
    decorateReply: false,
    index: false,
    cacheControl: false,
    setHeaders: setStaticHeaders,
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
  await registerTestRoutes(app, { db });
  await registerSettingsRoutes(app, { db });
  await registerSettingsTestRoutes(app, { db });
  await registerLibraryRoutes(app, { db, uploadsDir: libraryUploadsDir });
  await registerFeedbackAssetRoutes(app, { db });
  await registerNativePadRoutes(app, { db });
  await registerNativeReanalyzeRoutes(app, { db });
  await registerClassInsightsRoutes(app, { db });

  app.get('/login', async (_request, reply) => reply.sendFile('login.html', publicDir));
  app.get('/student/change-password', async (_request, reply) => reply.sendFile('student-change-password.html', publicDir));
  app.get('/teacher-login', async (_request, reply) => reply.sendFile('teacher-login.html', publicDir));
  app.get('/teacher', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/index.html', publicDir));
  app.get('/teacher/students', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/students.html', publicDir));
  app.get('/teacher/assignments', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/assignments.html', publicDir));
  app.get('/teacher/native-review', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/native-review.html', publicDir));
  app.get('/teacher/student-profile', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/student-profile.html', publicDir));
  app.get('/teacher/class-insights', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/class-insights.html', publicDir));
  app.get('/teacher/new-assignment', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/new-assignment.html', publicDir));
  app.get('/teacher/settings', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/settings.html', publicDir));
  app.get('/teacher/feedback', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('teacher/feedback.html', publicDir));
  app.get('/student', async (_request, reply) => reply.sendFile('student-dashboard.html', publicDir));
  app.get('/native/feedback/:assignmentId', { preValidation: [app.requireStudentSession] }, async (_request, reply) => reply.sendFile('native-feedback.html', publicDir));
  app.get('/library', async (_request, reply) => reply.sendFile('eap-library.html', publicDir));
  app.get('/library/admin', { preValidation: [app.requireTeacherSession] }, async (_request, reply) => reply.sendFile('eap-library-admin.html', publicDir));
  // Two domains share this app: inkpad.* is the writing portal, whose root
  // is the student/teacher chooser (signout links land there); any other
  // host gets the EAP portal landing page.
  app.get('/', async (request, reply) => {
    const host = String(request.headers.host ?? '');
    if (host.startsWith('inkpad.')) return reply.sendFile('inkpad-home.html', publicDir);
    return reply.sendFile('index.html', publicDir);
  });

  return app;
}
