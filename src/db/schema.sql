-- Company A Kochi tour operator: S1 schema (catalogue, versions, pricing config).
-- Applied to an empty database by initSchema(); `npm run db:reset` rebuilds from scratch.
-- Later slices append their tables (AI extractions...) here.
-- Foreign keys are enforced per connection by openDb() (PRAGMA foreign_keys=ON).

CREATE TABLE staff_users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  -- agent: triage enquiries. admin: also create, edit and publish packages.
  role          TEXT NOT NULL CHECK (role IN ('admin', 'agent')),
  password_hash TEXT NOT NULL,
  -- 0 = cannot sign in and cannot be assigned work (the seed's system owner, or a staff member who left).
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
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

-- ---------------------------------------------------------------------------
-- S3: public enquiries and the mock outbox.
-- ---------------------------------------------------------------------------

-- One row per submitted enquiry: an immutable record of exactly what the traveller sent
-- (trg_enquiries_immutable). Staff workflow (status, assignment, notes) and AI output live in
-- later tables that reference enquiries.id, so the original message is always available to compare.
CREATE TABLE enquiries (
  id                      INTEGER PRIMARY KEY,
  -- Random 8-character code the traveller can quote. It is not an access key.
  reference               TEXT NOT NULL UNIQUE,
  -- 192-bit random token in the public status link /enquiry/received/:token. Treat as a secret.
  public_token            TEXT NOT NULL UNIQUE,
  -- Idempotency key issued with the form, so a resubmission returns the same enquiry.
  submission_key          TEXT NOT NULL UNIQUE,
  -- SHA-256 of the normalised submission, to recognise an identical resend from a fresh form.
  dedupe_hash             TEXT NOT NULL,
  -- 'seed_sample' marks the brief's sample enquiry inserted by the seed; everything else is 'web_form'.
  origin                  TEXT NOT NULL DEFAULT 'web_form' CHECK (origin IN ('web_form', 'seed_sample')),
  -- The package version that was live when the form was sent. The package is reached through it.
  source_version_id       INTEGER NOT NULL REFERENCES package_versions(id) ON DELETE RESTRICT,
  name                    TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email                   TEXT CHECK (email IS NULL OR length(email) <= 254),
  phone                   TEXT CHECK (phone IS NULL OR length(phone) <= 20),
  travel_start            TEXT CHECK (travel_start IS NULL OR travel_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  adults                  INTEGER NOT NULL CHECK (adults BETWEEN 1 AND 50),
  children                INTEGER NOT NULL CHECK (children BETWEEN 0 AND 20),
  child_ages_json         TEXT NOT NULL DEFAULT '[]',
  destination             TEXT CHECK (destination IS NULL OR length(destination) <= 120),
  -- NULL means "not given", never zero. The basis says whether the figure is for the whole party.
  budget_inr              INTEGER CHECK (budget_inr IS NULL OR budget_inr > 0),
  budget_basis            TEXT CHECK (budget_basis IS NULL OR budget_basis IN ('total', 'per_person')),
  -- The traveller's own words, kept verbatim after control characters are stripped.
  message                 TEXT NOT NULL CHECK (length(message) <= 2000),
  -- WhatsApp consent is separate from submitting the form. The wording shown is stored with it.
  whatsapp_consent        INTEGER NOT NULL CHECK (whatsapp_consent IN (0, 1)),
  whatsapp_consent_text   TEXT,
  whatsapp_consent_at     TEXT,
  privacy_notice_version  TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- A way to reply; a budget always comes with its basis; consent needs a phone number and its recorded wording.
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK ((budget_inr IS NULL) = (budget_basis IS NULL)),
  CHECK (whatsapp_consent = 0 OR (phone IS NOT NULL AND whatsapp_consent_text IS NOT NULL AND whatsapp_consent_at IS NOT NULL))
);
CREATE INDEX ix_enquiries_dedupe ON enquiries(dedupe_hash, created_at);
CREATE INDEX ix_enquiries_created ON enquiries(created_at);
CREATE INDEX ix_enquiries_version ON enquiries(source_version_id);

CREATE TRIGGER trg_enquiries_immutable
BEFORE UPDATE ON enquiries
BEGIN
  SELECT RAISE(ABORT, 'an enquiry is an immutable record of what the traveller submitted');
END;

-- Messages the system would send. No transport exists: delivery can only be 'mock_recorded'.
-- A real transport would change that CHECK deliberately, in its own migration.
CREATE TABLE outbox_messages (
  id               INTEGER PRIMARY KEY,
  enquiry_id       INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  -- 'acknowledgement' is the automatic fixed template. 'staff_reply' is a reply a named staff member approved (S4).
  kind             TEXT NOT NULL CHECK (kind IN ('acknowledgement', 'staff_reply')),
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  recipient        TEXT NOT NULL,
  subject          TEXT,
  body             TEXT NOT NULL,
  template_version TEXT NOT NULL,
  delivery         TEXT NOT NULL DEFAULT 'mock_recorded' CHECK (delivery = 'mock_recorded'),
  -- The staff member who approved a reply. Required for staff replies, empty for automatic acknowledgements.
  approved_by      INTEGER REFERENCES staff_users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((kind = 'staff_reply') = (approved_by IS NOT NULL))
);
CREATE UNIQUE INDEX ux_one_acknowledgement_per_enquiry
  ON outbox_messages(enquiry_id) WHERE kind = 'acknowledgement';
CREATE INDEX ix_outbox_enquiry ON outbox_messages(enquiry_id, kind, created_at);

-- A recorded message is history: it is never edited. (Deleting an enquiry still removes its messages.)
CREATE TRIGGER trg_outbox_immutable
BEFORE UPDATE ON outbox_messages
BEGIN
  SELECT RAISE(ABORT, 'a recorded message cannot be changed');
END;

-- ---------------------------------------------------------------------------
-- S4: triage workflow. Staff state about an enquiry lives here, never in `enquiries`, which stays
-- exactly what the traveller sent. S5 adds its AI extraction tables beside these.
-- ---------------------------------------------------------------------------

-- Exactly one row per enquiry, created by trigger so no insert path can forget it.
-- replied is reached only by recording a reply; staff choose among new, in_progress and closed.
-- lock_version is an optimistic lock: a form carries the version it was drawn from, and a stale save is refused.
CREATE TABLE enquiry_workflow (
  enquiry_id   INTEGER PRIMARY KEY REFERENCES enquiries(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'replied', 'closed')),
  assignee_id  INTEGER REFERENCES staff_users(id),
  lock_version INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL
);
CREATE INDEX ix_workflow_status ON enquiry_workflow(status, assignee_id);

CREATE TRIGGER trg_enquiries_workflow
AFTER INSERT ON enquiries
BEGIN
  INSERT INTO enquiry_workflow (enquiry_id, updated_at) VALUES (NEW.id, NEW.created_at);
END;

-- Internal notes: staff only, append-only.
CREATE TABLE enquiry_notes (
  id         INTEGER PRIMARY KEY,
  enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES staff_users(id),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);
CREATE INDEX ix_notes_enquiry ON enquiry_notes(enquiry_id, id);

CREATE TRIGGER trg_notes_immutable
BEFORE UPDATE ON enquiry_notes
BEGIN
  SELECT RAISE(ABORT, 'a note cannot be edited');
END;

-- The one working reply draft per enquiry. Nothing leaves the system from here: a draft becomes a message
-- only when a staff member approves it, which writes an outbox_messages row (kind 'staff_reply') and deletes the draft.
CREATE TABLE reply_drafts (
  enquiry_id INTEGER PRIMARY KEY REFERENCES enquiries(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  subject    TEXT CHECK (subject IS NULL OR length(subject) <= 200),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  updated_by INTEGER NOT NULL REFERENCES staff_users(id),
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- S4: staff sessions.
-- ---------------------------------------------------------------------------

-- The browser holds a random 256-bit token in an HttpOnly cookie. Only its SHA-256 is stored, so a copy of
-- the database does not yield usable cookies. csrf_token is the per-session synchroniser token printed into
-- every staff form. A session ends at expires_at (absolute) or when idle for too long (last_seen_at).
CREATE TABLE staff_sessions (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  csrf_token   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
CREATE INDEX ix_staff_sessions_user ON staff_sessions(user_id);
CREATE INDEX ix_staff_sessions_expires ON staff_sessions(expires_at);

-- AI output is a proposal, never a sent message or an overwrite of traveller input.
-- A consultant may correct the proposal; only that correction is marked accepted.
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
