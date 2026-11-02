-- Company A Kochi tour operator: S1 schema (catalogue, versions, pricing config).
-- Applied to an empty database by initSchema(); `npm run db:reset` rebuilds from scratch.
-- Later slices append their tables (enquiries, outbox, sessions...) here.
-- Foreign keys are enforced per connection by openDb() (PRAGMA foreign_keys=ON).

CREATE TABLE staff_users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  -- agent: triage enquiries. admin: also create, edit and publish packages.
  role          TEXT NOT NULL CHECK (role IN ('admin', 'agent')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A package is a stable identity. Content lives in package_versions.
-- There is deliberately no "live version" pointer: the live version is the single
-- row with status='published' (view live_versions), so there is no FK cycle.
CREATE TABLE packages (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,   -- e.g. PKG-KL-07
  slug        TEXT NOT NULL UNIQUE,   -- editable until first publish, then locked (trigger below)
  -- 'brief' = code and listed prices come from the client brief (text is still placeholder);
  -- 'synthetic' = invented demo data.
  data_origin TEXT NOT NULL CHECK (data_origin IN ('brief', 'synthetic')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*')
);

-- AUTOINCREMENT: ids are never reused, so a discarded draft's id cannot be inherited by a later
-- draft and silently accept a stale editor's save (same id, same lock_version).
CREATE TABLE package_versions (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id                INTEGER NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  version_no                INTEGER NOT NULL CHECK (version_no >= 1),
  status                    TEXT NOT NULL CHECK (status IN ('draft', 'published', 'superseded')),
  lock_version              INTEGER NOT NULL DEFAULT 1,  -- optimistic lock for draft saves (I8)
  title                     TEXT NOT NULL,
  summary                   TEXT NOT NULL,
  days                      INTEGER NOT NULL CHECK (days >= 1),
  nights                    INTEGER NOT NULL CHECK (nights >= 0),
  star_rating               INTEGER CHECK (star_rating BETWEEN 1 AND 5),
  region                    TEXT NOT NULL,
  -- No default child or single-supplement rule exists in the brief, so these stay NULL
  -- until staff set them. NULL means "not priced", never zero.
  child_pct                 INTEGER CHECK (child_pct IS NULL OR child_pct BETWEEN 0 AND 100),
  child_rule_note           TEXT,
  single_supp_inr           INTEGER CHECK (single_supp_inr IS NULL OR single_supp_inr > 0),
  itinerary_json            TEXT NOT NULL,
  inclusions_json           TEXT NOT NULL,
  exclusions_json           TEXT NOT NULL,
  created_by                INTEGER NOT NULL REFERENCES staff_users(id),
  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_at              TEXT,
  change_note               TEXT NOT NULL DEFAULT '',
  restored_from_version_id  INTEGER REFERENCES package_versions(id) ON DELETE RESTRICT,
  UNIQUE (package_id, version_no)
);

-- I1: at most one draft and at most one published version per package.
CREATE UNIQUE INDEX ux_one_draft_per_package
  ON package_versions(package_id) WHERE status = 'draft';
CREATE UNIQUE INDEX ux_one_published_per_package
  ON package_versions(package_id) WHERE status = 'published';

-- Public routes read only this view.
CREATE VIEW live_versions AS
  SELECT * FROM package_versions WHERE status = 'published';

CREATE TABLE package_version_destinations (
  id         INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES package_versions(id) ON DELETE RESTRICT,
  position   INTEGER NOT NULL,
  name       TEXT NOT NULL,
  UNIQUE (version_id, position)
);

CREATE TABLE package_version_tags (
  id         INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES package_versions(id) ON DELETE RESTRICT,
  tag        TEXT NOT NULL,
  UNIQUE (version_id, tag)
);

CREATE TABLE package_version_seasons (
  id                 INTEGER PRIMARY KEY,
  version_id         INTEGER NOT NULL REFERENCES package_versions(id) ON DELETE RESTRICT,
  position           INTEGER NOT NULL,
  name               TEXT NOT NULL,
  start_md           TEXT NOT NULL CHECK (start_md GLOB '[0-1][0-9]-[0-3][0-9]'),  -- MM-DD, inclusive
  end_md             TEXT NOT NULL CHECK (end_md GLOB '[0-1][0-9]-[0-3][0-9]'),    -- MM-DD, inclusive; may wrap past Dec 31
  price_pp_twin_inr  INTEGER NOT NULL CHECK (price_pp_twin_inr > 0),
  -- 1 = the date range is an assumption of this build, not a fact from the brief (shown in the UI).
  range_assumed      INTEGER NOT NULL DEFAULT 0 CHECK (range_assumed IN (0, 1)),
  UNIQUE (version_id, position)
);

-- gst_rate_bp is deliberately NOT seeded: the brief gives no tax rate.
CREATE TABLE pricing_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  note  TEXT
);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY,
  actor_id  INTEGER REFERENCES staff_users(id),
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  meta_json TEXT,
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- I2: version immutability.
-- Draft rows are editable. A published row may only move to 'superseded' with every
-- other column unchanged. Superseded rows never change. Non-draft rows are never deleted.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_versions_draft_transition
BEFORE UPDATE ON package_versions
WHEN OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'published')
BEGIN
  SELECT RAISE(ABORT, 'a draft version can only stay draft or become published');
