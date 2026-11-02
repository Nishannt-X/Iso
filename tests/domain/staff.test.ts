import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { all, get, run, type DatabaseSync } from '../../src/db/db.js';
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, resetDatabase } from '../../src/db/seed.js';
import { hashPasswordSync } from '../../src/domain/passwords.js';
import {
  authenticate, csrfMatches, endSession, listAssignable, normaliseEmail, resolveSession, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, startSession,
} from '../../src/domain/staff.js';

const T0 = new Date('2026-11-02T10:00:00.000Z');
const later = (ms: number): Date => new Date(T0.getTime() + ms);

function setup(): DatabaseSync {
  const db = resetDatabase(':memory:', { staffPassword: 'a-long-test-password' });
  const hash = hashPasswordSync('a-long-test-password', { N: 1024, r: 8, p: 1 });
  run(db, 'UPDATE staff_users SET password_hash = ? WHERE active = 1', hash);
  return db;
}
const count = (db: DatabaseSync, sql: string): number => get<{ n: number }>(db, sql)?.n ?? -1;

describe('demo staff seed', () => {
  test('without a password, demo accounts are created inactive with login disabled and no default password', () => {
    const db = resetDatabase(':memory:');
    const rows = all<{ email: string; role: string; active: number; password_hash: string }>(
      db,
      'SELECT email, role, active, password_hash FROM staff_users ORDER BY id',
    );
    assert.deepEqual(rows.filter((r) => r.active === 1), []);
    assert.ok(rows.every((r) => r.email.endsWith('.invalid')));
    assert.ok(rows.every((r) => r.active === 0 && r.password_hash === 'LOGIN-DISABLED'));
  });

  test('providing staffPassword creates active demo accounts with that password', async () => {
    const db = resetDatabase(':memory:', { staffPassword: 'my-demo-password' });
    const rows = all<{ email: string; role: string; active: number }>(db, 'SELECT email, role, active FROM staff_users ORDER BY id');
    assert.deepEqual(rows.filter((r) => r.active === 1).map((r) => [r.email, r.role]), DEMO_STAFF.map((u) => [u.email, u.role]));
    assert.ok(await authenticate(db, 'admin@staff.example.invalid', 'my-demo-password'));
    assert.equal(await authenticate(db, 'admin@staff.example.invalid', 'wrong-password'), null);
  });

  test('requireNonDefault rejects the known default password', () => {
    assert.throws(
      () => resetDatabase(':memory:', { staffPassword: DEMO_STAFF_PASSWORD, requireNonDefault: true }),
      /A non-default staff password is required/,
    );
  });
});

describe('authenticate', () => {
  const db = setup();

  test('returns the user for a correct email (any case, padded) and password', async () => {
    const user = await authenticate(db, '  Admin@Staff.Example.INVALID ', 'a-long-test-password');
    assert.deepEqual(user && [user.email, user.role], ['admin@staff.example.invalid', 'admin']);
    assert.ok(!('password_hash' in (user ?? {})));
  });

  test('every failure returns null: wrong password, unknown email, malformed email, switched-off account', async () => {
    assert.equal(await authenticate(db, 'admin@staff.example.invalid', 'wrong-password-here'), null);
    assert.equal(await authenticate(db, 'nobody@staff.example.invalid', 'a-long-test-password'), null);
    assert.equal(await authenticate(db, 'not an email', 'a-long-test-password'), null);
    run(db, "UPDATE staff_users SET password_hash = ? WHERE email = 'seed@system.invalid'", hashPasswordSync('a-long-test-password', { N: 1024, r: 8, p: 1 }));
    assert.equal(await authenticate(db, 'seed@system.invalid', 'a-long-test-password'), null, 'active = 0 cannot sign in even with the right password');
  });

  test('a wrong password for a real account is audited without the password; an unknown email writes nothing', async () => {
    const before = count(db, 'SELECT COUNT(*) AS n FROM audit_log');
    await authenticate(db, 'nobody@staff.example.invalid', 'whatever-password-1');
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM audit_log'), before);
    await authenticate(db, 'consultant1@staff.example.invalid', 'secret-wrong-password');
    const row = get<{ action: string; meta_json: string }>(db, "SELECT action, meta_json FROM audit_log WHERE action = 'auth.login_failed'");
    assert.equal(row?.action, 'auth.login_failed');
    assert.ok(!JSON.stringify(row).includes('secret-wrong-password'));
  });

  test('normaliseEmail', () => {
    assert.equal(normaliseEmail(' A@B.CO '), 'a@b.co');
    for (const bad of ['', 'a', 'a@b', '<a@b.co>', 'a b@c.de', `${'x'.repeat(250)}@b.co`]) assert.equal(normaliseEmail(bad), null, bad);
  });
});

