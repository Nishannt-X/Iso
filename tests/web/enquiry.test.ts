import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createApp } from '../../src/app.js';
import { all, get, type DatabaseSync } from '../../src/db/db.js';
import { resetDatabase } from '../../src/db/seed.js';
import { newSubmissionKey, newToken } from '../../src/domain/enquiries.js';
import { PRIVACY_NOTICE_VERSION, WHATSAPP_CONSENT_TEXT } from '../../src/domain/notices.js';

const SITE = 'https://tours.example';
const KL07 = 'munnar-thekkady-and-alleppey-houseboat-6-days';
const NOW = new Date('2026-11-02T10:00:00.000Z');
const BRIEF_MESSAGE = 'Hi, 2 adults and 1 kid, Kerala 5-6 nights in December, budget around 1.2 lakh total, houseboat a must';
const SAME_SITE = { Origin: SITE };

interface Harness {
  db: DatabaseSync;
  app: ReturnType<typeof createApp>;
  post(fields: Record<string, string>, headers?: Record<string, string>): Promise<Response>;
}

function harness(opts: Parameters<typeof createApp>[1] = {}, keepSample = false): Harness {
  const db = resetDatabase(':memory:');
  if (!keepSample) db.exec('DELETE FROM enquiries'); // the seed's sample enquiry would shift every count below
  const app = createApp(db, { siteUrl: SITE, now: () => NOW, ...opts });
  return {
    db,
    app,
    post: async (fields, headers = SAME_SITE) =>
      app.request('/enquire', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields).toString() }),
  };
}

const goodFields = (over: Record<string, string> = {}): Record<string, string> => ({
  package: KL07, key: newSubmissionKey(), name: 'Asha Menon', email: 'asha@example.invalid', phone: '', travelStart: '', adults: '2', children: '1',
  childAges: '', destination: 'Kerala', budget: '', budgetBasis: 'total', message: BRIEF_MESSAGE, ...over,
});
const count = (db: DatabaseSync, table: string): number => get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`)?.n ?? -1;
const tokenOf = (res: Response): string => (res.headers.get('location') ?? '').replace('/enquiry/received/', '');

describe('GET /enquire (the form)', () => {
  const { app } = harness();

  test('is specific to the package, noindex, uncached, and prefilled from the package destinations', async () => {
    const res = await app.request(`/enquire?package=${KL07}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.text();
    assert.match(body, /<h1>Enquire about Munnar, Thekkady and Alleppey houseboat<\/h1>/);
    assert.ok(body.includes('<meta name="robots" content="noindex"'));
    assert.ok(!body.includes('rel="canonical"'));
    assert.ok(body.includes(`name="package" value="${KL07}"`));
    assert.ok(body.includes('per person, twin sharing · GST pending'));
    assert.match(body, /name="destination" value="Munnar, Thekkady, Alleppey"/);
    assert.match(body, /name="key" value="[A-Za-z0-9_-]{22}"/);
  });

  test('every control has a label, and the WhatsApp consent is a separate checkbox that is not checked', async () => {
    const body = await (await app.request(`/enquire?package=${KL07}`)).text();
    for (const id of ['travelStart', 'adults', 'children', 'childAges', 'destination', 'budget', 'budgetBasis', 'message', 'name', 'email', 'phone', 'whatsappConsent']) {
      assert.ok(body.includes(`<label for="${id}"`), `label for ${id}`);
      assert.match(body, new RegExp(`id="${id}"`), `control ${id}`);
    }
    const consent = body.match(/<input[^>]*id="whatsappConsent"[^>]*>/)?.[0] ?? '';
    assert.ok(consent.includes('type="checkbox"'));
    assert.ok(!/\bchecked\b/.test(consent), consent);
    assert.ok(body.includes(WHATSAPP_CONSENT_TEXT));
    assert.match(body, /How we use your details/);
    assert.match(body, /Draft notice/);
    assert.ok(!body.includes('id="error-summary"'));
  });

  test('the honeypot is hidden from assistive tech and skipped by keyboard', async () => {
    const body = await (await app.request(`/enquire?package=${KL07}`)).text();
    assert.match(body, /<div class="hp" aria-hidden="true"><label for="website">[^<]*<\/label><input[^>]*name="website"[^>]*tabindex="-1"[^>]*autocomplete="off"/);
  });

  test('each visit gets a fresh submission key', async () => {
    const key = async () => (await (await app.request(`/enquire?package=${KL07}`)).text()).match(/name="key" value="([^"]+)"/)?.[1];
    assert.notEqual(await key(), await key());
  });

  test('unknown, unpublished (draft-only) and missing packages are a 404, never an empty form', async () => {
    for (const q of ['?package=nope', '?package=madurai-rameswaram-and-kanyakumari-5-days', '', '?package=<script>']) {
      const res = await app.request(`/enquire${q}`);
      assert.equal(res.status, 404, q);
      assert.ok(!(await res.text()).includes('<form'));
    }
  });
});

