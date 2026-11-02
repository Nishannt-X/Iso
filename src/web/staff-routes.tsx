import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { get, type DatabaseSync } from '../db/db.js';
import { createEnquiry, emptyForm, indiaToday, newSubmissionKey, validateEnquiry, FIELDS, type RawForm } from '../domain/enquiries.js';
import { acceptAnalysis, analyseEnquiry, getAnalysis, type ExtractedFields } from '../domain/analysis.js';
import { createBlog, listStaffBlogs, publishBlog, saveBlogDraft, startBlogRevision, type BlogRow } from '../domain/blog.js';
import { emptyPackageForm, formFromBody, formFromVersion, parsePackageForm } from '../domain/package-form.js';
import { createPackage, DomainError, listLiveVersions, listPackageHistory, listPackagesForStaff, publish, restoreVersion, saveDraft, type PackageAdminRow } from '../domain/packages.js';
import { cancelPublication, getPublicationSchedule, schedulePublication } from '../domain/publication-schedule.js';
import { RateLimiter } from '../domain/rate-limit.js';
import { approvePackageQuote, createPackageQuote, getQuote, listQuotes, recordPackageQuote } from '../domain/package-quotes.js';
import {
  authenticate, csrfMatches, endSession, listAssignable, resolveSession, startSession, type StaffSession, type StaffUser,
} from '../domain/staff.js';
import { ACTIVITY_LIMIT, addNote, assignEnquiry, changeStatus, getWorkspace, listActivity, listInbox, parseInboxQuery, recordReply, saveReplyDraft } from '../domain/triage.js';
import { PackageEditorPage, PackageHistoryPage, PackageListPage } from './package-cms-pages.js';
import { BlogArticlePage, BlogEditorPage, BlogStaffDetailPage, BlogStaffListPage, blogContentFromForm, blogFormFromVersion, emptyBlogForm, type BlogForm } from './blog-pages.js';
import { PackagePage, type PageContext } from './pages.js';
import { clientKey, isSameSite } from './request.js';
import { ActivityPage, InboxPageView, LoginPage, StaffMessage, type Viewer } from './staff-pages.js';
import { DONE_TEXT, WorkspacePage, type ProblemArea, type Retained } from './workspace-page.js';
import { QuoteBuilderPage, StaffQuotePage } from './quote-pages.js';
import { IntakePage } from './intake-page.js';

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
  geminiApiKey: string | null;
}

export interface StaffEnv {
  Variables: { session: StaffSession };
}

type ErrorStatus = 400 | 403 | 404 | 409 | 413 | 422 | 429;

