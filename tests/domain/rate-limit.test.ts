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
});
