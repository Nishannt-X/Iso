import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { run } from '../../src/db/db.js';
import { getGstRateBp, quote, type PricingVersion } from '../../src/domain/pricing.js';
import type { Season } from '../../src/domain/seasons.js';
import { freshDb } from '../helpers.js';

const peak: Season = { name: 'Peak', startMd: '10-01', endMd: '03-31', pricePpTwinInr: 32500, rangeAssumed: true };
const monsoon: Season = { name: 'Monsoon', startMd: '06-01', endMd: '09-30', pricePpTwinInr: 24900, rangeAssumed: true };
const kl07: PricingVersion = { days: 6, seasons: [peak, monsoon], childPct: null, singleSuppInr: null };

describe('sample enquiry: 2 adults + 1 child, December, no child rule', () => {
  const q = quote(kl07, { when: { month: 12 }, adults: 2, children: [{ age: 6 }] });
  test('is partial: adult fare priced, child fare unpriced', () => {
    assert.equal(q.status, 'partial');
    assert.equal(q.subtotal_inr, 65000);
    assert.deepEqual(q.lines.map((l) => [l.code, l.quantity, l.unit_inr, l.amount_inr]), [['adults', 2, 32500, 65000]]);
    assert.deepEqual(q.unpriced.map((u) => [u.kind, u.reason]), [['child', 'child_rule_missing']]);
    assert.equal(q.season_name, 'Peak');
  });
  test('has no GST line and says so', () => {
    assert.equal(q.gst, undefined);
    assert.equal(q.total_inr, undefined);
    assert.ok(q.assumptions.some((a) => /before GST; tax treatment to be confirmed by Company A/.test(a)));
  });
  test('labels the assumed season range and the lower-bound nature', () => {
    assert.ok(q.assumptions.some((a) => /ASSUMED/.test(a)));
    assert.ok(q.assumptions.some((a) => /lower bound/.test(a)));
    assert.ok(q.assumptions.some((a) => /no age band/.test(a)));
  });
});

describe('arithmetic fixture (test values only, never seeded): child 75%, GST 500 bp', () => {
  const v: PricingVersion = { ...kl07, childPct: 75 };
  test('24,375 + 65,000 = 89,375; GST 4,468.75 rounds to 4,469; total 93,844', () => {
    const q = quote(v, { when: { startDate: '2026-12-20' }, adults: 2, children: [{}], gstRateBp: 500 });
    assert.equal(q.status, 'complete');
    assert.deepEqual(q.unpriced, []);
    assert.equal(q.lines.find((l) => l.code === 'children')?.amount_inr, 24375);
    assert.equal(q.subtotal_inr, 89375);
    assert.deepEqual(q.gst, { rate_bp: 500, amount_inr: 4469 });
    assert.equal(q.total_inr, 93844);
  });
  test('GST rounds half up on the GST line only (0.5 -> 1, 0.49 -> 0)', () => {
    const one: PricingVersion = { days: 1, seasons: [{ ...peak, startMd: '01-01', endMd: '12-31', pricePpTwinInr: 10 }], childPct: null, singleSuppInr: null };
    assert.equal(quote(one, { when: { month: 6 }, adults: 2, children: [], gstRateBp: 250 }).gst?.amount_inr, 1); // 20 * 2.5% = 0.5
    assert.equal(quote(one, { when: { month: 6 }, adults: 2, children: [], gstRateBp: 240 }).gst?.amount_inr, 0); // 0.48
  });
  test('child fare rounds half up per rupee', () => {
    const odd: PricingVersion = { ...v, childPct: 50, seasons: [{ ...peak, startMd: '01-01', endMd: '12-31', pricePpTwinInr: 1001 }] };
    assert.equal(quote(odd, { when: { month: 6 }, adults: 2, children: [{}] }).lines[1].unit_inr, 501); // 500.5
  });
  test('an explicit 0% child rule is a valid rule: child priced at 0', () => {
    const q = quote({ ...kl07, childPct: 0 }, { when: { month: 12 }, adults: 2, children: [{}] });
    assert.equal(q.status, 'complete');
    assert.equal(q.subtotal_inr, 65000);
  });
  test('a configured GST rate of 0 yields a zero GST line, not a missing one', () => {
    const q = quote(kl07, { when: { month: 12 }, adults: 2, children: [], gstRateBp: 0 });
    assert.deepEqual(q.gst, { rate_bp: 0, amount_inr: 0 });
  });
});

