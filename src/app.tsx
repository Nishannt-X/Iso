import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { get, type DatabaseSync } from './db/db.js';
import { getLiveVersionBySlug, listDataOrigins, listLiveVersions } from './domain/packages.js';
import { PHOTO_FILE_PATTERN } from './domain/photos.js';
import { DEFAULT_LIMITS, registerEnquiryRoutes, type EnquiryLimits } from './web/enquiry-routes.js';
import { HomePage, MessagePage, PackagePage, packagePath, type PageContext } from './web/pages.js';

// Public site (slice S2): server-rendered home/list and package detail, plus sitemap, robots and 404.
// Slice S3 adds the enquiry flow (src/web/enquiry-routes.tsx): the form behind every Enquire button and the status page.

export interface AppOptions {
  /** Absolute origin used in canonical links, the sitemap and robots.txt, e.g. https://example.com */
  siteUrl?: string;
  /** True only behind exactly one trusted reverse proxy; then X-Forwarded-For identifies the client for rate limits. */
  trustProxy?: boolean;
  /** Clock, injectable for tests. */
  now?: () => Date;
  limits?: Partial<EnquiryLimits>;
}

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ASSETS: Record<string, { pattern: RegExp; type: string }> = {
  images: { pattern: PHOTO_FILE_PATTERN, type: 'image/jpeg' },
  fonts: { pattern: /^hanken-grotesk-latin(-ext)?\.woff2$/, type: 'font/woff2' },
};

const doc = (el: { toString(): string }): string => `<!DOCTYPE html>${el.toString()}`;
const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createApp(db: DatabaseSync, options: AppOptions = {}): Hono {
  const ctx: PageContext = { siteUrl: (options.siteUrl ?? 'http://localhost:3000').replace(/\/+$/, '') };
  const app = new Hono();

  app.use(compress());
  const securityHeaders = (referrerPolicy: 'same-origin' | 'no-referrer') =>
    secureHeaders({
      referrerPolicy,
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    });
  // Site-wide "same-origin", not Hono's default "no-referrer": with that, browsers send "Origin: null" on form
  // POSTs, which the enquiry form's same-site check must refuse. "same-origin" still sends nothing to other sites.
  // The status page URL holds a secret token, so it alone stays "no-referrer".
  const defaultHeaders = securityHeaders('same-origin');
  const statusPageHeaders = securityHeaders('no-referrer');
  app.use((c, next) => (c.req.path.startsWith('/enquiry/received/') ? statusPageHeaders : defaultHeaders)(c, next));
  app.use(trimTrailingSlash());

  app.get('/healthz', (c) => {
    try {
      get(db, 'SELECT 1 AS ok');
      return c.json({ status: 'ok' });
    } catch (err) {
      console.error('healthz: database check failed:', err instanceof Error ? err.message : err);
      return c.json({ status: 'error' }, 503);
    }
  });

  app.get('/', (c) => c.html(doc(<HomePage packages={listLiveVersions(db)} origins={listDataOrigins(db)} ctx={ctx} />)));

  app.get('/packages/:slug', (c) => {
    const slug = c.req.param('slug');
    const version = SLUG.test(slug) ? getLiveVersionBySlug(db, slug) : undefined;
    if (!version) return c.notFound();
    return c.html(doc(<PackagePage v={version} origin={listDataOrigins(db).get(version.packageId)} ctx={ctx} />));
  });

  registerEnquiryRoutes(app, db, ctx, {
    now: options.now ?? (() => new Date()),
    trustProxy: options.trustProxy ?? false,
    limits: { ...DEFAULT_LIMITS, ...options.limits },
  });

  app.get('/assets/:dir/:file', async (c) => {
    const rule = ASSETS[c.req.param('dir')];
    const file = c.req.param('file');
    if (!rule || !rule.pattern.test(file)) return c.notFound();
    try {
      const body = await readFile(`${PUBLIC_DIR}${c.req.param('dir')}/${file}`);
      return c.body(new Uint8Array(body), 200, { 'Content-Type': rule.type, 'Cache-Control': 'public, max-age=604800' });
    } catch {
      return c.notFound();
    }
  });

  app.get('/sitemap.xml', (c) => {
    const urls = [
      { loc: `${ctx.siteUrl}/`, lastmod: null as string | null },
      ...listLiveVersions(db).map((v) => ({ loc: `${ctx.siteUrl}${packagePath(v.packageSlug)}`, lastmod: v.publishedAt })),
    ];
    const body = urls
      .map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${xml(u.lastmod.slice(0, 10))}</lastmod>` : ''}</url>`)
      .join('\n');
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, 200, {
      'Content-Type': 'application/xml; charset=utf-8',
    });
  });

  app.get('/robots.txt', (c) =>
    c.text(`User-agent: *\nAllow: /\nDisallow: /enquire\nDisallow: /enquiry/\n\nSitemap: ${ctx.siteUrl}/sitemap.xml\n`),
  );

  app.notFound((c) =>
    c.html(doc(<MessagePage title="Page not found" body="That page does not exist, or the package is no longer available." ctx={ctx} path={c.req.path} />), 404),
  );

  app.onError((err, c) => {
    console.error('unhandled error:', err instanceof Error ? err.message : err);
    return c.html(doc(<MessagePage title="Something went wrong" body="Something went wrong. Please try again in a moment." ctx={ctx} path={c.req.path} linkText="Back to the home page" linkHref="/" />), 500);
  });

  return app;
}
