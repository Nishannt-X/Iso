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
    for (const [key, times] of this.hits) {
      if (!times.some((t) => t > nowMs - this.windowMs)) this.hits.delete(key);
    }
    // Still full of live keys: drop the least recently active until back under the bound.
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(key);
    }
  }
}