describe('odd adult counts and the single supplement', () => {
  test('odd adults with no supplement set: partial, single_supp_missing', () => {
    const q = quote(kl07, { when: { month: 12 }, adults: 3, children: [] });
    assert.equal(q.status, 'partial');
    assert.equal(q.subtotal_inr, 97500);
    assert.deepEqual(q.unpriced.map((u) => u.reason), ['single_supp_missing']);
  });
  test('odd adults with a supplement set: one supplement line, complete', () => {
    const q = quote({ ...kl07, singleSuppInr: 6000 }, { when: { month: 12 }, adults: 1, children: [] });
    assert.equal(q.status, 'complete');
    assert.equal(q.subtotal_inr, 38500);
  });
  test('even adults never need a supplement', () => {
    assert.equal(quote({ ...kl07, singleSuppInr: 6000 }, { when: { month: 12 }, adults: 4, children: [] }).lines.length, 1);
  });
});

describe('season outcomes', () => {
  test('April has no season: unavailable, nothing priced', () => {
    const q = quote(kl07, { when: { startDate: '2026-04-10' }, adults: 2, children: [] });
    assert.equal(q.status, 'unavailable');
    assert.equal(q.subtotal_inr, null);
    assert.deepEqual(q.lines, []);
    assert.deepEqual(q.unpriced.map((u) => u.reason), ['no_season_for_date']);
  });
  test('Dec 31 start (wrap-around) is Peak and priced', () => {
    const q = quote(kl07, { when: { startDate: '2026-12-31' }, adults: 2, children: [] });
    assert.equal(q.status, 'complete');
    assert.equal(q.season_name, 'Peak');
  });
  test('a stay that runs from Peak into the April gap is a lower-bound straddle', () => {
    const q = quote(kl07, { when: { startDate: '2027-03-29' }, adults: 2, children: [] });
    assert.equal(q.status, 'partial');
    assert.deepEqual(q.unpriced.map((u) => u.reason), ['season_straddle']);
    assert.equal(q.subtotal_inr, 65000);
  });
  test('a month spanning two seasons prices the cheaper one and says ambiguous_month', () => {
    const split: PricingVersion = {
      ...kl07,
      seasons: [{ ...peak, startMd: '12-01', endMd: '12-15' }, { ...monsoon, name: 'Late', startMd: '12-16', endMd: '12-31', pricePpTwinInr: 20000 }],
    };
    const q = quote(split, { when: { month: 12 }, adults: 2, children: [] });
    assert.equal(q.status, 'partial');
    assert.equal(q.subtotal_inr, 40000);
    assert.deepEqual(q.unpriced.map((u) => u.reason), ['ambiguous_month']);
    assert.equal(q.season_name, null);
  });
  test('single all-year season (PKG-SI-12 style) prices any month', () => {
    const allYear: PricingVersion = { days: 5, seasons: [{ name: 'All year', startMd: '01-01', endMd: '12-31', pricePpTwinInr: 18750, rangeAssumed: false }], childPct: null, singleSuppInr: null };
    for (const month of [1, 4, 5, 12]) assert.equal(quote(allYear, { when: { month }, adults: 2, children: [] }).status, 'complete');
  });
});

describe('input validation', () => {
  test('rejects zero, fractional and negative adults, bad ages and bad GST rates', () => {
    const base = { when: { month: 12 }, children: [] } as const;
    for (const adults of [0, 1.5, -2]) assert.throws(() => quote(kl07, { ...base, adults }), RangeError);
    assert.throws(() => quote(kl07, { when: { month: 12 }, adults: 2, children: [{ age: -1 }] }), RangeError);
    assert.throws(() => quote(kl07, { ...base, adults: 2, gstRateBp: -5 }), RangeError);
    assert.throws(() => quote(kl07, { ...base, adults: 2, gstRateBp: 12.5 }), RangeError);
  });
});

describe('getGstRateBp', () => {
  test('is null when not configured, parsed when set, and throws when malformed', () => {
    const db = freshDb();
    assert.equal(getGstRateBp(db), null);
    run(db, "INSERT INTO pricing_config (key, value) VALUES ('gst_rate_bp', '500')");
    assert.equal(getGstRateBp(db), 500);
    run(db, "UPDATE pricing_config SET value = '5%' WHERE key = 'gst_rate_bp'");
    assert.throws(() => getGstRateBp(db), /malformed/);
  });
});
