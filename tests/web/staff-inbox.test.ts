import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { get } from '../../src/db/db.js';
import { newSubmissionKey } from '../../src/domain/enquiries.js';
import { PAGE_SIZE } from '../../src/domain/triage.js';
import { ADMIN, C1, C2, count, csrfOf, harness, lockOf, SITE, type Harness } from './staff-harness.js';

const KL07 = 'munnar-thekkady-and-alleppey-houseboat-6-days';
const BRIEF_MESSAGE = 'Hi, 2 adults and 1 kid, Kerala 5-6 nights in December, budget around 1.2 lakh total, houseboat a must';
const text = async (res: Response): Promise<string> => res.text();

describe('inbox: what staff see', () => {
  test('a real seeded enquiry and a newly submitted public enquiry both appear, with status, assignee and waiting time', async () => {
    const h = harness({ keepSample: true });
    // The public flow, unchanged: a traveller submits the form.
    const sent = await h.app.request('/enquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: SITE },
      body: new URLSearchParams({
        package: KL07, key: newSubmissionKey(), name: 'Asha Menon', email: 'asha@example.invalid', adults: '2', children: '0', budgetBasis: 'total', message: 'Do you have a Christmas departure?',
      }).toString(),
    });
    assert.equal(sent.status, 303);
    h.clock.now = new Date(Date.now() + 90 * 60_000);

    const body = await text(await h.get('/staff/inbox', await h.login(ADMIN)));
    assert.ok(body.includes('Sample Traveller (synthetic)'), 'seeded');
    assert.ok(body.includes('Sample from brief'));
    assert.ok(body.includes('Asha Menon'), 'newly submitted');
    assert.equal((body.match(/class="q-row"/g) ?? []).length, 2);
    assert.ok(body.includes('Unassigned'));
    assert.match(body, />New <span class="n">2<\/span>/);
    assert.match(body, /Past the 1-hour target/);
    assert.match(body, /Waiting 1 h \d+ min/);
    assert.match(body, /elapsed clock time/i);
    assert.match(body, /No working\s+hours are applied/);
    assert.ok(!/guarantee/i.test(body), 'no guarantee is promised');
  });

  test('the waiting time follows created_at: fresh is within target, old is 12 hours or more', async () => {
    const h = harness();
    h.addEnquiry({ name: 'Fresh One' }, new Date(h.clock.now.getTime() - 10 * 60_000));
    h.addEnquiry({ name: 'Old One' }, new Date(h.clock.now.getTime() - 13 * 3_600_000));
    const body = await text(await h.get('/staff/inbox', await h.login(C1)));
    assert.match(body, /Waiting 10 min[\s\S]*?Within the 1-hour target/);
    assert.match(body, /Waiting 13 h[\s\S]*?12 hours or more/);
  });

  test('rows link to their workspace and show the party and package', async () => {
    const h = harness();
    const id = h.addEnquiry({ adults: 3, children: 2 });
    const body = await text(await h.get('/staff/inbox', await h.login(C1)));
    assert.ok(body.includes(`href="/staff/enquiries/${id}"`));
    assert.ok(body.includes('3 adults, 2 children'));
    assert.ok(body.includes('Munnar, Thekkady and Alleppey houseboat'));
  });

  test('values typed by travellers are escaped everywhere they appear', async () => {
    const h = harness();
    const id = h.addEnquiry({ name: '<img src=x onerror=alert(1)>', message: '<script>alert("m")</script>', destination: '<b>Goa</b>' });
    const cookie = await h.login(ADMIN);
    for (const path of ['/staff/inbox', `/staff/enquiries/${id}`, `/staff/inbox?q=${encodeURIComponent('"><script>alert(2)</script>')}`]) {
      const body = await text(await h.get(path, cookie));
      assert.ok(!body.includes('<img src=x'), path);
      assert.ok(!body.includes('<script>alert'), path);
    }
    assert.ok((await text(await h.get(`/staff/enquiries/${id}`, cookie))).includes('&lt;script&gt;alert(&quot;m&quot;)&lt;/script&gt;'));
  });

  test('empty states: no enquiries at all, and no match for a filter', async () => {
    const h = harness();
    const cookie = await h.login(C1);
    assert.match(await text(await h.get('/staff/inbox', cookie)), /No enquiries yet/);
    h.addEnquiry({ name: 'Someone' });
    const none = await text(await h.get('/staff/inbox?q=zzz-nothing', cookie));
    assert.match(none, /No enquiries match/);
    assert.match(none, /Show all enquiries/);
    assert.match(await text(await h.get('/staff/inbox?status=closed', cookie)), /No enquiries match/);
  });
});

