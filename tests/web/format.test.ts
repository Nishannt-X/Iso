import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SYNTHETIC_MARKER } from '../../src/domain/packages.js';
import type { Season } from '../../src/domain/seasons.js';
import { cleanSummary, duration, formatInr, fromPrice, metaDescription, seasonDates, starLabel } from '../../src/web/format.js';

const season = (over: Partial<Season>): Season => ({ name: 'S', startMd: '10-01', endMd: '03-31', pricePpTwinInr: 1000, rangeAssumed: true, ...over });

describe('formatInr', () => {
  test('uses Indian digit grouping', () => {
    assert.equal(formatInr(32500), '₹32,500');
    assert.equal(formatInr(120000), '₹1,20,000');
    assert.equal(formatInr(950), '₹950');
  });
});

describe('seasonDates', () => {
  test('an assumed range is shown by month only, since the brief gives months', () => {
    assert.equal(seasonDates(season({})), 'October to March');
    assert.equal(seasonDates(season({ startMd: '06-01', endMd: '09-30' })), 'June to September');
  });
  test('a known range shows exact days; all year reads "All year"', () => {
    assert.equal(seasonDates(season({ rangeAssumed: false, startMd: '04-15', endMd: '05-31' })), '15 Apr to 31 May');
    assert.equal(seasonDates(season({ rangeAssumed: false, startMd: '01-01', endMd: '12-31' })), 'All year');
  });
});

describe('fromPrice', () => {
  test('is the lowest season price, or null with no seasons', () => {
    assert.equal(fromPrice([season({ pricePpTwinInr: 32500 }), season({ pricePpTwinInr: 24900 })]), 24900);
    assert.equal(fromPrice([]), null);
  });
});

describe('labels', () => {
  test('stars, duration and singular forms', () => {
    assert.equal(starLabel(4), '4-star');
    assert.equal(starLabel(null), null);
    assert.equal(duration({ days: 6, nights: 5 }), '6 days, 5 nights');
    assert.equal(duration({ days: 1, nights: 0 }), '1 day, 0 nights');
    assert.equal(duration({ days: 2, nights: 1 }), '2 days, 1 night');
  });
  test('cleanSummary strips only the leading synthetic marker', () => {
    assert.equal(cleanSummary(`${SYNTHETIC_MARKER}Five days.`), 'Five days.');
    assert.equal(cleanSummary('Five days.'), 'Five days.');
  });
  test('metaDescription cuts at a word boundary and leaves short text alone', () => {
    assert.equal(metaDescription('short'), 'short');
    const out = metaDescription('word '.repeat(60), 50);
    assert.ok(out.length <= 50 && out.endsWith('…') && !out.includes('wor…'));
  });
});
