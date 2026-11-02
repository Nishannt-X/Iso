import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { DatabaseSync } from '../db/db.js';
import { DomainError } from '../domain/packages.js';
import { RateLimiter } from '../domain/rate-limit.js';
import {
  authenticate, csrfMatches, endSession, listAssignable, resolveSession, startSession, type StaffSession, type StaffUser,
} from '../domain/staff.js';
import { ACTIVITY_LIMIT, addNote, assignEnquiry, changeStatus, getWorkspace, listActivity, listInbox, parseInboxQuery, recordReply, saveReplyDraft } from '../domain/triage.js';
import type { PageContext } from './pages.js';
import { clientKey, isSameSite } from './request.js';
import { ActivityPage, InboxPageView, LoginPage, StaffMessage, type Viewer } from './staff-pages.js';
import { DONE_TEXT, WorkspacePage, type ProblemArea, type Retained } from './workspace-page.js';

// Staff area (slice S4), all under /staff:
//   GET/POST /staff/login, POST /staff/logout
//   GET /staff/inbox                     filterable, paginated list        (admin, agent)
//   GET /staff/enquiries/:id             workspace                         (admin, agent)
//   POST /staff/enquiries/:id/{assign,status,notes,reply/draft,reply/record}   (admin, agent; assignment rules in triage.ts)
//   GET /staff/activity                  audit trail                       (admin only)
//
// One gate runs before every route except sign-in: it needs a valid session, and for every POST it requires the
// session's CSRF token and a same-site Origin. Role checks are enforced on the server, not by hiding links.

export interface LoginLimits {
  /** Failed sign-ins per client address per window. */
  perClient: number;
  /** Failed sign-ins per email text per window, whether or not the account exists. */
  perEmail: number;
  windowMs: number;
}

export const DEFAULT_LOGIN_LIMITS: LoginLimits = { perClient: 10, perEmail: 5, windowMs: 15 * 60_000 };

export interface StaffRouteOptions {
  now: () => Date;
  trustProxy: boolean;
  /** True when SITE_URL is https: the session cookie is then Secure and uses the __Host- prefix. */
  secureCookies: boolean;
  loginLimits: LoginLimits;
}

export interface StaffEnv {
  Variables: { session: StaffSession };
}

type ErrorStatus = 400 | 403 | 404 | 409 | 413 | 422 | 429;

const doc = (el: { toString(): string }): string => `<!DOCTYPE html>${el.toString()}`;
const BODY_LIMIT_BYTES = 32 * 1024;
const ID = /^\d{1,9}$/;
/** Where sign-in may send someone afterwards: a path under /staff, nothing else (no query, no other host). */
const SAFE_NEXT = /^\/staff\/[a-z0-9/-]{1,100}$/;
const safeNext = (v: unknown): string | undefined => (typeof v === 'string' && SAFE_NEXT.test(v) && !v.includes('//') ? v : undefined);
const text = (body: Record<string, unknown>, key: string): string => (typeof body[key] === 'string' ? (body[key] as string) : '');

const DOMAIN_STATUS: Record<DomainError['code'], ErrorStatus> = {
  validation: 422, conflict: 409, forbidden: 403, invalid_state: 409, not_found: 404, draft_exists: 409, slug_locked: 409,
};

