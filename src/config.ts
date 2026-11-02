import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './domain/passwords.js';

// The only module that reads process.env. Variable names are documented in README.md.
export interface Config {
  port: number;
  dbPath: string;
  /** Absolute origin for canonical links, sitemap and robots.txt. */
  siteUrl: string;
  /** True only when exactly one trusted reverse proxy sets X-Forwarded-For. Used to find the client for rate limits. */
  trustProxy: boolean;
  /** Password for the three synthetic demo staff accounts that `npm run db:reset` creates. null = the documented demo password. */
  demoStaffPassword: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${env.PORT}"`);
  }
  const siteUrl = (env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
  let parsed: URL | null = null;
  try {
    parsed = new URL(siteUrl);
  } catch {
    // reported below
  }
  if (!parsed || !/^https?:$/.test(parsed.protocol) || parsed.pathname !== '/') {
    throw new Error(`SITE_URL must be an http(s) origin such as https://example.com, got "${env.SITE_URL}"`);
  }
  const demoStaffPassword = env.DEMO_STAFF_PASSWORD || null;
  if (demoStaffPassword !== null && (demoStaffPassword.length < MIN_PASSWORD_LENGTH || demoStaffPassword.length > MAX_PASSWORD_LENGTH)) {
    throw new Error(`DEMO_STAFF_PASSWORD must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`);
  }
  return { port, dbPath: env.DB_PATH || 'data/kochi-tours.db', siteUrl, trustProxy: env.TRUST_PROXY === '1', demoStaffPassword };
}
