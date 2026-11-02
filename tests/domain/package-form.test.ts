import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { emptyPackageForm, formFromVersion, parsePackageForm } from '../../src/domain/package-form.js';
import { resetDatabase } from '../../src/db/seed.js';
import { getLiveVersionBySlug } from '../../src/domain/packages.js';

describe('package editor form', () => {
  test('round trips a published package without changing its season provenance or prices', () => {
    const db = resetDatabase(':memory:');
    const original = getLiveVersionBySlug(db, 'munnar-thekkady-and-alleppey-houseboat-6-days')!;
    const parsed = parsePackageForm(formFromVersion(original));
    assert.deepEqual(parsed.seasons, original.seasons);
    assert.deepEqual(parsed.itinerary, original.itinerary);
    assert.equal(parsed.title, original.title);
  });

  test('refuses malformed price lines and noninteger numbers', () => {
    const form = { ...emptyPackageForm(), days: '2.5', seasons: 'Peak | 10-01 | 03-31 | 32500 | assumed' };
    assert.throws(() => parsePackageForm(form), /Days must be a whole number/);
    form.days = '2';
    form.seasons = 'Peak | 10-01 | 03-31 | thirty thousand | assumed';
    assert.throws(() => parsePackageForm(form), /price must be a whole number/);
    form.seasons = 'Peak | 10-01 | 03-31 | 32500';
    assert.throws(() => parsePackageForm(form), /Season line 1 needs/);
  });
});
