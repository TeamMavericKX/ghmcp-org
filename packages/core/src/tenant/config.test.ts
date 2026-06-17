import { describe, expect, it } from 'vitest';
import { InvalidInputError } from '../errors/index.js';
import {
  type TenantConfigDocument,
  loadTenantRegistryFromDocument,
  loadTenantRegistryFromFile,
} from './config.js';

const PEM =
  '-----BEGIN PRIVATE KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAplaceholder\n-----END PRIVATE KEY-----';

function doc(tenants: unknown[]): TenantConfigDocument {
  return { tenants: tenants as TenantConfigDocument['tenants'] };
}

function basicTenant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acme',
    displayName: 'Acme',
    appId: '123',
    installationId: '456',
    privateKey: PEM,
    allowedToolsets: ['repos'],
    ...overrides,
  };
}

describe('loadTenantRegistryFromDocument', () => {
  it('builds a registry from a well-formed document', () => {
    const registry = loadTenantRegistryFromDocument(doc([basicTenant()]));
    expect(registry.size()).toBe(1);
    const tenant = registry.get('acme');
    expect(tenant.displayName).toBe('Acme');
    expect(tenant.appId).toBe('123');
    expect(tenant.installationId).toBe('456');
    expect(tenant.privateKey).toBe(PEM);
    expect(tenant.repositorySelection).toBe('all');
    expect(tenant.allowedToolsets).toEqual(['repos']);
    expect(tenant.apiBase).toBe('https://api.github.com');
  });

  it('defaults repositorySelection to "all" when omitted', () => {
    const registry = loadTenantRegistryFromDocument(
      doc([basicTenant({ repositorySelection: undefined })]),
    );
    expect(registry.get('acme').repositorySelection).toBe('all');
  });

  it('passes through "selected" repositorySelection', () => {
    const registry = loadTenantRegistryFromDocument(
      doc([basicTenant({ repositorySelection: 'selected', allowedRepositoryIds: [1, 2] })]),
    );
    expect(registry.get('acme').repositorySelection).toBe('selected');
    expect(registry.get('acme').allowedRepositoryIds).toEqual([1, 2]);
  });

  it('uses an explicit apiBase when provided', () => {
    const registry = loadTenantRegistryFromDocument(
      doc([basicTenant({ apiBase: 'https://ghe.local/api/v3' })]),
    );
    expect(registry.get('acme').apiBase).toBe('https://ghe.local/api/v3');
  });

  it('trims surrounding whitespace from string fields', () => {
    const registry = loadTenantRegistryFromDocument(
      doc([basicTenant({ displayName: '  Acme Co  ' })]),
    );
    expect(registry.get('acme').displayName).toBe('Acme Co');
  });

  it('defaults allowedToolsets to empty when omitted', () => {
    const registry = loadTenantRegistryFromDocument(
      doc([basicTenant({ allowedToolsets: undefined })]),
    );
    expect(registry.get('acme').allowedToolsets).toEqual([]);
  });

  it('rejects a document without a tenants array', () => {
    expect(() =>
      loadTenantRegistryFromDocument({ tenants: undefined as unknown as never }),
    ).toThrow(InvalidInputError);
  });

  it('rejects a tenant that is not an object', () => {
    expect(() => loadTenantRegistryFromDocument(doc(['not-an-object']))).toThrow(InvalidInputError);
  });

  it('rejects a tenant with an empty id', () => {
    expect(() => loadTenantRegistryFromDocument(doc([basicTenant({ id: '' })]))).toThrow(
      InvalidInputError,
    );
  });

  it('rejects a tenant with a non-numeric appId', () => {
    expect(() => loadTenantRegistryFromDocument(doc([basicTenant({ appId: 'abc' })]))).toThrow(
      InvalidInputError,
    );
  });

  it('rejects a tenant with a non-numeric installationId', () => {
    expect(() =>
      loadTenantRegistryFromDocument(doc([basicTenant({ installationId: 'xyz' })])),
    ).toThrow(InvalidInputError);
  });

  it('rejects an invalid repositorySelection', () => {
    expect(() =>
      loadTenantRegistryFromDocument(doc([basicTenant({ repositorySelection: 'maybe' })])),
    ).toThrow(InvalidInputError);
  });

  it('rejects a tenant without privateKey or privateKeyPath', () => {
    expect(() =>
      loadTenantRegistryFromDocument(
        doc([{ ...basicTenant(), privateKey: undefined, privateKeyPath: undefined }]),
      ),
    ).toThrow(InvalidInputError);
  });

  it('rejects a privateKey that does not look like PEM', () => {
    expect(() =>
      loadTenantRegistryFromDocument(doc([basicTenant({ privateKey: 'not-a-pem' })])),
    ).toThrow(InvalidInputError);
  });

  it('resolves privateKeyPath via the privateKeys map', () => {
    const privateKeys = new Map([['acme', PEM]]);
    const registry = loadTenantRegistryFromDocument(
      doc([basicTenant({ privateKey: undefined, privateKeyPath: '/keys/acme.pem' })]),
      { privateKeys },
    );
    expect(registry.get('acme').privateKey).toBe(PEM);
  });

  it('throws when privateKeyPath is given but the map is empty', () => {
    expect(() =>
      loadTenantRegistryFromDocument(
        doc([basicTenant({ privateKey: undefined, privateKeyPath: '/keys/acme.pem' })]),
      ),
    ).toThrow(InvalidInputError);
  });

  it('rejects allowedRepositoryIds containing a negative value', () => {
    expect(() =>
      loadTenantRegistryFromDocument(doc([basicTenant({ allowedRepositoryIds: [1, -5] })])),
    ).toThrow(InvalidInputError);
  });

  it('rejects allowedRepositoryIds containing a non-integer', () => {
    expect(() =>
      loadTenantRegistryFromDocument(doc([basicTenant({ allowedRepositoryIds: [1.5] })])),
    ).toThrow(InvalidInputError);
  });

  it('rejects allowedToolsets containing an empty string', () => {
    expect(() =>
      loadTenantRegistryFromDocument(doc([basicTenant({ allowedToolsets: ['ok', ''] })])),
    ).toThrow(InvalidInputError);
  });

  it('builds multiple tenants and preserves order', () => {
    const registry = loadTenantRegistryFromDocument(
      doc([basicTenant({ id: 'alpha' }), basicTenant({ id: 'bravo', displayName: 'Bravo' })]),
    );
    expect(registry.size()).toBe(2);
    expect(registry.list().map((t) => t.id)).toEqual(['alpha', 'bravo']);
  });

  it('rejects duplicate ids across tenants', () => {
    expect(() =>
      loadTenantRegistryFromDocument(doc([basicTenant({ id: 'dup' }), basicTenant({ id: 'dup' })])),
    ).toThrow(InvalidInputError);
  });
});

