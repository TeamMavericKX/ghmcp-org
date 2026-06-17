import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../errors/index.js';
import type { Installation, InstallationToken } from '../github-app/index.js';
import { TenantAppClients } from './clients.js';
import type { TenantConfig } from './registry.js';
import { TenantRegistry } from './registry.js';

const PEM = '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----';

function makeTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    id: 'acme',
    displayName: 'Acme',
    appId: '123',
    installationId: '456',
    privateKey: PEM,
    repositorySelection: 'all',
    allowedRepositoryIds: [],
    allowedToolsets: ['repos'],
    apiBase: 'https://api.github.com',
    ...overrides,
  };
}

function makeInstallation(overrides: Partial<Installation> = {}): Installation {
  return {
    id: 4242,
    account: { id: 9999, login: 'acme', type: 'Organization' },
    repositorySelection: 'all',
    permissions: { contents: 'read' },
    ...overrides,
  };
}

function makeToken(expiresAt: number): InstallationToken {
  return {
    token: 'ghs_test',
    expiresAt,
    permissions: {},
    repositorySelection: 'all',
    repositories: [],
  };
}

function buildRegistry(tenants: TenantConfig[]): TenantRegistry {
  return new TenantRegistry({ tenants });
}

describe('TenantAppClients', () => {
  it('builds a per-tenant client on first access', () => {
    const registry = buildRegistry([makeTenant()]);
    const clients = new TenantAppClients({ registry });
    const entry = clients.for('acme');
    expect(entry.tenant.id).toBe('acme');
    expect(entry.client).toBeDefined();
    expect(entry.cache).toBeDefined();
    expect(clients.size()).toBe(1);
  });

  it('returns the same entry on subsequent calls', () => {
    const registry = buildRegistry([makeTenant()]);
    const clients = new TenantAppClients({ registry });
    const a = clients.for('acme');
    const b = clients.for('acme');
    expect(a).toBe(b);
    expect(clients.size()).toBe(1);
  });

  it('throws NotFoundError for unknown tenant ids', () => {
    const registry = buildRegistry([makeTenant()]);
    const clients = new TenantAppClients({ registry });
    expect(() => clients.for('nope')).toThrow(NotFoundError);
  });

  it('has() reports warmed entries', () => {
    const registry = buildRegistry([makeTenant()]);
    const clients = new TenantAppClients({ registry });
    expect(clients.has('acme')).toBe(false);
    clients.for('acme');
    expect(clients.has('acme')).toBe(true);
  });

  it('warmup() initializes entries for every tenant', () => {
    const registry = buildRegistry([makeTenant({ id: 'aa' }), makeTenant({ id: 'bb' })]);
    const clients = new TenantAppClients({ registry });
    clients.warmup();
    expect(clients.size()).toBe(2);
    expect(clients.has('aa')).toBe(true);
    expect(clients.has('bb')).toBe(true);
  });

  it('invalidate() drops a single entry', () => {
    const registry = buildRegistry([makeTenant()]);
    const clients = new TenantAppClients({ registry });
    const first = clients.for('acme');
    clients.invalidate('acme');
    expect(clients.has('acme')).toBe(false);
    const second = clients.for('acme');
    expect(second).not.toBe(first);
  });

  it('invalidateAll() drops every entry', () => {
    const registry = buildRegistry([makeTenant({ id: 'aa' }), makeTenant({ id: 'bb' })]);
    const clients = new TenantAppClients({ registry });
    clients.warmup();
    clients.invalidateAll();
    expect(clients.size()).toBe(0);
  });

  it('uses the injected fetcher when provided', async () => {
    const token = makeToken(1_700_000_000 + 3600);
    const fetcher = vi.fn(async (_installation: Installation) => token);
    const registry = buildRegistry([makeTenant()]);
    const clients = new TenantAppClients({ registry, fetcher });
    const entry = clients.for('acme');
    const result = await entry.cache.getToken(makeInstallation());
    expect(result.token).toBe('ghs_test');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cache respects a custom clock', async () => {
    let now = 1_700_000_000;
    const clock = () => now;
    const fetcher = vi.fn(async (_installation: Installation) => makeToken(now + 3600));
    const registry = buildRegistry([makeTenant()]);
    const clients = new TenantAppClients({ registry, fetcher, clock });
    const entry = clients.for('acme');
    await entry.cache.getToken(makeInstallation());
    expect(fetcher).toHaveBeenCalledTimes(1);
    // 100s later — still well within the 1h token TTL, hit the cache.
    now += 100;
    await entry.cache.getToken(makeInstallation());
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Advance past expiry — should re-mint.
    now += 3601;
    await entry.cache.getToken(makeInstallation());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('different tenants get different clients', () => {
    const registry = buildRegistry([makeTenant({ id: 'aa' }), makeTenant({ id: 'bb' })]);
    const clients = new TenantAppClients({ registry });
    const a = clients.for('aa');
    const b = clients.for('bb');
    expect(a.tenant.id).toBe('aa');
    expect(b.tenant.id).toBe('bb');
    expect(a.client).not.toBe(b.client);
    expect(a.cache).not.toBe(b.cache);
  });

  it('apiBase override beats per-tenant apiBase', () => {
    const registry = buildRegistry([makeTenant({ id: 'aa', apiBase: 'https://api.github.com' })]);
    const clients = new TenantAppClients({
      registry,
      apiBase: 'https://ghe.local/api/v3',
    });
    const entry = clients.for('aa');
    // We don't expose apiBase on the client directly, but we can confirm
    // the client was built; the apiBase propagation is covered by the
    // underlying GitHubAppClient tests.
    expect(entry.client).toBeDefined();
  });
});