describe('POST /enquire (the brief’s sample enquiry, end to end)', () => {
  test('stores it, redirects 303 to an opaque status link, and the status page shows the acknowledgement', async () => {
    const { app, db, post } = harness();
    const res = await post(goodFields());
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location') ?? '', /^\/enquiry\/received\/[A-Za-z0-9_-]{32}$/);

    const row = get<Record<string, unknown>>(db, 'SELECT * FROM enquiries')!;
    assert.equal(row.message, BRIEF_MESSAGE);
    assert.equal(row.adults, 2);
    assert.equal(row.children, 1);
    assert.equal(row.whatsapp_consent, 0);
    assert.equal(row.origin, 'web_form');
    assert.equal(row.privacy_notice_version, PRIVACY_NOTICE_VERSION);
    const version = get<{ package_id: number; status: string }>(db, 'SELECT package_id, status FROM package_versions WHERE id = ?', row.source_version_id as number)!;
    assert.equal(version.status, 'published');
    assert.equal(count(db, 'outbox_messages'), 1);

    const page = await app.request(res.headers.get('location')!);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /We have received your enquiry/);
    assert.ok(html.includes(row.reference as string));
    assert.ok(html.includes('Munnar, Thekkady and Alleppey houseboat'));
    assert.match(html, /Demo build: this was saved in a mock outbox, and nothing was sent/);
    assert.match(html, /It is not a quote/);
  });

  test('the status page leaks no personal data and carries noindex, no-store and no-referrer protections', async () => {
    const { app, post, db } = harness();
    const res = await post(goodFields({ name: 'Zainab Q. Visitor', email: 'zq@example.invalid', phone: '+919847012345', message: 'my private message text' }));
    const page = await app.request(res.headers.get('location')!);
    const html = await page.text();
    for (const secret of ['Zainab', 'zq@example.invalid', '9847012345', 'private message', '2 adults']) assert.ok(!html.includes(secret), `leaked ${secret}`);
    assert.ok(!html.includes(tokenOf(res)), 'the secret token is not repeated in the page (canonical, og:url)');
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(html.includes('<meta name="robots" content="noindex"'));
    assert.ok(!html.includes('rel="canonical"'));
    assert.equal(count(db, 'enquiries'), 1);
  });

  test('unknown, malformed, reference-shaped and SQL-shaped tokens all give the same 404', async () => {
    const { app, post, db } = harness();
    await post(goodFields());
    const reference = get<{ reference: string }>(db, 'SELECT reference FROM enquiries')!.reference;
    const real = get<{ public_token: string }>(db, 'SELECT public_token FROM enquiries')!.public_token;
    const bodies = new Set<string>();
    for (const t of [newToken(), reference, 'short', encodeURIComponent("' OR 1=1 --"), real.slice(0, 31), `${real}x`, '1']) {
      const res = await app.request(`/enquiry/received/${t}`);
      assert.equal(res.status, 404, t);
      bodies.add((await res.text()).replace(/<meta property="og:url" content="[^"]*"\/?>/, '')); // the 404 page only echoes the requested path, there
    }
    assert.equal(bodies.size, 1, 'no response varies except for the echoed path');
    assert.equal((await app.request(`/enquiry/received/${real}`)).status, 200);
  });

  test('robots.txt keeps crawlers off the form and the status pages', async () => {
    const { app } = harness();
    const robots = await (await app.request('/robots.txt')).text();
    assert.ok(robots.includes('Disallow: /enquire\n') && robots.includes('Disallow: /enquiry/\n'));
  });

  test('WhatsApp consent is stored with its wording and time only when the box is ticked, and needs a phone', async () => {
    const { post, db } = harness();
    assert.equal((await post(goodFields({ phone: '9847012345' }))).status, 303);
    assert.equal(get<{ c: number; t: string | null }>(db, 'SELECT whatsapp_consent AS c, whatsapp_consent_text AS t FROM enquiries')?.c, 0);
    assert.equal(get<{ t: string | null }>(db, 'SELECT whatsapp_consent_text AS t FROM enquiries')?.t, null);

    const ticked = await post(goodFields({ phone: '9847012345', whatsappConsent: 'on', message: 'second' }));
    assert.equal(ticked.status, 303);
    const row = get<{ c: number; t: string; at: string }>(db, 'SELECT whatsapp_consent AS c, whatsapp_consent_text AS t, whatsapp_consent_at AS at FROM enquiries WHERE message = ?', 'second')!;
    assert.deepEqual({ ...row }, { c: 1, t: WHATSAPP_CONSENT_TEXT, at: NOW.toISOString() });

    const noPhone = await post(goodFields({ whatsappConsent: 'on', message: 'third' }));
    assert.equal(noPhone.status, 422);
    assert.match(await noPhone.text(), /enter your phone number above/);
    assert.equal(count(db, 'enquiries'), 2);
  });

  test('a failed validation saves nothing, returns 422 with an error summary, and keeps the safe inputs', async () => {
    const { post, db } = harness();
    const res = await post(goodFields({ name: '', email: 'not-an-email', adults: '0', message: 'Keep <b>this</b> text & "quotes"', budget: '50000', budgetBasis: 'per_person' }));
    assert.equal(res.status, 422);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const html = await res.text();
    assert.equal(count(db, 'enquiries'), 0);
    assert.match(html, /<title>Error: Enquire about/);
    assert.match(html, /id="error-summary"[^>]*autofocus/);
    for (const f of ['name', 'email', 'adults']) assert.ok(html.includes(`href="#${f}"`), `summary links to ${f}`);
    assert.match(html, /<input[^>]*id="email"[^>]*aria-invalid="true"/);
    assert.match(html, /aria-describedby="[^"]*email-error/);
    assert.ok(html.includes('Keep &lt;b&gt;this&lt;/b&gt; text &amp; &quot;quotes&quot;'), 'message kept, escaped');
    assert.ok(!html.includes('<b>this</b>'));
    assert.match(html, /value="not-an-email"/);
    assert.match(html, /<option value="per_person" selected/);
    assert.match(html, /name="budget" value="50000"/);
  });

  test('the checkbox the traveller ticked stays ticked after an error; nothing is ticked on their behalf', async () => {
    const { post } = harness();
    const kept = await (await post(goodFields({ name: '', phone: '9847012345', whatsappConsent: 'on' }))).text();
    assert.match(kept.match(/<input[^>]*id="whatsappConsent"[^>]*>/)?.[0] ?? '', /\bchecked\b/);
    const unticked = await (await post(goodFields({ name: '', phone: '9847012345' }))).text();
    assert.ok(!/\bchecked\b/.test(unticked.match(/<input[^>]*id="whatsappConsent"[^>]*>/)?.[0] ?? ''));
  });

  test('the same form sent twice (double click, refresh) creates one enquiry and returns the same link', async () => {
    const { post, db } = harness();
    const fields = goodFields();
    const a = await post(fields);
    const b = await post(fields);
    assert.equal(a.status, 303);
    assert.equal(b.status, 303);
    assert.equal(a.headers.get('location'), b.headers.get('location'));
    assert.equal(count(db, 'enquiries'), 1);
    assert.equal(count(db, 'outbox_messages'), 1);
  });

  test('an identical resend from a fresh form is recognised; a different message is a new enquiry', async () => {
    const { post, db } = harness();
    const a = await post(goodFields());
    const b = await post(goodFields());
    assert.equal(a.headers.get('location'), b.headers.get('location'));
    const c = await post(goodFields({ message: 'a different question' }));
    assert.notEqual(a.headers.get('location'), c.headers.get('location'));
    assert.equal(count(db, 'enquiries'), 2);
  });

  test('a missing or malformed key is replaced server-side, not trusted', async () => {
    const { post, db } = harness();
    assert.equal((await post(goodFields({ key: "'; DROP TABLE enquiries;--" }))).status, 303);
    assert.equal((await post(goodFields({ key: '', message: 'other' }))).status, 303);
    assert.ok(all<{ k: string }>(db, 'SELECT submission_key AS k FROM enquiries').every((r) => /^[A-Za-z0-9_-]{22}$/.test(r.k)));
  });

  test('script and SQL payloads are stored as text and never rendered unescaped', async () => {
    const { post, app, db } = harness();
    const evil = `<script>alert(1)</script>'); DROP TABLE enquiries;--`;
    const res = await post(goodFields({ name: evil, message: evil, destination: evil, childAges: evil }));
    assert.equal(res.status, 422); // childAges is invalid, so the form comes back with the payload in it
    const html = await res.text();
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    const ok = await post(goodFields({ name: evil, message: evil, destination: evil }));
    assert.equal(ok.status, 303);
    assert.equal(get<{ name: string }>(db, 'SELECT name FROM enquiries')?.name, evil);
    assert.equal((await app.request(ok.headers.get('location')!)).status, 200);
  });

  test('Malayalam text round-trips unchanged', async () => {
    const { post, db } = harness();
    const ml = 'കേരളത്തിലെ ഹൗസ്ബോട്ട് യാത്ര';
    assert.equal((await post(goodFields({ message: ml }))).status, 303);
    assert.equal(get<{ message: string }>(db, 'SELECT message FROM enquiries')?.message, ml);
  });

  test('an unpublished or unknown package cannot receive an enquiry, even with a valid form', async () => {
    const { post, db } = harness();
    for (const slug of ['madurai-rameswaram-and-kanyakumari-5-days', 'nope', '../etc/passwd']) {
      assert.equal((await post(goodFields({ package: slug }))).status, 404, slug);
    }
    assert.equal(count(db, 'enquiries'), 0);
  });

  test('a storage failure returns a generic 500 form with the answers kept, and stores nothing', async () => {
    const { post, db } = harness();
    db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox_messages BEGIN SELECT RAISE(ABORT, 'disk on fire /secret/path'); END");
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    let res: Response;
    try {
      res = await post(goodFields({ message: 'please keep me' }));
    } finally {
      console.error = original;
    }
    assert.equal(res.status, 500);
    const html = await res.text();
    assert.match(html, /We could not save your enquiry/);
    assert.ok(html.includes('please keep me'));
    assert.ok(!html.includes('disk on fire') && !html.includes('/secret/path'), 'internals are not shown');
    assert.ok(!JSON.stringify(errors).includes('please keep me') && !JSON.stringify(errors).includes('asha@example'), 'personal data is not logged');
    assert.equal(count(db, 'enquiries'), 0);
  });
});

