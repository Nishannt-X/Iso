import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resetDatabase } from '../../src/db/seed.js';
import { listLiveVersions } from '../../src/domain/packages.js';
import { HOME_HERO, PHOTOS, PHOTO_FILE_PATTERN, photoSrc, photosFor } from '../../src/domain/photos.js';

const file = (src: string): string => fileURLToPath(new URL(`../../src/public${src.replace('/assets', '')}`, import.meta.url));

describe('photo provenance', () => {
  test('every photo has author, licence, licence URL and a Commons source, and both files exist', () => {
    for (const p of Object.values(PHOTOS)) {
      assert.ok(p.author && p.licence && p.alt && p.place, p.id);
      assert.match(p.licenceUrl, /^https:\/\/creativecommons\.org\/licenses\//, p.id);
      assert.match(p.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, p.id);
      for (const size of [900, 2000] as const) {
        assert.match(`${p.id}-${size}.jpg`, PHOTO_FILE_PATTERN);
        assert.ok(existsSync(file(photoSrc(p, size))), `${p.id} ${size}`);
      }
    }
  });

  test('the home hero and every seeded live package resolve to a hero photo', () => {
    assert.ok(HOME_HERO.id);
    for (const v of listLiveVersions(resetDatabase(':memory:'))) assert.ok(photosFor(v.packageCode).hero, v.packageCode);
  });

  test('an unassigned package code has no photos', () => {
    assert.deepEqual(photosFor('NOPE-1'), { hero: null, band: null });
  });
});
