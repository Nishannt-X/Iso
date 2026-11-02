import { schemaVersion, type DatabaseSync } from './db.js';

/** Additive migration for existing local S4 databases. Keep traveller and staff records intact. */
export function migrateSchema(db: DatabaseSync): void {
  if (schemaVersion(db) === 3) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE enquiry_analysis (
      enquiry_id INTEGER PRIMARY KEY REFERENCES enquiries(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('gemini', 'local_fallback')),
      status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted')),
      fields_json TEXT NOT NULL,
      suggestions_json TEXT NOT NULL,
      reply_opening TEXT NOT NULL,
      uncertainty TEXT NOT NULL,
      analysed_at TEXT NOT NULL,
      accepted_by INTEGER REFERENCES staff_users(id),
      accepted_at TEXT
    );
    PRAGMA user_version = 4;
    COMMIT;`);
  if (schemaVersion(db) === 4) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE package_publication_schedule (
      package_id INTEGER PRIMARY KEY REFERENCES packages(id) ON DELETE CASCADE,
      draft_id INTEGER NOT NULL REFERENCES package_versions(id),
      publish_at TEXT NOT NULL,
      note TEXT NOT NULL,
      expected_lock_version INTEGER NOT NULL,
      scheduled_by INTEGER NOT NULL REFERENCES staff_users(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed', 'cancelled')),
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX ix_publication_due ON package_publication_schedule(status, publish_at);
    PRAGMA user_version = 5;
    COMMIT;`);
}