describe('POST /enquire: honeypot, origin and size', () => {
  test('a filled honeypot looks like success but stores nothing', async () => {
    const { post, db } = harness();
    const res = await post(goodFields({ website: 'https://spam.example' }));
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Your enquiry has been received/);
    assert.equal(count(db, 'enquiries'), 0);
    assert.equal(count(db, 'outbox_messages'), 0);
  });

  test('a cross-site submission is refused and stores nothing', async () => {
    const { post, db } = harness();
    const refused: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }];
    for (const headers of refused) {
      const res = await post(goodFields(), headers);
      assert.equal(res.status, 403, JSON.stringify(headers));
    }
    assert.equal(count(db, 'enquiries'), 0);
  });

  test('same-origin forms are accepted: the site origin, the host in use, Sec-Fetch-Site same-origin, and non-browser clients', async () => {
    const { post, db } = harness();
    const accepted: Record<string, string>[] = [
      { Origin: SITE }, { Origin: 'http://127.0.0.1:3000', Host: '127.0.0.1:3000' }, { 'Sec-Fetch-Site': 'same-origin' }, {},
    ];
    for (const [i, headers] of accepted.entries()) {
      assert.equal((await post(goodFields({ message: `m${i}` }), headers)).status, 303, JSON.stringify(headers));
    }
    assert.equal(count(db, 'enquiries'), 4);
  });

  test('an oversized body is refused with a 413 and stores nothing', async () => {
    const { post, db } = harness();
    const res = await post(goodFields({ message: 'x'.repeat(70_000) }));
    assert.equal(res.status, 413);
    assert.equal(count(db, 'enquiries'), 0);
  });

  test('an over-long message that fits the body limit is a validation error, not truncated', async () => {
    const { post, db } = harness();
    const res = await post(goodFields({ message: 'x'.repeat(2500) }));
    assert.equal(res.status, 422);
    assert.match(await res.text(), /2000 characters or fewer/);
    assert.equal(count(db, 'enquiries'), 0);
  });
});

