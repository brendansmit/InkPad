export const secretSettingKeys = ['openrouter_api_key', 'serverchan_key', 'admin_export_key'];
export const ADMIN_EXPORT_URL_DEFAULT = 'https://admin.inkheron.app';
export const CURRENT_SEMESTER_DEFAULT = 'S1';
const SEMESTERS = new Set(['S1', 'S2']);

function cleanSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function maskSecret(value) {
  const secret = cleanSecret(value);
  if (!secret) return null;
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}

export function publicSecretSetting(row) {
  const value = cleanSecret(row?.value);
  return {
    is_set: Boolean(value),
    masked: maskSecret(value),
    updated_at: row?.updated_at ?? null,
  };
}

export function readSecretSettings(db) {
  const rows = db.prepare(`
    SELECT key, value, updated_at
    FROM settings
    WHERE key IN (${secretSettingKeys.map(() => '?').join(',')})
  `).all(...secretSettingKeys);
  const byKey = new Map(rows.map(row => [row.key, row]));
  return Object.fromEntries(
    secretSettingKeys.map(key => [key, publicSecretSetting(byKey.get(key))])
  );
}

export function readRawSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value?.trim() ?? null;
}

export function readAdminExportUrl(db) {
  return readRawSetting(db, 'admin_export_url') || ADMIN_EXPORT_URL_DEFAULT;
}

export function writeAdminExportUrl(db, value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('admin_export_url', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(trimmed || ADMIN_EXPORT_URL_DEFAULT);
  return readAdminExportUrl(db);
}

export function readCurrentSemester(db) {
  const value = readRawSetting(db, 'current_semester');
  return SEMESTERS.has(value) ? value : CURRENT_SEMESTER_DEFAULT;
}

export function writeCurrentSemester(db, value) {
  const semester = SEMESTERS.has(value) ? value : CURRENT_SEMESTER_DEFAULT;
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('current_semester', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(semester);
  return readCurrentSemester(db);
}


// The Doer model family for all heavy AI extraction (literacy coder, rubric
// estimate, rewrite judge, suggesters). A fuzzy intent, never an exact id
// (CLAUDE.md §8). Default is DeepSeek: strong on Chinese-English transfer
// errors, cheap, and it outperformed haiku on finding density in the live
// smoke test. The Checker stays a DIFFERENT family (gemini flash).
const DOER_INTENT_DEFAULT = 'deepseek chat v3';

export function readDoerIntent(db) {
  const value = (readRawSetting(db, 'ai_doer_intent') ?? '').trim();
  return value || DOER_INTENT_DEFAULT;
}

export function writeDoerIntent(db, value) {
  const intent = String(value ?? '').trim().slice(0, 120) || DOER_INTENT_DEFAULT;
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('ai_doer_intent', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(intent);
  return readDoerIntent(db);
}

export function writeSecretSettings(db, input) {
  const updates = Object.entries(input ?? {})
    .filter(([key]) => secretSettingKeys.includes(key));
  if (!updates.length) {
    const err = new Error('settings_required');
    err.statusCode = 400;
    throw err;
  }

  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  db.exec('BEGIN');
  try {
    for (const [key, value] of updates) {
      upsert.run(key, cleanSecret(value));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return readSecretSettings(db);
}