describe('sessions', () => {
  test('a session resolves to its user and csrf token; only a hash of the cookie is stored', () => {
    const db = setup();
    const user = { id: 2, email: 'x', name: 'x', role: 'agent' as const };
    const s = startSession(db, { ...user, id: Number(get<{ id: number }>(db, "SELECT id FROM staff_users WHERE email = 'consultant1@staff.example.invalid'")?.id) }, T0);
    assert.match(s.token, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(s.token, s.csrfToken);
    const resolved = resolveSession(db, s.token, later(1000));
    assert.equal(resolved?.user.role, 'agent');
    assert.equal(resolved?.csrfToken, s.csrfToken);
    assert.ok(!JSON.stringify(all(db, 'SELECT * FROM staff_sessions')).includes(s.token));
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.login'"), 1);
  });

  test('two sign-ins give two different cookies and csrf tokens', () => {
    const db = setup();
    const u = { id: 2, email: 'a', name: 'a', role: 'admin' as const };
    const a = startSession(db, u, T0);
    const b = startSession(db, u, T0);
    assert.notEqual(a.token, b.token);
    assert.notEqual(a.csrfToken, b.csrfToken);
  });

  test('missing, malformed and unknown tokens resolve to nothing', () => {
    const db = setup();
    for (const t of [undefined, '', 'short', 'x'.repeat(43), `${'a'.repeat(42)}!`, "' OR 1=1 --"]) assert.equal(resolveSession(db, t, T0), null, String(t));
  });

  test('expires after 12 hours even if used all the time', () => {
    const db = setup();
    const s = startSession(db, { id: 2, email: 'a', name: 'a', role: 'admin' }, T0);
    for (let h = 1; h < 12; h++) assert.ok(resolveSession(db, s.token, later(h * 3_600_000)), `hour ${h}`);
    assert.equal(resolveSession(db, s.token, later(SESSION_ABSOLUTE_MS)), null);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM staff_sessions'), 0, 'an expired row is removed when seen');
  });

  test('expires after 2 idle hours, and use before that extends it', () => {
    const db = setup();
    const s = startSession(db, { id: 2, email: 'a', name: 'a', role: 'admin' }, T0);
    assert.ok(resolveSession(db, s.token, later(SESSION_IDLE_MS - 1000)));
    assert.ok(resolveSession(db, s.token, later(2 * SESSION_IDLE_MS - 2000)), 'last seen was refreshed');
    assert.equal(resolveSession(db, s.token, later(4 * SESSION_IDLE_MS)), null);
  });

  test('switching an account off ends its sessions immediately', () => {
    const db = setup();
    const s = startSession(db, { id: 2, email: 'a', name: 'a', role: 'admin' }, T0);
    assert.ok(resolveSession(db, s.token, later(1000)));
    run(db, 'UPDATE staff_users SET active = 0 WHERE id = 2');
    assert.equal(resolveSession(db, s.token, later(2000)), null);
  });

  test('endSession removes the session and audits the logout; repeating it is harmless', () => {
    const db = setup();
    const s = startSession(db, { id: 2, email: 'a', name: 'a', role: 'admin' }, T0);
    endSession(db, s.token, 2);
    endSession(db, s.token, 2);
    endSession(db, undefined, 2);
    assert.equal(resolveSession(db, s.token, later(1000)), null);
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.logout'"), 1, 'one logout per real session');
  });

  test('signing in clears expired sessions of anyone', () => {
    const db = setup();
    startSession(db, { id: 2, email: 'a', name: 'a', role: 'admin' }, T0);
    startSession(db, { id: 3, email: 'b', name: 'b', role: 'agent' }, later(SESSION_ABSOLUTE_MS + 1000));
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM staff_sessions'), 1);
  });
});

describe('csrfMatches and listAssignable', () => {
  test('csrfMatches accepts only the exact token', () => {
    const session = { user: { id: 1, email: 'a', name: 'a', role: 'admin' as const }, csrfToken: 'abc123' };
    assert.equal(csrfMatches(session, 'abc123'), true);
    for (const bad of ['abc124', 'abc12', 'abc1234', '', undefined, null, 5, ['abc123']]) assert.equal(csrfMatches(session, bad), false, String(bad));
  });

  test('listAssignable lists active staff only, consultants first', () => {
    const db = resetDatabase(':memory:', { staffPassword: 'a-long-test-password' });
    assert.deepEqual(listAssignable(db).map((u) => u.name), ['Demo Consultant One', 'Demo Consultant Two', 'Demo Admin']);
  });
});
