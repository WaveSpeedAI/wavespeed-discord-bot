import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limit.js';

describe('RateLimiter', () => {
  it('allows up to the per-user limit inside the window', () => {
    const now = 1_000;
    const limiter = new RateLimiter(3, 60_000, 10, () => now);
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.tryAcquire('u1').allowed).toBe(true);
      limiter.release();
    }
    const denied = limiter.tryAcquire('u1');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('user-window');
    expect(denied.retryAfterMs).toBe(60_000);
  });

  it('lets the user through again once the window rolls over', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1_000, 10, () => now);
    expect(limiter.tryAcquire('u1').allowed).toBe(true);
    limiter.release();
    expect(limiter.tryAcquire('u1').allowed).toBe(false);
    now = 1_001;
    expect(limiter.tryAcquire('u1').allowed).toBe(true);
  });

  it('tracks users independently', () => {
    const limiter = new RateLimiter(1, 60_000, 10);
    expect(limiter.tryAcquire('u1').allowed).toBe(true);
    expect(limiter.tryAcquire('u2').allowed).toBe(true);
    expect(limiter.tryAcquire('u1').allowed).toBe(false);
  });

  it('enforces the global concurrency cap without burning the user window', () => {
    const limiter = new RateLimiter(10, 60_000, 2);
    expect(limiter.tryAcquire('u1').allowed).toBe(true);
    expect(limiter.tryAcquire('u2').allowed).toBe(true);
    const denied = limiter.tryAcquire('u3');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('global-concurrency');
    expect(limiter.activeJobs).toBe(2);
    limiter.release();
    expect(limiter.tryAcquire('u3').allowed).toBe(true);
  });

  it('never lets release drive the in-flight count negative', () => {
    const limiter = new RateLimiter(1, 1_000, 1);
    limiter.release();
    limiter.release();
    expect(limiter.activeJobs).toBe(0);
  });

  it('prunes expired entries', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 100, 5, () => now);
    limiter.tryAcquire('u1');
    limiter.release();
    now = 500;
    limiter.prune();
    expect(limiter.tryAcquire('u1').allowed).toBe(true);
  });
});
