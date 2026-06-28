import { testOpenRouterKey, testServerChanKey } from '../services/keyTests.js';

export async function registerSettingsTestRoutes(app, { db }) {
  app.post('/api/settings/test/openrouter',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async () => testOpenRouterKey(db)
  );

  app.post('/api/settings/test/serverchan',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async () => testServerChanKey(db)
  );
}
