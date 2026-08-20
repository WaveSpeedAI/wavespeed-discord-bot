// Per-user rate limiting and global concurrency control.
//
// A shared bot spends the host's WaveSpeed credits, so every generation
// command passes through here first. Two independent guards:
//
//   * a rolling per-user window (default 5 jobs / 5 minutes), and
//   * a global in-flight cap so a busy server cannot queue unbounded work.

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds until the user's next slot, when denied by the user window. */
  retryAfterMs?: number;
  reason?: 'user-window' | 'global-concurrency';
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private inFlight = 0;

  constructor(
    private readonly limitPerUser: number,
    private readonly windowMs: number,
    private readonly maxConcurrent: number,
    private readonly now: () => number = Date.now,
  ) {}

  get activeJobs(): number {
    return this.inFlight;
  }

  /**
   * Reserve a generation slot for `userId`. On success the caller MUST call
   * `release()` when the job settles.
   */
  tryAcquire(userId: string): RateLimitDecision {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(userId) ?? []).filter((at) => at > cutoff);

    if (recent.length >= this.limitPerUser) {
      const oldest = recent[0] ?? now;
      this.hits.set(userId, recent);
      return {
        allowed: false,
        reason: 'user-window',
        retryAfterMs: Math.max(0, oldest + this.windowMs - now),
      };
    }

    if (this.inFlight >= this.maxConcurrent) {
      this.hits.set(userId, recent);
      return { allowed: false, reason: 'global-concurrency' };
    }

    recent.push(now);
    this.hits.set(userId, recent);
    this.inFlight += 1;
    return { allowed: true };
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  /** Drop window entries that can no longer matter. Called opportunistically. */
  prune(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [userId, timestamps] of this.hits) {
      const kept = timestamps.filter((at) => at > cutoff);
      if (kept.length === 0) this.hits.delete(userId);
      else this.hits.set(userId, kept);
    }
  }
}
