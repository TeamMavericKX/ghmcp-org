import { describe, expect, it } from 'vitest';
import { InvalidInputError, NotFoundError } from '../errors/index.js';
import { type TenantConfig, TenantRegistry } from './registry.js';

function makeTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    id: 'acme',
    displayName: 'Acme',
    appId: '123',
    installationId: '456',
    repositorySelection: 'all',
    allowedRepositoryIds: [],
    allowedToolsets: ['repos'],
    apiBase: 'https://api.github.com',
    ...overrides,
  };
}

describe('TenantRegistry', () => {
  it('returns a registered tenant by id', () => {
    const tenant = makeTenant();
    const registry = new TenantRegistry({ tenants: [tenant] });
    expect(registry.get('acme')).toEqual(tenant);
  });

  it('throws NotFoundError for an unknown id', () => {
    const registry = new TenantRegistry({ tenants: [] });
    expect(() => registry.get('missing')).toThrow(NotFoundError);
  });

  it('tryGet returns undefined for unknown ids', () => {
    const registry = new TenantRegistry({ tenants: [] });
    expect(registry.tryGet('nope')).toBeUndefined();
  });

  it('has() reports presence', () => {
    const registry = new TenantRegistry({ tenants: [makeTenant()] });
    expect(registry.has('acme')).toBe(true);
    expect(registry.has('other')).toBe(false);
  });

  it('list() returns all tenants in insertion order', () => {
    const a = makeTenant({ id: 'aa' });
    const b = makeTenant({ id: 'bb' });
    const c = makeTenant({ id: 'cc' });
    const registry = new TenantRegistry({ tenants: [a, b, c] });
    expect(registry.list().map((t) => t.id)).toEqual(['aa', 'bb', 'cc']);
  });

  it('size() reports the tenant count', () => {
    const registry = new TenantRegistry({
      tenants: [makeTenant({ id: 'aa' }), makeTenant({ id: 'bb' })],
    });
    expect(registry.size()).toBe(2);
  });

  it('rejects duplicate tenant ids', () => {
    const a = makeTenant({ id: 'dup' });
    const b = makeTenant({ id: 'dup' });
    expect(() => new TenantRegistry({ tenants: [a, b] })).toThrow(InvalidInputError);
  });

  it('accepts well-formed ids with dashes and digits', () => {
    const tenant = makeTenant({ id: 'a1-b2-c3' });
    const registry = new TenantRegistry({ tenants: [tenant] });
    expect(registry.has('a1-b2-c3')).toBe(true);
  });

  it('rejects ids with uppercase letters', () => {
    expect(() => new TenantRegistry({ tenants: [makeTenant({ id: 'Acme' })] })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects ids with leading or trailing dashes', () => {
    expect(() => new TenantRegistry({ tenants: [makeTenant({ id: '-acme' })] })).toThrow(
      InvalidInputError,
    );
    expect(() => new TenantRegistry({ tenants: [makeTenant({ id: 'acme-' })] })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects ids that are too long', () => {
    const longId = 'a'.repeat(65);
    expect(() => new TenantRegistry({ tenants: [makeTenant({ id: longId })] })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects empty displayName', () => {
    expect(() => new TenantRegistry({ tenants: [makeTenant({ displayName: '' })] })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects non-numeric appId', () => {
    expect(() => new TenantRegistry({ tenants: [makeTenant({ appId: 'abc' })] })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects non-numeric installationId', () => {
    expect(() => new TenantRegistry({ tenants: [makeTenant({ installationId: 'xyz' })] })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects empty toolset names', () => {
    expect(
      () => new TenantRegistry({ tenants: [makeTenant({ allowedToolsets: ['valid', ''] })] }),
    ).toThrow(InvalidInputError);
  });

  it('rejects negative repository ids', () => {
    expect(
      () =>
        new TenantRegistry({
          tenants: [makeTenant({ allowedRepositoryIds: [1, -2] })],
        }),
    ).toThrow(InvalidInputError);
  });

  it('rejects non-integer repository ids', () => {
    expect(
      () =>
        new TenantRegistry({
          tenants: [makeTenant({ allowedRepositoryIds: [1.5] })],
        }),
    ).toThrow(InvalidInputError);
  });

  it('filterAllowedRepositories passes everything through when no allowlist', () => {
    const registry = new TenantRegistry({ tenants: [makeTenant()] });
    expect(registry.filterAllowedRepositories('acme', [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('filterAllowedRepositories narrows to the allowlist', () => {
    const registry = new TenantRegistry({
      tenants: [makeTenant({ allowedRepositoryIds: [2, 3] })],
    });
    expect(registry.filterAllowedRepositories('acme', [1, 2, 3, 4])).toEqual([2, 3]);
  });

  it('filterAllowedRepositories returns empty when nothing matches', () => {
    const registry = new TenantRegistry({
      tenants: [makeTenant({ allowedRepositoryIds: [99] })],
    });
    expect(registry.filterAllowedRepositories('acme', [1, 2])).toEqual([]);
  });

  it('isToolsetAllowed returns true for an allowed toolset', () => {
    const registry = new TenantRegistry({
      tenants: [makeTenant({ allowedToolsets: ['repos', 'issues'] })],
    });
    expect(registry.isToolsetAllowed('acme', 'repos')).toBe(true);
  });

  it('isToolsetAllowed returns false for a denied toolset', () => {
    const registry = new TenantRegistry({
      tenants: [makeTenant({ allowedToolsets: ['repos'] })],
    });
    expect(registry.isToolsetAllowed('acme', 'admin')).toBe(false);
  });
});
