import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { all, get, run, type DatabaseSync } from '../../src/db/db.js';
import { DEMO_STAFF_PASSWORD, resetDatabase } from '../../src/db/seed.js';
import { createEnquiry, getAcknowledgement, newSubmissionKey, type EnquiryInput } from '../../src/domain/enquiries.js';
import { DomainError } from '../../src/domain/packages.js';
import {
  addNote, assignEnquiry, changeStatus, DEFAULT_QUERY, getWorkspace, inboxQueryString, listActivity, listInbox, mayAssign, PAGE_SIZE,
  parseInboxQuery, recordReply, replyChannels, saveReplyDraft, TRIAGE_LIMITS, type InboxQuery,
} from '../../src/domain/triage.js';
import type { StaffUser } from '../../src/domain/staff.js';

const T0 = new Date('2026-11-02T10:00:00.000Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

interface Fixture {
  db: DatabaseSync;
  admin: StaffUser;
  c1: StaffUser;
  c2: StaffUser;
  versionId: number;
  add(over?: Partial<EnquiryInput>, when?: Date): number;
}

/** The seed stamps its sample enquiry with the real clock, so tests that fix the time start without it unless they ask for it. */
function fixture(keepSample = false): Fixture {
  const db = resetDatabase(':memory:', { staffPassword: DEMO_STAFF_PASSWORD });
  if (!keepSample) db.exec('DELETE FROM enquiries');
  const user = (email: string): StaffUser => get<StaffUser>(db, 'SELECT id, email, name, role FROM staff_users WHERE email = ?', email)!;
  const versionId = get<{ id: number }>(db, "SELECT v.id FROM live_versions v JOIN packages p ON p.id = v.package_id WHERE p.code = 'PKG-KL-07'")!.id;
  let n = 0;
  return {
    db, versionId,
    admin: user('admin@staff.example.invalid'), c1: user('consultant1@staff.example.invalid'), c2: user('consultant2@staff.example.invalid'),
    add(over = {}, when = T0) {
      n++;
      const input: EnquiryInput = {
        name: `Traveller ${n}`, email: `t${n}@example.invalid`, phone: null, travelStart: null, adults: 2, children: 0, childAges: [], destination: null,
        budgetInr: null, budgetBasis: null, message: `Message number ${n}`, whatsappConsent: false, ...over,
      };
      const r = createEnquiry(db, { input, versionId, submissionKey: newSubmissionKey(), now: when });
      return get<{ id: number }>(db, 'SELECT id FROM enquiries WHERE reference = ?', r.reference)!.id;
    },
  };
}
const lock = (db: DatabaseSync, id: number): number => get<{ lock_version: number }>(db, 'SELECT lock_version FROM enquiry_workflow WHERE enquiry_id = ?', id)!.lock_version;
const count = (db: DatabaseSync, sql: string): number => get<{ n: number }>(db, sql)?.n ?? -1;
const q = (over: Partial<InboxQuery> = {}): InboxQuery => ({ ...DEFAULT_QUERY, ...over });
function code(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof DomainError ? err.code : `other: ${String(err)}`;
  }
  return 'none';
}

describe('workflow rows', () => {
  test('every enquiry, seeded or new, gets a New workflow row from the database itself', () => {
    const f = fixture(true);
    const id = f.add();
    assert.deepEqual(all<{ status: string }>(f.db, 'SELECT status FROM enquiry_workflow').map((r) => r.status), ['new', 'new']);
    assert.equal(count(f.db, 'SELECT COUNT(*) AS n FROM enquiries'), 2);
    assert.equal(get<{ assignee_id: number | null }>(f.db, 'SELECT assignee_id FROM enquiry_workflow WHERE enquiry_id = ?', id)?.assignee_id, null);
  });

  test('the original enquiry stays immutable while workflow changes', () => {
    const f = fixture();
    const id = f.add();
    changeStatus(f.db, f.admin, { enquiryId: id, status: 'closed', expectedLock: 1 }, T0);
    assert.throws(() => run(f.db, "UPDATE enquiries SET message = 'edited' WHERE id = ?", id), /immutable/);
  });
});

