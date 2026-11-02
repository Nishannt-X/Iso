import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { resetDatabase } from '../../src/db/seed.js';
import { getLiveVersionBySlug } from '../../src/domain/packages.js';
import { PackagePage } from '../../src/web/pages.js';

const SITE = 'https://example.com';
const KL07_SLUG = 'munnar-thekkady-and-alleppey-houseboat-6-days';

describe('Public Package Detail Experience & Editorial Copy', () => {
  const db = resetDatabase(':memory:');
  const app = createApp(db, { siteUrl: SITE });

  test('renders full-bleed credited travel hero with pills, title and lede', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.ok(html.includes('class="hero short has-credit"'));
    assert.ok(html.includes('class="pkg-pills"'));
    assert.ok(html.includes('PKG-KL-07'));
    assert.ok(html.includes('6 days, 5 nights'));
    assert.ok(html.includes('Alleppey backwaters'));
    assert.ok(html.includes('Paul Arps'));
  });

  test('displays at-a-glance summary cards with duration, stays, region, and package code', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="at-a-glance"'));
    assert.ok(html.includes('class="glance-item"'));
    assert.ok(html.includes('Duration'));
    assert.ok(html.includes('Stays'));
    assert.ok(html.includes('4-star hotels'));
    assert.ok(html.includes('Region'));
    assert.ok(html.includes('Kerala'));
    assert.ok(html.includes('Package code'));
  });

  test('renders editorial timeline itinerary with day markers and clean descriptions', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="itinerary"'));
    assert.ok(html.includes('class="itinerary-day"'));
    assert.ok(html.includes('Day 1'));
    assert.ok(html.includes('Day 6'));
    assert.ok(html.includes('Arrive in Kochi'));
    assert.ok(html.includes('Alleppey to Kochi'));
  });

  test('renders photo band with frame and licence provenance below', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="band"'));
    assert.ok(html.includes('class="band-frame"'));
    assert.ok(html.includes('munnar-tea'));
    assert.ok(html.includes('Ingo Mehling'));
    assert.ok(html.includes('CC BY-SA 4.0'));
  });

  test('renders inclusions and exclusions in two structured cards with item icons', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="two-col"'));
    assert.ok(html.includes('class="col-card inclusion-card"'));
    assert.ok(html.includes('class="col-card exclusion-card"'));
    assert.ok(html.includes('Included and not included'));
    assert.ok(html.includes('One night on a houseboat with meals'));
    assert.ok(html.includes('class="item-icon"'));
  });

  test('renders stay notes without fabricating hotel names', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="stay-card"'));
    assert.ok(html.includes('4-star hotels throughout.'));
    assert.ok(html.includes('Hotel names are not listed for this package yet.'));
  });

  test('renders seasonal pricing table with twin-sharing and GST notes', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="prices-card"'));
    assert.match(html, /<caption>All prices are per person, twin sharing\. GST pending\.<\/caption>/);
    assert.match(html, /Peak<\/th><td>October to March<\/td><td class="num">₹32,500<\/td>/);
    assert.match(html, /Monsoon<\/th><td>June to September<\/td><td class="num">₹24,900<\/td>/);
    assert.ok(html.includes('GST: pending'));
    assert.ok(html.includes('Exact start and end dates are still to be confirmed'));
  });

  test('renders exactly one strong Enquire button with reassurance badges', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    const buttons = html.match(/<a class="btn" href="([^"]+)">Enquire<\/a>/g) ?? [];
    assert.equal(buttons.length, 1);
    assert.ok(html.includes(`href="/enquire?package=${KL07_SLUG}"`));
    assert.ok(html.includes('class="book"'));
    assert.ok(html.includes('class="book-reassurance"'));
    assert.ok(html.includes('Instant enquiry acknowledgement'));
  });

  test('bare package fallback renders honestly with no hero class', () => {
    const memDb = resetDatabase(':memory:');
    const base = getLiveVersionBySlug(memDb, KL07_SLUG)!;
    const bare = {
      ...base,
      packageCode: 'BARE-TEST',
      seasons: [],
      starRating: null,
      inclusions: [],
      exclusions: [],
      destinations: [],
    };
    const html = PackagePage({ v: bare, origin: 'synthetic', ctx: { siteUrl: SITE } }).toString();

    assert.ok(!html.includes('class="hero'));
    assert.ok(html.includes('Prices for this package are not published yet'));
    assert.ok(html.includes('Price to be confirmed'));
    assert.ok(html.includes('Hotel category not listed'));
    assert.ok(html.includes('Not listed yet'));
  });

  test('home page ticket stub clearly labels synthetic lowest fare (P1 copy fix)', async () => {
    const res = await app.request('/');
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.match(html, /<dt>Fares from<\/dt><dd class="num">₹14,000<\/dd>/);
    assert.ok(html.includes('Synthetic demo fare'));
    assert.ok(html.includes('lowest fare is from a demo package'));
  });

  test('how it works step 3 states truthful mock outbox demo wording without false reply promise (P1 copy fix)', async () => {
    const res = await app.request('/');
    const html = await res.text();

    assert.ok(!html.includes('A Company A consultant will read it and reply to you personally'));
    assert.ok(html.includes('enquiries are stored in a mock outbox'));
  });
});
