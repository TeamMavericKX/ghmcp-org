// Multi-tenant routing layer.
//
// A "tenant" is a self-contained customer identity: their own GitHub App
// installation, their own toolset allowlist, and their own optional
// repository allowlist. The server is multi-tenant because a single
// process can serve many tenants at once (e.g. one MCP endpoint, one
// process, hundreds of GitHub Apps behind it).
//
// The registry is keyed by an opaque `tenantId` (e.g. a URL slug from the
// inbound HTTP path, or a header value). Lookup is a fast in-memory
// `Map`; the registry is process-local and immutable per load. To rotate
// config, build a new registry and atomically swap it in the caller.

import { InvalidInputError, NotFoundError } from '../errors/index.js';
import type { InstallationRepositorySelection } from '../github-app/index.js';

export interface TenantConfig {
  /** Stable, URL-safe identifier (e.g. "acme"). */
  readonly id: string;
  /** Human-readable label for logs and dashboards. */
  readonly displayName: string;
  /** GitHub App id. */
  readonly appId: string;
  /** Installation id to mint access tokens for. */
  readonly installationId: string;
  /** Whether the tenant's access tokens should bind to all or selected repos. */
  readonly repositorySelection: InstallationRepositorySelection;
  /** Specific repository ids this tenant is allowed to operate on (empty = all). */
  readonly allowedRepositoryIds: readonly number[];
  /** Toolsets the tenant is allowed to invoke. Empty = none. */
  readonly allowedToolsets: readonly string[];
  /** API base override (e.g. for GitHub Enterprise). */
  readonly apiBase: string;
}

export interface TenantRegistryOptions {
  readonly tenants: readonly TenantConfig[];
}

export class TenantRegistry {
  readonly #tenants: ReadonlyMap<string, TenantConfig>;

  constructor(options: TenantRegistryOptions) {
    const map = new Map<string, TenantConfig>();
    for (const tenant of options.tenants) {
      validateTenant(tenant);
      if (map.has(tenant.id)) {
        throw new InvalidInputError(`duplicate tenant id: ${tenant.id}`, {
          cause: { id: tenant.id },
        });
      }
      map.set(tenant.id, tenant);
    }
    this.#tenants = map;
  }

  /** Returns the tenant for `id`, or throws `NotFoundError`. */
  get(id: string): TenantConfig {
    const tenant = this.#tenants.get(id);
    if (!tenant) {
      throw new NotFoundError(`tenant not found: ${id}`, { cause: { id } });
    }
    return tenant;
  }

  /** Returns the tenant for `id`, or `undefined`. */
  tryGet(id: string): TenantConfig | undefined {
    return this.#tenants.get(id);
  }

  /** Whether a tenant with this id is registered. */
  has(id: string): boolean {
    return this.#tenants.has(id);
  }

  /** All tenants. Returned array is a copy. */
  list(): readonly TenantConfig[] {
    return [...this.#tenants.values()];
  }

  /** Number of registered tenants. */
  size(): number {
    return this.#tenants.size;
  }

  /**
   * Returns the subset of `repositoryIds` that the tenant is allowed to
   * access. If the tenant has no allowlist, returns the input unchanged.
   */
  filterAllowedRepositories(id: string, repositoryIds: readonly number[]): readonly number[] {
    const tenant = this.get(id);
    if (tenant.allowedRepositoryIds.length === 0) {
      return [...repositoryIds];
    }
    const allow = new Set(tenant.allowedRepositoryIds);
    return repositoryIds.filter((rid) => allow.has(rid));
  }

  /** Whether the tenant is allowed to invoke a given toolset. */
  isToolsetAllowed(id: string, toolset: string): boolean {
    const tenant = this.get(id);
    return tenant.allowedToolsets.includes(toolset);
  }
}

const TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
const NUMERIC_RE = /^\d+$/;

function validateTenant(tenant: TenantConfig): void {
  if (!TENANT_ID_RE.test(tenant.id)) {
    throw new InvalidInputError(
      `tenant id must match ${TENANT_ID_RE} (lowercase, digits, dashes)`,
      { cause: { id: tenant.id } },
    );
  }
  if (tenant.displayName.length === 0) {
    throw new InvalidInputError(`tenant ${tenant.id}: displayName is required`);
  }
  if (!NUMERIC_RE.test(tenant.appId)) {
    throw new InvalidInputError(`tenant ${tenant.id}: appId must be numeric`, {
      cause: { appId: tenant.appId },
    });
  }
  if (!NUMERIC_RE.test(tenant.installationId)) {
    throw new InvalidInputError(`tenant ${tenant.id}: installationId must be numeric`, {
      cause: { installationId: tenant.installationId },
    });
  }
  for (const toolset of tenant.allowedToolsets) {
    if (toolset.length === 0) {
      throw new InvalidInputError(`tenant ${tenant.id}: empty toolset name`);
    }
  }
  for (const rid of tenant.allowedRepositoryIds) {
    if (!Number.isInteger(rid) || rid < 0) {
      throw new InvalidInputError(
        `tenant ${tenant.id}: allowedRepositoryIds must contain non-negative integers`,
        { cause: { value: rid } },
      );
    }
  }
}