describe('parseInboxQuery', () => {
  const parse = (s: string) => parseInboxQuery(new URLSearchParams(s));
  const rejected = (s: string): string | null => {
    const r = parse(s);
    return r.ok ? null : r.message;
  };

  test('no parameters gives the default: open enquiries, oldest first, page 1', () => {
    assert.deepEqual(parse(''), { ok: true, query: DEFAULT_QUERY });
    assert.deepEqual(parse('status=&page=&q='), { ok: true, query: DEFAULT_QUERY });
  });

  test('accepts every documented value', () => {
    for (const s of ['open', 'all', 'new', 'in_progress', 'replied', 'closed']) assert.deepEqual(parse(`status=${s}`).ok && (parse(`status=${s}`) as { query: InboxQuery }).query.status, s);
    const r = parse('assignee=me&sort=newest&page=3&q=%20asha%20%20menon%20');
    assert.deepEqual(r.ok && r.query, { status: 'open', assignee: 'me', q: 'asha menon', sort: 'newest', page: 3 });
    assert.deepEqual((parse('assignee=7') as { query: InboxQuery }).query.assignee, 7);
    assert.deepEqual((parse('assignee=unassigned') as { query: InboxQuery }).query.assignee, 'unassigned');
  });

  test('refuses malformed values instead of guessing', () => {
    for (const bad of [
      'status=bogus', 'status=OPEN', 'status=new%27%20OR%201=1', 'assignee=-1', 'assignee=1.5', 'assignee=abc', 'assignee=1234567890', 'sort=random',
      'page=0', 'page=-2', 'page=abc', 'page=1.5', 'page=1e3', 'page=100000', 'page=10001', 'page=%20', `q=${'x'.repeat(TRIAGE_LIMITS.query + 1)}`,
    ]) {
      assert.ok(rejected(bad), bad);
    }
  });

  test('refuses a filter given twice, so there is no ambiguity about which one applies', () => {
    for (const bad of ['status=new&status=closed', 'page=1&page=2', 'q=a&q=b', 'assignee=me&assignee=1', 'sort=oldest&sort=newest']) assert.match(rejected(bad) ?? '', /more than once/, bad);
  });

  test('ignores unknown parameters', () => {
    assert.deepEqual(parse('utm_source=x&foo=bar'), { ok: true, query: DEFAULT_QUERY });
  });

  test('inboxQueryString leaves out defaults and round-trips through the parser', () => {
    assert.equal(inboxQueryString(DEFAULT_QUERY), '');
    for (const query of [q({ status: 'closed' }), q({ assignee: 4, page: 2 }), q({ q: 'a&b=c 100%', sort: 'newest' }), q({ assignee: 'unassigned', status: 'all' })]) {
      assert.deepEqual(parse(inboxQueryString(query).slice(1)), { ok: true, query });
    }
  });
});

