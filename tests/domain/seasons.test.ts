import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addDays, isoOrdinal, mdOrdinal, resolveMonth, resolveStay, validateSeasons, type Season,
} from '../../src/domain/seasons.js';

const peak: Season = { name: 'Peak', startMd: '10-01', endMd: '03-31', pricePpTwinInr: 32500, rangeAssumed: true };
const monsoon: Season = { name: 'Monsoon', startMd: '06-01', endMd: '09-30', pricePpTwinInr: 24000, rangeAssumed: true };
const assumed = [peak, monsoon];

describe('mdOrdinal / isoOrdinal', () => {
  test('accepts real dates including Feb 29 and rejects impossible ones', () => {
    assert.equal(mdOrdinal('01-01'), 1);
    assert.equal(mdOrdinal('12-31'), 366);
    assert.notEqual(mdOrdinal('02-29'), null);
    for (const bad of ['02-30', '13-01', '00-10', '04-31', '1-1', '', 'ab-cd']) assert.equal(mdOrdinal(bad), null, bad);
  });
  test('isoOrdinal ignores the year and rejects non-dates', () => {
    assert.equal(isoOrdinal('2026-12-31'), 366 - 0);
    assert.equal(isoOrdinal('2026-02-29'), null); // 2026 is not a leap year
    assert.notEqual(isoOrdinal('2028-02-29'), null);
    assert.equal(isoOrdinal('26-01-01'), null);
  });
  test('addDays crosses year end', () => assert.equal(addDays('2026-12-30', 3), '2027-01-02'));
});

describe('resolveStay (assumed Peak Oct-Mar, Monsoon Jun-Sep)', () => {
  test('wrap-around: Dec 31 and Jan 1 are both Peak', () => {
    for (const d of ['2026-12-31', '2027-01-01']) {
      const r = resolveStay([peak], d, 1);
      assert.equal(r.kind, 'single');
      assert.equal(r.kind === 'single' && r.season.name, 'Peak');
    }
  });
  test('Dec 20 for 6 days stays inside Peak', () => {
    const r = resolveStay(assumed, '2026-12-20', 6);
    assert.equal(r.kind, 'single');
  });
  test('April and May are uncovered: no_season_for_date', () => {
    for (const d of ['2026-04-01', '2026-04-30', '2026-05-15', '2026-05-31']) {
      assert.deepEqual(resolveStay(assumed, d, 6), { kind: 'none', reason: 'no_season_for_date' }, d);
    }
  });
  test('stay that runs from Peak into the uncovered April gap is a straddle with Peak as the only candidate', () => {
    const r = resolveStay(assumed, '2027-03-29', 6);
    assert.equal(r.kind, 'ambiguous');
    assert.equal(r.kind === 'ambiguous' && r.reason, 'season_straddle');
    assert.deepEqual(r.kind === 'ambiguous' && r.candidates.map((s) => s.name), ['Peak']);
  });
  test('stay across two real seasons is a straddle listing both', () => {
    const seasons: Season[] = [
      { ...peak, startMd: '12-01', endMd: '12-24' },
      { ...monsoon, name: 'Festive', startMd: '12-25', endMd: '01-05' },
    ];
    const r = resolveStay(seasons, '2026-12-22', 6);
    assert.equal(r.kind, 'ambiguous');
    assert.deepEqual(r.kind === 'ambiguous' && r.candidates.map((s) => s.name).sort(), ['Festive', 'Peak']);
  });
  test('rejects a malformed date instead of guessing', () => {
    assert.throws(() => resolveStay(assumed, '20/12/2026', 6), RangeError);
  });
});

describe('resolveMonth', () => {
  test('December is entirely Peak', () => assert.equal(resolveMonth(assumed, 12).kind, 'single'));
  test('April and May have no season', () => {
    assert.equal(resolveMonth(assumed, 4).kind, 'none');
    assert.equal(resolveMonth(assumed, 5).kind, 'none');
  });
  test('a month split between two seasons is ambiguous_month', () => {
    const split: Season[] = [
      { ...peak, startMd: '12-01', endMd: '12-15' },
      { ...monsoon, name: 'Late', startMd: '12-16', endMd: '12-31' },
    ];
    const r = resolveMonth(split, 12);
    assert.equal(r.kind, 'ambiguous');
    assert.equal(r.kind === 'ambiguous' && r.reason, 'ambiguous_month');
  });
  test('rejects month 0 and 13', () => {
    assert.throws(() => resolveMonth(assumed, 0), RangeError);
    assert.throws(() => resolveMonth(assumed, 13), RangeError);
  });
});

describe('validateSeasons', () => {
  test('the assumed Peak/Monsoon pair is valid', () => assert.deepEqual(validateSeasons(assumed), []));
  test('requires at least one season', () => assert.match(validateSeasons([]).join(), /at least one season/));
  test('detects overlap including across the year wrap', () => {
    const issues = validateSeasons([peak, { ...monsoon, startMd: '03-15', endMd: '04-10' }]);
    assert.match(issues.join(), /overlap/);
  });
  test('detects overlap between two seasons that share a name', () => {
    const issues = validateSeasons([peak, { ...peak, startMd: '03-15', endMd: '04-10' }]);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /overlap/);
    assert.match(issues[0], /#1/);
    assert.match(issues[0], /#2/);
  });
  test('identically named seasons that do not overlap are valid', () => {
    assert.deepEqual(validateSeasons([{ ...peak, startMd: '10-01', endMd: '12-31' }, { ...peak, startMd: '01-01', endMd: '03-31' }]), []);
  });
  test('flags invalid MM-DD and non-positive or fractional prices', () => {
    assert.match(validateSeasons([{ ...peak, startMd: '02-30' }]).join(), /not a valid MM-DD/);
    assert.match(validateSeasons([{ ...peak, pricePpTwinInr: 0 }]).join(), /positive whole number/);
    assert.match(validateSeasons([{ ...peak, pricePpTwinInr: 100.5 }]).join(), /positive whole number/);
  });
});
