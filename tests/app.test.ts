import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { initSchema, openDb } from '../src/db/db.js';
import { resetDatabase } from '../src/db/seed.js';
import { createPackage, getDraftForPackage, getLiveVersionBySlug, publish, restoreVersion, saveDraft, type VersionContent } from '../src/domain/packages.js';
import { HomePage, PackagePage } from '../src/web/pages.js';

const SITE = 'https://tours.example';
const KL07 = '/packages/munnar-thekkady-and-alleppey-houseboat-6-days';
const text = async (res: Response): Promise<string> => res.text();

function content(over: Partial<VersionContent> = {}): VersionContent {
  return {
    title: 'T', summary: 's', days: 1, nights: 0, starRating: null, region: 'Kerala',
    childPct: null, childRuleNote: null, singleSuppInr: null,
    itinerary: [{ day: 1, title: 'd', description: '' }], inclusions: [], exclusions: [], destinations: [], tags: [],
    seasons: [{ name: 'All', startMd: '01-01', endMd: '12-31', pricePpTwinInr: 1000, rangeAssumed: false }],
    ...over,
  };
}

describe('GET / (home and package list)', () => {
  const app = createApp(resetDatabase(':memory:'), { siteUrl: SITE });

  test('lists live packages as links to clean URLs; the draft-only PKG-SI-12 is absent', async () => {
    const res = await app.request('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const body = await text(res);
    assert.ok(body.startsWith('<!DOCTYPE html>'));
    assert.ok(body.includes('Munnar, Thekkady and Alleppey houseboat'));
    assert.ok(body.includes(`href="${KL07}"`));
    assert.ok(!body.includes('Madurai, Rameswaram and Kanyakumari'));
    assert.ok(!body.includes('PKG-SI-12'));
  });

  test('every price states the per-person basis, twin sharing and that GST is pending', async () => {
    const body = await text(await app.request('/'));
    assert.match(body, /From<\/span> <strong[^>]*>₹24,900<\/strong>/);
    assert.ok(body.includes('per person, twin sharing · GST pending'));
    assert.ok(!/\bRs\.? ?\d|INR/.test(body));
  });

  test('labels synthetic and placeholder content visibly, without the raw seed marker', async () => {
    const body = await text(await app.request('/'));
    assert.match(body, /Synthetic demo package/);
    assert.match(body, /itinerary is placeholder/);
    assert.ok(!body.includes('[Synthetic demo content]'));
  });

  test('has a title, description, canonical link and a full-width hero photo with its licence credit', async () => {
    const body = await text(await app.request('/'));
    assert.match(body, /<title>Kerala and South India holiday packages \| Kochi Tours<\/title>/);
    assert.match(body, /<meta name="description" content="[^"]+"/);
    assert.ok(body.includes(`<link rel="canonical" href="${SITE}/"`));
    assert.match(body, /<h1[^>]*>[^<]+<\/h1>/);
    assert.match(body, /class="hero[^"]*"/);
    assert.ok(body.includes('CC BY 2.0'));
    assert.ok(body.includes('via Wikimedia Commons'));
  });

  test('shows an empty state when nothing is published', async () => {
    const db = openDb(':memory:');
    initSchema(db);
    const res = await createApp(db, { siteUrl: SITE }).request('/');
    assert.equal(res.status, 200);
    assert.match(await text(res), /No packages are published yet/);
  });

  test('escapes package text (XSS payload in a title renders inert)', async () => {
    const db = resetDatabase(':memory:');
    const { versionId } = createPackage(db, {
      code: 'XSS-1', slug: 'xss-1', dataOrigin: 'synthetic', actorId: 1,
      content: content({ title: '<script>alert(1)</script>', region: '"><img src=x onerror=alert(2)>', itinerary: [{ day: 1, title: '<b>x</b>', description: '<i>y</i>' }] }),
    });
    publish(db, { draftId: versionId, actorId: 1, note: '' });
    const app = createApp(db, { siteUrl: SITE });
    for (const path of ['/', '/packages/xss-1']) {
      const body = await text(await app.request(path));
      assert.ok(!body.includes('<script>alert(1)'), path);
      assert.ok(body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), path);
      assert.ok(!body.includes('<img src=x'), path);
      assert.ok(!body.includes('<b>x</b>'), path);
    }
  });
});

