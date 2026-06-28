export const secretSettingKeys = ['openrouter_api_key', 'serverchan_key'];

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
