import { readSecretSettings, writeSecretSettings, readAdminExportUrl, writeAdminExportUrl, readCurrentSemester, writeCurrentSemester, readDoerIntent, writeDoerIntent, readCheckerIntent, writeCheckerIntent } from '../services/settingsStore.js';
import { testOpenRouterKey, testServerChanKey } from '../services/keyTests.js';

function intentFamily(intent) {
  const lower = String(intent ?? '').toLowerCase();
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('zhipu') || lower.includes('glm')) return 'zhipu';
  if (lower.includes('google') || lower.includes('gemini')) return 'google';
  if (lower.includes('openai') || lower.includes('gpt')) return 'openai';
  if (lower.includes('moonshot') || lower.includes('kimi')) return 'moonshot';
  return lower.split(/\s+/)[0] || 'unknown';
}

export async function registerSettingsRoutes(app, { db }) {
  app.get('/api/settings',
    { preValidation: [app.requireTeacherSession] },
    async () => ({
      settings: readSecretSettings(db),
      admin_export_url: readAdminExportUrl(db),
      current_semester: readCurrentSemester(db),
      ai_doer_intent: readDoerIntent(db),
      ai_checker_intent: readCheckerIntent(db),
    })
  );

  app.patch('/api/settings',
    { preValidation: [app.requireTeacherSession, app.requireCsrfToken] },
    async (request) => {
      const { admin_export_url, current_semester, ai_doer_intent, ai_checker_intent, ...secretInput } = request.body ?? {};
      const hasSecretInput = Object.keys(secretInput).length > 0;
      const hasUrlInput = typeof admin_export_url === 'string' && admin_export_url.trim().length > 0;
      const hasSemesterInput = typeof current_semester === 'string' && current_semester.trim().length > 0;
      const hasDoerInput = typeof ai_doer_intent === 'string' && ai_doer_intent.trim().length > 0;
      const hasCheckerInput = typeof ai_checker_intent === 'string' && ai_checker_intent.trim().length > 0;
      if (!hasSecretInput && !hasUrlInput && !hasSemesterInput && !hasDoerInput && !hasCheckerInput) {
        const err = new Error('settings_required');
        err.statusCode = 400;
        throw err;
      }
      const nextDoer = hasDoerInput ? ai_doer_intent.trim() : readDoerIntent(db);
      const nextChecker = hasCheckerInput ? ai_checker_intent.trim() : readCheckerIntent(db);
      if (intentFamily(nextDoer) === intentFamily(nextChecker)) {
        const err = new Error('checker_must_be_different_family');
        err.statusCode = 400;
        throw err;
      }
      const settings = hasSecretInput ? writeSecretSettings(db, secretInput) : readSecretSettings(db);
      if (hasUrlInput) writeAdminExportUrl(db, admin_export_url);
      if (hasSemesterInput) writeCurrentSemester(db, current_semester);
      if (hasDoerInput) writeDoerIntent(db, ai_doer_intent);
      if (hasCheckerInput) writeCheckerIntent(db, ai_checker_intent);
      return {
        settings,
        admin_export_url: readAdminExportUrl(db),
        current_semester: readCurrentSemester(db),
        ai_doer_intent: readDoerIntent(db),
        ai_checker_intent: readCheckerIntent(db),
      };
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
