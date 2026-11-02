import { createHash, randomBytes, randomInt } from 'node:crypto';
import { get, run, transaction, type DatabaseSync } from '../db/db.js';
import { DomainError } from './packages.js';
import { PRIVACY_NOTICE_VERSION, WHATSAPP_CONSENT_TEXT } from './notices.js';

// Public enquiries (slice S3): validate what a traveller typed, store it as an immutable record,
// and record a fixed-template acknowledgement in the mock outbox. Nothing is ever sent.
// Staff triage (S4) and AI extraction (S5) will read these rows and write to their own tables.

// ---------------------------------------------------------------------------
// Input and validation
// ---------------------------------------------------------------------------

export const FIELDS = [
  'name', 'email', 'phone', 'travelStart', 'adults', 'children', 'childAges',
  'destination', 'budget', 'budgetBasis', 'message', 'whatsappConsent',
] as const;
export type FieldName = (typeof FIELDS)[number];
/** What the form posted, as plain strings. Re-rendered into the form after a failure. */
export type RawForm = Record<FieldName, string>;
export type FieldErrors = Partial<Record<FieldName, string>>;

export const LIMITS = {
  name: 120, email: 254, destination: 120, message: 2000,
  // ponytail: sizes are abuse bounds, not business rules. Larger groups can say so in the message.
  adults: 50, children: 20, maxChildAge: 17, minBudget: 1000, maxBudget: 999_999_999, daysAhead: 730,
} as const;

export type BudgetBasis = 'total' | 'per_person';

export interface EnquiryInput {
  name: string;
  email: string | null;
  phone: string | null;
  /** YYYY-MM-DD, or null when the traveller did not pick a date. */
  travelStart: string | null;
  adults: number;
  children: number;
  childAges: number[];
  destination: string | null;
  budgetInr: number | null;
  budgetBasis: BudgetBasis | null;
  message: string;
  whatsappConsent: boolean;
}

export type Validation = { ok: true; value: EnquiryInput } | { ok: false; errors: FieldErrors };

export const emptyForm = (): RawForm => ({
  name: '', email: '', phone: '', travelStart: '', adults: '2', children: '0', childAges: '',
  destination: '', budget: '', budgetBasis: 'total', message: '', whatsappConsent: '',
});

// Control characters (except newline in the message), bidirectional overrides and zero-width spaces are
// removed. ZWJ and ZWNJ (U+200C, U+200D) stay: Malayalam and Hindi text needs them.
// eslint-disable-next-line no-control-regex -- stripping control characters is the purpose of this pattern
const STRIPPED = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function cleanText(raw: string, multiline = false): string {
  const text = raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(STRIPPED, '');
  return (multiline ? text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : text.replace(/\s+/g, ' ')).trim();
}