describe('listInbox', () => {
  test('lists the seeded sample and a newly created enquiry, oldest first by default', () => {
    const f = fixture(true);
    const soon = new Date(Date.now() + 30 * 60_000);
    const id = f.add({}, soon);
    const page = listInbox(f.db, DEFAULT_QUERY, f.admin.id, new Date(soon.getTime() + 600_000));
    assert.equal(page.total, 2);
    assert.deepEqual(page.rows.map((r) => r.isSample), [true, false]);
    assert.equal(page.rows[1]?.id, id);
    assert.equal(page.rows[1]?.packageTitle, 'Munnar, Thekkady and Alleppey houseboat');
    assert.equal(listInbox(f.db, q({ sort: 'newest' }), f.admin.id, soon).rows[0]?.id, id);
  });

  test('the wait indicator comes from created_at and the supplied clock', () => {
    const f = fixture();
    f.add({}, at(0));
    const rows = listInbox(f.db, q({ sort: 'newest' }), f.admin.id, at(61)).rows;
    assert.equal(rows[0]?.sla.state, 'past_target');
    assert.equal(rows[0]?.sla.elapsedMinutes, 61);
  });

  test('status filter and per-tab counts', () => {
    const f = fixture();
    const [a, b, c, d] = [f.add(), f.add(), f.add(), f.add()] as [number, number, number, number];
    changeStatus(f.db, f.admin, { enquiryId: b, status: 'in_progress', expectedLock: 1 }, T0);
    changeStatus(f.db, f.admin, { enquiryId: c, status: 'closed', expectedLock: 1 }, T0);
    recordReply(f.db, f.admin, { enquiryId: d, channel: 'email', subject: '', body: 'Hello', approved: true, expectedLock: 1 }, at(5));
    const ids = (status: InboxQuery['status']) => listInbox(f.db, q({ status }), f.admin.id, at(10)).rows.map((r) => r.id).sort();
    assert.deepEqual(ids('open'), [a, b].sort());
    assert.deepEqual(ids('new'), [a]);
    assert.deepEqual(ids('in_progress'), [b]);
    assert.deepEqual(ids('replied'), [d]);
    assert.deepEqual(ids('closed'), [c]);
    assert.deepEqual(ids('all'), [a, b, c, d].sort());
    assert.deepEqual(listInbox(f.db, DEFAULT_QUERY, f.admin.id, at(10)).counts, { new: 1, in_progress: 1, replied: 1, closed: 1, open: 2, all: 4 });
  });

  test('assignee filters: me, unassigned, a specific person; counts follow the assignee filter', () => {
    const f = fixture();
    const [a, b, c] = [f.add(), f.add(), f.add()] as [number, number, number];
    assignEnquiry(f.db, f.admin, { enquiryId: a, assigneeId: f.c1.id, expectedLock: 1 }, T0);
    assignEnquiry(f.db, f.admin, { enquiryId: b, assigneeId: f.c2.id, expectedLock: 1 }, T0);
    const ids = (assignee: InboxQuery['assignee'], viewer = f.c1.id) => listInbox(f.db, q({ assignee, status: 'all' }), viewer, T0).rows.map((r) => r.id);
    assert.deepEqual(ids('me'), [a]);
    assert.deepEqual(ids('me', f.c2.id), [b]);
    assert.deepEqual(ids('unassigned'), [c]);
    assert.deepEqual(ids(f.c2.id), [b]);
    assert.deepEqual(ids(999), []);
    assert.equal(listInbox(f.db, q({ assignee: 'unassigned' }), f.c1.id, T0).counts.all, 1);
    assert.equal(listInbox(f.db, q({ assignee: 'unassigned' }), f.c1.id, T0).rows[0]?.assigneeName, null);
    assert.equal(listInbox(f.db, q({ assignee: 'me' }), f.c1.id, T0).rows[0]?.assigneeName, 'Demo Consultant One');
  });

  test('search matches reference, name, email, phone and package, ignoring case', () => {
    const f = fixture();
    const id = f.add({ name: 'Asha Menon', email: 'asha.m@example.invalid', phone: '+919847012345' });
    f.add({ name: 'Someone Else' });
    const ref = get<{ reference: string }>(f.db, 'SELECT reference FROM enquiries WHERE id = ?', id)!.reference;
    for (const term of ['asha', 'MENON', 'asha.m@example', '9847012', ref.toLowerCase(), 'houseboat']) {
      const hits = listInbox(f.db, q({ q: term, status: 'all' }), f.admin.id, T0).rows.map((r) => r.id);
      assert.ok(hits.includes(id), term);
    }
    assert.deepEqual(listInbox(f.db, q({ q: 'zzz-no-match', status: 'all' }), f.admin.id, T0).rows, []);
  });

  test('search text is data: LIKE wildcards are literal and SQL metacharacters change nothing', () => {
    const f = fixture();
    f.add({ name: 'Plain Name' });
    f.add({ name: '100% Real_Name' });
    const names = (term: string) => listInbox(f.db, q({ q: term, status: 'all' }), f.admin.id, T0).rows.map((r) => r.name);
    assert.deepEqual(names('%'), ['100% Real_Name']);
    assert.deepEqual(names('_'), ['100% Real_Name']);
    assert.deepEqual(names('\\'), []);
    assert.deepEqual(names("' OR 1=1 --"), []);
    assert.deepEqual(names("x'; DROP TABLE enquiries; --"), []);
    assert.equal(count(f.db, 'SELECT COUNT(*) AS n FROM enquiries'), 2);
  });

  test('paginates at 25: page sizes, page count, an out-of-range page is empty not an error', () => {
    const f = fixture();
    const ids = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => f.add({}, at(i)));
    const p1 = listInbox(f.db, q({ page: 1 }), f.admin.id, at(100));
    const p2 = listInbox(f.db, q({ page: 2 }), f.admin.id, at(100));
    assert.deepEqual([p1.rows.length, p2.rows.length, p1.pageCount, p1.total], [PAGE_SIZE, 5, 2, PAGE_SIZE + 5]);
    assert.deepEqual([...p1.rows, ...p2.rows].map((r) => r.id), ids);
    const beyond = listInbox(f.db, q({ page: 9 }), f.admin.id, at(100));
    assert.deepEqual([beyond.rows.length, beyond.total, beyond.pageCount], [0, PAGE_SIZE + 5, 2]);
  });

  test('an empty inbox is empty, with zero counts', () => {
    const f = fixture();
    const page = listInbox(f.db, DEFAULT_QUERY, f.admin.id, T0);
    assert.deepEqual([page.rows, page.total, page.pageCount, page.counts.all], [[], 0, 1, 0]);
  });
});

