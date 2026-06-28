import { readSecretSettings, writeSecretSettings } from '../services/settingsStore.js';
import { testOpenRouterKey, testServerChanKey } from '../services/keyTests.js';

export async function registerSettingsRoutes(app, { db }) {
  app.get('/api/settings',
    { preValidation: [app.requireTeacherSession] },
    async () => ({ settings: readSecretSettings(db) })
  );

  app.patch('/api/settings',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => ({ settings: writeSecretSettings(db, request.body) })
  );

  app.post('/api/settings/test-openrouter',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (_request, reply) => {
      const result = await testOpenRouterKey(db);
      return reply.code(result.ok ? 200 : 400).send(result);
    }
  );

  app.post('/api/settings/test-serverchan',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (_request, reply) => {
      const result = await testServerChanKey(db);
      return reply.code(result.ok ? 200 : 400).send(result);
    }
  );
}
