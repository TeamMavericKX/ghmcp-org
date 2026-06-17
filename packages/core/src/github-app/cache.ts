// In-memory cache for installation tokens.
//
// GitHub installation tokens live for 60 minutes and cannot be revoked early
// in a meaningful way. To avoid hitting the access-tokens endpoint on every
// request, we cache the token per (app, installation) pair and refresh it
// when it gets close to expiry. The cache uses single-flight semantics so
// concurrent callers share one in-flight mint.
//
// The cache is intentionally process-local. A multi-replica deployment
// should either share tokens (one replica per installation) or wrap this
// cache with a distributed lock — out of scope for v0.1.

import {
  type Installation,
  type InstallationToken,
  isTokenExpired,
  shouldRefreshToken,
  tokenRemainingSeconds,
} from './installation.js';

/** Fetches a fresh installation token from GitHub. */
export type InstallationTokenFetcher = (installation: Installation) => Promise<InstallationToken>;

/** Returns the current Unix seconds. */
export type Clock = () => number;

export interface InstallationTokenCacheOptions {
  /** How early to refresh before expiry. Defaults to 5 minutes. */
  readonly refreshWindowSeconds?: number;
  /** Clock for tests. Defaults to `Math.floor(Date.now() / 1000)`. */
  readonly clock?: Clock;
  /** Fetcher implementation — usually the GitHub HTTP client. */
  readonly fetcher: InstallationTokenFetcher;
}

interface CacheEntry {
  readonly token: InstallationToken;
  readonly installation: Installation;
  /** Wall-clock unix seconds when the current in-flight mint was started. */
  inflightStartedAt?: number;
  inflight?: Promise<InstallationToken>;
}

const DEFAULT_REFRESH_WINDOW_SECONDS = 5 * 60;

/**
 * Per-process installation token cache. Safe to share across requests.
 */
export class InstallationTokenCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #refreshWindowSeconds: number;
  readonly #clock: Clock;
  readonly #fetcher: InstallationTokenFetcher;

  constructor(options: InstallationTokenCacheOptions) {
    this.#refreshWindowSeconds = options.refreshWindowSeconds ?? DEFAULT_REFRESH_WINDOW_SECONDS;
    this.#clock = options.clock ?? defaultClock;
    this.#fetcher = options.fetcher;
  }

  /**
   * Get a valid (or just-issued) token for the given installation, minting
   * or refreshing as needed. Single-flight: concurrent callers share one
   * in-flight request.
   */
  async getToken(installation: Installation): Promise<InstallationToken> {
    const key = cacheKey(installation);
    const existing = this.#entries.get(key);
    const now = this.#clock();

    if (existing && !this.#needsRefresh(existing.token, now)) {
      return existing.token;
    }

    if (existing?.inflight) {
      return existing.inflight;
    }

    return this.#mint(installation, key, now);
  }

  /** Drop a cached token; the next `getToken` will mint a new one. */
  invalidate(installation: Installation): void {
    this.#entries.delete(cacheKey(installation));
  }

  /** Drop every cached token. */
  invalidateAll(): void {
    this.#entries.clear();
  }

  /**
   * Diagnostic snapshot of the cache. Returned array is a copy; mutating it
   * does not affect the cache.
   */
  snapshot(): readonly CacheSnapshotEntry[] {
    const now = this.#clock();
    return [...this.#entries.values()].map((entry) => ({
      installationId: entry.installation.id,
      token: entry.token.token,
      expiresAt: entry.token.expiresAt,
      remainingSeconds: tokenRemainingSeconds(entry.token, now),
      refreshing: entry.inflight !== undefined,
    }));
  }

  #needsRefresh(token: InstallationToken, now: number): boolean {
    if (isTokenExpired(token, now)) return true;
    return shouldRefreshToken(token, now, this.#refreshWindowSeconds);
  }

  async #mint(installation: Installation, key: string, now: number): Promise<InstallationToken> {
    const inflight = (async () => {
      try {
        const token = await this.#fetcher(installation);
        this.#entries.set(key, {
          token,
          installation,
        });
        return token;
      } finally {
        // Drop the inflight marker so the next call re-evaluates freshness.
        const entry = this.#entries.get(key);
        if (entry?.inflight) {
          this.#entries.set(key, {
            token: entry.token,
            installation: entry.installation,
          });
        }
      }
    })();

    this.#entries.set(key, {
      token: placeholderToken(),
      installation,
      inflightStartedAt: now,
      inflight,
    });

    return inflight;
  }
}

export interface CacheSnapshotEntry {
  readonly installationId: number;
  readonly token: string;
  readonly expiresAt: number;
  readonly remainingSeconds: number;
  readonly refreshing: boolean;
}

function cacheKey(installation: Installation): string {
  return `${installation.id}`;
}

function placeholderToken(): InstallationToken {
  // Until the real token lands, expose an obviously-expired placeholder
  // so that any other code that reads the entry will not treat it as
  // valid. The inflight promise is the only source of truth while a mint
  // is in flight.
  return {
    token: '',
    issuedAt: 0,
    expiresAt: 0,
    permissions: {},
    repositorySelection: 'all',
    repositories: [],
  };
}

function defaultClock(): number {
  return Math.floor(Date.now() / 1000);
}

export const DEFAULT_INSTALLATION_TOKEN_REFRESH_WINDOW_SECONDS = DEFAULT_REFRESH_WINDOW_SECONDS;