describe('inbox: filters, search and pagination', () => {
  async function seeded(): Promise<{ h: Harness; cookie: string; ids: number[] }> {
    const h = harness();
    const ids = [h.addEnquiry({ name: 'Asha Menon' }), h.addEnquiry({ name: 'Ravi Kumar' }), h.addEnquiry({ name: 'Meera Nair' }), h.addEnquiry({ name: 'Joseph Mathew' })];
    const cookie = await h.login(ADMIN);
    return { h, cookie, ids };
  }

  test('status tabs filter and carry counts', async () => {
    const { h, cookie, ids } = await seeded();
    const page = await text(await h.get(`/staff/enquiries/${ids[1]}`, cookie));
    await h.post(`/staff/enquiries/${ids[1]}/status`, { _csrf: csrfOf(page), lock: lockOf(page), status: 'closed' }, cookie);
    assert.equal(count(h.db, "SELECT COUNT(*) AS n FROM enquiry_workflow WHERE status = 'closed'"), 1);

    const open = await text(await h.get('/staff/inbox', cookie));
    assert.ok(open.includes('Asha Menon') && !open.includes('Ravi Kumar'));
    assert.match(open, />Open <span class="n">3<\/span>/);
    assert.match(open, />Closed <span class="n">1<\/span>/);
    const closed = await text(await h.get('/staff/inbox?status=closed', cookie));
    assert.ok(closed.includes('Ravi Kumar') && !closed.includes('Asha Menon'));
    assert.equal((await text(await h.get('/staff/inbox?status=all', cookie))).match(/class="q-row"/g)?.length, 4);
  });

  test('assignee filter, search and sort', async () => {
    const { h, cookie, ids } = await seeded();
    const page = await text(await h.get(`/staff/enquiries/${ids[2]}`, cookie));
    await h.post(`/staff/enquiries/${ids[2]}/assign`, { _csrf: csrfOf(page), lock: lockOf(page), assignee: String(h.userId(C2)) }, cookie);
    const names = (body: string) => [...body.matchAll(/class="q-name">([^<]+)</g)].map((m) => m[1]);
    assert.deepEqual(names(await text(await h.get(`/staff/inbox?assignee=${h.userId(C2)}`, cookie))), ['Meera Nair']);
    assert.deepEqual(names(await text(await h.get('/staff/inbox?assignee=me', cookie))), []);
    assert.equal(names(await text(await h.get('/staff/inbox?assignee=unassigned', cookie))).length, 3);
    assert.deepEqual(names(await text(await h.get('/staff/inbox?q=mathew', cookie))), ['Joseph Mathew']);
    assert.deepEqual(names(await text(await h.get('/staff/inbox?sort=newest', cookie))).slice(0, 2), ['Joseph Mathew', 'Meera Nair']);
    const reflected = await text(await h.get('/staff/inbox?q=mathew&assignee=unassigned', cookie));
    assert.match(reflected, /<input type="search" id="q" name="q" value="mathew"/);
    assert.match(reflected, /<option value="unassigned" selected/);
  });

  test('malformed filters and page numbers get a 400 explanation, never an error page or a SQL error', async () => {
    const { h, cookie } = await seeded();
    for (const q of [
      'status=bogus', "status=new' OR '1'='1", 'assignee=abc', 'assignee=-1', 'sort=random', 'page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=99999999', 'page=1&page=2',
      `q=${'x'.repeat(101)}`, 'status=new&status=closed',
    ]) {
      const res = await h.get(`/staff/inbox?${q}`, cookie);
      assert.equal(res.status, 400, q);
      assert.match(await text(res), /That filter is not valid/, q);
    }
    assert.equal(count(h.db, 'SELECT COUNT(*) AS n FROM enquiries'), 4, 'nothing was dropped by hostile input');
  });

  test('pages of 25 with working previous and next links that keep the filters; a page past the end is a calm empty state', async () => {
    const h = harness();
    for (let i = 0; i < PAGE_SIZE + 3; i++) h.addEnquiry({ name: `Guest ${String(i).padStart(2, '0')}` }, new Date(h.clock.now.getTime() - (PAGE_SIZE + 3 - i) * 60_000));
    const cookie = await h.login(C1);
    const p1 = await text(await h.get('/staff/inbox', cookie));
    assert.equal(p1.match(/class="q-row"/g)?.length, PAGE_SIZE);
    assert.match(p1, /Showing 1–25 of 28/);
    assert.match(p1, /Page 1 of 2/);
    assert.match(p1, /<a href="\/staff\/inbox\?page=2" rel="next">Next<\/a>/);
    assert.ok(p1.includes('Guest 00') && !p1.includes('Guest 27'));
    const p2 = await text(await h.get('/staff/inbox?page=2', cookie));
    assert.equal(p2.match(/class="q-row"/g)?.length, 3);
    assert.match(p2, /Showing 26–28 of 28/);
    assert.match(p2, /<a href="\/staff\/inbox" rel="prev">Previous<\/a>/);
    const beyond = await h.get('/staff/inbox?page=9', cookie);
    assert.equal(beyond.status, 200);
    assert.match(await text(beyond), /No enquiries on this page/);
    const filtered = await text(await h.get('/staff/inbox?sort=newest&q=guest&page=2', cookie));
    assert.match(filtered, /href="\/staff\/inbox\?q=guest&amp;sort=newest" rel="prev"/);
  });
});