export function registerStaffRoutes(app: Hono, db: DatabaseSync, ctx: PageContext, options: StaffRouteOptions): void {
  const staff = new Hono<StaffEnv>();
  const siteOrigin = new URL(ctx.siteUrl).origin;
  const cookieName = options.secureCookies ? '__Host-kochi_staff' : 'kochi_staff';
  const { loginLimits: limits } = options;
  const failedByClient = new RateLimiter(limits.perClient, limits.windowMs);
  const failedByEmail = new RateLimiter(limits.perEmail, limits.windowMs);

  const viewerOf = (s: StaffSession): Viewer => ({ id: s.user.id, name: s.user.name, role: s.user.role, csrfToken: s.csrfToken });
  const page = (c: Context, el: { toString(): string }, status: 200 | ErrorStatus = 200) => c.html(doc(el), status);
  const message = (c: Context, status: ErrorStatus, title: string, body: string, viewer: Viewer | null, link?: { href: string; text: string }, headers?: Record<string, string>) =>
    c.html(doc(<StaffMessage ctx={ctx} viewer={viewer} title={title} body={body} linkHref={link?.href} linkText={link?.text} />), status, headers);
  const sessionViewer = (c: Context<StaffEnv>): Viewer => viewerOf(c.get('session'));

  // Staff pages hold personal data: never cached, never indexed.
  staff.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');
    await next();
  });

  const limitBody = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => message(c, 413, 'That was too large', 'What you sent was too large. Please shorten it and try again.', null),
  });
  staff.use('*', (c, next) => (c.req.method === 'POST' ? limitBody(c, next) : next()));

  // The gate: a valid session for every route except sign-in; a CSRF token and same-site Origin for every POST.
  staff.use('*', createMiddleware<StaffEnv>(async (c, next) => {
    if (c.req.path === '/staff/login') return next();
    const token = getCookie(c, cookieName);
    const session = resolveSession(db, token, options.now());
    if (!session) {
      if (token) deleteCookie(c, cookieName, { path: '/', secure: options.secureCookies });
      const next_ = c.req.method === 'GET' ? safeNext(c.req.path) : undefined;
      return c.redirect(`/staff/login${next_ ? `?next=${encodeURIComponent(next_)}` : ''}`, 303);
    }
    c.set('session', session);
    if (c.req.method === 'POST') {
      if (!isSameSite(c, siteOrigin, true)) {
        return message(c, 403, 'We could not do that', 'The request did not come from this site. Open the page here and try again.', viewerOf(session));
      }
      let body: Record<string, unknown>;
      try {
        body = await c.req.parseBody();
      } catch {
        return message(c, 400, 'We could not read that', 'The form could not be read. Please try again.', viewerOf(session));
      }
      if (!csrfMatches(session, body._csrf)) {
        return message(c, 403, 'This page has expired', 'For your safety the form was not accepted. Reload the page and try again.', viewerOf(session), { href: '/staff/inbox', text: 'Back to the inbox' });
      }
    }
    return next();
  }));

  const adminOnly = createMiddleware<StaffEnv>(async (c, next) => {
    if (c.get('session').user.role !== 'admin') {
      return message(c, 403, 'No access', 'Your role does not include this page.', sessionViewer(c), { href: '/staff/inbox', text: 'Back to the inbox' });
    }
    return next();
  });

  // ---- sign in and out ----------------------------------------------------

  staff.get('/login', (c) => {
    if (resolveSession(db, getCookie(c, cookieName), options.now())) return c.redirect('/staff/inbox', 303);
    return page(c, <LoginPage ctx={ctx} next={safeNext(c.req.query('next'))} />);
  });

  staff.post('/login', async (c) => {
    if (!isSameSite(c, siteOrigin, true)) {
      return message(c, 403, 'We could not do that', 'The request did not come from this site. Open the sign-in page here and try again.', null);
    }
    let body: Record<string, unknown>;
    try {
      body = await c.req.parseBody();
    } catch {
      return message(c, 400, 'We could not read that', 'The form could not be read. Please try again.', null);
    }
    const email = text(body, 'email').slice(0, 254);
    const password = text(body, 'password');
    const next = safeNext(text(body, 'next'));
    const now = options.now();
    const t = now.getTime();
    const client = clientKey(c, options.trustProxy);
    const emailKey = email.trim().toLowerCase();

    // Throttle on the text typed, not on whether the account exists, so the answer reveals nothing about accounts.
    const blocked = [failedByClient.check(client, t), failedByEmail.check(emailKey, t)].find((r) => !r.allowed);
    if (blocked) {
      c.header('Retry-After', String(blocked.retryAfterSec));
      return page(c, <LoginPage ctx={ctx} email={email} next={next} error={`Too many sign-in attempts. Please wait ${Math.ceil(blocked.retryAfterSec / 60)} minute(s) and try again.`} />, 429);
    }

    const user = await authenticate(db, email, password);
    if (!user) {
      failedByClient.record(client, t);
      failedByEmail.record(emailKey, t);
      return page(c, <LoginPage ctx={ctx} email={email} next={next} error="The email or password is not correct." />, 422);
    }
    const session = startSession(db, user, now);
    setCookie(c, cookieName, session.token, { httpOnly: true, secure: options.secureCookies, sameSite: 'Lax', path: '/', maxAge: session.maxAgeSec });
    return c.redirect(next ?? '/staff/inbox', 303);
  });

  staff.post('/logout', (c) => {
    endSession(db, getCookie(c, cookieName), c.get('session').user.id);
    deleteCookie(c, cookieName, { path: '/', secure: options.secureCookies });
    return c.redirect('/staff/login', 303);
  });

  staff.get('/', (c) => c.redirect('/staff/inbox', 303));

  // ---- inbox --------------------------------------------------------------

  staff.get('/inbox', (c) => {
    const parsed = parseInboxQuery(new URL(c.req.url).searchParams);
    if (!parsed.ok) return message(c, 400, 'That filter is not valid', parsed.message, sessionViewer(c), { href: '/staff/inbox', text: 'Back to the inbox' });
    const viewer = sessionViewer(c);
    const data = listInbox(db, parsed.query, viewer.id, options.now());
    return page(c, <InboxPageView ctx={ctx} viewer={viewer} data={data} query={parsed.query} staff={listAssignable(db)} />);
  });

  // ---- workspace ----------------------------------------------------------

  const workspaceResponse = (c: Context<StaffEnv>, id: number, status: 200 | ErrorStatus, extra: { problem?: { area: ProblemArea; message: string }; retained?: Retained; saved?: string } = {}) => {
    const ws = getWorkspace(db, id, options.now());
    if (!ws) return message(c, 404, 'Enquiry not found', 'There is no enquiry with that number.', sessionViewer(c), { href: '/staff/inbox', text: 'Back to the inbox' });
    return page(c, <WorkspacePage ctx={ctx} viewer={sessionViewer(c)} ws={ws} staff={listAssignable(db)} {...extra} />, status);
  };

  staff.get('/enquiries/:id', (c) => {
    const raw = c.req.param('id');
    if (!ID.test(raw)) return workspaceResponse(c, 0, 200);
    const done = c.req.query('done');
    return workspaceResponse(c, Number(raw), 200, { saved: done !== undefined && Object.hasOwn(DONE_TEXT, done) ? DONE_TEXT[done] : undefined });
  });

  /** Runs one workspace write. A refused write re-renders the workspace with the reason and the typed text kept. */
  const act = async (c: Context<StaffEnv>, area: ProblemArea, apply: (body: Record<string, unknown>, user: StaffUser, id: number, now: Date) => keyof typeof DONE_TEXT) => {
    const raw = c.req.param('id') ?? '';
    if (!ID.test(raw)) return workspaceResponse(c, 0, 200);
    const id = Number(raw);
    const body = await c.req.parseBody(); // already parsed and cached by the gate
    try {
      return c.redirect(`/staff/enquiries/${id}?done=${apply(body, c.get('session').user, id, options.now())}`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      const retained: Retained = area === 'note' ? { note: text(body, 'body') } : area === 'reply' ? { reply: { channel: text(body, 'channel'), subject: text(body, 'subject'), body: text(body, 'body') } } : {};
      return workspaceResponse(c, id, DOMAIN_STATUS[err.code], { problem: { area, message: err.message }, retained });
    }
  };

  const lockOf = (body: Record<string, unknown>): number => {
    const v = text(body, 'lock');
    if (!ID.test(v)) throw new DomainError('conflict', 'This page is out of date. Reload it and try again.');
    return Number(v);
  };

  staff.post('/enquiries/:id/assign', (c) =>
    act(c, 'assign', (body, user, id, now) => {
      const choice = text(body, 'assignee');
      if (choice !== 'none' && !ID.test(choice)) throw new DomainError('validation', 'Choose someone from the list.');
      const { changed } = assignEnquiry(db, user, { enquiryId: id, assigneeId: choice === 'none' ? null : Number(choice), expectedLock: lockOf(body) }, now);
      return changed ? 'assigned' : 'nochange';
    }),
  );

  staff.post('/enquiries/:id/status', (c) =>
    act(c, 'status', (body, user, id, now) => (changeStatus(db, user, { enquiryId: id, status: text(body, 'status'), expectedLock: lockOf(body) }, now).changed ? 'status' : 'nochange')),
  );

  staff.post('/enquiries/:id/notes', (c) =>
    act(c, 'note', (body, user, id, now) => {
      addNote(db, user, { enquiryId: id, body: text(body, 'body') }, now);
      return 'note';
    }),
  );

  const replyInput = (body: Record<string, unknown>, id: number) => ({ enquiryId: id, channel: text(body, 'channel'), subject: text(body, 'subject'), body: text(body, 'body') });

  staff.post('/enquiries/:id/reply/draft', (c) =>
    act(c, 'reply', (body, user, id, now) => {
      saveReplyDraft(db, user, { ...replyInput(body, id), expectedLock: lockOf(body) }, now);
      return 'draft';
    }),
  );

  staff.post('/enquiries/:id/reply/record', (c) =>
    act(c, 'reply', (body, user, id, now) => {
      recordReply(db, user, { ...replyInput(body, id), approved: text(body, 'approve') === 'yes', expectedLock: lockOf(body) }, now);
      return 'recorded';
    }),
  );

  // ---- activity (admin only) ----------------------------------------------

  staff.get('/activity', adminOnly, (c) => page(c, <ActivityPage ctx={ctx} viewer={sessionViewer(c)} rows={listActivity(db)} limit={ACTIVITY_LIMIT} />));

  app.route('/staff', staff);
}