END;

CREATE TRIGGER trg_versions_published_frozen
BEFORE UPDATE ON package_versions
WHEN OLD.status = 'published' AND NOT (
  NEW.status = 'superseded'
  AND NEW.id IS OLD.id AND NEW.package_id IS OLD.package_id AND NEW.version_no IS OLD.version_no
  AND NEW.lock_version IS OLD.lock_version AND NEW.title IS OLD.title AND NEW.summary IS OLD.summary
  AND NEW.days IS OLD.days AND NEW.nights IS OLD.nights AND NEW.star_rating IS OLD.star_rating
  AND NEW.region IS OLD.region AND NEW.child_pct IS OLD.child_pct
  AND NEW.child_rule_note IS OLD.child_rule_note AND NEW.single_supp_inr IS OLD.single_supp_inr
  AND NEW.itinerary_json IS OLD.itinerary_json AND NEW.inclusions_json IS OLD.inclusions_json
  AND NEW.exclusions_json IS OLD.exclusions_json AND NEW.created_by IS OLD.created_by
  AND NEW.created_at IS OLD.created_at AND NEW.updated_at IS OLD.updated_at
  AND NEW.published_at IS OLD.published_at AND NEW.change_note IS OLD.change_note
  AND NEW.restored_from_version_id IS OLD.restored_from_version_id
)
BEGIN
  SELECT RAISE(ABORT, 'a published version is immutable; it can only be superseded');
END;

CREATE TRIGGER trg_versions_superseded_frozen
BEFORE UPDATE ON package_versions
WHEN OLD.status = 'superseded'
BEGIN
  SELECT RAISE(ABORT, 'a superseded version is immutable');
END;

CREATE TRIGGER trg_versions_no_delete_non_draft
BEFORE DELETE ON package_versions
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'published and superseded versions cannot be deleted');
END;

-- Slug lock: once a package has ever been published (any non-draft version), its slug is fixed.
-- This replaces a redirect engine: public URLs never move.
CREATE TRIGGER trg_packages_slug_locked
BEFORE UPDATE OF slug ON packages
WHEN NEW.slug <> OLD.slug
  AND EXISTS (SELECT 1 FROM package_versions WHERE package_id = OLD.id AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'slug is locked after the first publish');
END;

-- ---------------------------------------------------------------------------
-- I2b: child rows (destinations, tags, seasons) follow their parent's immutability.
-- INSERT, UPDATE and DELETE are rejected unless the parent version is a draft.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_destinations_ins BEFORE INSERT ON package_version_destinations
WHEN (SELECT status FROM package_versions WHERE id = NEW.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;
CREATE TRIGGER trg_destinations_upd BEFORE UPDATE ON package_version_destinations
WHEN (SELECT status FROM package_versions WHERE id = OLD.version_id) <> 'draft'
  OR (SELECT status FROM package_versions WHERE id = NEW.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;
CREATE TRIGGER trg_destinations_del BEFORE DELETE ON package_version_destinations
WHEN (SELECT status FROM package_versions WHERE id = OLD.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;

CREATE TRIGGER trg_tags_ins BEFORE INSERT ON package_version_tags
WHEN (SELECT status FROM package_versions WHERE id = NEW.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;
CREATE TRIGGER trg_tags_upd BEFORE UPDATE ON package_version_tags
WHEN (SELECT status FROM package_versions WHERE id = OLD.version_id) <> 'draft'
  OR (SELECT status FROM package_versions WHERE id = NEW.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;
CREATE TRIGGER trg_tags_del BEFORE DELETE ON package_version_tags
WHEN (SELECT status FROM package_versions WHERE id = OLD.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;

CREATE TRIGGER trg_seasons_ins BEFORE INSERT ON package_version_seasons
WHEN (SELECT status FROM package_versions WHERE id = NEW.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;
CREATE TRIGGER trg_seasons_upd BEFORE UPDATE ON package_version_seasons
WHEN (SELECT status FROM package_versions WHERE id = OLD.version_id) <> 'draft'
  OR (SELECT status FROM package_versions WHERE id = NEW.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;
CREATE TRIGGER trg_seasons_del BEFORE DELETE ON package_version_seasons
WHEN (SELECT status FROM package_versions WHERE id = OLD.version_id) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'child rows of a non-draft version are immutable'); END;

PRAGMA user_version = 1;