describe('workspace', () => {
  test('shows the immutable original and the structured fields side by side, with an honest not-analysed state', async () => {
    const h = harness({ keepSample: true });
    const cookie = await h.login(C1);
    const body = await text(await h.get('/staff/enquiries/1', cookie));
    assert.ok(body.includes('Original enquiry'));
    assert.ok(body.includes(`<blockquote class="orig">${BRIEF_MESSAGE}</blockquote>`));
    assert.match(body, /cannot be edited/);
    assert.match(body, /<dt>Travellers<\/dt><dd>2 adults, 1 child<\/dd>/);
    assert.match(body, /<dt>Budget<\/dt><dd><span class="none">Not given<\/span><\/dd>/);
    assert.match(body, /<dt>Package<\/dt><dd><a href="\/packages\/munnar-thekkady-and-alleppey-houseboat-6-days">/);
    assert.match(body, /<dt>Source<\/dt><dd>Sample enquiry from the client brief/);
    assert.match(body, /<section class="panel analysis" id="analysis"[^>]*>[\s\S]*Not analysed yet/);
    assert.ok(!/Extracted|Suggested packages|Confidence/i.test(body), 'no invented analysis');
    assert.ok(body.includes('Sample from brief') || body.includes('sample enquiry from the client brief'));
  });

  test('an enquiry with a blank message, full contact details and consent shows each plainly', async () => {
    const h = harness();
    const id = h.addEnquiry({
      name: 'Asha Menon', phone: '+919847012345', travelStart: '2026-12-20', adults: 2, children: 2, childAges: [4, 9], destination: 'Kerala',
      budgetInr: 120000, budgetBasis: 'total', message: '', whatsappConsent: true,
    });
    const body = await text(await h.get(`/staff/enquiries/${id}`, await h.login(C1)));
    assert.match(body, /left the message blank/);
    assert.match(body, /2 adults, 2 children \(ages 4, 9\)/);
    assert.match(body, /₹1,20,000 for the whole group/);
    assert.match(body, /Given on 2 Nov 2026/);
    assert.match(body, /<dt>Phone<\/dt><dd>\+919847012345<\/dd>/);
  });

  test('bad or unknown ids are a 404 and never reach the database as anything but a number', async () => {
    const h = harness();
    h.addEnquiry();
    const cookie = await h.login(ADMIN);
    for (const id of ['abc', '1abc', '0x1', '-1', '1.5', '99999', '12345678901234567890', '1%20OR%201=1', '%27']) {
      assert.equal((await h.get(`/staff/enquiries/${id}`, cookie)).status, 404, id);
    }
    const page = await text(await h.get('/staff/enquiries/1', cookie));
    for (const action of ['status', 'assign', 'notes', 'reply/draft', 'reply/record']) {
      const res = await h.post(`/staff/enquiries/99999/${action}`, { _csrf: csrfOf(page), lock: '1', status: 'closed', assignee: 'none', body: 'x', channel: 'email', approve: 'yes' }, cookie);
      assert.equal(res.status, 404, action);
    }
  });

  test('pages are never cached or indexed and carry the usual security headers', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const cookie = await h.login(C1);
    for (const path of ['/staff/inbox', `/staff/enquiries/${id}`]) {
      const res = await h.get(path, cookie);
      assert.equal(res.headers.get('cache-control'), 'no-store', path);
      assert.match(res.headers.get('x-robots-tag') ?? '', /noindex/);
      assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.ok((await text(res)).includes('<meta name="robots" content="noindex"'));
    }
  });
});

