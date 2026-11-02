import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetDatabase } from '../../src/db/seed.js';
import { getDraftForPackage, getLiveVersionBySlug } from '../../src/domain/packages.js';
import { getPublicationSchedule, runDuePublications, schedulePublication } from '../../src/domain/publication-schedule.js';
import { get } from '../../src/db/db.js';

test('a ready private draft publishes at its scheduled time', () => {
  const db = resetDatabase(':memory:');
  const pkg = get<{ id: number; slug: string }>(db, "SELECT id, slug FROM packages WHERE code='PKG-SI-12'")!;
  const draft = getDraftForPackage(db, pkg.id)!;
  const now = new Date('2026-11-02T10:00:00.000Z');
  schedulePublication(db, { packageId: pkg.id, publishAt: '2026-11-02T10:01:00.000Z', note: 'Scheduled review', actorId: draft.createdBy, expectedLockVersion: draft.lockVersion }, now);
  assert.equal(getLiveVersionBySlug(db, pkg.slug), undefined);
  assert.deepEqual(runDuePublications(db, new Date('2026-11-02T10:00:59.000Z')), { published: 0, failed: 0 });
  assert.deepEqual(runDuePublications(db, new Date('2026-11-02T10:01:00.000Z')), { published: 1, failed: 0 });
  assert.ok(getLiveVersionBySlug(db, pkg.slug));
  assert.equal(getPublicationSchedule(db, pkg.id)?.status, 'published');
});