describe('POST /enquire: rate limits', () => {
  test('after 5 new enquiries from one client the 6th is refused with 429 and Retry-After, and keeps the form', async () => {
    const { post, db } = harness();
    for (let i = 0; i < 5; i++) assert.equal((await post(goodFields({ message: `enquiry ${i}` }))).status, 303);
    const res = await post(goodFields({ message: 'enquiry 5 (kept)' }));
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    const html = await res.text();
    assert.match(html, /Too many enquiries/);
    assert.ok(html.includes('enquiry 5 (kept)'));
    assert.equal(count(db, 'enquiries'), 5);
  });

  test('re-sending an enquiry that was already accepted still works at the limit, and does not count again', async () => {
    const { post, db } = harness();
    const last = goodFields({ message: 'enquiry 4' });
    for (let i = 0; i < 4; i++) await post(goodFields({ message: `enquiry ${i}` }));
    const first = await post(last);
    assert.equal(first.status, 303);
    const again = await post(last);
    assert.equal(again.status, 303);
    assert.equal(again.headers.get('location'), first.headers.get('location'));
    assert.equal(count(db, 'enquiries'), 5);
  });

  test('invalid attempts are limited too, so the form cannot be probed without bound', async () => {
    const { post, db } = harness({ limits: { attempts: 3 } });
    for (let i = 0; i < 3; i++) assert.equal((await post(goodFields({ name: '' }))).status, 422);
    assert.equal((await post(goodFields())).status, 429);
    assert.equal(count(db, 'enquiries'), 0);
  });

  test('the global ceiling stops new enquiries from any client', async () => {
    const { post, db } = harness({ limits: { globalPerHour: 2 }, trustProxy: true });
    const from = (ip: string, message: string) => post(goodFields({ message }), { ...SAME_SITE, 'X-Forwarded-For': `spoofed, ${ip}` });
    assert.equal((await from('10.0.0.1', 'a')).status, 303);
    assert.equal((await from('10.0.0.2', 'b')).status, 303);
    assert.equal((await from('10.0.0.3', 'c')).status, 429);
    assert.equal(count(db, 'enquiries'), 2);
  });

  test('with TRUST_PROXY the last forwarded address is the client; without it the header is ignored', async () => {
    const trusting = harness({ limits: { perClientPerHour: 1 }, trustProxy: true });
    const send = (h: Harness, ip: string, message: string) => h.post(goodFields({ message }), { ...SAME_SITE, 'X-Forwarded-For': ip });
    assert.equal((await send(trusting, '1.1.1.1', 'a')).status, 303);
    assert.equal((await send(trusting, '2.2.2.2', 'b')).status, 303, 'a different client has its own allowance');
    assert.equal((await send(trusting, '1.1.1.1', 'c')).status, 429);

    const ignoring = harness({ limits: { perClientPerHour: 1 } });
    assert.equal((await send(ignoring, '1.1.1.1', 'a')).status, 303);
    assert.equal((await send(ignoring, '2.2.2.2', 'b')).status, 429, 'a spoofed header cannot buy a new allowance');
  });
});

describe('seeded sample enquiry', () => {
  test('the brief’s sample enquiry is seeded verbatim, labelled as a sample, with a mock acknowledgement', async () => {
    const { db, app } = harness({}, true);
    assert.equal(count(db, 'enquiries'), 1);
    const row = get<Record<string, unknown>>(db, "SELECT * FROM enquiries WHERE origin = 'seed_sample'")!;
    assert.equal(row.message, BRIEF_MESSAGE);
    assert.equal(row.adults, 2);
    assert.equal(row.children, 1);
    assert.equal(row.budget_inr, null, 'the budget stays in the message for later extraction; no structured figure is invented');
    assert.equal(row.travel_start, null, 'December is not a date, so none is invented');
    assert.match(String(row.email), /@example\.invalid$/);
    assert.equal(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM outbox_messages WHERE enquiry_id = ?', row.id as number)?.n, 1);
    const html = await (await app.request(`/enquiry/received/${row.public_token}`)).text();
    assert.match(html, /sample enquiry from the client brief/);
  });
});
