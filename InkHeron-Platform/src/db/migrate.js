import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..', '..');
const migrationsDir = path.join(projectRoot, 'migrations');

export function defaultDatabasePath() {
  return path.join(projectRoot, 'data', 'inkheron.db');
}

export function runMigrations(databasePath = process.env.INKHERON_DB_PATH ?? defaultDatabasePath()) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrations = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const applied = [];
    const skipped = [];

    for (const file of migrations) {
      const exists = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(file);
      if (exists) {
        skipped.push(file);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      db.exec('BEGIN');
      try {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(file);
        db.exec('COMMIT');
        applied.push(file);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }

    return { databasePath, applied, skipped };
  } finally {
    db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runMigrations(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
}
