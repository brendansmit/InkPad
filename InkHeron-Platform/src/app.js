import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { openDatabase } from './db/database.js';
import { registerIdentityRoutes } from './routes/identity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

export async function buildApp(options = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
  });
  const db = options.db ?? openDatabase(options.databasePath);

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

  await registerIdentityRoutes(app, { db });

  app.get('/', async (_request, reply) => reply.sendFile('index.html', publicDir));

  return app;
}
