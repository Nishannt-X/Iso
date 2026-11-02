import { randomBytes, scrypt, scryptSync, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Password hashing with scrypt from node:crypto (no dependency). The stored form is
// "scrypt$N$r$p$salt$hash" (base64url), so the cost can be raised later and old hashes still verify.
// Costs follow OWASP's scrypt guidance of N=2^15, r=8, p=3 (about 32 MiB, a fraction of a second).

export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_COST: ScryptCost = { N: 2 ** 15, r: 8, p: 3 };
export const MIN_PASSWORD_LENGTH = 12;
/** Longer inputs are refused before hashing so a request cannot make the server hash megabytes. */
export const MAX_PASSWORD_LENGTH = 256;

const KEY_BYTES = 32;
const SALT_BYTES = 16;
// Bounds for parameters read back from storage, so a damaged row cannot ask for gigabytes of memory.
const MAX_N = 2 ** 20;
const MAX_R = 16;
const MAX_P = 16;

const options = (cost: ScryptCost): ScryptOptions => ({ N: cost.N, r: cost.r, p: cost.p, maxmem: 256 * 1024 * 1024 });
const normalise = (password: string): string => password.normalize('NFKC');

/** Asynchronous, so a login does not block the event loop while it hashes. */
function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(normalise(password), salt, KEY_BYTES, options(cost), (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function encode(cost: ScryptCost, salt: Buffer, key: Buffer): string {
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

function assertAcceptable(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`);
  }
}

export async function hashPassword(password: string, cost: ScryptCost = DEFAULT_COST): Promise<string> {
  assertAcceptable(password);
  const salt = randomBytes(SALT_BYTES);
  return encode(cost, salt, await derive(password, salt, cost));
}

/** For the seed script and tests only, which run before any request is served. */
export function hashPasswordSync(password: string, cost: ScryptCost = DEFAULT_COST): string {
  assertAcceptable(password);
  const salt = randomBytes(SALT_BYTES);
  return encode(cost, salt, scryptSync(normalise(password), salt, KEY_BYTES, options(cost)));
}

function parse(stored: string): { cost: ScryptCost; salt: Buffer; key: Buffer } | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null; // includes the seed user's LOGIN-DISABLED marker
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const powerOfTwo = Number.isInteger(N) && N >= 2 && N <= MAX_N && (N & (N - 1)) === 0;
  if (!powerOfTwo || !Number.isInteger(r) || r < 1 || r > MAX_R || !Number.isInteger(p) || p < 1 || p > MAX_P) return null;
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const key = Buffer.from(parts[5] ?? '', 'base64url');
  if (salt.length !== SALT_BYTES || key.length !== KEY_BYTES) return null;
  return { cost: { N, r, p }, salt, key };
}

/** True only for a correct password. A stored value that is not a valid hash never verifies. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed.cost);
  return timingSafeEqual(key, parsed.key);
}

let dummy: Promise<string> | undefined;
/**
 * Spends the cost of one verification when the account does not exist or is switched off, so response time
 * does not reveal which email addresses have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<null> {
  dummy ??= hashPassword('not-a-real-account-password');
  await verifyPassword(password, await dummy);
  return null;
}
