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
  if (schemaVersion(db) === 5) {
    // SQLite cannot widen a CHECK constraint in place. Rebuild only this table while preserving IDs;
    // dependent rows keep their staff_users references, checked again before committing.
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE staff_users_new (
          id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'agent', 'editor')),
          password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        INSERT INTO staff_users_new (id, email, name, role, password_hash, active, created_at)
          SELECT id, email, name, role, password_hash, active, created_at FROM staff_users;
        DROP TABLE staff_users;
        ALTER TABLE staff_users_new RENAME TO staff_users;
        CREATE TABLE blog_posts (
          id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          CHECK (slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*')
        );
        CREATE TABLE blog_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
          version_no INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'superseded')),
          lock_version INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, excerpt TEXT NOT NULL,
          body_markdown TEXT NOT NULL, category TEXT NOT NULL, cover_photo_id TEXT,
          seo_title TEXT NOT NULL, seo_description TEXT NOT NULL, related_codes_json TEXT NOT NULL,
          created_by INTEGER NOT NULL REFERENCES staff_users(id),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          published_at TEXT, UNIQUE (post_id, version_no)
        );
        CREATE UNIQUE INDEX ux_blog_draft ON blog_versions(post_id) WHERE status='draft';
        CREATE UNIQUE INDEX ux_blog_live ON blog_versions(post_id) WHERE status='published';
        CREATE INDEX ix_blog_live_category ON blog_versions(status, category, published_at);
        PRAGMA user_version = 6;
        COMMIT;`);
      const invalid = db.prepare('PRAGMA foreign_key_check').all();
      if (invalid.length) throw new Error('Blog migration left invalid foreign keys');
    } catch (err) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw err;
    } finally { db.exec('PRAGMA foreign_keys = ON'); }
  }
  if (schemaVersion(db) === 6) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE package_quotes (
      id INTEGER PRIMARY KEY,
      public_token TEXT NOT NULL UNIQUE,
      enquiry_id INTEGER NOT NULL REFERENCES enquiries(id),
      package_version_id INTEGER NOT NULL REFERENCES package_versions(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'mock_recorded')),
      start_date TEXT NOT NULL,
      adults INTEGER NOT NULL CHECK (adults BETWEEN 1 AND 50),
      children INTEGER NOT NULL CHECK (children BETWEEN 0 AND 20),
      snapshot_json TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES staff_users(id),
      approved_by INTEGER REFERENCES staff_users(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      approved_at TEXT,
      recorded_at TEXT
    );
    CREATE INDEX ix_package_quotes_enquiry ON package_quotes(enquiry_id, created_at DESC);
    PRAGMA user_version = 7;
    COMMIT;`);
  if (schemaVersion(db) === 7) db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE enquiries ADD COLUMN intake_channel TEXT NOT NULL DEFAULT 'web' CHECK (intake_channel IN ('web','email','chat','whatsapp','phone'));
    ALTER TABLE enquiries ADD COLUMN entered_by INTEGER REFERENCES staff_users(id);
    PRAGMA user_version = 8;
    COMMIT;`);
}
