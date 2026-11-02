import { all, get, run, transaction, type DatabaseSync, type Param } from '../db/db.js';
import { writeAudit } from './audit.js';
import { cleanText, type Channel } from './enquiries.js';
import { DomainError } from './packages.js';
import { slaFor, type Sla } from './sla.js';
import type { StaffUser } from './staff.js';

// Staff triage of enquiries (slice S4): the inbox query, the workspace read model, and the writes
// (assign, change status, note, reply draft, approve-and-record a reply). Every write is one transaction that also
// writes its audit row. An enquiry itself is never modified; state lives in enquiry_workflow and friends.
//
// Replies are mock: recordReply stores an outbox_messages row with delivery 'mock_recorded'. There is no transport.

export const STATUSES = ['new', 'in_progress', 'replied', 'closed'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = { new: 'New', in_progress: 'In progress', replied: 'Replied', closed: 'Closed' };
/** What staff may pick by hand. `replied` is reached only by recording a reply. */
export const SETTABLE_STATUSES = ['new', 'in_progress', 'closed'] as const;

export const PAGE_SIZE = 25;
export const TRIAGE_LIMITS = { note: 2000, reply: 4000, subject: 200, query: 100, maxPage: 10_000 } as const;

// ---------------------------------------------------------------------------
// Inbox query: parsing and listing
// ---------------------------------------------------------------------------

export type StatusFilter = 'open' | 'all' | Status;
export type AssigneeFilter = 'any' | 'me' | 'unassigned' | number;
export type Sort = 'oldest' | 'newest';

export interface InboxQuery {
  status: StatusFilter;
  assignee: AssigneeFilter;
  q: string;
  sort: Sort;
  page: number;
}

export const DEFAULT_QUERY: InboxQuery = { status: 'open', assignee: 'any', q: '', sort: 'oldest', page: 1 };

export type ParsedQuery = { ok: true; query: InboxQuery } | { ok: false; message: string };

const STATUS_FILTERS: readonly string[] = ['open', 'all', ...STATUSES];

/** Validates the inbox URL's query string. Unknown parameters are ignored; known ones must be well-formed and appear once. */
export function parseInboxQuery(params: URLSearchParams): ParsedQuery {
  const one = (key: string): string | { error: string } => {
    const values = params.getAll(key);
    if (values.length > 1) return { error: `The "${key}" filter was given more than once.` };
    return values[0] ?? '';
  };
  const query: InboxQuery = { ...DEFAULT_QUERY };

  const status = one('status');
  if (typeof status !== 'string') return { ok: false, message: status.error };
  if (status !== '') {
    if (!STATUS_FILTERS.includes(status)) return { ok: false, message: 'That status filter is not recognised.' };
    query.status = status as StatusFilter;
  }

  const assignee = one('assignee');
  if (typeof assignee !== 'string') return { ok: false, message: assignee.error };
  if (assignee !== '') {
    if (assignee === 'any' || assignee === 'me' || assignee === 'unassigned') query.assignee = assignee;
    else if (/^\d{1,9}$/.test(assignee)) query.assignee = Number(assignee);
    else return { ok: false, message: 'That assignee filter is not recognised.' };
  }

  const sort = one('sort');
  if (typeof sort !== 'string') return { ok: false, message: sort.error };
  if (sort !== '') {
    if (sort !== 'oldest' && sort !== 'newest') return { ok: false, message: 'That sort order is not recognised.' };
    query.sort = sort;
  }

  const q = one('q');
  if (typeof q !== 'string') return { ok: false, message: q.error };
  const cleaned = cleanText(q);
  if (cleaned.length > TRIAGE_LIMITS.query) return { ok: false, message: `Search text can be up to ${TRIAGE_LIMITS.query} characters.` };
  query.q = cleaned;

  const page = one('page');
  if (typeof page !== 'string') return { ok: false, message: page.error };
  if (page !== '') {
    if (!/^\d{1,5}$/.test(page) || Number(page) < 1 || Number(page) > TRIAGE_LIMITS.maxPage) return { ok: false, message: 'That page number is not valid.' };
    query.page = Number(page);
  }
  return { ok: true, query };
}

/** The query string for a link to this view; values equal to the default are left out so URLs stay short. */
export function inboxQueryString(query: InboxQuery): string {
  const p = new URLSearchParams();
  if (query.status !== DEFAULT_QUERY.status) p.set('status', query.status);
  if (query.assignee !== DEFAULT_QUERY.assignee) p.set('assignee', String(query.assignee));
  if (query.q) p.set('q', query.q);
  if (query.sort !== DEFAULT_QUERY.sort) p.set('sort', query.sort);
  if (query.page !== 1) p.set('page', String(query.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface InboxRow {
  id: number;
  reference: string;
  name: string;
  adults: number;
  children: number;
  createdAt: string;
  packageTitle: string;
  status: Status;
  assigneeId: number | null;
  assigneeName: string | null;
  isSample: boolean;
  sla: Sla;
}

export interface InboxPage {
  rows: InboxRow[];
  /** Rows matching every filter. */
  total: number;
  page: number;
  pageCount: number;
  /** Matches per status for the current assignee and search filters, so each tab shows what it would list. */
  counts: Record<Status | 'open' | 'all', number>;
}

const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

export function listInbox(db: DatabaseSync, query: InboxQuery, viewerId: number, now: Date): InboxPage {
  const where: string[] = [];
  const params: Param[] = [];
  if (query.assignee === 'me') {
    where.push('w.assignee_id = ?');
    params.push(viewerId);
  } else if (query.assignee === 'unassigned') {
    where.push('w.assignee_id IS NULL');
  } else if (typeof query.assignee === 'number') {
    where.push('w.assignee_id = ?');
    params.push(query.assignee);
  }
  if (query.q) {
    const like = likePattern(query.q);
    where.push("(e.reference LIKE ? ESCAPE '\\' OR e.name LIKE ? ESCAPE '\\' OR e.email LIKE ? ESCAPE '\\' OR e.phone LIKE ? ESCAPE '\\' OR v.title LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like, like);
  }
  const from = `FROM enquiries e
      JOIN enquiry_workflow w ON w.enquiry_id = e.id
      JOIN package_versions v ON v.id = e.source_version_id`;
  const base = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const counts: InboxPage['counts'] = { new: 0, in_progress: 0, replied: 0, closed: 0, open: 0, all: 0 };
  for (const r of all<{ status: Status; n: number }>(db, `SELECT w.status, COUNT(*) AS n ${from} ${base} GROUP BY w.status`, ...params)) {
    counts[r.status] = r.n;
  }
  counts.open = counts.new + counts.in_progress;
  counts.all = counts.open + counts.replied + counts.closed;

  const total = counts[query.status];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rowWhere = [...where];
  const rowParams = [...params];
  if (query.status === 'open') rowWhere.push("w.status IN ('new', 'in_progress')");
  else if (query.status !== 'all') {
    rowWhere.push('w.status = ?');
    rowParams.push(query.status);
  }
  const direction = query.sort === 'newest' ? 'DESC' : 'ASC';

  const rows = all<{
    id: number; reference: string; name: string; adults: number; children: number; created_at: string; title: string; status: Status;
    assignee_id: number | null; assignee_name: string | null; origin: string; first_reply_at: string | null;
  }>(
    db,
    `SELECT e.id, e.reference, e.name, e.adults, e.children, e.created_at, e.origin, v.title, w.status, w.assignee_id,
            (SELECT a.name FROM staff_users a WHERE a.id = w.assignee_id) AS assignee_name,
            (SELECT MIN(o.created_at) FROM outbox_messages o WHERE o.enquiry_id = e.id AND o.kind = 'staff_reply') AS first_reply_at
       ${from}
      ${rowWhere.length ? `WHERE ${rowWhere.join(' AND ')}` : ''}
      ORDER BY e.created_at ${direction}, e.id ${direction}
      LIMIT ? OFFSET ?`,
    ...rowParams, PAGE_SIZE, (query.page - 1) * PAGE_SIZE,
  );

  return {
    rows: rows.map((r) => ({
      id: r.id, reference: r.reference, name: r.name, adults: r.adults, children: r.children, createdAt: r.created_at, packageTitle: r.title,
      status: r.status, assigneeId: r.assignee_id, assigneeName: r.assignee_name, isSample: r.origin === 'seed_sample',
      sla: slaFor({ createdAt: r.created_at, firstReplyAt: r.first_reply_at, status: r.status, now }),
    })),
    total, page: query.page, pageCount, counts,
  };
}

// ---------------------------------------------------------------------------
// Workspace read model
// ---------------------------------------------------------------------------

export interface ReplyChannel {
  channel: Channel;
  recipient: string;
}

/** Ways a reply can be addressed: the email, WhatsApp only with recorded consent, and SMS to the phone number. Default first. */
export function replyChannels(e: { email: string | null; phone: string | null; whatsappConsent: boolean }): ReplyChannel[] {
  const out: ReplyChannel[] = [];
  if (e.email) out.push({ channel: 'email', recipient: e.email });
  if (e.phone && e.whatsappConsent) out.push({ channel: 'whatsapp', recipient: e.phone });
  if (e.phone) out.push({ channel: 'sms', recipient: e.phone });
  return out;
}

export interface WorkspaceMessage {
  id: number;
  kind: 'acknowledgement' | 'staff_reply';
  channel: Channel;
  recipient: string;
  subject: string | null;
  body: string;
  createdAt: string;
  approvedByName: string | null;
}

export interface Workspace {
  enquiry: {
    id: number; reference: string; origin: 'web_form' | 'seed_sample'; createdAt: string; name: string; email: string | null; phone: string | null;
    travelStart: string | null; adults: number; children: number; childAges: number[]; destination: string | null;
    budgetInr: number | null; budgetBasis: 'total' | 'per_person' | null; message: string;
    whatsappConsent: boolean; whatsappConsentText: string | null; whatsappConsentAt: string | null; privacyNoticeVersion: string;
  };
  package: { title: string; code: string; slug: string; versionNo: number; isLive: boolean };
  status: Status;
  assigneeId: number | null;
  assigneeName: string | null;
  lockVersion: number;
  sla: Sla;
  channels: ReplyChannel[];
  draft: { channel: Channel; subject: string | null; body: string; updatedByName: string; updatedAt: string } | null;
  notes: { id: number; authorName: string; body: string; createdAt: string }[];
  messages: WorkspaceMessage[];
  activity: { at: string; actorName: string | null; action: string; meta: Record<string, string | number | boolean | null> }[];
}

export function getWorkspace(db: DatabaseSync, id: number, now: Date): Workspace | undefined {
  const e = get<Record<string, unknown>>(
    db,
    `SELECT e.*, w.status, w.assignee_id, w.lock_version, v.title, v.version_no, p.code, p.slug,
            (SELECT a.name FROM staff_users a WHERE a.id = w.assignee_id) AS assignee_name,
            EXISTS (SELECT 1 FROM live_versions lv WHERE lv.package_id = p.id AND lv.id = v.id) AS is_live
       FROM enquiries e
       JOIN enquiry_workflow w ON w.enquiry_id = e.id
       JOIN package_versions v ON v.id = e.source_version_id
       JOIN packages p ON p.id = v.package_id
      WHERE e.id = ?`,
    id,
  );
  if (!e) return undefined;
  const str = (k: string): string => e[k] as string;
  const strOrNull = (k: string): string | null => (e[k] as string | null) ?? null;
  const enquiry: Workspace['enquiry'] = {
    id, reference: str('reference'), origin: e.origin as 'web_form' | 'seed_sample', createdAt: str('created_at'), name: str('name'),
    email: strOrNull('email'), phone: strOrNull('phone'), travelStart: strOrNull('travel_start'), adults: e.adults as number, children: e.children as number,
    childAges: JSON.parse(str('child_ages_json')) as number[], destination: strOrNull('destination'), budgetInr: (e.budget_inr as number | null) ?? null,
    budgetBasis: (e.budget_basis as 'total' | 'per_person' | null) ?? null, message: str('message'), whatsappConsent: e.whatsapp_consent === 1,
    whatsappConsentText: strOrNull('whatsapp_consent_text'), whatsappConsentAt: strOrNull('whatsapp_consent_at'), privacyNoticeVersion: str('privacy_notice_version'),
  };

  const messages = all<{
    id: number; kind: WorkspaceMessage['kind']; channel: Channel; recipient: string; subject: string | null; body: string; created_at: string; approver: string | null;
  }>(
    db,
    `SELECT o.id, o.kind, o.channel, o.recipient, o.subject, o.body, o.created_at, (SELECT a.name FROM staff_users a WHERE a.id = o.approved_by) AS approver
       FROM outbox_messages o WHERE o.enquiry_id = ? ORDER BY o.created_at, o.id`,
    id,
  );
  const firstReply = messages.find((m) => m.kind === 'staff_reply')?.created_at ?? null;
  const status = e.status as Status;
  const draft = get<{ channel: Channel; subject: string | null; body: string; updated_at: string; by: string }>(
    db, 'SELECT d.channel, d.subject, d.body, d.updated_at, (SELECT a.name FROM staff_users a WHERE a.id = d.updated_by) AS by FROM reply_drafts d WHERE d.enquiry_id = ?', id,
  );

  return {
    enquiry,
    package: { title: str('title'), code: str('code'), slug: str('slug'), versionNo: e.version_no as number, isLive: e.is_live === 1 },
    status,
    assigneeId: (e.assignee_id as number | null) ?? null,
    assigneeName: strOrNull('assignee_name'),
    lockVersion: e.lock_version as number,
    sla: slaFor({ createdAt: enquiry.createdAt, firstReplyAt: firstReply, status, now }),
    channels: replyChannels(enquiry),
    draft: draft ? { channel: draft.channel, subject: draft.subject, body: draft.body, updatedByName: draft.by, updatedAt: draft.updated_at } : null,
    notes: all<{ id: number; author: string; body: string; created_at: string }>(
      db, 'SELECT n.id, (SELECT a.name FROM staff_users a WHERE a.id = n.author_id) AS author, n.body, n.created_at FROM enquiry_notes n WHERE n.enquiry_id = ? ORDER BY n.id DESC', id,
    ).map((n) => ({ id: n.id, authorName: n.author, body: n.body, createdAt: n.created_at })),
    messages: messages.map((m) => ({
      id: m.id, kind: m.kind, channel: m.channel, recipient: m.recipient, subject: m.subject, body: m.body, createdAt: m.created_at, approvedByName: m.approver,
    })),
    activity: all<{ at: string; actor: string | null; action: string; meta_json: string | null }>(
      db,
      `SELECT l.at, (SELECT a.name FROM staff_users a WHERE a.id = l.actor_id) AS actor, l.action, l.meta_json
         FROM audit_log l WHERE l.entity = 'enquiry' AND l.entity_id = ? ORDER BY l.id DESC`,
      id,
    ).map((l) => ({ at: l.at, actorName: l.actor, action: l.action, meta: l.meta_json ? (JSON.parse(l.meta_json) as Record<string, string | number | boolean | null>) : {} })),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

interface WorkflowRow {
  status: Status;
  assignee_id: number | null;
  lock_version: number;
}

function loadWorkflow(db: DatabaseSync, enquiryId: number): WorkflowRow {
  const row = get<WorkflowRow>(db, 'SELECT status, assignee_id, lock_version FROM enquiry_workflow WHERE enquiry_id = ?', enquiryId);
  if (!row) throw new DomainError('not_found', 'That enquiry does not exist.');
  return row;
}

function checkLock(row: WorkflowRow, expected: number): void {
  if (row.lock_version !== expected) {
    throw new DomainError('conflict', 'Someone else changed this enquiry after you opened it. Reload the page to see the latest version, then try again.');
  }
}

function bump(db: DatabaseSync, enquiryId: number, at: string, set = 'enquiry_id = enquiry_id', ...params: Param[]): void {
  run(db, `UPDATE enquiry_workflow SET ${set}, lock_version = lock_version + 1, updated_at = ? WHERE enquiry_id = ?`, ...params, at, enquiryId);
}

/** Consultants can take an unassigned enquiry or release their own. Only admins can assign to someone else or take over. */
export function mayAssign(actor: Pick<StaffUser, 'id' | 'role'>, current: number | null, target: number | null): boolean {
  if (actor.role === 'admin') return true;
  if (target === actor.id) return current === null || current === actor.id;
  return target === null && current === actor.id;
}

export function assignEnquiry(
  db: DatabaseSync, actor: StaffUser, args: { enquiryId: number; assigneeId: number | null; expectedLock: number }, now: Date,
): { changed: boolean } {
  return transaction(db, () => {
    const row = loadWorkflow(db, args.enquiryId);
    checkLock(row, args.expectedLock);
    if (args.assigneeId !== null && !get(db, "SELECT 1 FROM staff_users WHERE id = ? AND active = 1 AND role IN ('admin', 'agent')", args.assigneeId)) {
      throw new DomainError('validation', 'Choose someone from the list.');
    }
    if (args.assigneeId === row.assignee_id) return { changed: false };
    if (!mayAssign(actor, row.assignee_id, args.assigneeId)) {
      throw new DomainError('forbidden', 'You can take an unassigned enquiry or release one you hold. Ask an admin to assign it to someone else.');
    }
    bump(db, args.enquiryId, now.toISOString(), 'assignee_id = ?', args.assigneeId);
    writeAudit(db, actor.id, 'enquiry.assign', 'enquiry', args.enquiryId, { from: row.assignee_id, to: args.assigneeId });
    return { changed: true };
  });
}

export function changeStatus(
  db: DatabaseSync, actor: StaffUser, args: { enquiryId: number; status: string; expectedLock: number }, now: Date,
): { changed: boolean } {
  if (!(SETTABLE_STATUSES as readonly string[]).includes(args.status)) {
    throw new DomainError('validation', 'Choose New, In progress or Closed. An enquiry becomes Replied when a reply is recorded.');
  }
  return transaction(db, () => {
    const row = loadWorkflow(db, args.enquiryId);
    checkLock(row, args.expectedLock);
    if (args.status === row.status) return { changed: false };
    bump(db, args.enquiryId, now.toISOString(), 'status = ?', args.status);
    writeAudit(db, actor.id, 'enquiry.status', 'enquiry', args.enquiryId, { from: row.status, to: args.status });
    return { changed: true };
  });
}

export function addNote(db: DatabaseSync, actor: StaffUser, args: { enquiryId: number; body: string }, now: Date): number {
  const body = cleanText(args.body, true);
  if (!body) throw new DomainError('validation', 'Write a note first.');
  if (body.length > TRIAGE_LIMITS.note) throw new DomainError('validation', `Keep a note to ${TRIAGE_LIMITS.note} characters or fewer. It is ${body.length} now.`);
  return transaction(db, () => {
    loadWorkflow(db, args.enquiryId);
    const noteId = Number(run(db, 'INSERT INTO enquiry_notes (enquiry_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', args.enquiryId, actor.id, body, now.toISOString()).lastInsertRowid);
    writeAudit(db, actor.id, 'enquiry.note', 'enquiry', args.enquiryId, { note_id: noteId });
    return noteId;
  });
}

export interface ReplyInput {
  enquiryId: number;
  channel: string;
  subject: string;
  body: string;
}

interface CheckedReply {
  channel: Channel;
  recipient: string;
  subject: string | null;
  body: string;
}

/** Validates a reply against the enquiry's real contact details. The recipient is never taken from the request. */
function checkReply(db: DatabaseSync, input: ReplyInput): CheckedReply & { reference: string } {
  const e = get<{ reference: string; email: string | null; phone: string | null; whatsapp_consent: number }>(
    db, 'SELECT reference, email, phone, whatsapp_consent FROM enquiries WHERE id = ?', input.enquiryId,
  );
  if (!e) throw new DomainError('not_found', 'That enquiry does not exist.');
  const option = replyChannels({ email: e.email, phone: e.phone, whatsappConsent: e.whatsapp_consent === 1 }).find((c) => c.channel === input.channel);
  if (!option) throw new DomainError('validation', 'Choose one of the listed ways to reach this traveller.');
  const body = cleanText(input.body, true);
  if (!body) throw new DomainError('validation', 'Write the reply first.');
  if (body.length > TRIAGE_LIMITS.reply) throw new DomainError('validation', `Keep a reply to ${TRIAGE_LIMITS.reply} characters or fewer. It is ${body.length} now.`);
  let subject: string | null = null;
  if (option.channel === 'email') {
    subject = cleanText(input.subject) || `Your enquiry (${e.reference})`;
    if (subject.length > TRIAGE_LIMITS.subject) throw new DomainError('validation', `Keep the subject to ${TRIAGE_LIMITS.subject} characters or fewer.`);
  }
  return { channel: option.channel, recipient: option.recipient, subject, body, reference: e.reference };
}

/** Saves the working draft (one per enquiry). Advances lock_version so stale pages conflict. Nothing is recorded as a message and nothing is sent. */
export function saveReplyDraft(
  db: DatabaseSync, actor: StaffUser, input: ReplyInput & { expectedLock: number }, now: Date,
): void {
  transaction(db, () => {
    const row = loadWorkflow(db, input.enquiryId);
    checkLock(row, input.expectedLock);
    if (row.status === 'closed') throw new DomainError('invalid_state', 'This enquiry is closed. Reopen it before drafting a reply.');
    const r = checkReply(db, input);
    run(
      db,
      `INSERT INTO reply_drafts (enquiry_id, channel, subject, body, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (enquiry_id) DO UPDATE SET channel = excluded.channel, subject = excluded.subject, body = excluded.body,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      input.enquiryId, r.channel, r.subject, r.body, actor.id, now.toISOString(),
    );
    bump(db, input.enquiryId, now.toISOString());
    writeAudit(db, actor.id, 'enquiry.reply_draft', 'enquiry', input.enquiryId, { channel: r.channel });
  });
}

/**
 * The human approval step. `approved` must be an explicit true: the caller passes it only when the staff member
 * ticked the confirmation. The reply is stored in the mock outbox (delivery 'mock_recorded'); it is not sent.
 * The enquiry moves to Replied, and `expectedLock` makes a double submit or a stale page fail instead of recording twice.
 */
export function recordReply(
  db: DatabaseSync, actor: StaffUser, input: ReplyInput & { approved: boolean; expectedLock: number }, now: Date,
): { messageId: number } {
  if (input.approved !== true) throw new DomainError('validation', 'Tick the box to confirm that you have read this reply and approve recording it.');
  return transaction(db, () => {
    const row = loadWorkflow(db, input.enquiryId);
    checkLock(row, input.expectedLock);
    if (row.status === 'closed') throw new DomainError('invalid_state', 'This enquiry is closed. Reopen it before recording a reply.');
    const r = checkReply(db, input);
    const at = now.toISOString();
    const messageId = Number(
      run(
        db,
        `INSERT INTO outbox_messages (enquiry_id, kind, channel, recipient, subject, body, template_version, approved_by, created_at)
         VALUES (?, 'staff_reply', ?, ?, ?, ?, 'staff-written-1', ?, ?)`,
        input.enquiryId, r.channel, r.recipient, r.subject, r.body, actor.id, at,
      ).lastInsertRowid,
    );
    run(db, 'DELETE FROM reply_drafts WHERE enquiry_id = ?', input.enquiryId);
    bump(db, input.enquiryId, at, "status = 'replied'");
    writeAudit(db, actor.id, 'enquiry.reply_recorded', 'enquiry', input.enquiryId, { message_id: messageId, channel: r.channel, status_from: row.status });
    return { messageId };
  });
}

// ---------------------------------------------------------------------------
// Activity log (admin)
// ---------------------------------------------------------------------------

export interface ActivityRow {
  id: number;
  at: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: number;
  /** The enquiry's reference when the entity is an enquiry. */
  enquiryReference: string | null;
  meta: Record<string, string | number | boolean | null>;
}

export const ACTIVITY_LIMIT = 100;

export function listActivity(db: DatabaseSync): ActivityRow[] {
  return all<{ id: number; at: string; actor: string | null; action: string; entity: string; entity_id: number; reference: string | null; meta_json: string | null }>(
    db,
    `SELECT l.id, l.at, (SELECT a.name FROM staff_users a WHERE a.id = l.actor_id) AS actor, l.action, l.entity, l.entity_id,
            CASE WHEN l.entity = 'enquiry' THEN (SELECT e.reference FROM enquiries e WHERE e.id = l.entity_id) END AS reference, l.meta_json
       FROM audit_log l ORDER BY l.id DESC LIMIT ?`,
    ACTIVITY_LIMIT,
  ).map((l) => ({
    id: l.id, at: l.at, actorName: l.actor, action: l.action, entity: l.entity, entityId: l.entity_id, enquiryReference: l.reference,
    meta: l.meta_json ? (JSON.parse(l.meta_json) as ActivityRow['meta']) : {},
  }));
}
