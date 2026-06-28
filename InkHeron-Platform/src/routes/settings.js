import { readSecretSettings, writeSecretSettings } from '../services/settingsStore.js';

export async function registerSettingsRoutes(app, { db }) {
  app.get('/api/settings',
    { preValidation: [app.requireTeacherSession] },
    async () => ({ settings: readSecretSettings(db) })
  );

  app.patch('/api/settings',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => ({ settings: writeSecretSettings(db, request.body) })
  );
}
