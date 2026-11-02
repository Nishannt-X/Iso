import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { get } from '../../src/db/db.js';
import { ADMIN, C1, C2, count, cookieHeader, csrfOf, harness, lockOf, PASSWORD, SITE } from './staff-harness.js';

const GENERIC = 'The email or password is not correct.';

describe('staff area requires a session', () => {
  const h = harness({ keepSample: true });

  test('every staff page redirects an unauthenticated visitor to sign-in, remembering safe GET paths only', async () => {
    for (const path of ['/staff', '/staff/inbox', '/staff/enquiries/1', '/staff/activity', '/staff/does-not-exist']) {
      const res = await h.get(path);
      assert.equal(res.status, 303, path);
      assert.match(res.headers.get('location') ?? '', /^\/staff\/login/, path);
    }
    assert.equal((await h.get('/staff/inbox')).headers.get('location'), '/staff/login?next=%2Fstaff%2Finbox');
    assert.equal((await h.get('/staff/enquiries/1')).headers.get('location'), '/staff/login?next=%2Fstaff%2Fenquiries%2F1');
  });

  test('unauthenticated POSTs change nothing and are sent to sign-in', async () => {
    const before = [count(h.db, 'SELECT SUM(lock_version) AS n FROM enquiry_workflow'), count(h.db, 'SELECT COUNT(*) AS n FROM enquiry_notes'), count(h.db, 'SELECT COUNT(*) AS n FROM audit_log')];
    for (const [path, fields] of [
      ['/staff/enquiries/1/status', { status: 'closed', lock: '1' }], ['/staff/enquiries/1/assign', { assignee: '2', lock: '1' }],
      ['/staff/enquiries/1/notes', { body: 'x' }], ['/staff/enquiries/1/reply/draft', { channel: 'email', body: 'x' }],
      ['/staff/enquiries/1/reply/record', { channel: 'email', body: 'x', approve: 'yes', lock: '1' }], ['/staff/logout', {}],
    ] as const) {
      const res = await h.post(path, { ...fields, _csrf: 'anything' });
      assert.equal(res.status, 303, path);
      assert.equal(res.headers.get('location'), '/staff/login', path);
    }
    assert.deepEqual(
      [count(h.db, 'SELECT SUM(lock_version) AS n FROM enquiry_workflow'), count(h.db, 'SELECT COUNT(*) AS n FROM enquiry_notes'), count(h.db, 'SELECT COUNT(*) AS n FROM audit_log')],
      before,
    );
  });

  test('forged, malformed and unknown cookies are no session, and a bad cookie is cleared', async () => {
    for (const value of ['', 'x', 'a'.repeat(43), "' OR 1=1 --", 'a'.repeat(5000)]) {
      const res = await h.get('/staff/inbox', `__Host-kochi_staff=${value}`);
      assert.equal(res.status, 303, value.slice(0, 20));
    }
    const res = await h.get('/staff/inbox', `__Host-kochi_staff=${'a'.repeat(43)}`);
    assert.match(res.headers.getSetCookie().join('\n'), /__Host-kochi_staff=;.*Max-Age=0/i);
  });

  test('the sign-in page is a plain form, never cached or indexed, and shows no credentials', async () => {
    const res = await h.get('/staff/login');
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.ok(body.includes('<meta name="robots" content="noindex"'));
    assert.match(body, /<input type="password" id="password" name="password" autocomplete="current-password"/);
    assert.match(body, /<label for="email">/);
    assert.ok(!body.includes('demo-staff-password') && !body.includes('@staff.example.invalid'));
    assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  });

  test('robots.txt keeps crawlers out of /staff/', async () => {
    assert.match(await (await h.get('/robots.txt')).text(), /Disallow: \/staff\//);
  });
});

describe('sign in', () => {
  test('a correct sign-in sets a hardened session cookie, stores only its hash, and lands on the inbox', async () => {
    const h = harness();
    const res = await h.post('/staff/login', { email: ' Admin@Staff.Example.Invalid ', password: PASSWORD });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/staff/inbox');
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('__Host-kochi_staff='))!;
    assert.ok(setCookie, 'the __Host- prefix is used on https');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /Max-Age=43200/);
    assert.ok(!/Domain=/i.test(setCookie));
    const token = setCookie.split(';')[0]!.split('=')[1]!;
    assert.ok(!JSON.stringify(h.db.prepare('SELECT * FROM staff_sessions').all()).includes(token), 'only a hash is stored');
    assert.equal(count(h.db, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.login'"), 1);
    const inbox = await h.get('/staff/inbox', cookieHeader(res));
    assert.equal(inbox.status, 200);
    assert.equal((await h.get('/staff/login', cookieHeader(res))).headers.get('location'), '/staff/inbox', 'signed-in visitors skip the form');
  });

  test('on a plain http site the cookie is not Secure and has no prefix (it could not be set otherwise)', async () => {
    const h = harness({ siteUrl: 'http://localhost:3000' });
    const res = await h.post('/staff/login', { email: ADMIN, password: PASSWORD });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('kochi_staff='))!;
    assert.ok(cookie);
    assert.ok(!/Secure/i.test(cookie));
    assert.match(cookie, /HttpOnly/i);
  });

  test('every kind of failure gives the same status and message and sets no cookie', async () => {
    const h = harness();
    const attempts: [string, string][] = [
      [ADMIN, 'wrong-password-here'], ['nobody@staff.example.invalid', PASSWORD], ['not-an-email', PASSWORD], ['', ''], [ADMIN, ''],
      ['seed@system.invalid', PASSWORD], [ADMIN, 'x'.repeat(300)], [`${'a'.repeat(300)}@staff.example.invalid`, PASSWORD],
    ];
    const bodies = new Set<string>();
    for (const [email, password] of attempts) {
      const res = await h.post('/staff/login', { email, password });
      const body = await res.text();
      assert.equal(res.status, 422, email);
      assert.ok(body.includes(GENERIC), email);
      assert.equal(res.headers.getSetCookie().length, 0, email);
      bodies.add(body.replace(/name="email" value="[^"]*"/, '').replace(/value="[^"]*"/g, ''));
    }
    assert.equal(bodies.size, 1, 'the pages differ only in the echoed email');
    assert.equal(count(h.db, 'SELECT COUNT(*) AS n FROM staff_sessions'), 0);
  });

  test('the failed-sign-in page never echoes the password, and escapes the email it echoes', async () => {
    const h = harness();
    const res = await h.post('/staff/login', { email: '"><script>alert(1)</script>', password: 'super-secret-pass-123' });
    const body = await res.text();
    assert.ok(!body.includes('super-secret-pass-123'));
    assert.ok(!body.includes('<script>alert(1)</script>'));
  });

  test('repeated failures are throttled per email and per client, the same whether or not the account exists', async () => {
    const h = harness({ loginLimits: { perEmail: 3, perClient: 100 } });
    for (const email of [ADMIN, 'ghost@staff.example.invalid']) {
      for (let i = 0; i < 3; i++) assert.equal((await h.post('/staff/login', { email, password: 'wrong-password-1' })).status, 422);
      const blocked = await h.post('/staff/login', { email, password: PASSWORD });
      assert.equal(blocked.status, 429, `${email} is locked out for a while, even with the right password`);
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
      assert.match(await blocked.text(), /Too many sign-in attempts/);
    }
    assert.equal((await h.post('/staff/login', { email: C1, password: PASSWORD })).status, 303, 'other accounts are unaffected');

    const byClient = harness({ loginLimits: { perEmail: 100, perClient: 3 } });
    for (let i = 0; i < 3; i++) await byClient.post('/staff/login', { email: `u${i}@staff.example.invalid`, password: 'wrong-password-1' });
    assert.equal((await byClient.post('/staff/login', { email: ADMIN, password: PASSWORD })).status, 429);
    byClient.clock.advance(16);
    assert.equal((await byClient.post('/staff/login', { email: ADMIN, password: PASSWORD })).status, 303, 'the window passes');
  });

  test('sign-in needs a same-site Origin: none, null, other sites and cross-site fetches are refused', async () => {
    const h = harness();
    const fields = new URLSearchParams({ email: ADMIN, password: PASSWORD }).toString();
    const send = (headers: Record<string, string>) => h.app.request('/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: fields });
    assert.equal((await send({})).status, 403, 'no signal at all');
    assert.equal((await send({ Origin: 'null' })).status, 403);
    assert.equal((await send({ Origin: 'https://evil.example' })).status, 403);
    assert.equal((await send({ 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await send({ 'Sec-Fetch-Site': 'same-site' })).status, 403);
    assert.equal((await send({ 'Sec-Fetch-Site': 'same-origin' })).status, 303);
    assert.equal((await send({ Origin: SITE })).status, 303);
    assert.equal(count(h.db, 'SELECT COUNT(*) AS n FROM staff_sessions'), 2);
  });

  test('"next" is honoured only for a plain path under /staff/', async () => {
    const h = harness();
    const dest = async (next: string) => (await h.post('/staff/login', { email: ADMIN, password: PASSWORD, next })).headers.get('location');
    assert.equal(await dest('/staff/enquiries/1'), '/staff/enquiries/1');
    for (const bad of ['//evil.example', 'https://evil.example/staff/inbox', '/staff//evil.example', '/other', '/staff', '/staff/../x', '/staff/%2e%2e', 'javascript:alert(1)', '/staff/inbox?x=1', '\\\\evil.example', '/staff/a b']) {
      assert.equal(await dest(bad), '/staff/inbox', bad);
    }
    const page = await (await h.get('/staff/login?next=//evil.example')).text();
    assert.ok(!page.includes('evil.example'));
  });

  test('nothing sensitive reaches the logs: emails, passwords and cookies stay out of console output', async () => {
    const spies = (['log', 'error', 'warn', 'info', 'debug'] as const).map((m) => mock.method(console, m, () => {}));
    try {
      const h = harness();
      await h.post('/staff/login', { email: 'private.person@staff.example.invalid', password: 'my-private-password-1' });
      await h.post('/staff/login', { email: ADMIN, password: 'another-private-pass-2' });
      const cookie = await h.login(ADMIN);
      await h.get('/staff/enquiries/abc', cookie);
      const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.arguments.join(' '))).join('\n');
      for (const secret of ['private.person', 'my-private-password-1', 'another-private-pass-2', PASSWORD, cookie.split('=')[1]!]) assert.ok(!logged.includes(secret), secret);
    } finally {
      mock.restoreAll();
    }
  });
});

describe('sign out and session lifetime', () => {
  test('sign-out needs a POST with the CSRF token, ends the session, clears the cookie and audits it', async () => {
    const h = harness();
    const cookie = await h.login(ADMIN);
    const token = csrfOf(await (await h.get('/staff/inbox', cookie)).text());
    assert.ok(token.length >= 40);
    assert.equal((await h.get('/staff/logout', cookie)).status, 404, 'there is no GET sign-out');
    assert.equal((await h.post('/staff/logout', {}, cookie)).status, 403, 'no token');
    assert.equal((await h.post('/staff/logout', { _csrf: 'wrong' }, cookie)).status, 403, 'wrong token');
    assert.equal((await h.get('/staff/inbox', cookie)).status, 200, 'still signed in after refused attempts');

    const out = await h.post('/staff/logout', { _csrf: token }, cookie);
    assert.equal(out.status, 303);
    assert.equal(out.headers.get('location'), '/staff/login');
    assert.match(out.headers.getSetCookie().join('\n'), /Max-Age=0/i);
    assert.equal(count(h.db, 'SELECT COUNT(*) AS n FROM staff_sessions'), 0);
    assert.equal((await h.get('/staff/inbox', cookie)).status, 303, 'the old cookie no longer works');
    assert.equal(count(h.db, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.logout'"), 1);
  });

  test('a session ends after 2 idle hours and after 12 hours in all', async () => {
    const h = harness();
    const idle = await h.login(ADMIN);
    h.clock.advance(119);
    assert.equal((await h.get('/staff/inbox', idle)).status, 200);
    h.clock.advance(121);
    assert.equal((await h.get('/staff/inbox', idle)).status, 303);

    const busy = await h.login(C1);
    for (let i = 0; i < 12; i++) {
      h.clock.advance(59);
      assert.equal((await h.get('/staff/inbox', busy)).status, 200, `hour ${i + 1}`);
    }
    h.clock.advance(60);
    assert.equal((await h.get('/staff/inbox', busy)).status, 303, 'twelve hours is the limit however busy');
  });

  test('two browsers are two sessions: signing out of one leaves the other', async () => {
    const h = harness();
    const a = await h.login(ADMIN);
    const b = await h.login(ADMIN);
    assert.notEqual(a, b);
    await h.post('/staff/logout', { _csrf: csrfOf(await (await h.get('/staff/inbox', a)).text()) }, a);
    assert.equal((await h.get('/staff/inbox', b)).status, 200);
  });
});

describe('CSRF on every staff write', () => {
  const routes: [string, Record<string, string>][] = [
    ['/staff/enquiries/1/status', { status: 'closed' }],
    ['/staff/enquiries/1/assign', { assignee: 'none' }],
    ['/staff/enquiries/1/notes', { body: 'a note' }],
    ['/staff/enquiries/1/reply/draft', { channel: 'email', subject: 's', body: 'draft text' }],
    ['/staff/enquiries/1/reply/record', { channel: 'email', subject: 's', body: 'reply text', approve: 'yes' }],
  ];

  test('a missing, wrong or another session’s token is refused with no change, even with a correct cookie', async () => {
    const h = harness();
    h.addEnquiry();
    const admin = await h.login(ADMIN);
    const other = await h.login(C1);
    const otherToken = csrfOf(await (await h.get('/staff/inbox', other)).text());
    const page = await (await h.get('/staff/enquiries/1', admin)).text();
    const lock = lockOf(page);
    const snapshot = () => [count(h.db, 'SELECT SUM(lock_version) AS n FROM enquiry_workflow'), count(h.db, 'SELECT COUNT(*) AS n FROM enquiry_notes'), count(h.db, 'SELECT COUNT(*) AS n FROM reply_drafts'), count(h.db, 'SELECT COUNT(*) AS n FROM outbox_messages'), count(h.db, 'SELECT COUNT(*) AS n FROM audit_log')];
    const before = snapshot();
    for (const [path, fields] of routes) {
      for (const token of [undefined, '', 'forged', otherToken]) {
        const res = await h.post(path, { ...fields, lock, ...(token === undefined ? {} : { _csrf: token }) }, admin);
        assert.equal(res.status, 403, `${path} with token ${String(token).slice(0, 8)}`);
      }
    }
    assert.deepEqual(snapshot(), before);
  });

  test('a correct token from a foreign origin is still refused, and a correct token and origin works', async () => {
    const h = harness();
    h.addEnquiry();
    const admin = await h.login(ADMIN);
    const page = await (await h.get('/staff/enquiries/1', admin)).text();
    const fields = { _csrf: csrfOf(page), lock: lockOf(page), body: 'a note' };
    assert.equal((await h.post('/staff/enquiries/1/notes', fields, admin, { Origin: 'https://evil.example' })).status, 403);
    assert.equal(count(h.db, 'SELECT COUNT(*) AS n FROM enquiry_notes'), 0);
    assert.equal((await h.post('/staff/enquiries/1/notes', fields, admin)).status, 303);
    assert.equal(count(h.db, 'SELECT COUNT(*) AS n FROM enquiry_notes'), 1);
  });

  test('GET never changes anything: the write routes are POST only', async () => {
    const h = harness();
    h.addEnquiry();
    const admin = await h.login(ADMIN);
    for (const [path] of routes) assert.equal((await h.get(`${path}?status=closed&body=x&_csrf=x`, admin)).status, 404, path);
    assert.equal(count(h.db, "SELECT COUNT(*) AS n FROM enquiry_workflow WHERE status <> 'new'"), 0);
  });
});

describe('roles', () => {
  test('the activity log is admin-only: a consultant gets 403 and sees no link to it', async () => {
    const h = harness();
    const agent = await h.login(C1);
    const admin = await h.login(ADMIN);
    const denied = await h.get('/staff/activity', agent);
    assert.equal(denied.status, 403);
    const text = await denied.text();
    assert.match(text, /Your role does not include this page/);
    assert.ok(!text.includes('Auth') && !text.includes('signed in'));
    assert.equal((await h.get('/staff/activity', admin)).status, 200);
    assert.ok(!(await (await h.get('/staff/inbox', agent)).text()).includes('href="/staff/activity"'));
    assert.ok((await (await h.get('/staff/inbox', admin)).text()).includes('href="/staff/activity"'));
  });

  test('both roles can use the inbox; the page names who is signed in and their role', async () => {
    const h = harness();
    for (const [email, label] of [[ADMIN, 'Demo Admin · Admin'], [C2, 'Demo Consultant Two · Consultant']] as const) {
      const res = await h.get('/staff/inbox', await h.login(email));
      assert.equal(res.status, 200);
      assert.ok((await res.text()).includes(label), label);
    }
  });

  test('switching an account off ends its session on the next request', async () => {
    const h = harness();
    const cookie = await h.login(C1);
    assert.equal((await h.get('/staff/inbox', cookie)).status, 200);
    h.db.prepare('UPDATE staff_users SET active = 0 WHERE email = ?').run(C1);
    assert.equal((await h.get('/staff/inbox', cookie)).status, 303);
    assert.equal((await h.post('/staff/login', { email: C1, password: PASSWORD })).status, 422);
    assert.equal(get<{ n: number }>(h.db, 'SELECT COUNT(*) AS n FROM staff_users WHERE active = 1')?.n, 2);
  });
});