describe('GET /packages/:slug (package detail)', () => {
  const app = createApp(resetDatabase(':memory:'), { siteUrl: SITE });

  test('shows the itinerary day by day, inclusions, hotel stars and a single Enquire link', async () => {
    const res = await app.request(KL07);
    assert.equal(res.status, 200);
    const body = await text(res);
    for (const d of ['Day 1', 'Day 6', 'Arrive in Kochi', 'Alleppey to Kochi']) assert.ok(body.includes(d), d);
    assert.ok(body.includes('Included and not included'));
    assert.ok(body.includes('One night on a houseboat with meals'));
    assert.ok(body.includes('4-star hotels'));
    assert.ok(body.includes('Hotel names are not listed'));
    const enquire = body.match(/<a class="btn" href="([^"]+)">Enquire<\/a>/g) ?? [];
    assert.equal(enquire.length, 1);
    assert.ok(body.includes(`href="/enquire?package=munnar-thekkady-and-alleppey-houseboat-6-days"`));
  });

  test('prices table lists both brief seasons per person, twin sharing, with GST pending', async () => {
    const body = await text(await app.request(KL07));
    assert.match(body, /<caption>All prices are per person, twin sharing\. GST pending\.<\/caption>/);
    assert.match(body, /Peak<\/th><td>October to March<\/td><td class="num">₹32,500<\/td>/);
    assert.match(body, /Monsoon<\/th><td>June to September<\/td><td class="num">₹24,900<\/td>/);
    assert.ok(body.includes('GST: pending'));
    assert.ok(body.includes('Exact start and end dates are still to be confirmed'));
  });

  test('has a full-width hero photo, a second photo and both licence credits', async () => {
    const body = await text(await app.request(KL07));
    assert.match(body, /class="hero short has-credit"/);
    assert.match(body, /srcset="\/assets\/images\/alleppey-houseboats-900\.jpg 900w, \/assets\/images\/alleppey-houseboats-2000\.jpg 2000w"/);
    assert.ok(body.includes('/assets/images/munnar-tea-900.jpg'));
    assert.ok(body.includes('Paul Arps'));
    assert.ok(body.includes('Ingo Mehling'));
    assert.ok(body.includes('CC BY-SA 4.0'));
  });

  test('has SEO basics: title, description, canonical, og tags', async () => {
    const body = await text(await app.request(KL07));
    assert.match(body, /<title>Munnar, Thekkady and Alleppey houseboat, 6 days, 5 nights \| Kochi Tours<\/title>/);
    assert.ok(body.includes(`<link rel="canonical" href="${SITE}${KL07}"`));
    assert.ok(body.includes('property="og:image"'));
    assert.ok(!body.includes('name="robots"'));
  });

  test('a draft-only package is a 404, as is an unknown or malformed slug', async () => {
    for (const path of ['/packages/madurai-rameswaram-and-kanyakumari-5-days', '/packages/nope', '/packages/Bad_Slug', '/packages/-x']) {
      const res = await app.request(path);
      assert.equal(res.status, 404, path);
      assert.match(await text(res), /Page not found/);
    }
  });

  test('serves only the published version: edits to a draft and a restore stay invisible until publish', async () => {
    const db = resetDatabase(':memory:');
    const a = createApp(db, { siteUrl: SITE });
    const live = await text(await a.request(KL07));
    const pkgId = 1;
    const { draftId } = restoreVersion(db, { versionId: 1, actorId: 1 });
    const draft = getDraftForPackage(db, pkgId)!;
    saveDraft(db, { versionId: draftId, expectedLockVersion: draft.lockVersion, content: { ...draft, title: 'Draft only title' } });
    const after = await text(await a.request(KL07));
    assert.equal(after, live);
    assert.ok(!after.includes('Draft only title'));
  });

  test('a version with no photo, seasons or star rating still renders honestly', async () => {
    // Publishing requires a season, so this state cannot come from the database today; the page must still cope.
    const db = resetDatabase(':memory:');
    const base = getLiveVersionBySlug(db, 'munnar-thekkady-and-alleppey-houseboat-6-days')!;
    const bare = { ...base, packageCode: 'BARE-1', seasons: [], starRating: null, inclusions: [], destinations: [] };
    const detail = PackagePage({ v: bare, origin: 'synthetic', ctx: { siteUrl: SITE } }).toString();
    assert.ok(detail.includes('Prices for this package are not published yet'));
    assert.ok(detail.includes('Price to be confirmed'));
    assert.ok(detail.includes('Hotel category not listed'));
    assert.ok(detail.includes('Not listed yet'));
    assert.ok(!detail.includes('class="hero'));
    assert.match(HomePage({ packages: [bare], origins: new Map(), ctx: { siteUrl: SITE } }).toString(), /Photo to come/);
  });
});

