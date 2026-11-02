import { schemaVersion, type DatabaseSync } from './db.js';

/** Additive migration for existing local S4 databases. Keep traveller and staff records intact. */
export function migrateSchema(db: DatabaseSync): void {
  if (schemaVersion(db) !== 3) return;
  db.exec(`BEGIN IMMEDIATE;
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
}
