import { z } from 'zod';
import { all, get, run, transaction, type DatabaseSync, type Param } from '../db/db.js';
import { mdOrdinal, validateSeasons, type Season } from './seasons.js';

// Package catalogue domain: versions move draft -> published -> superseded, never backwards.
// The database enforces the invariants (see schema.sql); this layer adds validation,
// optimistic locking and the multi-statement transactions.

export type VersionStatus = 'draft' | 'published' | 'superseded';
export type DataOrigin = 'brief' | 'synthetic';

/** Seed summaries start with this marker. Pages strip it and show a visible demo label instead. */
export const SYNTHETIC_MARKER = '[Synthetic demo content] ';

export interface ItineraryDay {
  day: number;
  title: string;
  description: string;
}

export interface VersionContent {
  title: string;
  summary: string;
  days: number;
  nights: number;
  starRating: number | null;
  region: string;
  childPct: number | null;
  childRuleNote: string | null;
  singleSuppInr: number | null;
  itinerary: ItineraryDay[];
  inclusions: string[];
  exclusions: string[];
  destinations: string[];
  tags: string[];
  seasons: Season[];
}

export interface PackageVersion extends VersionContent {
  id: number;
  packageId: number;
  packageCode: string;
  packageSlug: string;
  versionNo: number;
  status: VersionStatus;
  lockVersion: number;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  changeNote: string;
  restoredFromVersionId: number | null;
}

export type DomainErrorCode = 'conflict' | 'validation' | 'not_found' | 'draft_exists' | 'slug_locked' | 'invalid_state';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// ---------------------------------------------------------------------------
// Validation. DraftContent is the shape the database can store; PublishableVersion adds
// the completeness rules a version must meet before it can go live.
// ---------------------------------------------------------------------------

const text = (max: number) => z.string().max(max);
const SeasonSchema = z.object({
  name: text(80),
  startMd: z.string().refine((v) => mdOrdinal(v) !== null, 'must be a valid MM-DD date'),
  endMd: z.string().refine((v) => mdOrdinal(v) !== null, 'must be a valid MM-DD date'),
  pricePpTwinInr: z.number().int().positive(),
  rangeAssumed: z.boolean(),
});

export const DraftContent = z.object({
  title: text(200),
  summary: text(1000),
  days: z.number().int().min(1).max(60),
  nights: z.number().int().min(0).max(60),
  starRating: z.number().int().min(1).max(5).nullable(),
  region: text(100),
  childPct: z.number().int().min(0).max(100).nullable(),
  childRuleNote: text(300).nullable(),
  singleSuppInr: z.number().int().positive().nullable(),
  itinerary: z.array(z.object({ day: z.number().int(), title: text(200), description: text(2000) })).max(60),
  inclusions: z.array(text(300)).max(100),
  exclusions: z.array(text(300)).max(100),
  destinations: z.array(text(100)).max(30),
  tags: z.array(text(60)).max(30),
  seasons: z.array(SeasonSchema).max(12),
});

export const PublishableVersion = DraftContent.superRefine((v, ctx) => {
  const need = (ok: boolean, path: string, message: string) => {
    if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
  };
  need(v.title.trim().length > 0, 'title', 'is required');
  need(v.summary.trim().length > 0, 'summary', 'is required');
  need(v.region.trim().length > 0, 'region', 'is required');
  need(v.itinerary.length === v.days, 'itinerary', `must have exactly ${v.days} day(s) to match days, found ${v.itinerary.length}`);
  need(v.itinerary.every((d, i) => d.day === i + 1), 'itinerary', 'days must be numbered 1, 2, 3... in order');
  need(v.itinerary.every((d) => d.title.trim().length > 0), 'itinerary', 'every day needs a title');
  need(v.seasons.every((s) => s.name.trim().length > 0), 'seasons', 'every season needs a name');
  for (const issue of validateSeasons(v.seasons)) need(false, 'seasons', issue);
});

function normalise(content: VersionContent): VersionContent {
  const trim = (xs: string[]) => xs.map((x) => x.trim()).filter((x) => x.length > 0);
  return {
    ...content,
    title: content.title.trim(),
    summary: content.summary.trim(),
    region: content.region.trim(),
    destinations: trim(content.destinations),
    tags: [...new Set(trim(content.tags).map((t) => t.toLowerCase()))],
    inclusions: trim(content.inclusions),
    exclusions: trim(content.exclusions),
  };
}

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
}

function parseDraft(content: VersionContent): VersionContent {
  const parsed = DraftContent.safeParse(normalise(content));
  if (!parsed.success) throw new DomainError('validation', 'invalid package content', issuesOf(parsed.error));
  return parsed.data;
}

