// A sliding-window rate limiter held in memory. It never grows past `maxKeys` entries.
// ponytail: state is per process and lost on restart, and one process serves this app. If it is ever
// run as several instances, move the counters into SQLite or a shared store.

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until a slot frees up; 0 when allowed. */
  retryAfterSec: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 5000,
  ) {}

  /** Would one more hit for `key` be allowed? Does not record anything. */
  check(key: string, nowMs: number): RateLimitResult {
    const recent = this.recent(key, nowMs);
    if (recent.length < this.limit) return { allowed: true, retryAfterSec: 0 };
    const oldest = recent[0] ?? nowMs;
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + this.windowMs - nowMs) / 1000)) };
  }

  /** Records one hit for `key`. */
  record(key: string, nowMs: number): void {
    const recent = this.recent(key, nowMs);
    recent.push(nowMs);
    this.hits.delete(key); // re-insert so the Map's order stays oldest-activity first
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.evict(nowMs);
  }

  get size(): number {
    return this.hits.size;
  }

  private recent(key: string, nowMs: number): number[] {
    return (this.hits.get(key) ?? []).filter((t) => t > nowMs - this.windowMs);
  }

  private evict(nowMs: number): void {
    // 1. Prune expired hits and remove keys that no longer have hits within the sliding window.
    for (const [key, times] of this.hits) {
      const active = times.filter((t) => t > nowMs - this.windowMs);
      if (active.length === 0) {
        this.hits.delete(key);
      } else if (active.length !== times.length) {
        this.hits.set(key, active);
      }
    }

    if (this.hits.size <= this.maxKeys) return;

    // 2. Memory bound reached with live keys.
    // To prevent key spraying from defeating rate limits, prioritize retaining actively blocked keys
    // (hits >= limit) and keys with higher hit counts. An attacker spraying single-hit fake keys must
    // never evict a blocked account or an account accumulating failed attempts.
    const unblocked: { key: string; count: number; lastHit: number }[] = [];
    const blocked: { key: string; oldestHit: number }[] = [];

    for (const [key, times] of this.hits) {
      if (times.length < this.limit) {
        unblocked.push({ key, count: times.length, lastHit: times[times.length - 1] ?? 0 });
      } else {
        blocked.push({ key, oldestHit: times[0] ?? 0 });
      }
    }

    // Unblocked keys are evicted first: lowest hit count first, then least recently active (oldest lastHit).
    unblocked.sort((a, b) => a.count - b.count || a.lastHit - b.lastHit);

    let needed = this.hits.size - this.maxKeys;
    for (const item of unblocked) {
      if (needed <= 0) break;
      this.hits.delete(item.key);
      needed--;
    }

    if (needed > 0) {
      // If the limiter is entirely full of blocked keys, evict the blocked key whose penalty expires soonest.
      blocked.sort((a, b) => a.oldestHit - b.oldestHit);
      for (const item of blocked) {
        if (needed <= 0) break;
        this.hits.delete(item.key);
        needed--;
      }
    }
  }
}
