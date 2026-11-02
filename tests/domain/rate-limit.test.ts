import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RateLimiter } from '../../src/domain/rate-limit.js';

describe('RateLimiter', () => {
  test('allows up to the limit inside the window, then blocks with a retry time', () => {
    const rl = new RateLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) {
      assert.equal(rl.check('a', 1000 + i).allowed, true);
      rl.record('a', 1000 + i);
    }
    const blocked = rl.check('a', 2000);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSec, 59); // oldest hit at 1000 frees up at 61000
    assert.equal(rl.check('b', 2000).allowed, true, 'other keys are unaffected');
  });

  test('frees a slot once the oldest hit leaves the window', () => {
    const rl = new RateLimiter(2, 10_000);
    rl.record('a', 0);
    rl.record('a', 5000);
    assert.equal(rl.check('a', 9999).allowed, false);
    assert.equal(rl.check('a', 10_001).allowed, true);
  });

  test('check does not record', () => {
    const rl = new RateLimiter(1, 1000);
    for (let i = 0; i < 5; i++) assert.equal(rl.check('a', 0).allowed, true);
  });

  test('never holds more than maxKeys keys, even when all are live', () => {
    const rl = new RateLimiter(1, 1_000_000, 50);
    for (let i = 0; i < 500; i++) rl.record(`ip-${i}`, i);
    assert.ok(rl.size <= 50, `size ${rl.size}`);
    assert.equal(rl.check('ip-499', 600).allowed, false, 'the most recent key is still tracked');
  });

  test('expired keys are dropped before live ones when the bound is hit', () => {
    const rl = new RateLimiter(1, 1000, 3);
    rl.record('old1', 0);
    rl.record('old2', 1);
    rl.record('live1', 5000);
    rl.record('live2', 5001);
    assert.equal(rl.size, 2);
    assert.equal(rl.check('live1', 5002).allowed, false);
  });

  test('key spraying cannot evict an actively blocked key', () => {
    const maxKeys = 50;
    const rl = new RateLimiter(5, 60_000, maxKeys);
    // Record 5 failed attempts for the victim key -> blocked
    for (let i = 0; i < 5; i++) rl.record('victim@example.invalid', 1000 + i * 10);
    assert.equal(rl.check('victim@example.invalid', 1100).allowed, false);

    // Attacker sprays 500 random keys into the rate limiter
    for (let i = 0; i < 500; i++) {
      rl.record(`spray-${i}@example.invalid`, 1200 + i);
    }

    // Memory bound is preserved
    assert.ok(rl.size <= maxKeys, `size ${rl.size} should be <= ${maxKeys}`);

    // Victim key is still blocked: sprayed single-hit keys must never evict a blocked key
    const status = rl.check('victim@example.invalid', 1800);
    assert.equal(status.allowed, false, 'victim key must remain blocked despite key spraying');
    assert.ok(status.retryAfterSec > 0);
  });

  test('key spraying cannot evict an accumulating key to reset its counter', () => {
    const maxKeys = 50;
    const rl = new RateLimiter(5, 60_000, maxKeys);
    // 4 failed attempts recorded for victim (1 attempt away from being blocked)
    for (let i = 0; i < 4; i++) rl.record('victim@example.invalid', 1000 + i * 10);
    assert.equal(rl.check('victim@example.invalid', 1100).allowed, true);

    // Attacker sprays 500 single-hit keys trying to flush the victim from memory
    for (let i = 0; i < 500; i++) {
      rl.record(`spray-${i}@example.invalid`, 1200 + i);
    }

    assert.ok(rl.size <= maxKeys);

    // The 5th attempt on victim must immediately block it (accumulated count was preserved)
    rl.record('victim@example.invalid', 1800);
    assert.equal(rl.check('victim@example.invalid', 1801).allowed, false, 'victim must reach blocked state on 5th hit');
  });
});
