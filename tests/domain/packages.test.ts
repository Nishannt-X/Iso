import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { all, get, run, type DatabaseSync } from '../../src/db/db.js';
import {
  createPackage, DomainError, getDraftForPackage, getLiveVersionBySlug, getVersion, listLiveVersions, listPackageHistory, listPackagesForStaff,
  publish, restoreVersion, saveDraft, setPackageSlug, validatePublishable, type DomainErrorCode, type VersionContent,
} from '../../src/domain/packages.js';
import { freshDb } from '../helpers.js';

const ACTOR = 1;

function content(over: Partial<VersionContent> = {}): VersionContent {
  return {
    title: 'Kerala Test Package', summary: 'A synthetic test package.', days: 3, nights: 2, starRating: 4, region: 'Kerala',
    childPct: null, childRuleNote: null, singleSuppInr: null,
    itinerary: [1, 2, 3].map((day) => ({ day, title: `Day ${day}`, description: 'Synthetic.' })),
    inclusions: ['Breakfast'], exclusions: ['Flights'], destinations: ['Kochi', 'Munnar'], tags: ['houseboat', 'family'],
    seasons: [
      { name: 'Peak', startMd: '10-01', endMd: '03-31', pricePpTwinInr: 32500, rangeAssumed: true },
      { name: 'Monsoon', startMd: '06-01', endMd: '09-30', pricePpTwinInr: 24900, rangeAssumed: true },
    ],
    ...over,
  };
}

function setup(over: Partial<VersionContent> = {}, code = 'PKG-T-01', slug = 'pkg-t-01') {
  const db = freshDb();
  const created = createPackage(db, { code, slug, dataOrigin: 'synthetic', actorId: ACTOR, content: content(over) });
  return { db, ...created };
}

function expectDomainError(fn: () => unknown, code: DomainErrorCode): DomainError {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof DomainError, `expected DomainError, got ${String(err)}`);
    assert.equal(err.code, code, err.message);
    return err;
  }
  throw new assert.AssertionError({ message: `expected DomainError(${code}) but nothing was thrown` });
}

const statuses = (db: DatabaseSync, packageId: number) =>
  all<{ version_no: number; status: string }>(db, 'SELECT version_no, status FROM package_versions WHERE package_id = ? ORDER BY version_no', packageId)
    .map((r) => `${r.version_no}:${r.status}`);

