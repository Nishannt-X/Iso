import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hashPassword, hashPasswordSync, MAX_PASSWORD_LENGTH, verifyPassword } from '../../src/domain/passwords.js';

const CHEAP = { N: 1024, r: 8, p: 1 }; // tests only; production uses DEFAULT_COST

describe('passwords', () => {
  test('a hash verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery', CHEAP);
    assert.equal(await verifyPassword('correct horse battery', hash), true);
    assert.equal(await verifyPassword('correct horse batterz', hash), false);
    assert.equal(await verifyPassword('', hash), false);
  });

  test('the stored form has a random salt, records its own cost, and never contains the password', async () => {
    const a = await hashPassword('correct horse battery', CHEAP);
    const b = hashPasswordSync('correct horse battery', CHEAP);
    assert.notEqual(a, b);
    assert.match(a, /^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    assert.ok(!a.includes('correct'));
    assert.equal(await verifyPassword('correct horse battery', b), true);
  });

  test('Unicode forms of the same password are equal (NFKC), so a keyboard or paste difference does not lock someone out', async () => {
    const hash = await hashPassword('café-au-lait-2026', CHEAP);
    assert.equal(await verifyPassword('café-au-lait-2026', hash), true);
  });

  test('refuses passwords that are too short or too long to hash', async () => {
    await assert.rejects(hashPassword('short', CHEAP), RangeError);
    assert.throws(() => hashPasswordSync('x'.repeat(MAX_PASSWORD_LENGTH + 1), CHEAP), RangeError);
  });

  test('an over-long login password is refused before any hashing', async () => {
    const hash = await hashPassword('correct horse battery', CHEAP);
    assert.equal(await verifyPassword('x'.repeat(MAX_PASSWORD_LENGTH + 1), hash), false);
  });

  test('stored values that are not valid hashes never verify, including the seed user marker and absurd costs', async () => {
    for (const bad of ['', 'LOGIN-DISABLED', 'x', 'scrypt$1024$8$1$AAAA$BBBB', 'scrypt$3$8$1$a$b', 'scrypt$1073741824$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']) {
      assert.equal(await verifyPassword('correct horse battery', bad), false, bad);
    }
  });
});
