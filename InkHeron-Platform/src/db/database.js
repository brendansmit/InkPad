import { DatabaseSync } from 'node:sqlite';
import { defaultDatabasePath, runMigrations } from './migrate.js';

export function openDatabase(databasePath = process.env.INKHERON_DB_PATH ?? defaultDatabasePath()) {
  runMigrations(databasePath);
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