describe('createPackage', () => {
  test('creates a draft v1 with children, hidden from the public list', () => {
    const { db, packageId, versionId } = setup();
    const v = getVersion(db, versionId);
    assert.equal(v?.status, 'draft');
    assert.equal(v?.versionNo, 1);
    assert.deepEqual(v?.destinations, ['Kochi', 'Munnar']);
    assert.deepEqual(v?.tags, ['family', 'houseboat']);
    assert.equal(v?.seasons.length, 2);
    assert.equal(v?.childPct, null);
    assert.equal(v?.singleSuppInr, null);
    assert.deepEqual(listLiveVersions(db), []);
    assert.equal(getDraftForPackage(db, packageId)?.id, versionId);
  });

  test('rejects bad codes, bad slugs, and out-of-range content without leaving rows behind', () => {
    const db = freshDb();
    const base = { dataOrigin: 'synthetic', actorId: ACTOR, content: content() } as const;
    expectDomainError(() => createPackage(db, { ...base, code: 'bad code', slug: 'ok' }), 'validation');
    expectDomainError(() => createPackage(db, { ...base, code: 'PKG-1', slug: 'Not OK' }), 'validation');
    expectDomainError(() => createPackage(db, { ...base, code: 'PKG-1', slug: 'ok', content: content({ childPct: 150 }) }), 'validation');
    expectDomainError(() => createPackage(db, { ...base, code: 'PKG-1', slug: 'ok', content: content({ seasons: [{ name: 'x', startMd: '02-30', endMd: '03-01', pricePpTwinInr: 5, rangeAssumed: false }] }) }), 'validation');
    assert.equal(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM packages')?.n, 0);
  });

  test('a duplicate code rolls back the whole transaction', () => {
    const { db } = setup();
    assert.throws(() => createPackage(db, { code: 'PKG-T-01', slug: 'other', dataOrigin: 'synthetic', actorId: ACTOR, content: content() }), /UNIQUE/);
    assert.equal(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM packages')?.n, 1);
  });
});

describe('staff catalogue', () => {
  test('shows a draft before publication and keeps immutable history after a revision', () => {
    const { db, packageId, versionId } = setup();
    assert.equal(listPackagesForStaff(db).find((p) => p.id === packageId)?.draft?.id, versionId);
    assert.equal(listPackagesForStaff(db).find((p) => p.id === packageId)?.live, undefined);
    publish(db, { draftId: versionId, actorId: ACTOR, note: 'First release' });
    const revised = restoreVersion(db, { versionId, actorId: ACTOR });
    const row = listPackagesForStaff(db).find((p) => p.id === packageId);
    assert.equal(row?.live?.id, versionId);
    assert.equal(row?.draft?.id, revised.draftId);
    assert.deepEqual(listPackageHistory(db, packageId).map((v) => [v.id, v.status]), [
      [revised.draftId, 'draft'], [versionId, 'published'],
    ]);
  });
});

describe('publish (I4)', () => {
  test('publishes a valid draft, exposes it publicly and writes an audit row', () => {
    const { db, packageId, versionId } = setup();
    const result = publish(db, { draftId: versionId, actorId: ACTOR, note: 'First release' });
    assert.deepEqual(result, { versionId, supersededVersionId: null });
    const live = listLiveVersions(db);
    assert.equal(live.length, 1);
    assert.equal(live[0].status, 'published');
    assert.equal(live[0].changeNote, 'First release');
    assert.ok(live[0].publishedAt);
    assert.equal(getLiveVersionBySlug(db, 'pkg-t-01')?.id, versionId);
    assert.equal(getDraftForPackage(db, packageId), undefined);
    assert.equal(get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'version.publish'")?.n, 1);
  });

  test('a second publish supersedes the first and leaves exactly one live version', () => {
    const { db, packageId, versionId } = setup();
    publish(db, { draftId: versionId, actorId: ACTOR, note: 'v1' });
    const { draftId } = restoreVersion(db, { versionId, actorId: ACTOR });
    const res = publish(db, { draftId, actorId: ACTOR, note: 'v2' });
    assert.equal(res.supersededVersionId, versionId);
    assert.deepEqual(statuses(db, packageId), ['1:superseded', '2:published']);
    assert.equal(listLiveVersions(db).length, 1);
  });

  test('an unpublishable draft is refused with reasons, and the live version is untouched (atomic)', () => {
    const { db, packageId, versionId } = setup();
    publish(db, { draftId: versionId, actorId: ACTOR, note: 'v1' });
    const { draftId } = restoreVersion(db, { versionId, actorId: ACTOR });
    const lock = getVersion(db, draftId)!.lockVersion;
    saveDraft(db, { versionId: draftId, expectedLockVersion: lock, content: content({ itinerary: [{ day: 1, title: 'Only one', description: '' }] }) });
    const err = expectDomainError(() => publish(db, { draftId, actorId: ACTOR, note: 'bad' }), 'validation');
    assert.match(err.issues.join(' | '), /exactly 3 day/);
    assert.deepEqual(statuses(db, packageId), ['1:published', '2:draft']);
    assert.equal(listLiveVersions(db)[0].id, versionId);
  });

  test('validatePublishable names each rule', () => {
    const cases: [Partial<VersionContent>, RegExp][] = [
      [{ seasons: [] }, /at least one season/],
      [{ title: '  ' }, /title: is required/],
      [{ itinerary: content().itinerary.slice(0, 2) }, /exactly 3 day/],
      [{ itinerary: content().itinerary.map((d) => ({ ...d, day: d.day + 1 })) }, /numbered 1, 2, 3/],
      [{ seasons: [{ name: 'A', startMd: '10-01', endMd: '03-31', pricePpTwinInr: 1, rangeAssumed: false }, { name: 'B', startMd: '03-15', endMd: '04-10', pricePpTwinInr: 1, rangeAssumed: false }] }, /overlap/],
    ];
    for (const [over, pattern] of cases) assert.match(validatePublishable(content(over)).join(' | '), pattern);
    assert.deepEqual(validatePublishable(content()), []);
  });

  test('refuses to publish a non-draft or a missing version, and a stale expected lock', () => {
    const { db, versionId } = setup();
    expectDomainError(() => publish(db, { draftId: 9999, actorId: ACTOR, note: '' }), 'not_found');
    expectDomainError(() => publish(db, { draftId: versionId, actorId: ACTOR, note: '', expectedLockVersion: 99 }), 'conflict');
    publish(db, { draftId: versionId, actorId: ACTOR, note: '', expectedLockVersion: 1 });
    expectDomainError(() => publish(db, { draftId: versionId, actorId: ACTOR, note: '' }), 'invalid_state');
  });

  test('a published version cannot be edited through the domain or the database', () => {
    const { db, versionId } = setup();
    publish(db, { draftId: versionId, actorId: ACTOR, note: '' });
    expectDomainError(() => saveDraft(db, { versionId, expectedLockVersion: 2, content: content() }), 'invalid_state');
    assert.throws(() => run(db, "UPDATE package_versions SET title = 'x' WHERE id = ?", versionId), /immutable/);
  });
});

describe('saveDraft optimistic locking (I8)', () => {
  test('a fresh lock_version is accepted, increments, and replaces child rows', () => {
    const { db, versionId } = setup();
    const res = saveDraft(db, {
      versionId, expectedLockVersion: 1,
      content: content({ title: 'Renamed', tags: ['beach'], destinations: ['Goa'], seasons: [{ name: 'All', startMd: '01-01', endMd: '12-31', pricePpTwinInr: 9000, rangeAssumed: true }] }),
    });
    assert.equal(res.lockVersion, 2);
    const v = getVersion(db, versionId)!;
    assert.equal(v.lockVersion, 2);
    assert.equal(v.title, 'Renamed');
    assert.deepEqual(v.tags, ['beach']);
    assert.deepEqual(v.destinations, ['Goa']);
    assert.deepEqual(v.seasons.map((s) => s.pricePpTwinInr), [9000]);
  });

  test('a stale lock_version is rejected with conflict and nothing changes', () => {
    const { db, versionId } = setup();
    saveDraft(db, { versionId, expectedLockVersion: 1, content: content({ title: 'Editor A' }) });
    expectDomainError(() => saveDraft(db, { versionId, expectedLockVersion: 1, content: content({ title: 'Editor B', tags: ['lost'] }) }), 'conflict');
    const v = getVersion(db, versionId)!;
    assert.equal(v.title, 'Editor A');
    assert.deepEqual(v.tags, ['family', 'houseboat']);
    assert.equal(v.lockVersion, 2);
  });

  test('invalid content is rejected before any write; unknown id is not_found', () => {
    const { db, versionId } = setup();
    expectDomainError(() => saveDraft(db, { versionId, expectedLockVersion: 1, content: content({ singleSuppInr: -5 }) }), 'validation');
    expectDomainError(() => saveDraft(db, { versionId: 9999, expectedLockVersion: 1, content: content() }), 'not_found');
    assert.equal(getVersion(db, versionId)?.lockVersion, 1);
  });

  test('tags and destinations are trimmed, blank entries dropped, tags de-duplicated', () => {
    const { db, versionId } = setup();
    saveDraft(db, { versionId, expectedLockVersion: 1, content: content({ tags: [' Beach ', 'beach', '', 'Family'], destinations: [' Goa ', ' '] }) });
    const v = getVersion(db, versionId)!;
    assert.deepEqual(v.tags, ['beach', 'family']);
    assert.deepEqual(v.destinations, ['Goa']);
  });
});

describe('restoreVersion (I7)', () => {
  function livePackage() {
    const s = setup({ childPct: 60, childRuleNote: 'test rule', singleSuppInr: 5000 });
    publish(s.db, { draftId: s.versionId, actorId: ACTOR, note: 'v1' });
    return s;
  }

  test('deep-copies seasons, tags and destinations; the copy is publishable; history stays linear', () => {
    const { db, packageId, versionId } = livePackage();
    const { draftId } = restoreVersion(db, { versionId, actorId: ACTOR });
    const src = getVersion(db, versionId)!;
    const copy = getVersion(db, draftId)!;
    assert.equal(copy.status, 'draft');
    assert.equal(copy.versionNo, 2);
    assert.equal(copy.restoredFromVersionId, versionId);
    assert.equal(copy.lockVersion, 1);
    assert.deepEqual(copy.seasons, src.seasons);
    assert.deepEqual(copy.tags, src.tags);
    assert.deepEqual(copy.destinations, src.destinations);
    assert.deepEqual(copy.itinerary, src.itinerary);
    assert.deepEqual([copy.childPct, copy.childRuleNote, copy.singleSuppInr], [60, 'test rule', 5000]);
    assert.deepEqual(validatePublishable(copy), []);
    assert.deepEqual(statuses(db, packageId), ['1:published', '2:draft']);
  });

  test('restore price cascade: editing the restored draft never changes the source or the live fare', () => {
    const { db, versionId } = livePackage();
    const { draftId } = restoreVersion(db, { versionId, actorId: ACTOR });
    saveDraft(db, {
      versionId: draftId, expectedLockVersion: 1,
      content: content({ seasons: [{ name: 'Peak', startMd: '10-01', endMd: '03-31', pricePpTwinInr: 99999, rangeAssumed: true }], tags: ['changed'] }),
    });
    const live = listLiveVersions(db)[0];
    assert.equal(live.id, versionId);
    assert.deepEqual(live.seasons.map((s) => s.pricePpTwinInr), [32500, 24900]);
    assert.deepEqual(live.tags, ['family', 'houseboat']);
  });

  test('refuses while a draft exists unless discard is confirmed, then replaces it and audits the discard', () => {
    const { db, packageId, versionId } = livePackage();
    const first = restoreVersion(db, { versionId, actorId: ACTOR });
    expectDomainError(() => restoreVersion(db, { versionId, actorId: ACTOR }), 'draft_exists');
    assert.equal(getDraftForPackage(db, packageId)?.id, first.draftId);
    const second = restoreVersion(db, { versionId, actorId: ACTOR, discardDraft: true });
    assert.notEqual(second.draftId, first.draftId);
    assert.equal(getVersion(db, first.draftId), undefined);
    // a stale editor that still holds the discarded draft's id must not land in the new draft
    expectDomainError(() => saveDraft(db, { versionId: first.draftId, expectedLockVersion: 1, content: content({ title: 'stale' }) }), 'not_found');
    assert.notEqual(getVersion(db, second.draftId)?.title, 'stale');
    assert.equal(getDraftForPackage(db, packageId)?.id, second.draftId);
    assert.equal(get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'version.discard_draft'")?.n, 1);
    assert.equal(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM package_version_seasons WHERE version_id = ?', first.draftId)?.n, 0);
  });

  test('can restore a superseded version; refuses a draft or a missing version', () => {
    const { db, packageId, versionId } = livePackage();
    const { draftId } = restoreVersion(db, { versionId, actorId: ACTOR });
    publish(db, { draftId, actorId: ACTOR, note: 'v2' });
    const back = restoreVersion(db, { versionId, actorId: ACTOR }); // v1 is now superseded
    assert.equal(getVersion(db, back.draftId)?.versionNo, 3);
    assert.deepEqual(statuses(db, packageId), ['1:superseded', '2:published', '3:draft']);
    expectDomainError(() => restoreVersion(db, { versionId: back.draftId, actorId: ACTOR }), 'invalid_state');
    expectDomainError(() => restoreVersion(db, { versionId: 9999, actorId: ACTOR }), 'not_found');
  });
});

describe('slug lock', () => {
  test('editable until the first publish, locked afterwards', () => {
    const { db, packageId, versionId } = setup();
    setPackageSlug(db, packageId, 'renamed-before-publish');
    publish(db, { draftId: versionId, actorId: ACTOR, note: '' });
    assert.equal(getLiveVersionBySlug(db, 'renamed-before-publish')?.id, versionId);
    expectDomainError(() => setPackageSlug(db, packageId, 'renamed-after'), 'slug_locked');
    expectDomainError(() => setPackageSlug(db, 9999, 'x'), 'not_found');
    expectDomainError(() => setPackageSlug(db, packageId, 'Bad Slug'), 'validation');
    assert.equal(getLiveVersionBySlug(db, 'renamed-after'), undefined);
  });
});