describe('enquire placeholder', () => {
  const app = createApp(resetDatabase(':memory:'), { siteUrl: SITE });

  test('names the package, is noindex and links back; unknown packages get the generic text', async () => {
    const body = await text(await app.request('/enquire?package=munnar-thekkady-and-alleppey-houseboat-6-days'));
    assert.ok(body.includes('The enquiry form is not live yet'));
    assert.ok(body.includes('Munnar, Thekkady and Alleppey houseboat'));
    assert.ok(body.includes('<meta name="robots" content="noindex"'));
    assert.ok(body.includes(`href="${KL07}"`));
    const generic = await text(await app.request('/enquire?package=<script>'));
    assert.ok(!generic.includes('<script>'));
    assert.ok(generic.includes('See all packages'));
  });
});

describe('sitemap.xml and robots.txt', () => {
  const app = createApp(resetDatabase(':memory:'), { siteUrl: `${SITE}/` });

  test('sitemap lists the home page and each live package, never the draft', async () => {
    const res = await app.request('/sitemap.xml');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/xml/);
    const body = await text(res);
    assert.ok(body.includes(`<loc>${SITE}/</loc>`));
    assert.ok(body.includes(`<loc>${SITE}${KL07}</loc>`));
    assert.equal((body.match(/<url>/g) ?? []).length, 7); // home + 6 live packages
    assert.match(body, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    assert.ok(!body.includes('madurai'));
    assert.ok(!body.includes('//packages'));
  });

  test('sitemap follows publishing: a newly published package appears', async () => {
    const db = resetDatabase(':memory:');
    const a = createApp(db, { siteUrl: SITE });
    assert.ok(!(await text(await a.request('/sitemap.xml'))).includes('/packages/new-one'));
    const { versionId } = createPackage(db, { code: 'NEW-1', slug: 'new-one', dataOrigin: 'synthetic', actorId: 1, content: content() });
    publish(db, { draftId: versionId, actorId: 1, note: '' });
    assert.ok((await text(await a.request('/sitemap.xml'))).includes(`${SITE}/packages/new-one`));
  });

  test('robots.txt allows crawling, keeps the placeholder out and points at the sitemap', async () => {
    const body = await text(await app.request('/robots.txt'));
    assert.equal(body, `User-agent: *\nAllow: /\nDisallow: /enquire\n\nSitemap: ${SITE}/sitemap.xml\n`);
  });
});

describe('assets', () => {
  const app = createApp(resetDatabase(':memory:'), { siteUrl: SITE });

  test('serves a photo and the font with a type and cache header', async () => {
    const img = await app.request('/assets/images/alleppey-houseboat-2000.jpg');
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.match(img.headers.get('cache-control') ?? '', /max-age=\d+/);
    assert.ok((await img.arrayBuffer()).byteLength > 10_000);
    const font = await app.request('/assets/fonts/hanken-grotesk-latin.woff2');
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
  });

  test('refuses anything outside the allowed names (traversal, other types, missing files)', async () => {
    for (const path of ['/assets/images/..%2Fpackage.json', '/assets/images/nope-900.jpg', '/assets/images/alleppey-houseboat-2000.png', '/assets/other/x.jpg', '/assets/fonts/evil.woff2', '/assets/images/%2e%2e%2fapp.tsx']) {
      assert.equal((await app.request(path)).status, 404, path);
    }
  });
});

describe('routing, headers and errors', () => {
  const app = createApp(resetDatabase(':memory:'), { siteUrl: SITE });

  test('unknown paths show a designed 404 page that is noindex', async () => {
    const res = await app.request('/nope');
    assert.equal(res.status, 404);
    const body = await text(res);
    assert.match(body, /Page not found/);
    assert.ok(body.includes('<meta name="robots" content="noindex"'));
    assert.ok(body.includes('href="/#packages"'));
  });

  test('a trailing slash redirects permanently to the clean URL', async () => {
    const res = await app.request(`${KL07}/`);
    assert.equal(res.status, 301);
    assert.ok((res.headers.get('location') ?? '').endsWith(KL07));
  });

  test('sets security headers and a CSP that allows only own assets', async () => {
    const res = await app.request('/');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.ok(!csp.includes("'unsafe-eval'"));
  });

  test('a database failure gives a friendly 500 page that leaks no internals', async () => {
    const db = resetDatabase(':memory:');
    const broken = createApp(db, { siteUrl: SITE });
    db.close();
    const res = await broken.request('/');
    assert.equal(res.status, 500);
    const body = await text(res);
    assert.match(body, /Something went wrong/);
    assert.ok(!/node:sqlite|SELECT \*|SELECT v\.|no such|DatabaseSync|at .*\.ts:\d+/.test(body));
  });
});

describe('GET /healthz', () => {
  test('is ok while the database is reachable and 503 once it is not', async () => {
    const db = resetDatabase(':memory:');
    const app = createApp(db);
    const ok = await app.request('/healthz');
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { status: 'ok' });
    db.close();
    const down = await app.request('/healthz');
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), { status: 'error' });
  });
});

