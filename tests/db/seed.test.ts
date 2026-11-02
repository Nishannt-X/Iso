import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { all, get } from '../../src/db/db.js';
import { resetDatabase } from '../../src/db/seed.js';
import { listLiveVersions } from '../../src/domain/packages.js';
import { quote } from '../../src/domain/pricing.js';

describe('seed data', () => {
  const db = resetDatabase(':memory:');
  const live = listLiveVersions(db);
  const byCode = (code: string) => live.find((v) => v.packageCode === code);

  test('PKG-KL-07 is live with an ASSUMED Peak/Monsoon pair and the brief peak price', () => {
    const v = byCode('PKG-KL-07');
    assert.ok(v);
    assert.equal(v.days, 6);
    assert.deepEqual(v.seasons.map((s) => [s.name, s.startMd, s.endMd, s.rangeAssumed]), [['Peak', '10-01', '03-31', true], ['Monsoon', '06-01', '09-30', true]]);
    assert.equal(v.seasons[0].pricePpTwinInr, 32500);
    assert.ok(v.tags.includes('houseboat'));
  });

  test('draft-only PKG-SI-12 exists but is absent from live_versions', () => {
    assert.equal(byCode('PKG-SI-12'), undefined);
    assert.equal(get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM packages WHERE code = 'PKG-SI-12'")?.n, 1);
    assert.equal(get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM package_versions v JOIN packages p ON p.id = v.package_id WHERE p.code = 'PKG-SI-12' AND v.status = 'draft'")?.n, 1);
    assert.equal(get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM live_versions v JOIN packages p ON p.id = v.package_id WHERE p.code = 'PKG-SI-12'")?.n, 0);
  });

  test('PKG-SI-12 has a single all-year season labelled as unspecified', () => {
    const seasons = all<{ name: string; start_md: string; end_md: string }>(db, "SELECT s.* FROM package_version_seasons s JOIN package_versions v ON v.id = s.version_id JOIN packages p ON p.id = v.package_id WHERE p.code = 'PKG-SI-12'");
    assert.deepEqual(seasons.map((s) => [s.name, s.start_md, s.end_md]), [['All year (season not specified)', '01-01', '12-31']]);
  });

  test('five synthetic packages are live and the synthetic/brief split is recorded', () => {
    assert.deepEqual(live.map((v) => v.packageCode), ['PKG-KL-07', 'SYN-GA-01', 'SYN-KL-01', 'SYN-KL-02', 'SYN-KL-03', 'SYN-KL-04']);
    const origins = all<{ code: string; data_origin: string }>(db, 'SELECT code, data_origin FROM packages ORDER BY code');
    assert.deepEqual(origins.filter((o) => o.data_origin === 'brief').map((o) => o.code), ['PKG-KL-07', 'PKG-SI-12']);
    for (const v of live.filter((x) => x.packageCode.startsWith('SYN-'))) assert.match(v.summary, /^\[Synthetic demo content\]/);
  });

  test('no child, single-supplement or GST rate is seeded anywhere', () => {
    assert.equal(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM package_versions WHERE child_pct IS NOT NULL OR single_supp_inr IS NOT NULL OR child_rule_note IS NOT NULL')?.n, 0);
    assert.equal(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM pricing_config')?.n, 0);
  });

  test('the seeded sample enquiry (2 adults + 1 child, December) is a partial quote of Rs 65,000', () => {
    const q = quote(byCode('PKG-KL-07')!, { when: { month: 12 }, adults: 2, children: [{ age: 6 }] });
    assert.equal(q.status, 'partial');
    assert.equal(q.subtotal_inr, 65000);
    assert.deepEqual(q.unpriced.map((u) => u.reason), ['child_rule_missing']);
  });

  test('exactly one package has no season for December', () => {
    const unavailable = live.filter((v) => quote(v, { when: { month: 12 }, adults: 2, children: [] }).status === 'unavailable');
    assert.deepEqual(unavailable.map((v) => v.packageCode), ['SYN-KL-04']);
  });

  test('every seeded version change note records its provenance', () => {
    for (const v of live) assert.match(v.changeNote, /^Seed:/);
  });
});

describe('resetDatabase', () => {
  test('is idempotent on a real file and refuses to overwrite a foreign file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kochi-reset-'));
    const path = join(dir, 'test.db');
    const counts = () => {
      const db = resetDatabase(path);
      const out = [
        get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM packages')?.n,
        get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM package_versions')?.n,
        get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM live_versions')?.n,
      ];
      db.close();
      return out;
    };
    assert.deepEqual(counts(), [7, 7, 6]);
    assert.deepEqual(counts(), [7, 7, 6]);

    const foreign = join(dir, 'notes.txt');
    writeFileSync(foreign, 'important notes');
    assert.throws(() => resetDatabase(foreign), /Refusing to replace/);
  });
});
