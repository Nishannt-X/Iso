import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { all, get, run, type DatabaseSync } from '../../src/db/db.js';
import { resetDatabase } from '../../src/db/seed.js';
import { DomainError, getLiveVersionBySlug } from '../../src/domain/packages.js';
import {
  acknowledgementRoute, buildAcknowledgement, cleanText, createEnquiry, DUPLICATE_WINDOW_MS, emptyForm, getAcknowledgement, indiaToday,
  newSubmissionKey, newToken, TOKEN_PATTERN, validateEnquiry, type EnquiryInput, type RawForm,
} from '../../src/domain/enquiries.js';
import { PRIVACY_NOTICE_VERSION, WHATSAPP_CONSENT_TEXT } from '../../src/domain/notices.js';
import { expectSqlError } from '../helpers.js';

const TODAY = '2026-11-02';
const KL07_SLUG = 'munnar-thekkady-and-alleppey-houseboat-6-days';
const form = (over: Partial<RawForm> = {}): RawForm => ({ ...emptyForm(), name: 'Asha Menon', email: 'asha@example.invalid', ...over });
const valid = (over: Partial<RawForm> = {}): EnquiryInput => {
  const v = validateEnquiry(form(over), TODAY);
  if (!v.ok) throw new Error(`expected valid, got ${JSON.stringify(v.errors)}`);
  return v.value;
};
const errorsOf = (over: Partial<RawForm>) => {
  const v = validateEnquiry(form(over), TODAY);
  return v.ok ? null : v.errors;
};
const count = (db: DatabaseSync, table: string): number => get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`)?.n ?? -1;

function setup() {
  const db = resetDatabase(':memory:');
  db.exec('DELETE FROM enquiries'); // the seed's sample enquiry would shift every count below
  const version = getLiveVersionBySlug(db, KL07_SLUG)!;
  return { db, versionId: version.id };
}

describe('validateEnquiry', () => {
  test('accepts the minimum: a name, one contact method, and the default party', () => {
    const v = valid();
    assert.deepEqual(v, {
      name: 'Asha Menon', email: 'asha@example.invalid', phone: null, travelStart: null, adults: 2, children: 0, childAges: [],
      destination: null, budgetInr: null, budgetBasis: null, message: '', whatsappConsent: false,
    });
  });

  test('requires a name and at least one of email or phone', () => {
    assert.match(errorsOf({ name: '   ' })?.name ?? '', /Enter your name/);
    assert.match(errorsOf({ email: '', phone: '' })?.email ?? '', /email address or a phone number/);
    assert.equal(valid({ email: '', phone: '98470 12345' }).phone, '9847012345');
  });

  test('rejects malformed email and phone, normalises phone punctuation and email case', () => {
    for (const bad of ['asha', 'a@b', 'a b@c.com', 'a@b.c', '<x>@y.com', 'a@b.com, c@d.com']) {
      assert.ok(errorsOf({ email: bad })?.email, bad);
    }
    for (const bad of ['12345', 'call me', '+91-98470-12345-99999999', '98470x12345']) {
      assert.ok(errorsOf({ phone: bad })?.phone, bad);
    }
    assert.equal(valid({ email: ' Asha@Example.INVALID ' }).email, 'asha@example.invalid');
    assert.equal(valid({ phone: '+91 (98470) 12-345' }).phone, '+919847012345');
  });

  test('party size: whole numbers inside the bounds', () => {
    for (const bad of ['0', '-1', '1.5', 'two', '', '51', '1e2']) assert.ok(errorsOf({ adults: bad })?.adults, `adults ${bad}`);
    for (const bad of ['-1', '21', 'x', '']) assert.ok(errorsOf({ children: bad })?.children, `children ${bad}`);
    assert.equal(valid({ adults: '50', children: '20' }).children, 20);
  });

  test('child ages must match the child count, or be blank', () => {
    assert.deepEqual(valid({ children: '2', childAges: '4, 9' }).childAges, [4, 9]);
    assert.deepEqual(valid({ children: '2', childAges: '' }).childAges, []);
    assert.match(errorsOf({ children: '2', childAges: '4' })?.childAges ?? '', /Enter 2 ages/);
    assert.match(errorsOf({ children: '0', childAges: '4' })?.childAges ?? '', /no children/);
    assert.ok(errorsOf({ children: '1', childAges: '18' })?.childAges);
    assert.ok(errorsOf({ children: '1', childAges: 'six' })?.childAges);
  });

  test('travel date: real, not in the past (India date), within two years; blank is fine', () => {
    assert.equal(valid({ travelStart: TODAY }).travelStart, TODAY);
    assert.equal(valid({ travelStart: '2028-10-31' }).travelStart, '2028-10-31');
    assert.match(errorsOf({ travelStart: '2026-11-01' })?.travelStart ?? '', /today or later/);
    assert.match(errorsOf({ travelStart: '2026-02-30' })?.travelStart ?? '', /real date/);
    assert.match(errorsOf({ travelStart: '02/12/2026' })?.travelStart ?? '', /real date/);
    assert.match(errorsOf({ travelStart: '2028-11-03' })?.travelStart ?? '', /next two years/);
  });

  test('indiaToday rolls over at 18:30 UTC, not at midnight UTC', () => {
    assert.equal(indiaToday(new Date('2026-11-02T18:29:00Z')), '2026-11-02');
    assert.equal(indiaToday(new Date('2026-11-02T18:30:00Z')), '2026-11-03');
  });

  test('budget: rupees as a number, with a basis; no budget means no basis', () => {
    const b = valid({ budget: '₹ 1,20,000', budgetBasis: 'total' });
    assert.equal(b.budgetInr, 120000);
    assert.equal(b.budgetBasis, 'total');
    const none = valid({ budget: '', budgetBasis: 'per_person' });
    assert.equal(none.budgetInr, null);
    assert.equal(none.budgetBasis, null);
    for (const bad of ['1.2 lakh', '999', '0', '-5000', '1000000000', 'abc']) assert.ok(errorsOf({ budget: bad })?.budget, bad);
    assert.ok(errorsOf({ budget: '50000', budgetBasis: 'weekly' })?.budgetBasis);
  });

  test('message: kept verbatim apart from control characters; length bound is enforced, not truncated', () => {
    const brief = 'Hi, 2 adults and 1 kid, Kerala 5-6 nights in December, budget around 1.2 lakh total, houseboat a must';
    assert.equal(valid({ message: brief }).message, brief);
    assert.equal(valid({ message: 'a\r\nb\u0000\u0007c' }).message, 'a\nbc');
    assert.equal(valid({ message: 'line1\n\n\n\n\nline2' }).message, 'line1\n\nline2');
    assert.equal(valid({ message: 'x'.repeat(2000) }).message.length, 2000);
    assert.match(errorsOf({ message: 'x'.repeat(2001) })?.message ?? '', /2000 characters or fewer\. It is 2001/);
  });

  test('keeps Malayalam and emoji (ZWJ, ZWNJ) but removes bidi overrides and zero-width spaces', () => {
    const ZWNJ = String.fromCharCode(0x200c);
    const ZWJ = String.fromCharCode(0x200d);
    const ml = `കേരളം ${ZWNJ} ക്ഷ ${ZWJ} 👨${ZWJ}👩${ZWJ}👧`;
    assert.equal(cleanText(ml, true), ml);
    assert.equal(cleanText(`pay${String.fromCharCode(0x202e)}ment${String.fromCharCode(0x200b)}`, true), 'payment');
  });

  test('WhatsApp consent is optional, needs a phone number, and defaults to false', () => {
    assert.equal(valid().whatsappConsent, false);
    assert.equal(valid({ phone: '9847012345', whatsappConsent: 'on' }).whatsappConsent, true);
    assert.match(errorsOf({ whatsappConsent: 'on' })?.whatsappConsent ?? '', /phone number/);
    assert.equal(valid({ phone: '9847012345', whatsappConsent: 'yes' }).whatsappConsent, false, 'only the checkbox value "on" counts');
  });

  test('reports every error at once, so the form can show them together', () => {
    const e = errorsOf({ name: '', email: 'x', adults: '0', travelStart: '2020-01-01' })!;
    assert.deepEqual(Object.keys(e).sort(), ['adults', 'email', 'name', 'travelStart']);
  });
});

describe('acknowledgement template and routing', () => {
  test('is fixed text with the package title and reference, and no personal data or price', () => {
    const a = buildAcknowledgement('Goa Beach Break', 'K7M2P9QX');
    assert.ok(a.body.includes('Goa Beach Break') && a.body.includes('K7M2P9QX'));
    assert.match(a.body, /not a quote/);
    assert.ok(!/₹|\d{4,}/.test(a.body.replace('K7M2P9QX', '')));
  });
  test('email wins; WhatsApp only with consent; otherwise SMS', () => {
    assert.deepEqual(acknowledgementRoute({ email: 'a@b.co', phone: '9', whatsappConsent: true }), { channel: 'email', recipient: 'a@b.co' });
    assert.deepEqual(acknowledgementRoute({ email: null, phone: '9847012345', whatsappConsent: true }), { channel: 'whatsapp', recipient: '9847012345' });
    assert.deepEqual(acknowledgementRoute({ email: null, phone: '9847012345', whatsappConsent: false }), { channel: 'sms', recipient: '9847012345' });
  });
});

describe('createEnquiry', () => {
  test('stores the enquiry, its source version, consent record and a mock acknowledgement together', () => {
    const { db, versionId } = setup();
    const now = new Date('2026-11-02T10:00:00.000Z');
    const input = valid({
      phone: '+919847012345', whatsappConsent: 'on', travelStart: '2026-12-10', children: '1', childAges: '6',
      destination: 'Kerala', budget: '120000', budgetBasis: 'total', message: 'houseboat a must',
    });
    const r = createEnquiry(db, { input, versionId, submissionKey: newSubmissionKey(), now });
    assert.equal(r.outcome, 'created');
    assert.match(r.reference, /^[A-HJKMNP-TV-Z2-9]{8}$/);
    assert.match(r.token, TOKEN_PATTERN);

    const row = get<Record<string, unknown>>(db, 'SELECT * FROM enquiries WHERE public_token = ?', r.token)!;
    assert.equal(row.source_version_id, versionId);
    assert.equal(row.name, 'Asha Menon');
    assert.equal(row.phone, '+919847012345');
    assert.equal(row.travel_start, '2026-12-10');
    assert.equal(row.adults, 2);
    assert.equal(row.child_ages_json, '[6]');
    assert.equal(row.budget_inr, 120000);
    assert.equal(row.budget_basis, 'total');
    assert.equal(row.message, 'houseboat a must');
    assert.equal(row.origin, 'web_form');
    assert.equal(row.whatsapp_consent, 1);
    assert.equal(row.whatsapp_consent_text, WHATSAPP_CONSENT_TEXT);
    assert.equal(row.whatsapp_consent_at, '2026-11-02T10:00:00.000Z');
    assert.equal(row.privacy_notice_version, PRIVACY_NOTICE_VERSION);

    const out = all<Record<string, unknown>>(db, 'SELECT * FROM outbox_messages');
    assert.equal(out.length, 1);
    assert.equal(out[0]?.channel, 'email');
    assert.equal(out[0]?.recipient, 'asha@example.invalid');
    assert.equal(out[0]?.delivery, 'mock_recorded');
    assert.equal(out[0]?.template_version, 'ack-1');
    assert.ok(String(out[0]?.body).includes(r.reference));
  });

  test('without consent: no consent text or time is stored and no WhatsApp message is queued', () => {
    const { db, versionId } = setup();
    const r = createEnquiry(db, { input: valid({ email: '', phone: '9847012345' }), versionId, submissionKey: newSubmissionKey() });
    const row = get<Record<string, unknown>>(db, 'SELECT * FROM enquiries WHERE public_token = ?', r.token)!;
    assert.equal(row.whatsapp_consent, 0);
    assert.equal(row.whatsapp_consent_text, null);
    assert.equal(row.whatsapp_consent_at, null);
    assert.deepEqual(all<{ channel: string }>(db, 'SELECT channel FROM outbox_messages').map((r) => r.channel), ['sms']);
    assert.equal(count(db, "outbox_messages WHERE channel = 'whatsapp'"), 0);
  });

  test('the same submission key returns the first enquiry and adds nothing (double click, refresh, back)', () => {
    const { db, versionId } = setup();
    const key = newSubmissionKey();
    const first = createEnquiry(db, { input: valid(), versionId, submissionKey: key });
    const again = createEnquiry(db, { input: valid({ message: 'changed my mind' }), versionId, submissionKey: key });
    assert.equal(again.outcome, 'same_submission');
    assert.equal(again.token, first.token);
    assert.equal(count(db, 'enquiries'), 1);
    assert.equal(count(db, 'outbox_messages'), 1);
  });

  test('an identical resend from a fresh form inside the window is recognised; a changed one or a later one is new', () => {
    const { db, versionId } = setup();
    const t0 = new Date('2026-11-02T10:00:00.000Z');
    const first = createEnquiry(db, { input: valid({ message: 'same' }), versionId, submissionKey: newSubmissionKey(), now: t0 });
    const dup = createEnquiry(db, { input: valid({ message: 'same' }), versionId, submissionKey: newSubmissionKey(), now: new Date(t0.getTime() + 60_000) });
    assert.equal(dup.outcome, 'same_content');
    assert.equal(dup.token, first.token);
    const changed = createEnquiry(db, { input: valid({ message: 'different' }), versionId, submissionKey: newSubmissionKey(), now: new Date(t0.getTime() + 60_000) });
    assert.equal(changed.outcome, 'created');
    const later = createEnquiry(db, { input: valid({ message: 'same' }), versionId, submissionKey: newSubmissionKey(), now: new Date(t0.getTime() + DUPLICATE_WINDOW_MS + 1000) });
    assert.equal(later.outcome, 'created');
    assert.equal(count(db, 'enquiries'), 3);
  });

  test('is atomic: if the acknowledgement cannot be recorded, no enquiry is left behind', () => {
    const { db, versionId } = setup();
    db.exec("CREATE TRIGGER test_outbox_fail BEFORE INSERT ON outbox_messages BEGIN SELECT RAISE(ABORT, 'outbox down'); END");
    assert.throws(() => createEnquiry(db, { input: valid(), versionId, submissionKey: newSubmissionKey() }), /outbox down/);
    assert.equal(count(db, 'enquiries'), 0);
    db.exec('DROP TRIGGER test_outbox_fail');
    assert.equal(createEnquiry(db, { input: valid(), versionId, submissionKey: newSubmissionKey() }).outcome, 'created');
  });

  test('refuses a version that is not live (the draft-only package, a superseded version)', () => {
    const { db } = setup();
    const draftId = get<{ id: number }>(db, "SELECT id FROM package_versions WHERE status = 'draft'")!.id;
    assert.throws(
      () => createEnquiry(db, { input: valid(), versionId: draftId, submissionKey: newSubmissionKey() }),
      (e: unknown) => e instanceof DomainError && e.code === 'not_found',
    );
    assert.equal(count(db, 'enquiries'), 0);
  });

  test('parameterised storage: SQL metacharacters and markup are stored as plain text', () => {
    const { db, versionId } = setup();
    const evil = `Robert'); DROP TABLE enquiries;-- <script>alert(1)</script>`;
    const r = createEnquiry(db, { input: valid({ name: evil, message: evil }), versionId, submissionKey: newSubmissionKey() });
    const row = get<{ name: string; message: string }>(db, 'SELECT name, message FROM enquiries WHERE public_token = ?', r.token)!;
    assert.equal(row.name, evil);
    assert.equal(row.message, evil);
  });
});

