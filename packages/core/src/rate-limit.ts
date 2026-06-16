// Per-tool rate limiter. Token-bucket per tool name. The bucket starts
// full and refills at a fixed rate. A successful consume takes one
// token; an empty bucket rejects with RateLimitError.

import { RateLimitError } from "./errors/index.js";

export interface RateLimitPolicy {
  readonly name: string;
  /** Max tokens in the bucket (== burst). */
  readonly capacity: number;
  /** Tokens added per second. */
  readonly refillPerSecond: number;
}

export interface RateLimiter {
  tryAcquire(name: string, weight?: number): boolean;
  acquireOrThrow(name: string, weight?: number): void;
  snapshot(): readonly RateLimitStatus[];
}

export interface RateLimitStatus {
  readonly name: string;
  readonly tokens: number;
  readonly capacity: number;
  readonly refillPerSecond: number;
}

class TokenBucket {
  tokens: number;
  lastRefillMs: number;
  constructor(public readonly policy: RateLimitPolicy, now: number) {
    this.tokens = policy.capacity;
    this.lastRefillMs = now;
  }
  take(weight: number, now: number): boolean {
    const elapsed = Math.max(0, (now - this.lastRefillMs) / 1000);
    this.tokens = Math.min(this.policy.capacity, this.tokens + elapsed * this.policy.refillPerSecond);
    this.lastRefillMs = now;
    if (this.tokens >= weight) {
      this.tokens -= weight;
      return true;
    }
    return false;
  }
}

class DefaultRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly policies = new Map<string, RateLimitPolicy>();

  constructor(policies: readonly RateLimitPolicy[], private readonly now: () => number = Date.now) {
    for (const p of policies) {
      if (this.policies.has(p.name)) {
        throw new Error(`duplicate rate limit policy: ${p.name}`);
      }
      this.policies.set(p.name, p);
      this.buckets.set(p.name, new TokenBucket(p, this.now()));
    }
  }

  tryAcquire(name: string, weight = 1): boolean {
    const bucket = this.buckets.get(name);
    if (bucket === undefined) return true; // unlimited by default
    return bucket.take(weight, this.now());
  }

  acquireOrThrow(name: string, weight = 1): void {
    if (!this.tryAcquire(name, weight)) {
      throw new RateLimitError(`rate limit exceeded for ${name}`, 1);
    }
  }

  snapshot(): readonly RateLimitStatus[] {
    return Array.from(this.policies.values()).map((p) => {
      const b = this.buckets.get(p.name);
      return {
        name: p.name,
        tokens: b?.tokens ?? p.capacity,
        capacity: p.capacity,
        refillPerSecond: p.refillPerSecond,
      };
    });
  }
}

export function createRateLimiter(policies: readonly RateLimitPolicy[]): RateLimiter {
  return new DefaultRateLimiter(policies);
}
