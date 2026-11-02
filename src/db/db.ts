import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type { DatabaseSync };
export type Param = SQLInputValue;

/** Opens a connection with foreign keys enforced (SQLite leaves them off by default). */
export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  return db;
}

/** Applies schema.sql to an empty database. Fails loudly on a non-empty one. */
export function initSchema(db: DatabaseSync): void {
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf-8'));
}

/** Bumped whenever schema.sql changes; a database built by an older schema must be reset. */
export const SCHEMA_VERSION = 4;

export function schemaVersion(db: DatabaseSync): number {
  return get<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version ?? 0;
}

export function isInitialised(db: DatabaseSync): boolean {
  return schemaVersion(db) >= 1;
}

export function get<T>(db: DatabaseSync, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(db: DatabaseSync, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(db: DatabaseSync, sql: string, ...params: Param[]) {
  return db.prepare(sql).run(...params);
}

/**
 * Runs fn in one write transaction. BEGIN IMMEDIATE takes the write lock up front so
 * read-then-write sequences (publish, restore) cannot interleave with another writer.
 * Not re-entrant: do not call transaction() from inside fn.
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