describe('enquiries table guarantees', () => {
  test('the original message and every other column are immutable', () => {
    const { db, versionId } = setup();
    const r = createEnquiry(db, { input: valid({ message: 'original words' }), versionId, submissionKey: newSubmissionKey() });
    expectSqlError(() => run(db, "UPDATE enquiries SET message = 'edited' WHERE public_token = ?", r.token), /immutable record/);
    expectSqlError(() => run(db, "UPDATE enquiries SET name = 'x'"), /immutable record/);
    assert.equal(get<{ message: string }>(db, 'SELECT message FROM enquiries')?.message, 'original words');
  });

  test('the database itself rejects consent without a phone, a budget without a basis, and no contact at all', () => {
    const { db, versionId } = setup();
    let n = 0;
    const insert = (cols: string, vals: string, consent = 0) => {
      n++;
      db.exec(`INSERT INTO enquiries (reference, public_token, submission_key, dedupe_hash, source_version_id, adults, children, message, whatsapp_consent, privacy_notice_version, ${cols})
               VALUES ('R${n}', 't${n}', 'k${n}', 'h', ${versionId}, 1, 0, '', ${consent}, 'v', ${vals})`);
    };
    expectSqlError(() => insert('name, email', "'n', 'a@b.co'", 1), /CHECK constraint/); // consent: no phone, no wording
    expectSqlError(() => insert('name, phone', "'n', '123'", 1), /CHECK constraint/); // consent: phone but no wording
    expectSqlError(() => insert('name, email, budget_inr', "'n', 'a@b.co', 5000"), /CHECK constraint/);
    expectSqlError(() => insert('name', "'n'"), /CHECK constraint/); // no email and no phone
    insert('name, phone, whatsapp_consent_text, whatsapp_consent_at', "'n', '123', 'text', 'now'", 1); // the valid shape is accepted
    assert.equal(count(db, 'enquiries'), 1);
  });

  test('the outbox can only hold mock-recorded messages', () => {
    const { db, versionId } = setup();
    const r = createEnquiry(db, { input: valid(), versionId, submissionKey: newSubmissionKey() });
    const id = get<{ id: number }>(db, 'SELECT id FROM enquiries WHERE public_token = ?', r.token)!.id;
    expectSqlError(
      () => run(db, "INSERT INTO outbox_messages (enquiry_id, kind, channel, recipient, body, template_version, delivery) VALUES (?, 'reply', 'email', 'a@b.co', 'x', 'v', 'sent')", id),
      /CHECK constraint/,
    );
    expectSqlError(
      () => run(db, "INSERT INTO outbox_messages (enquiry_id, kind, channel, recipient, body, template_version) VALUES (?, 'acknowledgement', 'email', 'a@b.co', 'x', 'v')", id),
      /UNIQUE constraint/,
    );
  });
});

