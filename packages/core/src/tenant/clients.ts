// Per-tenant GitHub App client + token cache.
//
// Each tenant has its own GitHub App id, installation id, private key,
// and (optionally) its own API base. A multi-tenant server therefore
// needs a way to mint installation tokens for whichever tenant a given
// request landed on.
//
// `TenantAppClients` holds a process-local `Map<tenantId, TenantClients>`
// and lazily builds a `GitHubAppClient` + `InstallationTokenCache` the
// first time a tenant is touched. Lookups are O(1); the map is
// immutable after construction in the sense that entries are never
// replaced, but new entries can be added (lazy init).

import {
  GitHubAppClient,
  type InstallationToken,
  type InstallationTokenCache,
  InstallationTokenCache as InstallationTokenCacheImpl,
  type InstallationTokenFetcher,
} from '../github-app/index.js';
import type { TenantConfig, TenantRegistry } from './registry.js';

export interface TenantClients {
  readonly tenant: TenantConfig;
  readonly client: GitHubAppClient;
  readonly cache: InstallationTokenCache;
}

export interface TenantAppClientsOptions {
  /** Source of truth for tenant configs. */
  readonly registry: TenantRegistry;
  /**
   * Optional fetcher override. If provided, this fetcher is wired into
   * every tenant's token cache INSTEAD of the per-tenant GitHubAppClient.
   * Useful for tests and for callers that want to inject a single
   * shared HTTP client.
   */
  readonly fetcher?: InstallationTokenFetcher;
  /** Refresh window in seconds applied to each tenant's cache. */
  readonly refreshWindowSeconds?: number;
  /** Optional API base override applied to every tenant. */
  readonly apiBase?: string;
  /** Clock injected into the token cache (defaults to Date.now / 1000). */
  readonly clock?: () => number;
}

/**
 * Holds per-tenant GitHub App clients + installation token caches.
 * Lazily constructs entries on first access. Construct once at startup
 * and share across requests.
 */
export class TenantAppClients {
  readonly #registry: TenantRegistry;
  readonly #fetcher: InstallationTokenFetcher | undefined;
  readonly #refreshWindowSeconds: number | undefined;
  readonly #apiBase: string | undefined;
  readonly #clock: () => number;
  readonly #entries = new Map<string, TenantClients>();

  constructor(options: TenantAppClientsOptions) {
    this.#registry = options.registry;
    this.#fetcher = options.fetcher;
    this.#refreshWindowSeconds = options.refreshWindowSeconds;
    this.#apiBase = options.apiBase;
    this.#clock = options.clock ?? defaultClock;
  }

  /** Returns the per-tenant client+cache pair for `tenantId`, building if needed. */
  for(tenantId: string): TenantClients {
    let entry = this.#entries.get(tenantId);
    if (entry) return entry;
    const tenant = this.#registry.get(tenantId);
    entry = buildTenantClients(tenant, this.#buildOptions());
    this.#entries.set(tenantId, entry);
    return entry;
  }

  /** Whether a tenant has an initialized client entry. */
  has(tenantId: string): boolean {
    return this.#entries.has(tenantId);
  }

  /** Number of tenants that have been touched so far. */
  size(): number {
    return this.#entries.size;
  }

  /** Pre-warm entries for every registered tenant. */
  warmup(): void {
    const opts = this.#buildOptions();
    for (const tenant of this.#registry.list()) {
      if (!this.#entries.has(tenant.id)) {
        this.#entries.set(tenant.id, buildTenantClients(tenant, opts));
      }
    }
  }

  /** Drop the cached entry for `tenantId`. Next `for()` call rebuilds. */
  invalidate(tenantId: string): void {
    this.#entries.delete(tenantId);
  }

  /** Drop every cached entry. */
  invalidateAll(): void {
    this.#entries.clear();
  }

  #buildOptions(): BuildOptions {
    return {
      fetcher: this.#fetcher,
      refreshWindowSeconds: this.#refreshWindowSeconds,
      apiBaseOverride: this.#apiBase,
      clock: this.#clock,
    };
  }
}

interface BuildOptions {
  readonly fetcher: InstallationTokenFetcher | undefined;
  readonly refreshWindowSeconds: number | undefined;
  readonly apiBaseOverride: string | undefined;
  readonly clock: () => number;
}

function buildTenantClients(tenant: TenantConfig, options: BuildOptions): TenantClients {
  const client = new GitHubAppClient({
    appId: tenant.appId,
    privateKey: tenant.privateKey,
    apiBase: options.apiBaseOverride ?? tenant.apiBase,
  });
  const fetcher =
    options.fetcher ?? ((installation) => client.createInstallationToken(installation));
  const cache = new InstallationTokenCacheImpl({
    fetcher,
    clock: options.clock,
    ...(options.refreshWindowSeconds !== undefined
      ? { refreshWindowSeconds: options.refreshWindowSeconds }
      : {}),
  });
  return { tenant, client, cache };
}

function defaultClock(): number {
  return Math.floor(Date.now() / 1000);
}

/** Re-export so callers don't have to dig into the cache module. */
export type { InstallationToken };
