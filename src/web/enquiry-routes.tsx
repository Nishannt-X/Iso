import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { DatabaseSync } from '../db/db.js';
import {
  createEnquiry, emptyForm, FIELDS, getAcknowledgement, indiaToday, LIMITS, newSubmissionKey, SUBMISSION_KEY_PATTERN, TOKEN_PATTERN,
  validateEnquiry, type RawForm,
} from '../domain/enquiries.js';
import { DomainError, getLiveVersionBySlug, type PackageVersion } from '../domain/packages.js';
import { RateLimiter } from '../domain/rate-limit.js';
import { AcknowledgementPage, EnquiryFormPage, type FormView } from './enquiry-pages.js';
import { MessagePage, type PageContext } from './pages.js';
import { clientKey, isSameSite } from './request.js';

// Public enquiry flow (slice S3):
//   GET  /enquire?package=<slug>        the form for one live package
//   POST /enquire                       validate, store, redirect (303) to the status page
//   GET  /enquiry/received/:token       acknowledgement and status, reached only by the unguessable token
//
// There are no cookies and no sessions here, so there is no login for a cross-site request to ride.
// The Origin / Sec-Fetch-Site check still stops other sites from submitting the form from a visitor's browser.

export interface EnquiryLimits {
  /** POST attempts (valid or not) per client per `attemptWindowMs`. */
  attempts: number;
  attemptWindowMs: number;
  /** New enquiries per client per hour. */
  perClientPerHour: number;
  /** New enquiries across all clients per hour: a ceiling on database growth. */
  globalPerHour: number;
}

export const DEFAULT_LIMITS: EnquiryLimits = { attempts: 20, attemptWindowMs: 10 * 60_000, perClientPerHour: 5, globalPerHour: 300 };