/** Today's date in India (UTC+5:30, no daylight saving), as YYYY-MM-DD. */
export function indiaToday(now: Date): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isRealDate(ymd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Checks the form values. `today` is the Indian calendar date (see indiaToday). */
export function validateEnquiry(raw: RawForm, today: string): Validation {
  const errors: FieldErrors = {};

  const name = cleanText(raw.name);
  if (!name) errors.name = 'Enter your name.';
  else if (name.length > LIMITS.name) errors.name = `Keep your name to ${LIMITS.name} characters or fewer.`;

  const emailText = cleanText(raw.email).toLowerCase();
  let email: string | null = null;
  if (emailText) {
    if (emailText.length > LIMITS.email || !EMAIL.test(emailText)) errors.email = 'Enter an email address like name@example.com.';
    else email = emailText;
  }

  const phoneText = cleanText(raw.phone).replace(/[\s().-]/g, '');
  let phone: string | null = null;
  if (phoneText) {
    if (!/^\+?[0-9]{7,15}$/.test(phoneText)) {
      errors.phone = 'Enter a phone number with 7 to 15 digits. Start with + and the country code if it is outside India.';
    } else phone = phoneText;
  }
  if (!emailText && !phoneText) errors.email = 'Enter an email address or a phone number so a consultant can reply.';

  let travelStart: string | null = null;
  const dateText = cleanText(raw.travelStart);
  if (dateText) {
    if (!isRealDate(dateText)) errors.travelStart = 'Enter a real date.';
    else if (dateText < today) errors.travelStart = 'Choose a date that is today or later, or leave it blank.';
    else if (dateText > addDays(today, LIMITS.daysAhead)) errors.travelStart = 'Choose a date within the next two years, or leave it blank.';
    else travelStart = dateText;
  }

  const count = (text: string, min: number, max: number): number | null => {
    const t = cleanText(text);
    if (!/^\d{1,3}$/.test(t)) return null;
    const n = Number(t);
    return n >= min && n <= max ? n : null;
  };
  const adults = count(raw.adults, 1, LIMITS.adults);
  if (adults === null) errors.adults = `Enter a whole number of adults from 1 to ${LIMITS.adults}.`;
  const children = count(raw.children, 0, LIMITS.children);
  if (children === null) errors.children = `Enter a whole number of children from 0 to ${LIMITS.children}.`;

  const agesText = cleanText(raw.childAges);
  let childAges: number[] = [];
  if (agesText) {
    const parts = agesText.split(/[\s,]+/).filter(Boolean);
    const ages = parts.map((p) => (/^\d{1,2}$/.test(p) ? Number(p) : NaN));
    if (ages.some((a) => !Number.isInteger(a) || a > LIMITS.maxChildAge)) {
      errors.childAges = `Enter each child’s age as a number from 0 to ${LIMITS.maxChildAge}, separated by commas.`;
    } else if (children !== null && ages.length !== children) {
      errors.childAges = children === 0 ? 'Leave this blank when there are no children.' : `Enter ${children} age${children === 1 ? '' : 's'}, one for each child, or leave this blank.`;
    } else childAges = ages;
  }

  const destinationText = cleanText(raw.destination);
  if (destinationText.length > LIMITS.destination) errors.destination = `Keep this to ${LIMITS.destination} characters or fewer.`;

  let budgetInr: number | null = null;
  let budgetBasis: BudgetBasis | null = null;
  const budgetText = cleanText(raw.budget).replace(/^₹\s*/, '').replace(/[,\s]/g, '');
  if (budgetText) {
    const n = /^\d{1,9}$/.test(budgetText) ? Number(budgetText) : NaN;
    if (!(n >= LIMITS.minBudget && n <= LIMITS.maxBudget)) {
      errors.budget = `Enter your budget in rupees as a number, from ${LIMITS.minBudget.toLocaleString('en-IN')} up, for example 120000.`;
    } else if (raw.budgetBasis !== 'total' && raw.budgetBasis !== 'per_person') {
      errors.budgetBasis = 'Say whether the budget is for the whole group or per person.';
    } else {
      budgetInr = n;
      budgetBasis = raw.budgetBasis;
    }
  }

  const message = cleanText(raw.message, true);
  if (message.length > LIMITS.message) errors.message = `Keep your message to ${LIMITS.message} characters or fewer. It is ${message.length} now.`;

  const whatsappConsent = raw.whatsappConsent === 'on';
  if (whatsappConsent && !phone && !errors.phone) errors.whatsappConsent = 'To agree to WhatsApp messages, enter your phone number above.';

  if (Object.keys(errors).length > 0 || adults === null || children === null) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name, email, phone, travelStart, adults, children, childAges,
      destination: destinationText || null, budgetInr, budgetBasis, message, whatsappConsent,
    },
  };
}

// ---------------------------------------------------------------------------
// Acknowledgement (fixed template, mock outbox)
// ---------------------------------------------------------------------------

export const ACK_TEMPLATE_VERSION = 'ack-1';
export type Channel = 'email' | 'sms' | 'whatsapp';

/**
 * The same text goes to every channel. It carries no personal data and no price, date or promise of
 * a reply time (the brief gives none), so the public status page can show it unchanged.
 */
export function buildAcknowledgement(packageTitle: string, reference: string): { subject: string; body: string } {
  return {
    subject: `We have received your enquiry (${reference})`,
    body:
      `Thank you for your enquiry about ${packageTitle}. We have received it, and a Company A consultant will reply to you personally. ` +
      `This is an automated acknowledgement. It is not a quote, and it does not confirm any price, date or availability. Your reference is ${reference}.`,
  };
}