describe('assignEnquiry and mayAssign', () => {
  test('an admin can assign to anyone, reassign and unassign, each audited with from and to', () => {
    const f = fixture();
    const id = f.add();
    assignEnquiry(f.db, f.admin, { enquiryId: id, assigneeId: f.c1.id, expectedLock: 1 }, T0);
    assignEnquiry(f.db, f.admin, { enquiryId: id, assigneeId: f.c2.id, expectedLock: 2 }, T0);
    assignEnquiry(f.db, f.admin, { enquiryId: id, assigneeId: null, expectedLock: 3 }, T0);
    assert.deepEqual(
      getWorkspace(f.db, id, T0)!.activity.map((a) => [a.action, a.meta.from, a.meta.to]).reverse(),
      [['enquiry.assign', null, f.c1.id], ['enquiry.assign', f.c1.id, f.c2.id], ['enquiry.assign', f.c2.id, null]],
    );
    assert.equal(lock(f.db, id), 4);
  });

  test('a consultant can take an unassigned enquiry and release their own, and nothing else', () => {
    const f = fixture();
    const id = f.add();
    assert.equal(code(() => assignEnquiry(f.db, f.c1, { enquiryId: id, assigneeId: f.c2.id, expectedLock: 1 }, T0)), 'forbidden', 'cannot give work to a colleague');
    assignEnquiry(f.db, f.c1, { enquiryId: id, assigneeId: f.c1.id, expectedLock: 1 }, T0);
    assert.equal(code(() => assignEnquiry(f.db, f.c2, { enquiryId: id, assigneeId: f.c2.id, expectedLock: 2 }, T0)), 'forbidden', 'cannot take over');
    assert.equal(code(() => assignEnquiry(f.db, f.c2, { enquiryId: id, assigneeId: null, expectedLock: 2 }, T0)), 'forbidden', 'cannot release a colleague');
    assignEnquiry(f.db, f.c1, { enquiryId: id, assigneeId: null, expectedLock: 2 }, T0);
    assert.equal(getWorkspace(f.db, id, T0)!.assigneeId, null);
    assert.deepEqual(
      [mayAssign(f.c1, null, f.c1.id), mayAssign(f.c1, f.c2.id, f.c1.id), mayAssign(f.c1, f.c1.id, null), mayAssign(f.c1, f.c2.id, null), mayAssign(f.c1, null, f.c2.id), mayAssign(f.admin, f.c1.id, f.c2.id)],
      [true, false, true, false, false, true],
    );
  });

  test('refuses an unknown or switched-off assignee and a missing enquiry', () => {
    const f = fixture();
    const id = f.add();
    const systemUser = get<{ id: number }>(f.db, "SELECT id FROM staff_users WHERE email = 'seed@system.invalid'")!.id;
    assert.equal(code(() => assignEnquiry(f.db, f.admin, { enquiryId: id, assigneeId: 9999, expectedLock: 1 }, T0)), 'validation');
    assert.equal(code(() => assignEnquiry(f.db, f.admin, { enquiryId: id, assigneeId: systemUser, expectedLock: 1 }, T0)), 'validation');
    assert.equal(code(() => assignEnquiry(f.db, f.admin, { enquiryId: 9999, assigneeId: null, expectedLock: 1 }, T0)), 'not_found');
  });

  test('a stale lock is a conflict and changes nothing: two people cannot both win', () => {
    const f = fixture();
    const id = f.add();
    assignEnquiry(f.db, f.c1, { enquiryId: id, assigneeId: f.c1.id, expectedLock: 1 }, T0);
    assert.equal(code(() => assignEnquiry(f.db, f.admin, { enquiryId: id, assigneeId: f.c2.id, expectedLock: 1 }, T0)), 'conflict');
    assert.equal(getWorkspace(f.db, id, T0)!.assigneeId, f.c1.id);
  });

  test('assigning to the current assignee is a no-op: no lock bump, no audit row', () => {
    const f = fixture();
    const id = f.add();
    assert.deepEqual(assignEnquiry(f.db, f.admin, { enquiryId: id, assigneeId: null, expectedLock: 1 }, T0), { changed: false });
    assert.equal(lock(f.db, id), 1);
    assert.equal(count(f.db, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'enquiry.assign'"), 0);
  });
});

describe('changeStatus', () => {
  test('moves between New, In progress and Closed (and back), each audited', () => {
    const f = fixture();
    const id = f.add();
    changeStatus(f.db, f.c1, { enquiryId: id, status: 'in_progress', expectedLock: 1 }, T0);
    changeStatus(f.db, f.c1, { enquiryId: id, status: 'closed', expectedLock: 2 }, T0);
    changeStatus(f.db, f.c1, { enquiryId: id, status: 'new', expectedLock: 3 }, T0);
    assert.deepEqual(
      getWorkspace(f.db, id, T0)!.activity.map((a) => [a.meta.from, a.meta.to]).reverse(),
      [['new', 'in_progress'], ['in_progress', 'closed'], ['closed', 'new']],
    );
  });

  test('replied cannot be set by hand, and nonsense is refused', () => {
    const f = fixture();
    const id = f.add();
    for (const bad of ['replied', 'done', '', 'NEW', 'closed; DROP TABLE enquiries']) {
      assert.equal(code(() => changeStatus(f.db, f.admin, { enquiryId: id, status: bad, expectedLock: 1 }, T0)), 'validation', bad);
    }
    assert.equal(lock(f.db, id), 1);
  });

  test('a stale lock is a conflict; the same status is a no-op', () => {
    const f = fixture();
    const id = f.add();
    changeStatus(f.db, f.admin, { enquiryId: id, status: 'in_progress', expectedLock: 1 }, T0);
    assert.equal(code(() => changeStatus(f.db, f.admin, { enquiryId: id, status: 'closed', expectedLock: 1 }, T0)), 'conflict');
    assert.deepEqual(changeStatus(f.db, f.admin, { enquiryId: id, status: 'in_progress', expectedLock: 2 }, T0), { changed: false });
    assert.equal(lock(f.db, id), 2);
  });

  test('an enquiry that was Replied can be reopened', () => {
    const f = fixture();
    const id = f.add();
    recordReply(f.db, f.c1, { enquiryId: id, channel: 'email', subject: '', body: 'Hi', approved: true, expectedLock: 1 }, T0);
    changeStatus(f.db, f.c1, { enquiryId: id, status: 'in_progress', expectedLock: 2 }, T0);
    assert.equal(getWorkspace(f.db, id, T0)!.status, 'in_progress');
  });
});

describe('addNote', () => {
  test('adds a note with its author, newest first, and audits only the note id', () => {
    const f = fixture();
    const id = f.add();
    addNote(f.db, f.c1, { enquiryId: id, body: '  Called the guest.\n\n\n\nWill call back.  ' }, at(1));
    const noteId = addNote(f.db, f.c2, { enquiryId: id, body: 'Second note' }, at(2));
    const w = getWorkspace(f.db, id, at(3))!;
    assert.deepEqual(w.notes.map((n) => [n.authorName, n.body]), [['Demo Consultant Two', 'Second note'], ['Demo Consultant One', 'Called the guest.\n\nWill call back.']]);
    const row = get<{ meta_json: string }>(f.db, "SELECT meta_json FROM audit_log WHERE action = 'enquiry.note' ORDER BY id DESC");
    assert.deepEqual(JSON.parse(row!.meta_json), { note_id: noteId });
    assert.equal(lock(f.db, id), 1, 'a note does not invalidate other people’s open forms');
  });

  test('refuses an empty, whitespace-only or over-long note and a missing enquiry', () => {
    const f = fixture();
    const id = f.add();
    for (const body of ['', '   \n  ', '\u0000​']) assert.equal(code(() => addNote(f.db, f.c1, { enquiryId: id, body }, T0)), 'validation', JSON.stringify(body));
    assert.equal(code(() => addNote(f.db, f.c1, { enquiryId: id, body: 'x'.repeat(TRIAGE_LIMITS.note + 1) }, T0)), 'validation');
    assert.equal(code(() => addNote(f.db, f.c1, { enquiryId: 9999, body: 'hello' }, T0)), 'not_found');
    addNote(f.db, f.c1, { enquiryId: id, body: 'x'.repeat(TRIAGE_LIMITS.note) }, T0);
    assert.equal(count(f.db, 'SELECT COUNT(*) AS n FROM enquiry_notes'), 1);
  });

  test('a note is stored as text and cannot be edited afterwards', () => {
    const f = fixture();
    const id = f.add();
    const noteId = addNote(f.db, f.c1, { enquiryId: id, body: '<script>alert(1)</script> നമസ്കാരം' }, T0);
    assert.equal(getWorkspace(f.db, id, T0)!.notes[0]?.body, '<script>alert(1)</script> നമസ്കാരം');
    assert.throws(() => run(f.db, "UPDATE enquiry_notes SET body = 'changed' WHERE id = ?", noteId), /cannot be edited/);
  });
});

describe('replies: channels, drafts and approval', () => {
  const input = (enquiryId: number, over: Partial<{ channel: string; subject: string; body: string }> = {}) => ({ enquiryId, channel: 'email', subject: '', body: 'Dear guest, thank you.', ...over });

  test('channels follow the traveller’s real contact details; WhatsApp needs recorded consent', () => {
    assert.deepEqual(replyChannels({ email: 'a@b.co', phone: null, whatsappConsent: false }).map((c) => c.channel), ['email']);
    assert.deepEqual(replyChannels({ email: null, phone: '+911', whatsappConsent: false }).map((c) => c.channel), ['sms']);
    assert.deepEqual(replyChannels({ email: 'a@b.co', phone: '+911', whatsappConsent: true }).map((c) => c.channel), ['email', 'whatsapp', 'sms']);
    assert.deepEqual(replyChannels({ email: null, phone: '+911', whatsappConsent: true }).map((c) => c.channel), ['whatsapp', 'sms']);
  });

  test('saving a draft keeps one working draft per enquiry, advances lock, records no message, and audits no text', () => {
    const f = fixture();
    const id = f.add();
    saveReplyDraft(f.db, f.c1, { ...input(id, { body: 'First draft' }), expectedLock: 1 }, at(1));
    assert.equal(getWorkspace(f.db, id, at(1))!.lockVersion, 2);
    // A stale submit with lock 1 fails with conflict
    assert.equal(code(() => saveReplyDraft(f.db, f.c2, { ...input(id, { body: 'Stale draft' }), expectedLock: 1 }, at(2))), 'conflict');
    // Submitting with updated lock 2 succeeds and bumps lock to 3
    saveReplyDraft(f.db, f.c2, { ...input(id, { body: 'Second draft', subject: 'Re: houseboat' }), expectedLock: 2 }, at(3));
    const w = getWorkspace(f.db, id, at(4))!;
    assert.equal(w.lockVersion, 3);
    assert.deepEqual([w.draft?.body, w.draft?.subject, w.draft?.updatedByName], ['Second draft', 'Re: houseboat', 'Demo Consultant Two']);
    assert.equal(count(f.db, "SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'staff_reply'"), 0);
    assert.equal(w.status, 'new', 'a draft does not change the status');
    const audits = all<{ meta_json: string }>(f.db, "SELECT meta_json FROM audit_log WHERE action = 'enquiry.reply_draft'");
    assert.equal(audits.length, 2);
    assert.ok(!audits.some((a) => a.meta_json.includes('draft')));
  });

  test('the recipient comes from the enquiry, and only offered channels are accepted', () => {
    const f = fixture();
    const id = f.add({ email: 'guest@example.invalid', phone: '+919847012345', whatsappConsent: false });
    assert.equal(code(() => saveReplyDraft(f.db, f.c1, { ...input(id, { channel: 'whatsapp' }), expectedLock: 1 }, T0)), 'validation', 'no consent, no WhatsApp');
    assert.equal(code(() => saveReplyDraft(f.db, f.c1, { ...input(id, { channel: 'carrier-pigeon' }), expectedLock: 1 }, T0)), 'validation');
    recordReply(f.db, f.c1, { ...input(id, { channel: 'sms' }), approved: true, expectedLock: 1 }, T0);
    assert.equal(get<{ recipient: string }>(f.db, "SELECT recipient FROM outbox_messages WHERE kind = 'staff_reply'")?.recipient, '+919847012345');
  });

  test('approval is explicit: anything other than true records nothing', () => {
    const f = fixture();
    const id = f.add();
    for (const approved of [false, undefined, null, 'on', 1, 'true'] as unknown[]) {
      assert.equal(code(() => recordReply(f.db, f.c1, { ...input(id), approved: approved as boolean, expectedLock: 1 }, T0)), 'validation', String(approved));
    }
    assert.equal(count(f.db, "SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'staff_reply'"), 0);
    assert.equal(getWorkspace(f.db, id, T0)!.status, 'new');
  });

  test('an approved reply is a mock outbox row naming its approver, clears the draft, moves to Replied and stops the clock', () => {
    const f = fixture();
    const id = f.add({}, T0);
    saveReplyDraft(f.db, f.c1, { ...input(id, { body: 'Draft text' }), expectedLock: 1 }, at(5));
    // Since saveReplyDraft advanced the lock to 2, recordReply with stale expectedLock 1 conflicts:
    assert.equal(code(() => recordReply(f.db, f.c1, { ...input(id, { subject: 'Your houseboat enquiry', body: 'Final text' }), approved: true, expectedLock: 1 }, at(42))), 'conflict');
    const { messageId } = recordReply(f.db, f.c1, { ...input(id, { subject: 'Your houseboat enquiry', body: 'Final text' }), approved: true, expectedLock: 2 }, at(42));
    const row = get<Record<string, unknown>>(f.db, 'SELECT * FROM outbox_messages WHERE id = ?', messageId)!;
    assert.deepEqual(
      [row.kind, row.channel, row.recipient, row.subject, row.body, row.delivery, row.approved_by, row.template_version, row.created_at],
      ['staff_reply', 'email', get<{ email: string }>(f.db, 'SELECT email FROM enquiries WHERE id = ?', id)!.email, 'Your houseboat enquiry', 'Final text', 'mock_recorded', f.c1.id, 'staff-written-1', at(42).toISOString()],
    );
    const w = getWorkspace(f.db, id, at(500))!;
    assert.equal(w.draft, null);
    assert.equal(w.status, 'replied');
    assert.deepEqual([w.sla.state, w.sla.elapsedMinutes], ['answered', 42]);
    assert.deepEqual(w.messages.map((m) => [m.kind, m.approvedByName]), [['acknowledgement', null], ['staff_reply', 'Demo Consultant One']]);
    const audit = get<{ meta_json: string }>(f.db, "SELECT meta_json FROM audit_log WHERE action = 'enquiry.reply_recorded'")!;
    assert.deepEqual(JSON.parse(audit.meta_json), { message_id: messageId, channel: 'email', status_from: 'new' });
  });

  test('a repeated submit (double click, stale page) records the reply once', () => {
    const f = fixture();
    const id = f.add();
    recordReply(f.db, f.c1, { ...input(id), approved: true, expectedLock: 1 }, T0);
    assert.equal(code(() => recordReply(f.db, f.c1, { ...input(id), approved: true, expectedLock: 1 }, T0)), 'conflict');
    assert.equal(count(f.db, "SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'staff_reply'"), 1);
  });

  test('a closed enquiry takes neither a draft nor a reply until it is reopened', () => {
    const f = fixture();
    const id = f.add();
    changeStatus(f.db, f.admin, { enquiryId: id, status: 'closed', expectedLock: 1 }, T0);
    assert.equal(code(() => saveReplyDraft(f.db, f.c1, { ...input(id), expectedLock: 2 }, T0)), 'invalid_state');
    assert.equal(code(() => recordReply(f.db, f.c1, { ...input(id), approved: true, expectedLock: 2 }, T0)), 'invalid_state');
  });

  test('empty, over-long and unknown-enquiry replies are refused; an email without a subject gets a plain default', () => {
    const f = fixture();
    const id = f.add();
    assert.equal(code(() => saveReplyDraft(f.db, f.c1, { ...input(id, { body: '  ' }), expectedLock: 1 }, T0)), 'validation');
    assert.equal(code(() => saveReplyDraft(f.db, f.c1, { ...input(id, { body: 'x'.repeat(TRIAGE_LIMITS.reply + 1) }), expectedLock: 1 }, T0)), 'validation');
    assert.equal(code(() => saveReplyDraft(f.db, f.c1, { ...input(id, { subject: 'x'.repeat(TRIAGE_LIMITS.subject + 1) }), expectedLock: 1 }, T0)), 'validation');
    assert.equal(code(() => saveReplyDraft(f.db, f.c1, { ...input(9999), expectedLock: 1 }, T0)), 'not_found');
    recordReply(f.db, f.c1, { ...input(id), approved: true, expectedLock: 1 }, T0);
    const ref = get<{ reference: string }>(f.db, 'SELECT reference FROM enquiries WHERE id = ?', id)!.reference;
    assert.equal(get<{ subject: string }>(f.db, "SELECT subject FROM outbox_messages WHERE kind = 'staff_reply'")?.subject, `Your enquiry (${ref})`);
  });

  test('a recorded message cannot be changed, and the traveller’s status page still shows only the acknowledgement', () => {
    const f = fixture();
    const id = f.add();
    const { messageId } = recordReply(f.db, f.c1, { ...input(id, { body: 'Private staff words' }), approved: true, expectedLock: 1 }, T0);
    assert.throws(() => run(f.db, "UPDATE outbox_messages SET body = 'changed' WHERE id = ?", messageId), /cannot be changed/);
    const token = get<{ public_token: string }>(f.db, 'SELECT public_token FROM enquiries WHERE id = ?', id)!.public_token;
    const ack = getAcknowledgement(f.db, token)!;
    assert.ok(!ack.body.includes('Private staff words'));
    assert.throws(() => run(f.db, "INSERT INTO outbox_messages (enquiry_id, kind, channel, recipient, body, template_version) VALUES (1, 'staff_reply', 'email', 'x', 'y', 'z')"), /CHECK/);
  });
});

describe('getWorkspace and listActivity', () => {
  test('returns the original enquiry and structured fields exactly as stored', () => {
    const f = fixture();
    const id = f.add({
      name: 'Asha Menon', phone: '+919847012345', travelStart: '2026-12-20', adults: 2, children: 2, childAges: [4, 9], destination: 'Kerala',
      budgetInr: 120000, budgetBasis: 'total', message: 'Line one\n\nLine two <b>x</b>', whatsappConsent: true,
    });
    const w = getWorkspace(f.db, id, T0)!;
    assert.deepEqual(
      [w.enquiry.name, w.enquiry.travelStart, w.enquiry.childAges, w.enquiry.budgetInr, w.enquiry.budgetBasis, w.enquiry.message, w.enquiry.whatsappConsent, w.enquiry.privacyNoticeVersion],
      ['Asha Menon', '2026-12-20', [4, 9], 120000, 'total', 'Line one\n\nLine two <b>x</b>', true, 'draft-1'],
    );
    assert.ok(w.enquiry.whatsappConsentText && w.enquiry.whatsappConsentAt);
    assert.deepEqual([w.package.code, w.package.versionNo, w.package.isLive, w.status, w.assigneeId, w.lockVersion], ['PKG-KL-07', 1, true, 'new', null, 1]);
    assert.deepEqual(w.messages.map((m) => m.kind), ['acknowledgement']);
    assert.equal(getWorkspace(f.db, 9999, T0), undefined);
  });

  test('the seeded sample is in the workspace with the brief’s message verbatim', () => {
    const f = fixture(true);
    const sample = getWorkspace(f.db, 1, T0)!;
    assert.equal(sample.enquiry.origin, 'seed_sample');
    assert.equal(sample.enquiry.message, 'Hi, 2 adults and 1 kid, Kerala 5-6 nights in December, budget around 1.2 lakh total, houseboat a must');
    assert.deepEqual([sample.enquiry.adults, sample.enquiry.children, sample.enquiry.budgetInr], [2, 1, null]);
  });

  test('listActivity returns the newest first, includes references, and carries no personal text', () => {
    const f = fixture();
    const id = f.add({ name: 'Secret Person' });
    changeStatus(f.db, f.admin, { enquiryId: id, status: 'in_progress', expectedLock: 1 }, T0);
    addNote(f.db, f.c1, { enquiryId: id, body: 'confidential note text' }, T0);
    const rows = listActivity(f.db);
    assert.equal(rows[0]?.action, 'enquiry.note');
    assert.equal(rows[0]?.enquiryReference, get<{ reference: string }>(f.db, 'SELECT reference FROM enquiries WHERE id = ?', id)!.reference);
    assert.ok(rows.some((r) => r.action === 'package.publish' || r.entity === 'package_version'), 'package audit rows appear too');
    const serial = JSON.stringify(rows);
    assert.ok(!serial.includes('Secret Person') && !serial.includes('confidential note text'));
    assert.ok(rows.length <= 100);
  });
});