describe('getAcknowledgement', () => {
  test('returns only public-safe fields for a valid token', () => {
    const { db, versionId } = setup();
    const r = createEnquiry(db, {
      input: valid({ name: 'Secret Name', email: 'secret@example.invalid', phone: '9847012345', message: 'private words' }), versionId, submissionKey: newSubmissionKey(),
    });
    const view = getAcknowledgement(db, r.token)!;
    assert.equal(view.reference, r.reference);
    assert.equal(view.packageTitle, 'Munnar, Thekkady and Alleppey houseboat');
    assert.equal(view.packageSlug, KL07_SLUG);
    assert.equal(view.packageIsLive, true);
    assert.equal(view.channel, 'email');
    const dump = JSON.stringify(view);
    for (const secret of ['Secret Name', 'secret@example.invalid', '9847012345', 'private words']) assert.ok(!dump.includes(secret), secret);
  });

  test('unknown, malformed and reference-shaped tokens find nothing; a reference is not an access key', () => {
    const { db, versionId } = setup();
    const r = createEnquiry(db, { input: valid(), versionId, submissionKey: newSubmissionKey() });
    assert.equal(getAcknowledgement(db, newToken()), undefined);
    assert.equal(getAcknowledgement(db, r.reference), undefined);
    assert.equal(getAcknowledgement(db, "' OR 1=1 --"), undefined);
    assert.equal(getAcknowledgement(db, r.token.slice(1)), undefined);
  });

  test('tokens are 192-bit random: distinct and URL-safe', () => {
    const seen = new Set(Array.from({ length: 500 }, newToken));
    assert.equal(seen.size, 500);
    for (const t of seen) assert.match(t, TOKEN_PATTERN);
  });
});
