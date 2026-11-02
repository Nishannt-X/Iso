import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { initSchema, openDb } from '../src/db/db.js';
import { resetDatabase } from '../src/db/seed.js';
import { createPackage, publish, type VersionContent } from '../src/domain/packages.js';

describe('GET /', () => {
  const app = createApp(resetDatabase(':memory:'));

  test('lists live packages: PKG-KL-07 present, draft-only PKG-SI-12 absent', async () => {
    const res = await app.request('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const body = await res.text();
    assert.ok(body.startsWith('<!DOCTYPE html>'));
    assert.ok(body.includes('PKG-KL-07'));
    assert.ok(body.includes('Munnar, Thekkady and Alleppey houseboat'));
    assert.ok(!body.includes('PKG-SI-12'));
    assert.ok(!body.includes('Madurai, Rameswaram and Kanyakumari'));
  });

  test('says the data is synthetic and shows no prices', async () => {
    const body = await (await app.request('/')).text();
    assert.match(body, /synthetic demo data/);
    assert.ok(!/₹|Rs\.? ?\d|INR/.test(body));
  });

  test('shows an empty state when nothing is published', async () => {
    const db = openDb(':memory:');
    initSchema(db);
    const body = await (await createApp(db).request('/')).text();
    assert.match(body, /No packages are published yet/);
  });

  test('escapes package text (XSS payload in a title renders inert)', async () => {
    const db = resetDatabase(':memory:');
    const content: VersionContent = {
      title: '<script>alert(1)</script>', summary: 's', days: 1, nights: 0, starRating: null, region: '"><img src=x onerror=alert(2)>',
      childPct: null, childRuleNote: null, singleSuppInr: null,
      itinerary: [{ day: 1, title: 'd', description: '' }], inclusions: [], exclusions: [], destinations: [], tags: [],
      seasons: [{ name: 'All', startMd: '01-01', endMd: '12-31', pricePpTwinInr: 1000, rangeAssumed: true }],
    };
    const { versionId } = createPackage(db, { code: 'XSS-1', slug: 'xss-1', dataOrigin: 'synthetic', actorId: 1, content });
    publish(db, { draftId: versionId, actorId: 1, note: '' });
    const body = await (await createApp(db).request('/')).text();
    assert.ok(!body.includes('<script>alert(1)'));
    assert.ok(body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!body.includes('<img src=x'));
  });

  test('returns a plain 500 without internals when the database fails', async () => {
    const db = resetDatabase(':memory:');
    const broken = createApp(db);
    db.close();
    const res = await broken.request('/');
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.match(text, /Something went wrong/);
    assert.ok(!/sqlite|database|SELECT/i.test(text));
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

describe('routing', () => {
  test('unknown paths are 404', async () => {
    const res = await createApp(resetDatabase(':memory:')).request('/nope');
    assert.equal(res.status, 404);
  });
});