describe('workspace: assign, status, note, reply', () => {
  async function open(h: Harness, id: number, cookie: string) {
    const body = await text(await h.get(`/staff/enquiries/${id}`, cookie));
    return { body, base: { _csrf: csrfOf(body), lock: lockOf(body) } };
  }
  const row = (h: Harness, id: number) => get<{ status: string; assignee_id: number | null; lock_version: number }>(h.db, 'SELECT status, assignee_id, lock_version FROM enquiry_workflow WHERE enquiry_id = ?', id)!;

  test('an admin assigns a consultant; the saved page confirms it and the activity trail records who did it', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const cookie = await h.login(ADMIN);
    const { base } = await open(h, id, cookie);
    const res = await h.post(`/staff/enquiries/${id}/assign`, { ...base, assignee: String(h.userId(C1)) }, cookie);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/staff/enquiries/${id}?done=assigned`);
    assert.equal(row(h, id).assignee_id, h.userId(C1));
    const after = await text(await h.get(res.headers.get('location')!, cookie));
    assert.match(after, /Assignment saved/);
    assert.match(after, /Assigned to Demo Consultant One/);
    assert.match(after, /Demo Admin assigned this to Demo Consultant One/);
    assert.match(await text(await h.get('/staff/inbox?assignee=' + h.userId(C1), cookie)), /Demo Consultant One/);
  });

  test('a consultant can take an unassigned enquiry, but not give it to a colleague or take a colleague’s', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const c1 = await h.login(C1);
    const c2 = await h.login(C2);
    const { base } = await open(h, id, c1);
    const denied = await h.post(`/staff/enquiries/${id}/assign`, { ...base, assignee: String(h.userId(C2)) }, c1);
    assert.equal(denied.status, 403);
    assert.match(await text(denied), /Ask an admin to assign it to someone else/);
    assert.equal(row(h, id).assignee_id, null);

    assert.equal((await h.post(`/staff/enquiries/${id}/assign`, { ...base, assignee: String(h.userId(C1)) }, c1)).status, 303);
    const theirs = await open(h, id, c2);
    assert.ok(!theirs.body.includes('Save assignment'), 'a colleague’s enquiry offers no assignment form to a consultant');
    assert.match(theirs.body, /Only an admin can reassign it/);
    const stolen = await h.post(`/staff/enquiries/${id}/assign`, { ...theirs.base, assignee: String(h.userId(C2)) }, c2);
    assert.equal(stolen.status, 403, 'forged form: the server enforces it, not the page');
    assert.equal(row(h, id).assignee_id, h.userId(C1));
  });

  test('status changes work, "replied" cannot be forced, and tampered values are refused', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const cookie = await h.login(C1);
    let page = await open(h, id, cookie);
    assert.equal((await h.post(`/staff/enquiries/${id}/status`, { ...page.base, status: 'in_progress' }, cookie)).status, 303);
    assert.equal(row(h, id).status, 'in_progress');
    page = await open(h, id, cookie);
    for (const bad of ['replied', 'done', '', 'closed;drop']) {
      const res = await h.post(`/staff/enquiries/${id}/status`, { ...page.base, status: bad }, cookie);
      assert.equal(res.status, 422, bad);
      assert.match(await text(res), /Choose New, In progress or Closed/);
    }
    assert.equal(row(h, id).status, 'in_progress');
    const same = await h.post(`/staff/enquiries/${id}/status`, { ...page.base, status: 'in_progress' }, cookie);
    assert.equal(same.headers.get('location'), `/staff/enquiries/${id}?done=nochange`);
  });

  test('two people editing at once: the second save is refused with an explanation and the latest state', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const a = await h.login(ADMIN);
    const b = await h.login(C1);
    const pa = await open(h, id, a);
    const pb = await open(h, id, b);
    assert.equal((await h.post(`/staff/enquiries/${id}/status`, { ...pa.base, status: 'closed' }, a)).status, 303);
    const stale = await h.post(`/staff/enquiries/${id}/status`, { ...pb.base, status: 'in_progress' }, b);
    assert.equal(stale.status, 409);
    const body = await text(stale);
    assert.match(body, /Someone else changed this enquiry/);
    assert.match(body, /<span class="chip s-closed">Closed<\/span>/, 'the page shown is the current state');
    assert.equal(row(h, id).status, 'closed');
    for (const lock of ['', 'abc', '-1']) {
      assert.equal((await h.post(`/staff/enquiries/${id}/status`, { _csrf: pb.base._csrf, lock, status: 'new' }, b)).status, 409, `lock "${lock}"`);
    }
  });

  test('a note is added, shown with its author, escaped, and keeps its text if it is refused', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const cookie = await h.login(C1);
    const { base } = await open(h, id, cookie);
    assert.equal((await h.post(`/staff/enquiries/${id}/notes`, { ...base, body: 'Called. <b>Prefers morning</b> calls.' }, cookie)).status, 303);
    const page = await text(await h.get(`/staff/enquiries/${id}?done=note`, cookie));
    assert.match(page, /Note added/);
    assert.ok(page.includes('Called. &lt;b&gt;Prefers morning&lt;/b&gt; calls.'));
    assert.match(page, /Demo Consultant One, 2 Nov 2026/);

    const empty = await h.post(`/staff/enquiries/${id}/notes`, { ...base, body: '   ' }, cookie);
    assert.equal(empty.status, 422);
    assert.match(await text(empty), /Write a note first/);
    const long = await h.post(`/staff/enquiries/${id}/notes`, { ...base, body: 'long note '.repeat(300) }, cookie);
    assert.equal(long.status, 422);
    assert.ok((await text(long)).includes('long note long note'), 'the text is put back in the box');
    assert.equal(count(h.db, 'SELECT COUNT(*) AS n FROM enquiry_notes'), 1);
  });

  test('a note is internal: the public status page never shows it', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const cookie = await h.login(C1);
    const { base } = await open(h, id, cookie);
    await h.post(`/staff/enquiries/${id}/notes`, { ...base, body: 'INTERNAL-ONLY-NOTE' }, cookie);
    const token = get<{ public_token: string }>(h.db, 'SELECT public_token FROM enquiries WHERE id = ?', id)!.public_token;
    assert.ok(!(await text(await h.get(`/enquiry/received/${token}`))).includes('INTERNAL-ONLY-NOTE'));
  });

  test('replying: the page says nothing is sent; a draft is saved but not recorded; recording needs the approval box', async () => {
    const h = harness();
    const id = h.addEnquiry({ email: 'guest@example.invalid' });
    const cookie = await h.login(C1);
    const first = await open(h, id, cookie);
    assert.match(first.body, /Mock reply\./);
    assert.match(first.body, /No email, SMS or WhatsApp message is sent/);
    assert.match(first.body, /<input type="checkbox" id="approve" name="approve" value="yes" required/);
    assert.match(first.body, /Approve and record reply/);
    assert.match(first.body, /formaction="\/staff\/enquiries\/\d+\/reply\/draft" formnovalidate(="")?>Save draft/);

    const fields = { ...first.base, channel: 'email', subject: 'Houseboat dates', body: 'Dear guest,\nThank you for writing.' };
    const draft = await h.post(`/staff/enquiries/${id}/reply/draft`, fields, cookie);
    assert.equal(draft.headers.get('location'), `/staff/enquiries/${id}?done=draft`);
    assert.equal(count(h.db, "SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'staff_reply'"), 0);
    assert.equal(row(h, id).status, 'new');
    const withDraft = await text(await h.get(`/staff/enquiries/${id}?done=draft`, cookie));
    assert.match(withDraft, /Draft saved\. Nothing has been recorded or sent/);
    assert.match(withDraft, /Dear guest,\nThank you for writing\./);
    assert.match(withDraft, /Draft last saved by Demo Consultant One/);
    assert.equal(lockOf(withDraft), '2');

    // Stale page saves (two independent submissions): both draft save and reply record fail with 409 conflict
    const staleDraft = await h.post(`/staff/enquiries/${id}/reply/draft`, { ...fields, lock: '1', body: 'Stale draft text' }, cookie);
    assert.equal(staleDraft.status, 409);
    assert.match(await text(staleDraft), /Someone else changed this enquiry/);

    const staleRecord = await h.post(`/staff/enquiries/${id}/reply/record`, { ...fields, lock: '1', approve: 'yes' }, cookie);
    assert.equal(staleRecord.status, 409);
    assert.match(await text(staleRecord), /Someone else changed this enquiry/);

    // Missing or invalid lock also fails with 409:
    const badLock = await h.post(`/staff/enquiries/${id}/reply/draft`, { ...fields, lock: 'invalid', body: 'Bad lock text' }, cookie);
    assert.equal(badLock.status, 409);
    assert.match(await text(badLock), /This page is out of date/);

    const unticked = await h.post(`/staff/enquiries/${id}/reply/record`, { ...fields, lock: lockOf(withDraft) }, cookie);
    assert.equal(unticked.status, 422);
    const body = await text(unticked);
    assert.match(body, /Tick the box to confirm/);
    assert.ok(body.includes('Dear guest,\nThank you for writing.'), 'the reply text is kept');
    assert.equal(count(h.db, "SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'staff_reply'"), 0);
    for (const approve of ['on', 'true', '1', 'YES']) {
      assert.equal((await h.post(`/staff/enquiries/${id}/reply/record`, { ...fields, lock: lockOf(withDraft), approve }, cookie)).status, 422, approve);
    }
  });

  test('an approved reply is recorded in the mock outbox, moves the enquiry to Replied, stops the clock, and is shown as not sent', async () => {
    const h = harness();
    const id = h.addEnquiry({ email: 'guest@example.invalid' });
    const cookie = await h.login(C1);
    const { base } = await open(h, id, cookie);
    h.clock.advance(42);
    const done = await h.post(`/staff/enquiries/${id}/reply/record`, { ...base, channel: 'email', subject: 'Houseboat dates', body: 'We can offer 20 December.', approve: 'yes' }, cookie);
    assert.equal(done.headers.get('location'), `/staff/enquiries/${id}?done=recorded`);
    const stored = get<Record<string, unknown>>(h.db, "SELECT * FROM outbox_messages WHERE kind = 'staff_reply'")!;
    assert.deepEqual([stored.delivery, stored.recipient, stored.approved_by, stored.body], ['mock_recorded', 'guest@example.invalid', h.userId(C1), 'We can offer 20 December.']);
    assert.equal(row(h, id).status, 'replied');

    h.clock.advance(100); // still inside the 2-hour idle limit
    const page = await text(await h.get(`/staff/enquiries/${id}?done=recorded`, cookie));
    assert.match(page, /Reply approved and recorded in the mock outbox\. Nothing was sent to the traveller/);
    assert.match(page, /Reply approved by Demo Consultant One/);
    assert.match(page, /Mock outbox: recorded in this demo, not sent\./);
    assert.match(page, /First reply after 42 min/);
    assert.match(page, /<span class="chip s-replied">Replied<\/span>/);
    const inbox = await text(await h.get('/staff/inbox?status=replied', cookie));
    assert.match(inbox, /First reply after 42 min/);
    const token = get<{ public_token: string }>(h.db, 'SELECT public_token FROM enquiries WHERE id = ?', id)!.public_token;
    assert.ok(!(await text(await h.get(`/enquiry/received/${token}`))).includes('We can offer 20 December.'), 'the traveller’s status page is unchanged');
  });

  test('pressing "Approve and record" twice records one reply', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const cookie = await h.login(C1);
    const { base } = await open(h, id, cookie);
    const fields = { ...base, channel: 'email', subject: '', body: 'Hello', approve: 'yes' };
    assert.equal((await h.post(`/staff/enquiries/${id}/reply/record`, fields, cookie)).status, 303);
    const again = await h.post(`/staff/enquiries/${id}/reply/record`, fields, cookie);
    assert.equal(again.status, 409);
    assert.equal(count(h.db, "SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'staff_reply'"), 1);
  });

  test('the recipient is fixed by the enquiry: a forged recipient is ignored and an unavailable channel is refused', async () => {
    const h = harness();
    const id = h.addEnquiry({ email: 'guest@example.invalid', phone: null });
    const cookie = await h.login(C1);
    const { base } = await open(h, id, cookie);
    const forged = await h.post(`/staff/enquiries/${id}/reply/record`, { ...base, channel: 'email', recipient: 'attacker@evil.example', to: 'attacker@evil.example', subject: 's', body: 'b', approve: 'yes' }, cookie);
    assert.equal(forged.status, 303);
    assert.equal(get<{ recipient: string }>(h.db, "SELECT recipient FROM outbox_messages WHERE kind = 'staff_reply'")?.recipient, 'guest@example.invalid');
    for (const channel of ['sms', 'whatsapp', 'fax', '']) {
      const page = await open(h, id, cookie);
      assert.equal((await h.post(`/staff/enquiries/${id}/reply/draft`, { ...page.base, channel, subject: 's', body: 'b' }, cookie)).status, 422, channel);
    }
  });

  test('WhatsApp is offered only with recorded consent', async () => {
    const h = harness();
    const plain = h.addEnquiry({ email: null, phone: '+919847012345', whatsappConsent: false });
    const consented = h.addEnquiry({ email: null, phone: '+919847012346', whatsappConsent: true });
    const cookie = await h.login(C1);
    const options = (body: string) => [...body.matchAll(/<option value="(email|sms|whatsapp)"/g)].map((m) => m[1]);
    assert.deepEqual(options((await open(h, plain, cookie)).body), ['sms']);
    assert.deepEqual(options((await open(h, consented, cookie)).body), ['whatsapp', 'sms']);
  });

  test('a closed enquiry offers no reply form until it is reopened', async () => {
    const h = harness();
    const id = h.addEnquiry();
    const cookie = await h.login(C1);
    const { base } = await open(h, id, cookie);
    await h.post(`/staff/enquiries/${id}/status`, { ...base, status: 'closed' }, cookie);
    const closed = await open(h, id, cookie);
    assert.match(closed.body, /This enquiry is closed/);
    assert.ok(!closed.body.includes('Approve and record reply'));
    const forced = await h.post(`/staff/enquiries/${id}/reply/record`, { ...closed.base, channel: 'email', subject: 's', body: 'b', approve: 'yes' }, cookie);
    assert.equal(forced.status, 409);
    assert.equal(count(h.db, "SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'staff_reply'"), 0);
  });

  test('every write is audited by name and id, and the admin activity page lists them without personal text', async () => {
    const h = harness();
    const id = h.addEnquiry({ name: 'Private Person' });
    const c1 = await h.login(C1);
    const { base } = await open(h, id, c1);
    await h.post(`/staff/enquiries/${id}/status`, { ...base, status: 'in_progress' }, c1);
    const p2 = await open(h, id, c1);
    await h.post(`/staff/enquiries/${id}/notes`, { ...p2.base, body: 'SECRET-NOTE-TEXT' }, c1);
    await h.post(`/staff/enquiries/${id}/reply/record`, { ...p2.base, channel: 'email', subject: 's', body: 'SECRET-REPLY-TEXT', approve: 'yes' }, c1);
    assert.deepEqual(
      h.db.prepare("SELECT action FROM audit_log WHERE entity = 'enquiry' ORDER BY id").all().map((r) => (r as { action: string }).action),
      ['enquiry.status', 'enquiry.note', 'enquiry.reply_recorded'],
    );
    const admin = await h.login(ADMIN);
    const page = await text(await h.get('/staff/activity', admin));
    assert.match(page, /Demo Consultant One changed the status of/);
    assert.match(page, /approved and recorded a mock reply for/);
    assert.match(page, /signed in/);
    assert.ok(!page.includes('SECRET-NOTE-TEXT') && !page.includes('SECRET-REPLY-TEXT') && !page.includes('Private Person'));
    assert.ok(!JSON.stringify(h.db.prepare('SELECT meta_json FROM audit_log').all()).includes('SECRET'));
  });
});