describe('loadTenantRegistryFromFile', () => {
  it('reads and parses a JSON document from disk', () => {
    const text = JSON.stringify({
      tenants: [basicTenant({ id: 'file-tenant' })],
    });
    const readFile = () => text;
    const registry = loadTenantRegistryFromFile(
      { GITHUB_TENANTS_FILE: '/etc/tenants.json' },
      {
        readFile,
      },
    );
    expect(registry.has('file-tenant')).toBe(true);
  });

  it('throws when GITHUB_TENANTS_FILE is not set', () => {
    expect(() => loadTenantRegistryFromFile({})).toThrow(InvalidInputError);
  });

  it('throws on whitespace-only GITHUB_TENANTS_FILE', () => {
    expect(() => loadTenantRegistryFromFile({ GITHUB_TENANTS_FILE: '   ' })).toThrow(
      InvalidInputError,
    );
  });

  it('propagates JSON parse errors as InvalidInputError', () => {
    const readFile = () => '{ not valid json';
    expect(() =>
      loadTenantRegistryFromFile({ GITHUB_TENANTS_FILE: '/bad.json' }, { readFile }),
    ).toThrow();
  });

  it('uses an injected parser', () => {
    const parseJson = (text: string) => JSON.parse(text);
    const readFile = () => JSON.stringify({ tenants: [basicTenant({ id: 'parsed' })] });
    const registry = loadTenantRegistryFromFile(
      { GITHUB_TENANTS_FILE: '/x.json' },
      {
        readFile,
        parseJson,
      },
    );
    expect(registry.has('parsed')).toBe(true);
  });
});
