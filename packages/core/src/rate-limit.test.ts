// Unit tests for the per-tool rate limiter. Uses a virtual clock
// factory so the token bucket can be exercised deterministically.

import { describe, expect, it } from 'vitest';
import { RateLimitError } from './errors/index.js';
import { createRateLimiter } from './rate-limit.js';

const policy = (
  over: Partial<{ capacity: number; refillPerSecond: number; name: string }> = {},
) => ({
  name: over.name ?? 'search_repos',
  capacity: over.capacity ?? 5,
  refillPerSecond: over.refillPerSecond ?? 1,
});

const virtualClock = (start = 0) => {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('createRateLimiter', () => {
  it('permits up to capacity in a burst', () => {
    const clock = virtualClock();
    const limiter = createRateLimiter([policy()], clock.now);
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.tryAcquire('search_repos')).toBe(true);
    }
  });

  it('rejects the request that exceeds capacity', () => {
    const clock = virtualClock();
    const limiter = createRateLimiter([policy({ capacity: 2 })], clock.now);
    expect(limiter.tryAcquire('search_repos')).toBe(true);
    expect(limiter.tryAcquire('search_repos')).toBe(true);
    expect(limiter.tryAcquire('search_repos')).toBe(false);
  });

  it('refills tokens at the configured rate over time', () => {
    const clock = virtualClock();
    const limiter = createRateLimiter([policy({ capacity: 1, refillPerSecond: 1 })], clock.now);
    expect(limiter.tryAcquire('search_repos')).toBe(true);
    expect(limiter.tryAcquire('search_repos')).toBe(false);
    clock.advance(1_000);
    expect(limiter.tryAcquire('search_repos')).toBe(true);
  });

  it('never refills above the bucket capacity', () => {
    const clock = virtualClock();
    const limiter = createRateLimiter([policy({ capacity: 3, refillPerSecond: 10 })], clock.now);
    expect(limiter.tryAcquire('search_repos')).toBe(true);
    expect(limiter.tryAcquire('search_repos')).toBe(true);
    expect(limiter.tryAcquire('search_repos')).toBe(true);
    clock.advance(10_000);
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.tryAcquire('search_repos')).toBe(true);
    }
    expect(limiter.tryAcquire('search_repos')).toBe(false);
  });

  it('treats unknown tool names as unlimited', () => {
    const clock = virtualClock();
    const limiter = createRateLimiter([policy()], clock.now);
    for (let i = 0; i < 100; i += 1) {
      expect(limiter.tryAcquire('untracked_tool')).toBe(true);
    }
  });

  it('acquireOrThrow throws RateLimitError when empty', () => {
    const clock = virtualClock();
    const limiter = createRateLimiter([policy({ capacity: 1 })], clock.now);
    expect(limiter.tryAcquire('search_repos')).toBe(true);
    expect(() => limiter.acquireOrThrow('search_repos')).toThrow(RateLimitError);
  });

  it('snapshot reflects the current token count after refill', () => {
    const clock = virtualClock();
    const limiter = createRateLimiter([policy({ capacity: 4, refillPerSecond: 2 })], clock.now);
    for (let i = 0; i < 4; i += 1) {
      limiter.tryAcquire('search_repos');
    }
    clock.advance(1_000);
    const [status] = limiter.snapshot();
    expect(status).toBeDefined();
    if (status) {
      expect(status.name).toBe('search_repos');
      expect(status.capacity).toBe(4);
      expect(status.refillPerSecond).toBe(2);
      // 2 tokens refilled in 1s at rate 2, capped at capacity 4.
      expect(status.tokens).toBe(2);
    }
  });

  it('rejects duplicate policy names on construction', () => {
    expect(() =>
      createRateLimiter([policy({ name: 'a' }), policy({ name: 'a' })], virtualClock().now),
    ).toThrow(/duplicate rate limit policy/);
  });
});
