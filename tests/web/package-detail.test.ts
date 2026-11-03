import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { resetDatabase } from '../../src/db/seed.js';
import { getLiveVersionBySlug } from '../../src/domain/packages.js';
import { PHOTOS } from '../../src/domain/photos.js';
import { PackagePage } from '../../src/web/pages.js';

const SITE = 'https://example.com';
const KL07_SLUG = 'munnar-thekkady-and-alleppey-houseboat-6-days';

describe('Public Package Detail Experience & Editorial Copy', () => {
  const db = resetDatabase(':memory:');
  const app = createApp(db, { siteUrl: SITE });

  test('renders full-bleed credited travel hero with clean kicker, title and lede without decorative pills', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.ok(html.includes('class="hero short has-credit"'));
    assert.ok(html.includes('class="kicker"'));
    assert.ok(html.includes('PKG-KL-07'));
    assert.ok(html.includes('Alleppey backwaters'));
    assert.ok(html.includes('Paul Arps'));
    // Decorative pills removed to eliminate duplication with summary
    assert.ok(!html.includes('class="pkg-pills"'));
  });

  test('displays at-a-glance editorial summary with duration, stays, region, and package code', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="at-a-glance"'));
    assert.ok(html.includes('class="glance-item"'));
    assert.ok(html.includes('Duration'));
    assert.ok(html.includes('6 days, 5 nights'));
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

  test('renders photo band with clean frame and licence provenance below', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="band"'));
    assert.ok(html.includes('munnar-tea'));
    assert.ok(html.includes('Ingo Mehling'));
    assert.ok(html.includes('CC BY-SA 4.0'));
  });

  test('renders inclusions and exclusions in clean two-column editorial lists without card boxes', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('class="two-col"'));
    assert.ok(html.includes('Included and not included'));
    assert.ok(html.includes('One night on a houseboat with meals'));
    assert.ok(html.includes('class="item-icon"'));
    assert.ok(!html.includes('class="col-card'));
  });

  test('renders stay notes without fabricating hotel names or unsupported service claims', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.ok(html.includes('4-star hotels throughout.'));
    assert.ok(html.includes('Hotel names are not listed for this package yet.'));
    // Unsupported service claims removed per review finding
    assert.ok(!html.includes('Verified room categories and service standards'));
    assert.ok(!html.includes('class="stay-card"'));
  });

  test('renders seasonal pricing table with twin-sharing and GST notes', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    assert.match(html, /<caption>All prices are per person, twin sharing\. GST pending\.<\/caption>/);
    assert.match(html, /Peak<\/th><td>October to March<\/td><td class="num">₹32,500<\/td>/);
    assert.match(html, /Monsoon<\/th><td>June to September<\/td><td class="num">₹24,900<\/td>/);
    assert.ok(html.includes('GST: pending'));
    assert.ok(html.includes('Exact start and end dates are still to be confirmed'));
    assert.ok(!html.includes('class="prices-card"'));
  });

  test('renders exactly one strong Enquire button without misleading reassurance marketing claims', async () => {
    const res = await app.request(`/packages/${KL07_SLUG}`);
    const html = await res.text();

    const buttons = html.match(/<a class="btn" href="([^"]+)">Enquire<\/a>/g) ?? [];
    assert.equal(buttons.length, 1);
    assert.ok(html.includes(`href="/enquire?package=${KL07_SLUG}"`));
    assert.ok(html.includes('class="book"'));
    // Misleading claims removed per review finding:
    assert.ok(!html.includes('Instant enquiry acknowledgement'));
    assert.ok(!html.includes('Fixed seasonal rates'));
    assert.ok(!html.includes('class="book-reassurance"'));
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

  test('public pages carry no invented rates, reply promises or controls that need JavaScript', async () => {
    for (const path of ['/', `/packages/${KL07_SLUG}`, '/packages', '/destinations', '/journal']) {
      const html = await (await app.request(path)).text();
      // The old client-side estimator invented a 5% GST, a 75% child fare and a 35% solo supplement.
      assert.ok(!/5% GST|75% rate|supplement|Estimated Party Total/i.test(html), `${path}: invented rate`);
      // The old slide-over form promised a reply time the build cannot keep and posted fields the server ignores.
      assert.ok(!/1-hour|within 1 hour|Guaranteed|DPDP Act compliant|whatsapp_consent|company_tax_pin/i.test(html), `${path}: unsupported promise`);
      // Buttons that do nothing without JavaScript (filters, pins, steppers) are gone.
      assert.ok(!html.includes('type="button"'), `${path}: script-only control`);
      assert.ok(!html.includes('role="button"'), `${path}: fake button`);
    }
  });

  test('destination tiles credit every photograph beside it and plain tiles show no photo', async () => {
    const html = await (await app.request('/destinations')).text();
    const shown = [...html.matchAll(/<img [^>]*?src="\/assets\/images\/([a-z0-9-]+)-900\.jpg"/g)].map((m) => m[1]!);
    assert.ok(shown.length >= 5);
    for (const id of shown) assert.ok(html.includes(PHOTOS[id as keyof typeof PHOTOS].author), id);
    assert.match(html, /<li class="dest-tile plain">/);
  });

  test('enquiry form step links all point at sections on the page', async () => {
    const html = await (await app.request(`/enquire?package=${KL07_SLUG}`)).text();
    const steps = [...html.matchAll(/<nav class="steps"[\s\S]*?<\/nav>/g)][0]![0];
    const targets = [...steps.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.equal(targets.length, 4);
    for (const id of targets) assert.ok(html.includes(` id="${id}"`), id);
    assert.ok(html.includes('What happens next'));
  });
});
