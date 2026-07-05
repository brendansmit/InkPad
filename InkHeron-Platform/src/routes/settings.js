import { readSecretSettings, writeSecretSettings, readAdminExportUrl, writeAdminExportUrl } from '../services/settingsStore.js';
import { testOpenRouterKey, testServerChanKey } from '../services/keyTests.js';

export async function registerSettingsRoutes(app, { db }) {
  app.get('/api/settings',
    { preValidation: [app.requireTeacherSession] },
    async () => ({ settings: readSecretSettings(db), admin_export_url: readAdminExportUrl(db) })
  );

  app.patch('/api/settings',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const { admin_export_url, ...secretInput } = request.body ?? {};
      const hasSecretInput = Object.keys(secretInput).length > 0;
      const hasUrlInput = typeof admin_export_url === 'string' && admin_export_url.trim().length > 0;
      if (!hasSecretInput && !hasUrlInput) {
        const err = new Error('settings_required');
        err.statusCode = 400;
        throw err;
      }
      const settings = hasSecretInput ? writeSecretSettings(db, secretInput) : readSecretSettings(db);
      if (hasUrlInput) writeAdminExportUrl(db, admin_export_url);
      return { settings, admin_export_url: readAdminExportUrl(db) };
    }
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