/** Email when given; otherwise WhatsApp only with consent, else SMS. */
export function acknowledgementRoute(input: Pick<EnquiryInput, 'email' | 'phone' | 'whatsappConsent'>): { channel: Channel; recipient: string } {
  if (input.email) return { channel: 'email', recipient: input.email };
  return { channel: input.whatsappConsent ? 'whatsapp' : 'sms', recipient: input.phone ?? '' };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** An identical resend inside this window returns the first enquiry instead of adding another. */
export const DUPLICATE_WINDOW_MS = 10 * 60_000;

const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const randomReference = (): string => Array.from({ length: 8 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('');
/** 192 random bits, URL-safe, 32 characters. */
export const newToken = (): string => randomBytes(24).toString('base64url');
/** The idempotency key printed into each form: 128 random bits, 22 characters. */
export const newSubmissionKey = (): string => randomBytes(16).toString('base64url');

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
export const SUBMISSION_KEY_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

export interface CreateEnquiryArgs {
  input: EnquiryInput;
  versionId: number;
  submissionKey: string;
  origin?: 'web_form' | 'seed_sample';
  now?: Date;
  /** Called after the duplicate checks and just before the insert; throw to stop a new enquiry (e.g. a rate limit). */
  beforeInsert?: () => void;
}

export interface CreatedEnquiry {
  token: string;
  reference: string;
  outcome: 'created' | 'same_submission' | 'same_content';
}

interface Existing { public_token: string; reference: string }

/**
 * Stores the enquiry and its acknowledgement in one transaction, so there is never an enquiry without
 * its outbox row or the reverse. Throws DomainError('not_found') when the version is no longer live.
 */
export function createEnquiry(db: DatabaseSync, args: CreateEnquiryArgs): CreatedEnquiry {
  const { input, versionId, submissionKey } = args;
  const now = args.now ?? new Date();
  return transaction(db, () => {
    const version = get<{ title: string; package_id: number }>(
      db, "SELECT title, package_id FROM package_versions WHERE id = ? AND status = 'published'", versionId,
    );
    if (!version) throw new DomainError('not_found', 'That package is not available.');

    const sameKey = get<Existing>(db, 'SELECT public_token, reference FROM enquiries WHERE submission_key = ?', submissionKey);
    if (sameKey) return { token: sameKey.public_token, reference: sameKey.reference, outcome: 'same_submission' as const };

    const dedupeHash = createHash('sha256').update(JSON.stringify([version.package_id, input])).digest('hex');
    const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString();
    const sameContent = get<Existing>(
      db, 'SELECT public_token, reference FROM enquiries WHERE dedupe_hash = ? AND created_at >= ? ORDER BY id LIMIT 1', dedupeHash, since,
    );
    if (sameContent) return { token: sameContent.public_token, reference: sameContent.reference, outcome: 'same_content' as const };

    args.beforeInsert?.();

    let reference = randomReference();
    for (let i = 0; i < 5 && get(db, 'SELECT 1 FROM enquiries WHERE reference = ?', reference); i++) reference = randomReference();
    const token = newToken();
    const at = now.toISOString();

    const enquiryId = Number(
      run(
        db,
        `INSERT INTO enquiries
           (reference, public_token, submission_key, dedupe_hash, origin, source_version_id, name, email, phone,
            travel_start, adults, children, child_ages_json, destination, budget_inr, budget_basis, message,
            whatsapp_consent, whatsapp_consent_text, whatsapp_consent_at, privacy_notice_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        reference, token, submissionKey, dedupeHash, args.origin ?? 'web_form', versionId, input.name, input.email, input.phone,
        input.travelStart, input.adults, input.children, JSON.stringify(input.childAges), input.destination, input.budgetInr, input.budgetBasis,
        input.message, input.whatsappConsent ? 1 : 0, input.whatsappConsent ? WHATSAPP_CONSENT_TEXT : null, input.whatsappConsent ? at : null,
        PRIVACY_NOTICE_VERSION, at,
      ).lastInsertRowid,
    );

    const ack = buildAcknowledgement(version.title, reference);
    const route = acknowledgementRoute(input);
    run(
      db,
      `INSERT INTO outbox_messages (enquiry_id, kind, channel, recipient, subject, body, template_version, created_at)
       VALUES (?, 'acknowledgement', ?, ?, ?, ?, ?, ?)`,
      enquiryId, route.channel, route.recipient, route.channel === 'email' ? ack.subject : null, ack.body, ACK_TEMPLATE_VERSION, at,
    );
    return { token, reference, outcome: 'created' as const };
  });
}

export interface AcknowledgementView {
  reference: string;
  receivedAt: string;
  packageTitle: string;
  packageSlug: string;
  packageIsLive: boolean;
  channel: Channel;
  body: string;
  isSample: boolean;
}

/**
 * What the public status page may show. It deliberately selects no name, email, phone, message or
 * party details, so a leaked link reveals only that an enquiry about this package exists.
 */
export function getAcknowledgement(db: DatabaseSync, token: string): AcknowledgementView | undefined {
  if (!TOKEN_PATTERN.test(token)) return undefined;
  const row = get<{
    reference: string; created_at: string; title: string; slug: string; is_live: number; channel: Channel; body: string; origin: string;
  }>(
    db,
    `SELECT e.reference, e.created_at, v.title, p.slug, e.origin, o.channel, o.body,
            EXISTS (SELECT 1 FROM live_versions lv WHERE lv.package_id = p.id) AS is_live
       FROM enquiries e
       JOIN package_versions v ON v.id = e.source_version_id
       JOIN packages p ON p.id = v.package_id
       JOIN outbox_messages o ON o.enquiry_id = e.id AND o.kind = 'acknowledgement'
      WHERE e.public_token = ?`,
    token,
  );
  if (!row) return undefined;
  return {
    reference: row.reference, receivedAt: row.created_at, packageTitle: row.title, packageSlug: row.slug,
    packageIsLive: row.is_live === 1, channel: row.channel, body: row.body, isSample: row.origin === 'seed_sample',
  };
}
