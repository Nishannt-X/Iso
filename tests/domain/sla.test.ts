import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatElapsed, LATE_MINUTES, slaFor, TARGET_MINUTES } from '../../src/domain/sla.js';

const CREATED = '2026-11-02T10:00:00.000Z';
const after = (minutes: number): Date => new Date(Date.parse(CREATED) + minutes * 60_000);
const waiting = (minutes: number, status = 'new') => slaFor({ createdAt: CREATED, firstReplyAt: null, status, now: after(minutes) });

describe('slaFor (unanswered)', () => {
  test('is within target up to and including 60 minutes, then past target', () => {
    assert.equal(waiting(0).state, 'within_target');
    assert.equal(waiting(TARGET_MINUTES).state, 'within_target');
    assert.equal(waiting(TARGET_MINUTES + 1).state, 'past_target');
  });

  test('is late from 12 hours', () => {
    assert.equal(waiting(LATE_MINUTES - 1).state, 'past_target');
    assert.equal(waiting(LATE_MINUTES).state, 'late');
    assert.equal(waiting(3 * 24 * 60).state, 'late');
  });

  test('counts wall-clock time: no working hours are assumed, so 3 a.m. counts', () => {
    const night = slaFor({ createdAt: '2026-11-02T21:30:00.000Z', firstReplyAt: null, status: 'new', now: new Date('2026-11-02T23:00:00.000Z') });
    assert.equal(night.elapsedMinutes, 90);
    assert.equal(night.state, 'past_target');
  });

  test('labels carry the elapsed time in words, never colour alone', () => {
    assert.equal(waiting(12).label, 'Waiting 12 min');
    assert.match(waiting(125, 'in_progress').detail, /past the 1-hour target/);
    assert.match(waiting(30).detail, /within the 1-hour target/);
  });

  test('a clock that is behind created_at never gives a negative time', () => {
    const s = slaFor({ createdAt: CREATED, firstReplyAt: null, status: 'new', now: after(-5) });
    assert.equal(s.elapsedMinutes, 0);
    assert.equal(s.state, 'within_target');
  });

  test('a closed enquiry with no reply stops the clock', () => {
    const s = waiting(5000, 'closed');
    assert.equal(s.state, 'closed_unanswered');
    assert.match(s.label, /no reply recorded/);
  });
});

describe('slaFor (answered)', () => {
  const answered = (minutes: number) =>
    slaFor({ createdAt: CREATED, firstReplyAt: after(minutes).toISOString(), status: 'replied', now: after(minutes + 10_000) });

  test('measures created_at to the first reply, not to now, and says whether it met the 1-hour target', () => {
    assert.deepEqual([answered(42).state, answered(42).elapsedMinutes, answered(42).label], ['answered', 42, 'First reply after 42 min']);
    assert.match(answered(60).detail, /within the 1-hour target/);
    assert.match(answered(61).detail, /after the 1-hour target/);
  });

  test('stays answered when the enquiry is reopened or closed afterwards', () => {
    for (const status of ['in_progress', 'closed']) {
      assert.equal(slaFor({ createdAt: CREATED, firstReplyAt: after(30).toISOString(), status, now: after(9000) }).state, 'answered', status);
    }
  });
});

describe('formatElapsed', () => {
  test('reads naturally at each scale', () => {
    const cases: [number, string][] = [
      [0, 'under 1 min'], [0.9, 'under 1 min'], [1, '1 min'], [59, '59 min'], [60, '1 h'], [65, '1 h 5 min'], [47 * 60 + 59, '47 h 59 min'],
      [48 * 60, '2 days'], [49 * 60, '2 days 1 h'], [-3, 'under 1 min'],
    ];
    for (const [input, expected] of cases) assert.equal(formatElapsed(input), expected, String(input));
  });
});