const doc = (el: { toString(): string }): string => `<!DOCTYPE html>${el.toString()}`;
const BODY_LIMIT_BYTES = 256 * 1024; // a 60-day package itinerary can be much longer than an enquiry reply
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
    const active = resolveSession(db, getCookie(c, cookieName), options.now());
    if (active) return c.redirect(active.user.role === 'editor' ? '/staff/blogs' : '/staff/inbox', 303);
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
    return c.redirect(next ?? (user.role === 'editor' ? '/staff/blogs' : '/staff/inbox'), 303);
  });

  staff.post('/logout', (c) => {
    endSession(db, getCookie(c, cookieName), c.get('session').user.id);
    deleteCookie(c, cookieName, { path: '/', secure: options.secureCookies });
    return c.redirect('/staff/login', 303);
  });

  staff.get('/', (c) => c.redirect(c.get('session').user.role === 'editor' ? '/staff/blogs' : '/staff/inbox', 303));

  staff.use('*', createMiddleware<StaffEnv>(async (c, next) => {
    if (c.get('session').user.role === 'editor' && !c.req.path.startsWith('/staff/blogs')) {
      return message(c, 403, 'No access', 'Content editors work in the journal.', sessionViewer(c), { href: '/staff/blogs', text: 'Open journal' });
    }
    return next();
  }));

  // ---- inbox --------------------------------------------------------------

  staff.get('/inbox', (c) => {
    const parsed = parseInboxQuery(new URL(c.req.url).searchParams);
    if (!parsed.ok) return message(c, 400, 'That filter is not valid', parsed.message, sessionViewer(c), { href: '/staff/inbox', text: 'Back to the inbox' });
    const viewer = sessionViewer(c);
    const data = listInbox(db, parsed.query, viewer.id, options.now());
    return page(c, <InboxPageView ctx={ctx} viewer={viewer} data={data} query={parsed.query} staff={listAssignable(db)} />);
  });

  staff.get('/intake/new', (c) => {
    const versions = listLiveVersions(db);
    return page(c, <IntakePage ctx={ctx} viewer={sessionViewer(c)} packages={versions} fields={emptyForm()} packageSlug={versions[0]?.packageSlug ?? ''} channel="email" />);
  });
  staff.post('/intake/new', async (c) => {
    const body = await c.req.parseBody();
    const fields = emptyForm();
    for (const key of FIELDS) fields[key] = text(body, key);
    const versions = listLiveVersions(db);
    const slug = text(body, 'package');
    const channel = text(body, 'channel');
    const show = (error: string) => page(c, <IntakePage ctx={ctx} viewer={sessionViewer(c)} packages={versions} fields={fields} packageSlug={slug} channel={channel} error={error} />, 422);
    if (!['email','chat','whatsapp','phone'].includes(channel)) return show('Choose an external channel.');
    const version = versions.find((v) => v.packageSlug === slug);
    if (!version) return show('Choose a published package.');
    const parsed = validateEnquiry(fields as RawForm, indiaToday(options.now()));
    if (!parsed.ok) return show(Object.values(parsed.errors).join(' '));
    if (channel === 'email' && !parsed.value.email) return show('An email enquiry needs an email address.');
    if ((channel === 'phone' || channel === 'whatsapp') && !parsed.value.phone) return show('A phone or WhatsApp enquiry needs a phone number.');
    try {
      const result = createEnquiry(db, { input: parsed.value, versionId: version.id, submissionKey: newSubmissionKey(), intakeChannel: channel as 'email' | 'chat' | 'whatsapp' | 'phone', enteredBy: c.get('session').user.id, now: options.now() });
      const id = get<{ id: number }>(db, 'SELECT id FROM enquiries WHERE reference=?', result.reference)?.id;
      return c.redirect(id ? `/staff/enquiries/${id}` : '/staff/inbox', 303);
    } catch (err) { if (!(err instanceof DomainError)) throw err; return show(err.message); }
  });

  // ---- workspace ----------------------------------------------------------

  const workspaceResponse = (c: Context<StaffEnv>, id: number, status: 200 | ErrorStatus, extra: { problem?: { area: ProblemArea; message: string }; retained?: Retained; saved?: string } = {}) => {
    const ws = getWorkspace(db, id, options.now());
    if (!ws) return message(c, 404, 'Enquiry not found', 'There is no enquiry with that number.', sessionViewer(c), { href: '/staff/inbox', text: 'Back to the inbox' });
    return page(c, <WorkspacePage ctx={ctx} viewer={sessionViewer(c)} ws={ws} staff={listAssignable(db)} analysis={getAnalysis(db, id)} quotes={listQuotes(db, id)} {...extra} />, status);
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

  // ---- quote builder: stored pricing snapshot, human approval, mock send ---

  const quoteId = (raw: string | undefined) => raw && ID.test(raw) ? Number(raw) : 0;
  staff.get('/quotes/new', (c) => {
    const id = quoteId(c.req.query('enquiry'));
    const ws = getWorkspace(db, id, options.now());
    if (!ws) return message(c, 404, 'Enquiry not found', 'Choose an enquiry from the inbox.', sessionViewer(c));
    const versions = listLiveVersions(db);
    return page(c, <QuoteBuilderPage ctx={ctx} viewer={sessionViewer(c)} enquiryId={id} versions={versions} defaults={{ slug: ws.package.isLive ? ws.package.slug : versions[0]?.packageSlug ?? '', date: ws.enquiry.travelStart ?? '', adults: ws.enquiry.adults, children: ws.enquiry.children }} />);
  });
  staff.post('/quotes/new', async (c) => {
    const body = await c.req.parseBody();
    const id = quoteId(text(body, 'enquiryId'));
    const ws = getWorkspace(db, id, options.now());
    if (!ws) return message(c, 404, 'Enquiry not found', 'Choose an enquiry from the inbox.', sessionViewer(c));
    const defaults = { slug: text(body, 'slug'), date: text(body, 'date'), adults: Number(text(body, 'adults')), children: Number(text(body, 'children')) };
    try { const created = createPackageQuote(db, { enquiryId: id, slug: defaults.slug, startDate: defaults.date, adults: defaults.adults, children: defaults.children, actorId: c.get('session').user.id, now: options.now() }); return c.redirect(`/staff/quotes/${created}`, 303); }
    catch (err) { if (!(err instanceof DomainError)) throw err; return page(c, <QuoteBuilderPage ctx={ctx} viewer={sessionViewer(c)} enquiryId={id} versions={listLiveVersions(db)} defaults={defaults} error={err.message} />, DOMAIN_STATUS[err.code]); }
  });
  staff.get('/quotes/:id', (c) => {
    const row = getQuote(db, quoteId(c.req.param('id')));
    return row ? page(c, <StaffQuotePage ctx={ctx} viewer={sessionViewer(c)} row={row} />) : message(c, 404, 'Quote not found', 'That quote does not exist.', sessionViewer(c));
  });
  staff.post('/quotes/:id/approve', async (c) => {
    const id = quoteId(c.req.param('id'));
    const row = getQuote(db, id);
    if (!row) return message(c, 404, 'Quote not found', 'That quote does not exist.', sessionViewer(c));
    const body = await c.req.parseBody();
    if (text(body, 'review') !== 'yes') return page(c, <StaffQuotePage ctx={ctx} viewer={sessionViewer(c)} row={row} error="Review and confirm the fare before approval." />, 422);
    try { approvePackageQuote(db, id, c.get('session').user.id); return c.redirect(`/staff/quotes/${id}`, 303); }
    catch (err) { if (!(err instanceof DomainError)) throw err; return page(c, <StaffQuotePage ctx={ctx} viewer={sessionViewer(c)} row={row} error={err.message} />, DOMAIN_STATUS[err.code]); }
  });
  staff.post('/quotes/:id/record', (c) => {
    const id = quoteId(c.req.param('id'));
    const row = getQuote(db, id);
    if (!row) return message(c, 404, 'Quote not found', 'That quote does not exist.', sessionViewer(c));
    try { recordPackageQuote(db, id, c.get('session').user.id); return c.redirect(`/staff/quotes/${id}`, 303); }
    catch (err) { if (!(err instanceof DomainError)) throw err; return page(c, <StaffQuotePage ctx={ctx} viewer={sessionViewer(c)} row={row} error={err.message} />, DOMAIN_STATUS[err.code]); }
  });

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

  staff.post('/enquiries/:id/analyse', async (c) => {
    const raw = c.req.param('id');
    if (!ID.test(raw)) return workspaceResponse(c, 0, 404);
    const id = Number(raw);
    if (!getWorkspace(db, id, options.now())) return workspaceResponse(c, id, 404);
    try {
      await analyseEnquiry(db, id, options.geminiApiKey, options.now());
      return c.redirect(`/staff/enquiries/${id}?done=analysed#analysis`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      return workspaceResponse(c, id, DOMAIN_STATUS[err.code], { problem: { area: 'analysis', message: err.message } });
    }
  });
  staff.post('/enquiries/:id/analysis/accept', async (c) => {
    const raw = c.req.param('id');
    if (!ID.test(raw)) return workspaceResponse(c, 0, 404);
    const id = Number(raw);
    const current = getAnalysis(db, id);
    if (!current) return workspaceResponse(c, id, 404, { problem: { area: 'analysis', message: 'Run analysis first.' } });
    const body = await c.req.parseBody();
    const optionalNumber = (key: string): number | null => text(body, key).trim() ? Number(text(body, key)) : null;
    const fields: ExtractedFields = {
      date: text(body, 'date').trim() || null, month: optionalNumber('month'), adults: optionalNumber('adults'), children: optionalNumber('children'),
      destination: text(body, 'destination').trim() || null, budgetInr: optionalNumber('budgetInr'),
      budgetBasis: text(body, 'budgetBasis') === 'total' || text(body, 'budgetBasis') === 'per_person' ? text(body, 'budgetBasis') as 'total' | 'per_person' : null,
      mustHave: text(body, 'mustHave').trim() || null, evidence: current.fields.evidence,
    };
    try {
      acceptAnalysis(db, id, c.get('session').user.id, fields, options.now());
      return c.redirect(`/staff/enquiries/${id}?done=accepted#analysis`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      return workspaceResponse(c, id, DOMAIN_STATUS[err.code], { problem: { area: 'analysis', message: err.message } });
    }
  });

  // ---- journal CMS (admins approve, editors prepare drafts) ---------------

  const blogRow = (raw: string | undefined): BlogRow | undefined => raw && ID.test(raw) ? listStaffBlogs(db).find((p) => p.id === Number(raw)) : undefined;
  const blogMissing = (c: Context<StaffEnv>) => message(c, 404, 'Article not found', 'That article does not exist.', sessionViewer(c), { href: '/staff/blogs', text: 'All articles' });
  const blogForm = (body: Record<string, unknown>): BlogForm => {
    const form = emptyBlogForm();
    for (const key of Object.keys(form) as (keyof BlogForm)[]) form[key] = text(body, key);
    return form;
  };
  const blogDetail = (c: Context<StaffEnv>, row: BlogRow, error?: string, done?: string, status: 200 | ErrorStatus = 200) =>
    page(c, <BlogStaffDetailPage ctx={ctx} viewer={sessionViewer(c)} row={row} error={error} done={done} />, status);
  const contentOnly = createMiddleware<StaffEnv>(async (c, next) => c.get('session').user.role === 'agent'
    ? message(c, 403, 'No access', 'Consultants work in the enquiry inbox.', sessionViewer(c), { href: '/staff/inbox', text: 'Open inbox' }) : next());

  staff.get('/blogs', contentOnly, (c) => page(c, <BlogStaffListPage ctx={ctx} viewer={sessionViewer(c)} rows={listStaffBlogs(db)} />));
  staff.get('/blogs/new', contentOnly, (c) => page(c, <BlogEditorPage ctx={ctx} viewer={sessionViewer(c)} form={emptyBlogForm()} />));
  staff.post('/blogs/new', contentOnly, async (c) => {
    const form = blogForm(await c.req.parseBody());
    try { const id = createBlog(db, form.slug.trim(), c.get('session').user.id, blogContentFromForm(form)); return c.redirect(`/staff/blogs/${id}?done=created`, 303); }
    catch (err) { if (!(err instanceof DomainError)) throw err; return page(c, <BlogEditorPage ctx={ctx} viewer={sessionViewer(c)} form={form} error={err.message} />, DOMAIN_STATUS[err.code]); }
  });
  staff.get('/blogs/:id', contentOnly, (c) => {
    const row = blogRow(c.req.param('id'));
    if (!row) return blogMissing(c);
    const done = c.req.query('done');
    const labels: Record<string, string> = { created: 'Article draft created.', saved: 'Draft saved.', published: 'Article published.', revised: 'Private revision started.' };
    return blogDetail(c, row, undefined, done ? labels[done] : undefined);
  });
  staff.get('/blogs/:id/edit', contentOnly, (c) => {
    const row = blogRow(c.req.param('id'));
    if (!row) return blogMissing(c);
    if (!row.draft) return blogDetail(c, row, 'Start a revision first.', undefined, 409);
    return page(c, <BlogEditorPage ctx={ctx} viewer={sessionViewer(c)} form={blogFormFromVersion(row.draft)} postId={row.id} lock={row.draft.lockVersion} />);
  });
  staff.post('/blogs/:id/edit', contentOnly, async (c) => {
    const row = blogRow(c.req.param('id'));
    if (!row) return blogMissing(c);
    const body = await c.req.parseBody();
    const form = blogForm(body);
    form.slug = row.slug;
    try { saveBlogDraft(db, row.id, parseLock(body), c.get('session').user.id, blogContentFromForm(form)); return c.redirect(`/staff/blogs/${row.id}?done=saved`, 303); }
    catch (err) { if (!(err instanceof DomainError)) throw err; return page(c, <BlogEditorPage ctx={ctx} viewer={sessionViewer(c)} form={form} postId={row.id} lock={ID.test(text(body, 'lock')) ? Number(text(body, 'lock')) : -1} error={err.message} />, DOMAIN_STATUS[err.code]); }
  });
  staff.get('/blogs/:id/preview', contentOnly, (c) => {
    const row = blogRow(c.req.param('id'));
    if (!row) return blogMissing(c);
    if (!row.draft) return blogDetail(c, row, 'There is no private draft to preview.', undefined, 409);
    const live = listLiveVersions(db);
    return page(c, <BlogArticlePage ctx={ctx} post={row.draft} related={live.filter((p) => row.draft!.relatedCodes.includes(p.packageCode))} previewId={row.id} />);
  });
  staff.post('/blogs/:id/revise', contentOnly, (c) => {
    const row = blogRow(c.req.param('id'));
    if (!row) return blogMissing(c);
    try { startBlogRevision(db, row.id, c.get('session').user.id); return c.redirect(`/staff/blogs/${row.id}/edit`, 303); }
    catch (err) { if (!(err instanceof DomainError)) throw err; return blogDetail(c, row, err.message, undefined, DOMAIN_STATUS[err.code]); }
  });
  staff.post('/blogs/:id/publish', adminOnly, async (c) => {
    const row = blogRow(c.req.param('id'));
    if (!row) return blogMissing(c);
    try { publishBlog(db, row.id, parseLock(await c.req.parseBody()), c.get('session').user.id); return c.redirect(`/staff/blogs/${row.id}?done=published`, 303); }
    catch (err) { if (!(err instanceof DomainError)) throw err; return blogDetail(c, row, err.message, undefined, DOMAIN_STATUS[err.code]); }
  });

  // ---- package CMS (admin only) ------------------------------------------

  const packageRow = (raw: string | undefined): PackageAdminRow | undefined =>
    raw && ID.test(raw) ? listPackagesForStaff(db).find((p) => p.id === Number(raw)) : undefined;
  const packageMissing = (c: Context<StaffEnv>) => message(c, 404, 'Package not found', 'That package does not exist.', sessionViewer(c), { href: '/staff/packages', text: 'All packages' });
  const packageHistory = (c: Context<StaffEnv>, row: PackageAdminRow, problem?: string, done?: string, status: 200 | ErrorStatus = 200) =>
    page(c, <PackageHistoryPage ctx={ctx} viewer={sessionViewer(c)} row={row} history={listPackageHistory(db, row.id)} schedule={getPublicationSchedule(db, row.id)} problem={problem} done={done} />, status);
  const cmsErrorStatus = (err: DomainError): ErrorStatus => DOMAIN_STATUS[err.code];
  const parseLock = (body: Record<string, unknown>): number => {
    const raw = text(body, 'lock');
    if (!ID.test(raw)) throw new DomainError('conflict', 'This page is out of date. Reload it and try again.');
    return Number(raw);
  };

  staff.get('/packages', adminOnly, (c) => page(c, <PackageListPage ctx={ctx} viewer={sessionViewer(c)} rows={listPackagesForStaff(db)} />));
  staff.get('/packages/new', adminOnly, (c) => page(c, <PackageEditorPage ctx={ctx} viewer={sessionViewer(c)} form={emptyPackageForm()} />));
  staff.post('/packages/new', adminOnly, async (c) => {
    const form = formFromBody(await c.req.parseBody());
    try {
      if (get(db, 'SELECT 1 FROM packages WHERE code = ? OR slug = ?', form.code.trim(), form.slug.trim())) {
        throw new DomainError('validation', 'That package code or URL is already in use.');
      }
      const created = createPackage(db, {
        code: form.code.trim(), slug: form.slug.trim(), dataOrigin: 'synthetic',
        actorId: c.get('session').user.id, content: parsePackageForm(form), changeNote: form.changeNote.trim(),
      });
      return c.redirect(`/staff/packages/${created.packageId}?done=created`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      return page(c, <PackageEditorPage ctx={ctx} viewer={sessionViewer(c)} form={form} error={err.message} issues={err.issues} />, cmsErrorStatus(err));
    }
  });

  staff.get('/packages/:id', adminOnly, (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    const done = c.req.query('done');
    const messages: Record<string, string> = { created: 'Package draft created.', saved: 'Draft saved.', published: 'Version published. The public page is updated.', restored: 'A private draft was restored.', scheduled: 'Publication scheduled.', cancelled: 'Scheduled publication cancelled.' };
    return packageHistory(c, row, undefined, done ? messages[done] : undefined);
  });
  staff.get('/packages/:id/edit', adminOnly, (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    if (!row.draft) return c.redirect(`/staff/packages/${row.id}`, 303);
    return page(c, <PackageEditorPage ctx={ctx} viewer={sessionViewer(c)} packageId={row.id} lock={row.draft.lockVersion} form={formFromVersion(row.draft)} />);
  });
  staff.post('/packages/:id/edit', adminOnly, async (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    if (!row.draft) return packageHistory(c, row, 'Start a revision before editing.', undefined, 409);
    const body = await c.req.parseBody();
    const form = formFromBody(body);
    form.code = row.code;
    form.slug = row.slug;
    try {
      const lock = parseLock(body);
      saveDraft(db, { versionId: row.draft.id, expectedLockVersion: lock, content: parsePackageForm(form), changeNote: form.changeNote.trim() });
      return c.redirect(`/staff/packages/${row.id}?done=saved`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      // Keep the submitted lock so a stale page cannot overwrite a colleague's newer draft on retry.
      const submittedLock = ID.test(text(body, 'lock')) ? Number(text(body, 'lock')) : -1;
      return page(c, <PackageEditorPage ctx={ctx} viewer={sessionViewer(c)} packageId={row.id} lock={submittedLock} form={form} error={err.message} issues={err.issues} />, cmsErrorStatus(err));
    }
  });
  staff.get('/packages/:id/preview', adminOnly, (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    if (!row.draft) return packageHistory(c, row, 'Start a revision before previewing.', undefined, 409);
    return page(c, <PackagePage v={row.draft} origin={row.origin} ctx={ctx} previewPackageId={row.id} />);
  });
  staff.post('/packages/:id/revise', adminOnly, (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    if (row.draft) return c.redirect(`/staff/packages/${row.id}/edit`, 303);
    if (!row.live) return packageHistory(c, row, 'There is no published version to revise.', undefined, 409);
    restoreVersion(db, { versionId: row.live.id, actorId: c.get('session').user.id });
    return c.redirect(`/staff/packages/${row.id}/edit`, 303);
  });
  staff.post('/packages/:id/duplicate', adminOnly, async (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    const source = row.live ?? row.draft;
    if (!source) return packageHistory(c, row, 'This package has no version to copy.', undefined, 409);
    const body = await c.req.parseBody();
    try {
      const code = text(body, 'code').trim();
      const slug = text(body, 'slug').trim();
      if (get(db, 'SELECT 1 FROM packages WHERE code = ? OR slug = ?', code, slug)) throw new DomainError('validation', 'That package code or URL is already in use.');
      const created = createPackage(db, { code, slug, dataOrigin: 'synthetic', actorId: c.get('session').user.id, content: source, changeNote: `Private copy of ${row.code}, version ${source.versionNo}.` });
      return c.redirect(`/staff/packages/${created.packageId}?done=created`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      return packageHistory(c, row, [err.message, ...err.issues].join(' '), undefined, cmsErrorStatus(err));
    }
  });
  staff.post('/packages/:id/publish', adminOnly, async (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    if (!row.draft) return packageHistory(c, row, 'There is no draft to publish.', undefined, 409);
    const body = await c.req.parseBody();
    try {
      const note = text(body, 'note').trim();
      if (!note || note.length > 300) throw new DomainError('validation', 'Enter a short note describing the change.');
      publish(db, { draftId: row.draft.id, actorId: c.get('session').user.id, note, expectedLockVersion: parseLock(body) });
      const schedule = getPublicationSchedule(db, row.id);
      if (schedule?.status === 'pending') cancelPublication(db, row.id, c.get('session').user.id);
      return c.redirect(`/staff/packages/${row.id}?done=published`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      return packageHistory(c, packageRow(c.req.param('id')) ?? row, [err.message, ...err.issues].join(' '), undefined, cmsErrorStatus(err));
    }
  });
  staff.post('/packages/:id/schedule', adminOnly, async (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    const body = await c.req.parseBody();
    try {
      const local = text(body, 'publishAt');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new DomainError('validation', 'Choose a valid India date and time.');
      schedulePublication(db, { packageId: row.id, publishAt: `${local}:00+05:30`, note: text(body, 'note'), actorId: c.get('session').user.id, expectedLockVersion: parseLock(body) }, options.now());
      return c.redirect(`/staff/packages/${row.id}?done=scheduled`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      return packageHistory(c, row, [err.message, ...err.issues].join(' '), undefined, cmsErrorStatus(err));
    }
  });
  staff.post('/packages/:id/schedule/cancel', adminOnly, (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    try { cancelPublication(db, row.id, c.get('session').user.id); return c.redirect(`/staff/packages/${row.id}?done=cancelled`, 303); }
    catch (err) { if (!(err instanceof DomainError)) throw err; return packageHistory(c, row, err.message, undefined, cmsErrorStatus(err)); }
  });
  staff.post('/packages/:id/restore/:version', adminOnly, async (c) => {
    const row = packageRow(c.req.param('id'));
    if (!row) return packageMissing(c);
    const raw = c.req.param('version');
    const version = ID.test(raw) ? listPackageHistory(db, row.id).find((v) => v.id === Number(raw)) : undefined;
    if (!version || version.status === 'draft') return packageHistory(c, row, 'Choose a published version from this package.', undefined, 404);
    const body = await c.req.parseBody();
    try {
      restoreVersion(db, { versionId: version.id, actorId: c.get('session').user.id, discardDraft: text(body, 'discard') === 'yes' });
      return c.redirect(`/staff/packages/${row.id}?done=restored`, 303);
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      return packageHistory(c, row, err.message, undefined, cmsErrorStatus(err));
    }
  });

  // ---- activity (admin only) ----------------------------------------------

  staff.get('/activity', adminOnly, (c) => page(c, <ActivityPage ctx={ctx} viewer={sessionViewer(c)} rows={listActivity(db)} limit={ACTIVITY_LIMIT} />));

  app.route('/staff', staff);
}
