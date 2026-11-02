import { createApp } from '../../src/app.js';
import { get, run, type DatabaseSync } from '../../src/db/db.js';
import { resetDatabase } from '../../src/db/seed.js';
import { createEnquiry, newSubmissionKey, type EnquiryInput } from '../../src/domain/enquiries.js';
import { hashPasswordSync } from '../../src/domain/passwords.js';

export const SITE = 'https://tours.example';
export const PASSWORD = 'a-long-test-password';
export const ADMIN = 'admin@staff.example.invalid';
export const C1 = 'consultant1@staff.example.invalid';
export const C2 = 'consultant2@staff.example.invalid';
export const T0 = new Date('2026-11-02T10:00:00.000Z');

// Tests verify passwords many times, so they use a cheap cost; production uses DEFAULT_COST (see passwords.test.ts).
const CHEAP_HASH = hashPasswordSync(PASSWORD, { N: 1024, r: 8, p: 1 });

export interface Clock {
  now: Date;
  advance(minutes: number): void;
}

export interface Harness {
  db: DatabaseSync;
  app: ReturnType<typeof createApp>;
  clock: Clock;
  userId(email: string): number;
  /** Adds an enquiry for PKG-KL-07 created at the given time (default: the clock). Returns its id. */
  addEnquiry(over?: Partial<EnquiryInput>, when?: Date): number;
  post(path: string, fields: Record<string, string>, cookie?: string, headers?: Record<string, string>): Promise<Response>;
  get(path: string, cookie?: string, headers?: Record<string, string>): Promise<Response>;
  /** Signs in and returns the cookie header value to send back. */
  login(email: string, password?: string): Promise<string>;
}

export function harness(options: { siteUrl?: string; keepSample?: boolean; loginLimits?: { perClient?: number; perEmail?: number } } = {}): Harness {
  const db = resetDatabase(':memory:', { staffPassword: PASSWORD });
  if (!options.keepSample) db.exec('DELETE FROM enquiries');
  run(db, 'UPDATE staff_users SET password_hash = ? WHERE active = 1', CHEAP_HASH);
  const clock: Clock = { now: new Date(T0), advance(m) { this.now = new Date(this.now.getTime() + m * 60_000); } };
  const siteUrl = options.siteUrl ?? SITE;
  const app = createApp(db, { siteUrl, now: () => clock.now, loginLimits: options.loginLimits });
  const versionId = get<{ id: number }>(db, "SELECT v.id FROM live_versions v JOIN packages p ON p.id = v.package_id WHERE p.code = 'PKG-KL-07'")!.id;
  let n = 0;
  const h: Harness = {
    db, app, clock,
    userId: (email) => get<{ id: number }>(db, 'SELECT id FROM staff_users WHERE email = ?', email)!.id,
    addEnquiry(over = {}, when) {
      n++;
      const input: EnquiryInput = {
        name: `Traveller ${n}`, email: `t${n}@example.invalid`, phone: null, travelStart: null, adults: 2, children: 0, childAges: [], destination: null,
        budgetInr: null, budgetBasis: null, message: `Message number ${n}`, whatsappConsent: false, ...over,
      };
      const r = createEnquiry(db, { input, versionId, submissionKey: newSubmissionKey(), now: when ?? clock.now });
      return get<{ id: number }>(db, 'SELECT id FROM enquiries WHERE reference = ?', r.reference)!.id;
    },
    post: async (path, fields, cookie, headers = {}) =>
      app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: new URL(siteUrl).origin, ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: new URLSearchParams(fields).toString(),
      }),
    get: async (path, cookie, headers = {}) => app.request(path, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } }),
    async login(email, password = PASSWORD) {
      const res = await h.post('/staff/login', { email, password });
      if (res.status !== 303) throw new Error(`login failed with ${res.status}`);
      return cookieHeader(res);
    },
  };
  return h;
}

/** "name=value" for the session cookie set by a response. */
export function cookieHeader(res: Response): string {
  const line = res.headers.getSetCookie().find((c) => /kochi_staff=/.test(c));
  if (!line) throw new Error('no session cookie was set');
  return line.split(';')[0]!;
}

export const csrfOf = (html: string): string => /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
export const lockOf = (html: string): string => /name="lock" value="(\d+)"/.exec(html)?.[1] ?? '';
export const count = (db: DatabaseSync, sql: string): number => get<{ n: number }>(db, sql)?.n ?? -1;