export interface EnquiryRouteOptions {
  now: () => Date;
  trustProxy: boolean;
  limits: EnquiryLimits;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const HOUR = 3_600_000;
const BODY_LIMIT_BYTES = 64 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

const doc = (el: { toString(): string }): string => `<!DOCTYPE html>${el.toString()}`;

class RateLimited extends Error {
  constructor(readonly retryAfterSec: number) {
    super('rate limited');
  }
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function readForm(body: Record<string, unknown>): { raw: RawForm; slug: string; key: string | null; honeypot: string } {
  const str = (k: string): string => (typeof body[k] === 'string' ? (body[k] as string) : '');
  const raw = emptyForm();
  for (const f of FIELDS) raw[f] = str(f);
  const key = str('key');
  return { raw, slug: str('package'), key: SUBMISSION_KEY_PATTERN.test(key) ? key : null, honeypot: str('website') };
}

export function registerEnquiryRoutes(app: Hono, db: DatabaseSync, ctx: PageContext, options: EnquiryRouteOptions): void {
  const { limits } = options;
  const siteOrigin = new URL(ctx.siteUrl).origin;
  const attempts = new RateLimiter(limits.attempts, limits.attemptWindowMs);
  const perClient = new RateLimiter(limits.perClientPerHour, HOUR);
  const global = new RateLimiter(limits.globalPerHour, HOUR, 1);
  const GLOBAL_KEY = 'all';

  const message = (status: 400 | 403 | 413 | 429, title: string, body: string, c: Context, extra: Record<string, string> = {}) =>
    c.html(doc(<MessagePage title={title} body={body} ctx={ctx} path="/enquire" linkText="See all packages" />), status, { ...NO_STORE, ...extra });

  const formView = (version: PackageVersion, over: Partial<FormView>): FormView => {
    const today = indiaToday(options.now());
    return {
      version, values: emptyForm(), errors: {}, submissionKey: newSubmissionKey(), today, maxDate: addDays(today, LIMITS.daysAhead), ctx, ...over,
    };
  };

  app.get('/enquire', (c) => {
    const slug = c.req.query('package') ?? '';
    const version = SLUG.test(slug) ? getLiveVersionBySlug(db, slug) : undefined;
    if (!version) return c.notFound();
    const values = { ...emptyForm(), destination: version.destinations.join(', ').slice(0, LIMITS.destination) };
    return c.html(doc(<EnquiryFormPage {...formView(version, { values })} />), 200, NO_STORE);
  });

  app.post(
    '/enquire',
    bodyLimit({ maxSize: BODY_LIMIT_BYTES, onError: (c) => message(413, 'That was too large', 'The form you sent was too large. Please shorten your message and try again.', c) }),
    async (c) => {
      if (!isSameSite(c, siteOrigin)) {
        return message(403, 'We could not send that', 'The form must be sent from this site. Please open the enquiry form here and try again.', c);
      }
      let body: Record<string, unknown>;
      try {
        body = await c.req.parseBody();
      } catch {
        return message(400, 'We could not read that', 'The form could not be read. Please try again.', c);
      }
      const { raw, slug, key, honeypot } = readForm(body);
      // Resolve the live version after the last await, so what we store is what was live at this moment.
      const version = SLUG.test(slug) ? getLiveVersionBySlug(db, slug) : undefined;
      const now = options.now();
      const t = now.getTime();
      const client = clientKey(c, options.trustProxy);
      const submissionKey = key ?? newSubmissionKey();

      const reject = (status: 400 | 422 | 429 | 500, extra: Partial<FormView>, headers: Record<string, string> = {}) =>
        version
          ? c.html(doc(<EnquiryFormPage {...formView(version, { values: raw, submissionKey, ...extra })} />), status, { ...NO_STORE, ...headers })
          : c.notFound();

      const tooMany = (retryAfterSec: number) =>
        reject(429, { banner: `Too many enquiries have been sent from this connection. Nothing was saved. Please try again in ${Math.ceil(retryAfterSec / 60)} minute(s).` }, {
          'Retry-After': String(retryAfterSec),
        });

      const attempt = attempts.check(client, t);
      if (!attempt.allowed) return tooMany(attempt.retryAfterSec);
      attempts.record(client, t);

      if (!version) return c.notFound();

      // A bot filled the hidden field. Show the same thanks as a real send, but store nothing.
      if (honeypot.trim() !== '') {
        return c.html(
          doc(<MessagePage title="Thank you" body="Your enquiry has been received." ctx={ctx} path="/enquire" linkText="See all packages" />),
          200,
          NO_STORE,
        );
      }

      const checked = validateEnquiry(raw, indiaToday(now));
      if (!checked.ok) return reject(422, { errors: checked.errors });

      try {
        const result = createEnquiry(db, {
          input: checked.value,
          versionId: version.id,
          submissionKey,
          now,
          // Runs after the duplicate checks, so re-sending an enquiry that was already accepted never counts or fails.
          beforeInsert: () => {
            const mine = perClient.check(client, t);
            const all = global.check(GLOBAL_KEY, t);
            if (!mine.allowed || !all.allowed) throw new RateLimited(Math.max(mine.retryAfterSec, all.retryAfterSec));
          },
        });
        if (result.outcome === 'created') {
          perClient.record(client, t);
          global.record(GLOBAL_KEY, t);
        }
        return c.redirect(`/enquiry/received/${result.token}`, 303);
      } catch (err) {
        if (err instanceof RateLimited) return tooMany(err.retryAfterSec);
        if (err instanceof DomainError && err.code === 'not_found') return c.notFound();
        // Log the cause only: the request carries personal data that must not reach the logs.
        console.error('enquiry: could not save:', err instanceof Error ? err.message : 'unknown error');
        return reject(500, { banner: 'We could not save your enquiry because of a problem on our side. Nothing was sent. Your answers are still in the form, so please try again in a moment.' });
      }
    },
  );

  app.get('/enquiry/received/:token', (c) => {
    const token = c.req.param('token');
    const ack = TOKEN_PATTERN.test(token) ? getAcknowledgement(db, token) : undefined;
    if (!ack) return c.notFound(); // the same 404 for malformed and unknown tokens
    return c.html(doc(<AcknowledgementPage ack={ack} ctx={ctx} />), 200, {
      ...NO_STORE,
      'X-Robots-Tag': 'noindex, nofollow', // Referrer-Policy: no-referrer for this path is set in app.tsx
    });
  });
}
