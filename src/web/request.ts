import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

// Request helpers shared by the public enquiry routes and the staff routes.

/** The address rate limits are counted against. Behind one trusted proxy, its X-Forwarded-For entry; otherwise the socket peer. */
export function clientKey(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const last = c.req.header('x-forwarded-for')?.split(',').pop()?.trim();
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown'; // no socket, e.g. app.request() in tests
  }
}

/**
 * Accepts a request that comes from this site. A browser always sends Origin on a POST; if it is
 * absent, Sec-Fetch-Site decides. With neither header the request is not from a browser acting on someone's
 * behalf: the public form allows it (only its rate limits apply), but `requireSignal` refuses it, which the
 * staff area uses so every state change must positively identify itself as same-site.
 */
export function isSameSite(c: Context, siteOrigin: string, requireSignal = false): boolean {
  const origin = c.req.header('origin');
  if (origin !== undefined) {
    if (origin === siteOrigin) return true;
    try {
      return new URL(origin).host === c.req.header('host'); // same origin even when SITE_URL is not the name in use
    } catch {
      return false; // includes the literal "null" origin
    }
  }
  const fetchSite = c.req.header('sec-fetch-site');
  if (fetchSite === undefined) return !requireSignal;
  return fetchSite === 'same-origin' || fetchSite === 'none';
}