/** Returns the reasons a version cannot be published; empty means publishable. */
export function validatePublishable(content: VersionContent): string[] {
  const parsed = PublishableVersion.safeParse(normalise(content));
  return parsed.success ? [] : issuesOf(parsed.error);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface VersionRow {
  id: number; package_id: number; code: string; slug: string; version_no: number; status: VersionStatus;
  lock_version: number; title: string; summary: string; days: number; nights: number; star_rating: number | null;
  region: string; child_pct: number | null; child_rule_note: string | null; single_supp_inr: number | null;
  itinerary_json: string; inclusions_json: string; exclusions_json: string; created_by: number;
  created_at: string; updated_at: string; published_at: string | null; change_note: string;
  restored_from_version_id: number | null;
}

const VERSION_SELECT = `SELECT v.*, p.code, p.slug FROM package_versions v JOIN packages p ON p.id = v.package_id`;

function hydrate(db: DatabaseSync, r: VersionRow): PackageVersion {
  return {
    id: r.id, packageId: r.package_id, packageCode: r.code, packageSlug: r.slug, versionNo: r.version_no,
    status: r.status, lockVersion: r.lock_version, title: r.title, summary: r.summary, days: r.days,
    nights: r.nights, starRating: r.star_rating, region: r.region, childPct: r.child_pct,
    childRuleNote: r.child_rule_note, singleSuppInr: r.single_supp_inr,
    itinerary: JSON.parse(r.itinerary_json) as ItineraryDay[],
    inclusions: JSON.parse(r.inclusions_json) as string[],
    exclusions: JSON.parse(r.exclusions_json) as string[],
    destinations: all<{ name: string }>(db, 'SELECT name FROM package_version_destinations WHERE version_id = ? ORDER BY position', r.id).map((d) => d.name),
    tags: all<{ tag: string }>(db, 'SELECT tag FROM package_version_tags WHERE version_id = ? ORDER BY tag', r.id).map((t) => t.tag),
    seasons: all<{ name: string; start_md: string; end_md: string; price_pp_twin_inr: number; range_assumed: number }>(
      db, 'SELECT * FROM package_version_seasons WHERE version_id = ? ORDER BY position', r.id,
    ).map((s) => ({ name: s.name, startMd: s.start_md, endMd: s.end_md, pricePpTwinInr: s.price_pp_twin_inr, rangeAssumed: s.range_assumed === 1 })),
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
    changeNote: r.change_note, restoredFromVersionId: r.restored_from_version_id,
  };
}

export function getVersion(db: DatabaseSync, versionId: number): PackageVersion | undefined {
  const row = get<VersionRow>(db, `${VERSION_SELECT} WHERE v.id = ?`, versionId);
  return row && hydrate(db, row);
}

/** Public read path: only ever the published version of each package. */
export function listLiveVersions(db: DatabaseSync): PackageVersion[] {
  return all<VersionRow>(db, `SELECT v.*, p.code, p.slug FROM live_versions v JOIN packages p ON p.id = v.package_id ORDER BY p.code`)
    .map((r) => hydrate(db, r));
}

export function getLiveVersionBySlug(db: DatabaseSync, slug: string): PackageVersion | undefined {
  const row = get<VersionRow>(db, `SELECT v.*, p.code, p.slug FROM live_versions v JOIN packages p ON p.id = v.package_id WHERE p.slug = ?`, slug);
  return row && hydrate(db, row);
}

/** Where each package's content comes from (client brief or synthetic), keyed by package id. */
export function listDataOrigins(db: DatabaseSync): Map<number, DataOrigin> {
  return new Map(all<{ id: number; data_origin: DataOrigin }>(db, 'SELECT id, data_origin FROM packages').map((r) => [r.id, r.data_origin]));
}

export function getDraftForPackage(db: DatabaseSync, packageId: number): PackageVersion | undefined {
  const row = get<VersionRow>(db, `${VERSION_SELECT} WHERE v.package_id = ? AND v.status = 'draft'`, packageId);
  return row && hydrate(db, row);
}

// ---------------------------------------------------------------------------
// Writes. Each public function is one transaction; helpers below are not re-entrant.
// ---------------------------------------------------------------------------

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

function audit(db: DatabaseSync, actorId: number, action: string, entityId: number, meta: Record<string, unknown>): void {
  run(db, 'INSERT INTO audit_log (actor_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)',
    actorId, action, 'package_version', entityId, JSON.stringify(meta));
}

function insertChildren(db: DatabaseSync, versionId: number, c: VersionContent): void {
  c.destinations.forEach((name, i) => run(db, 'INSERT INTO package_version_destinations (version_id, position, name) VALUES (?, ?, ?)', versionId, i + 1, name));
  c.tags.forEach((tag) => run(db, 'INSERT INTO package_version_tags (version_id, tag) VALUES (?, ?)', versionId, tag));
  c.seasons.forEach((s, i) => run(db,
    'INSERT INTO package_version_seasons (version_id, position, name, start_md, end_md, price_pp_twin_inr, range_assumed) VALUES (?, ?, ?, ?, ?, ?, ?)',
    versionId, i + 1, s.name, s.startMd, s.endMd, s.pricePpTwinInr, s.rangeAssumed ? 1 : 0));
}

function deleteChildren(db: DatabaseSync, versionId: number): void {
  for (const table of ['package_version_destinations', 'package_version_tags', 'package_version_seasons']) {
    run(db, `DELETE FROM ${table} WHERE version_id = ?`, versionId);
  }
}

function contentParams(c: VersionContent): Param[] {
  return [c.title, c.summary, c.days, c.nights, c.starRating, c.region, c.childPct, c.childRuleNote, c.singleSuppInr,
    JSON.stringify(c.itinerary), JSON.stringify(c.inclusions), JSON.stringify(c.exclusions)];
}

export interface CreatePackageInput {
  code: string;
  slug: string;
  dataOrigin: DataOrigin;
  actorId: number;
  content: VersionContent;
  changeNote?: string;
}

/** Creates a package with its first version as a draft. Publish it separately. */
export function createPackage(db: DatabaseSync, input: CreatePackageInput): { packageId: number; versionId: number } {
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(input.code)) throw new DomainError('validation', 'invalid package code', ['code: use capitals, digits and hyphens, e.g. PKG-KL-07']);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.slug)) throw new DomainError('validation', 'invalid slug', ['slug: use lowercase letters, digits and hyphens']);
  const content = parseDraft(input.content);
  return transaction(db, () => {
    const packageId = Number(run(db, 'INSERT INTO packages (code, slug, data_origin) VALUES (?, ?, ?)', input.code, input.slug, input.dataOrigin).lastInsertRowid);
    const versionId = Number(run(db,
      `INSERT INTO package_versions (package_id, version_no, status, title, summary, days, nights, star_rating, region,
         child_pct, child_rule_note, single_supp_inr, itinerary_json, inclusions_json, exclusions_json, created_by, change_note)
       VALUES (?, 1, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      packageId, ...contentParams(content), input.actorId, input.changeNote ?? '').lastInsertRowid);
    insertChildren(db, versionId, content);
    audit(db, input.actorId, 'package.create', versionId, { code: input.code });
    return { packageId, versionId };
  });
}

export interface SaveDraftInput {
  versionId: number;
  /** The lock_version the editor loaded. A mismatch means someone else saved first. */
  expectedLockVersion: number;
  content: VersionContent;
  changeNote?: string;
}

/** Saves the draft and replaces its child rows in one transaction (I8). Throws `conflict` when stale. */
export function saveDraft(db: DatabaseSync, input: SaveDraftInput): { lockVersion: number } {
  const content = parseDraft(input.content);
  return transaction(db, () => {
    const res = run(db,
      `UPDATE package_versions SET title = ?, summary = ?, days = ?, nights = ?, star_rating = ?, region = ?,
         child_pct = ?, child_rule_note = ?, single_supp_inr = ?, itinerary_json = ?, inclusions_json = ?, exclusions_json = ?,
         change_note = COALESCE(?, change_note), lock_version = lock_version + 1, updated_at = ${NOW}
       WHERE id = ? AND lock_version = ? AND status = 'draft'`,
      ...contentParams(content), input.changeNote ?? null, input.versionId, input.expectedLockVersion);
    if (res.changes === 0) {
      const row = get<{ status: VersionStatus; lock_version: number }>(db, 'SELECT status, lock_version FROM package_versions WHERE id = ?', input.versionId);
      if (!row) throw new DomainError('not_found', 'version not found');
      if (row.status !== 'draft') throw new DomainError('invalid_state', `only a draft can be edited; this version is ${row.status}`);
      throw new DomainError('conflict', 'this draft was changed by someone else; reload and re-apply your edits');
    }
    deleteChildren(db, input.versionId);
    insertChildren(db, input.versionId, content);
    return { lockVersion: input.expectedLockVersion + 1 };
  });
}

/** Changes a package slug. Allowed only until the package's first publish. */
export function setPackageSlug(db: DatabaseSync, packageId: number, slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new DomainError('validation', 'invalid slug', ['slug: use lowercase letters, digits and hyphens']);
  transaction(db, () => {
    if (!get(db, 'SELECT 1 AS x FROM packages WHERE id = ?', packageId)) throw new DomainError('not_found', 'package not found');
    if (get(db, "SELECT 1 AS x FROM package_versions WHERE package_id = ? AND status <> 'draft'", packageId)) {
      throw new DomainError('slug_locked', 'the slug is locked because this package has been published');
    }
    run(db, 'UPDATE packages SET slug = ? WHERE id = ?', slug, packageId);
  });
}

export interface PublishInput {
  draftId: number;
  actorId: number;
  note: string;
  /** When given, publishing fails with `conflict` if the draft changed since the reviewer loaded it. */
  expectedLockVersion?: number;
}

/**
 * I4: validates the draft, supersedes the current published version, publishes the draft and
 * writes an audit row, all in one transaction. A failure leaves the live version untouched.
 */
export function publish(db: DatabaseSync, input: PublishInput): { versionId: number; supersededVersionId: number | null } {
  return transaction(db, () => {
    const draft = getVersion(db, input.draftId);
    if (!draft) throw new DomainError('not_found', 'version not found');
    if (draft.status !== 'draft') throw new DomainError('invalid_state', `only a draft can be published; this version is ${draft.status}`);
    if (input.expectedLockVersion !== undefined && input.expectedLockVersion !== draft.lockVersion) {
      throw new DomainError('conflict', 'this draft was changed after you loaded it; review it again before publishing');
    }
    const issues = validatePublishable(draft);
    if (issues.length > 0) throw new DomainError('validation', 'the draft is not ready to publish', issues);

    const current = get<{ id: number }>(db, "SELECT id FROM package_versions WHERE package_id = ? AND status = 'published'", draft.packageId);
    if (current) run(db, "UPDATE package_versions SET status = 'superseded' WHERE id = ?", current.id);
    run(db,
      `UPDATE package_versions SET status = 'published', published_at = ${NOW}, updated_at = ${NOW},
         change_note = ?, lock_version = lock_version + 1 WHERE id = ?`,
      input.note.trim(), draft.id);
    audit(db, input.actorId, 'version.publish', draft.id, { versionNo: draft.versionNo, supersededVersionId: current?.id ?? null, note: input.note.trim() });
    return { versionId: draft.id, supersededVersionId: current?.id ?? null };
  });
}

export interface RestoreInput {
  versionId: number;
  actorId: number;
  /** Required to replace an existing draft; otherwise restore refuses so edits are never lost silently. */
  discardDraft?: boolean;
}

/**
 * I7: creates a new draft as a deep copy (including seasons, tags and destinations) of a published
 * or superseded version. History stays linear: the old version is untouched and a new version_no is used.
 */
export function restoreVersion(db: DatabaseSync, input: RestoreInput): { draftId: number } {
  return transaction(db, () => {
    const source = getVersion(db, input.versionId);
    if (!source) throw new DomainError('not_found', 'version not found');
    if (source.status === 'draft') throw new DomainError('invalid_state', 'a draft cannot be restored; restore a published or superseded version');

    const existing = getDraftForPackage(db, source.packageId);
    if (existing) {
      if (!input.discardDraft) throw new DomainError('draft_exists', 'this package already has a draft; confirm discarding it to restore');
      deleteChildren(db, existing.id);
      run(db, 'DELETE FROM package_versions WHERE id = ?', existing.id);
      audit(db, input.actorId, 'version.discard_draft', existing.id, { versionNo: existing.versionNo, reason: `restore of version ${source.versionNo}` });
    }
    const next = get<{ n: number }>(db, 'SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM package_versions WHERE package_id = ?', source.packageId)?.n ?? 1;
    const draftId = Number(run(db,
      `INSERT INTO package_versions (package_id, version_no, status, title, summary, days, nights, star_rating, region,
         child_pct, child_rule_note, single_supp_inr, itinerary_json, inclusions_json, exclusions_json,
         created_by, change_note, restored_from_version_id)
       SELECT package_id, ?, 'draft', title, summary, days, nights, star_rating, region,
         child_pct, child_rule_note, single_supp_inr, itinerary_json, inclusions_json, exclusions_json, ?, ?, id
       FROM package_versions WHERE id = ?`,
      next, input.actorId, `Restored from version ${source.versionNo}`, source.id).lastInsertRowid);
    run(db, 'INSERT INTO package_version_destinations (version_id, position, name) SELECT ?, position, name FROM package_version_destinations WHERE version_id = ?', draftId, source.id);
    run(db, 'INSERT INTO package_version_tags (version_id, tag) SELECT ?, tag FROM package_version_tags WHERE version_id = ?', draftId, source.id);
    run(db,
      `INSERT INTO package_version_seasons (version_id, position, name, start_md, end_md, price_pp_twin_inr, range_assumed)
       SELECT ?, position, name, start_md, end_md, price_pp_twin_inr, range_assumed FROM package_version_seasons WHERE version_id = ?`,
      draftId, source.id);
    audit(db, input.actorId, 'version.restore', draftId, { fromVersionId: source.id, fromVersionNo: source.versionNo, newVersionNo: next });
    return { draftId };
  });
}
