import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { all, get, run, transaction, type DatabaseSync } from '../db/db.js';
import { writeAudit } from './audit.js';
import { verifyAgainstDummy, verifyPassword } from './passwords.js';

// Staff accounts and sessions (slice S4). Roles: `admin` (everything an agent can do, plus assigning work to
// anyone and reading the activity log) and `agent` (a consultant who triages enquiries).

export type Role = 'admin' | 'agent' | 'editor';

export interface StaffUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface StaffSession {
  user: StaffUser;
  /** Synchroniser token that every staff form must send back. */
  csrfToken: string;
}

/** A session ends 12 hours after sign-in, or after 2 hours without a request, whichever comes first. */
export const SESSION_ABSOLUTE_MS = 12 * 3_600_000;
export const SESSION_IDLE_MS = 2 * 3_600_000;
/** last_seen_at is refreshed at most this often, so a page load is not always a write. */
const TOUCH_INTERVAL_MS = 60_000;

export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Lower-cased, trimmed email, or null when it cannot be an address. */
export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

interface UserRow extends StaffUser {
  password_hash: string;
}

/**
 * Checks an email and password. Returns the user, or null for every kind of failure (unknown email, switched-off
 * account, wrong password) so the caller can show one generic message. A wrong password for a real account
 * is written to the audit log; an unknown email is not, because the log needs an entity to point at.
 */
export async function authenticate(db: DatabaseSync, emailRaw: string, password: string): Promise<StaffUser | null> {
  const email = normaliseEmail(emailRaw);
  const row = email
    ? get<UserRow>(db, 'SELECT id, email, name, role, password_hash FROM staff_users WHERE email = ? AND active = 1', email)
    : undefined;
  if (!row) return verifyAgainstDummy(password);
  if (!(await verifyPassword(password, row.password_hash))) {
    writeAudit(db, row.id, 'auth.login_failed', 'staff_user', row.id);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Starts a session for an authenticated user. Returns the cookie token (shown once; only its hash is stored). */
export function startSession(db: DatabaseSync, user: StaffUser, now: Date): { token: string; csrfToken: string; maxAgeSec: number } {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const at = now.toISOString();
  transaction(db, () => {
    run(db, 'DELETE FROM staff_sessions WHERE expires_at <= ?', at); // housekeeping: expired rows go at the next sign-in
    run(
      db,
      'INSERT INTO staff_sessions (id, user_id, csrf_token, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      sha256(token), user.id, csrfToken, at, at, new Date(now.getTime() + SESSION_ABSOLUTE_MS).toISOString(),
    );
    writeAudit(db, user.id, 'auth.login', 'staff_user', user.id);
  });
  return { token, csrfToken, maxAgeSec: SESSION_ABSOLUTE_MS / 1000 };
}

/** The signed-in staff member for a cookie token, or null when it is malformed, unknown, expired, idle or the account is off. */
export function resolveSession(db: DatabaseSync, token: string | undefined, now: Date): StaffSession | null {
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) return null;
  const id = sha256(token);
  const row = get<StaffUser & { csrf_token: string; last_seen_at: string; expires_at: string }>(
    db,
    `SELECT u.id, u.email, u.name, u.role, s.csrf_token, s.last_seen_at, s.expires_at
       FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
      WHERE s.id = ? AND u.active = 1`,
    id,
  );
  if (!row) return null;
  const t = now.getTime();
  if (row.expires_at <= now.toISOString() || t - Date.parse(row.last_seen_at) >= SESSION_IDLE_MS) {
    run(db, 'DELETE FROM staff_sessions WHERE id = ?', id);
    return null;
  }
  if (t - Date.parse(row.last_seen_at) >= TOUCH_INTERVAL_MS) run(db, 'UPDATE staff_sessions SET last_seen_at = ? WHERE id = ?', now.toISOString(), id);
  return { user: { id: row.id, email: row.email, name: row.name, role: row.role }, csrfToken: row.csrf_token };
}

/** Ends the session behind a cookie token. Safe to call with a token that is already gone. */
export function endSession(db: DatabaseSync, token: string | undefined, userId: number): void {
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) return;
  transaction(db, () => {
    const removed = run(db, 'DELETE FROM staff_sessions WHERE id = ?', sha256(token)).changes;
    if (Number(removed) > 0) writeAudit(db, userId, 'auth.logout', 'staff_user', userId);
  });
}

/** Constant-time comparison of the token a form sent with the session's token. */
export function csrfMatches(session: StaffSession, sent: unknown): boolean {
  if (typeof sent !== 'string') return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(session.csrfToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Staff who can be given work: active accounts, in a stable order. */
export function listAssignable(db: DatabaseSync): StaffUser[] {
  return all<StaffUser>(db, "SELECT id, email, name, role FROM staff_users WHERE active = 1 AND role IN ('admin', 'agent') ORDER BY CASE role WHEN 'agent' THEN 0 ELSE 1 END, name, id");
}
