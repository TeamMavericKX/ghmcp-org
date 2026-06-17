// Tenant configuration loader.
//
// In the single-tenant case the GitHub App config is enough; for the
// multi-tenant case the server needs a list of tenants, each with its
// own App id, installation id, private key (PEM or file path), toolset
// allowlist and (optional) repository allowlist.
//
// The loader supports two shapes:
//
//   1. A JSON file path in `GITHUB_TENANTS_FILE` (or an explicit
//      `tenantsFile` option). The file is a `TenantConfigDocument`:
//        { tenants: [ { id, displayName, appId, installationId, ... }, ... ] }
//      Per-tenant secrets may be inlined (privateKey) or referenced by
//      file (privateKeyPath).
//
//   2. A flat env convention `GITHUB_TENANTS_<N>_*` keys. This is mostly
//      ergonomic for local dev; the JSON file is preferred for real
//      deployments.
//
// The loader produces a `TenantRegistry` ready to use at request time.

import { readFileSync } from 'node:fs';
import { InvalidInputError } from '../errors/index.js';
import type { InstallationRepositorySelection } from '../github-app/index.js';
import { type TenantConfig, TenantRegistry } from './registry.js';

export interface TenantConfigDocumentTenant {
  readonly id: string;
  readonly displayName: string;
  readonly appId: string;
  readonly installationId: string;
  readonly repositorySelection?: InstallationRepositorySelection;
  readonly allowedRepositoryIds?: readonly number[];
  readonly allowedToolsets?: readonly string[];
  readonly apiBase?: string;
  readonly privateKey?: string;
  readonly privateKeyPath?: string;
}

export interface TenantConfigDocument {
  readonly tenants: readonly TenantConfigDocumentTenant[];
}

export interface TenantConfigFileSource {
  readonly GITHUB_TENANTS_FILE?: string;
}

export interface LoadTenantConfigOptions {
  /** File-system reader for the tenants file. Defaults to readFileSync. */
  readonly readFile?: (path: string) => string | Buffer;
  /** Parse function for JSON. Defaults to JSON.parse. */
  readonly parseJson?: (text: string) => unknown;
  /** Resolved private-key map: id -> PEM string. Used when a tenant has a privateKeyPath. */
  readonly privateKeys?: ReadonlyMap<string, string>;
}

const DEFAULT_API_BASE = 'https://api.github.com';

/**
 * Load a list of tenants from a JSON document. Returns a `TenantRegistry`
 * ready for use. Throws `InvalidInputError` for malformed documents,
 * missing required fields, or unreadable private keys.
 */
export function loadTenantRegistryFromDocument(
  document: TenantConfigDocument,
  options: LoadTenantConfigOptions = {},
): TenantRegistry {
  if (!document || !Array.isArray(document.tenants)) {
    throw new InvalidInputError('tenant document must have a "tenants" array');
  }
  const privateKeys = options.privateKeys ?? new Map<string, string>();
  const tenants: TenantConfig[] = document.tenants.map((raw, index) =>
    coerceTenant(raw, index, privateKeys),
  );
  return new TenantRegistry({ tenants });
}

/**
 * Load a tenant registry from the file referenced by `source`. The file
 * must be JSON. `readFile` defaults to `fs.readFileSync`.
 */
export function loadTenantRegistryFromFile(
  source: TenantConfigFileSource,
  options: LoadTenantConfigOptions = {},
): TenantRegistry {
  const path = source.GITHUB_TENANTS_FILE?.trim();
  if (!path) {
    throw new InvalidInputError('GITHUB_TENANTS_FILE is not set');
  }
  const reader = options.readFile ?? ((p: string) => readFileSync(p, 'utf8'));
  const raw = reader(path);
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  const parsed = (options.parseJson ?? JSON.parse)(text);
  return loadTenantRegistryFromDocument(parsed as TenantConfigDocument, options);
}

function coerceTenant(
  raw: unknown,
  index: number,
  privateKeys: ReadonlyMap<string, string>,
): TenantConfig {
  if (!isObject(raw)) {
    throw new InvalidInputError(`tenants[${index}] must be an object`, { cause: { index } });
  }
  const id = stringField(raw, 'id', index);
  const displayName = stringField(raw, 'displayName', index);
  const appId = stringField(raw, 'appId', index);
  const installationId = stringField(raw, 'installationId', index);
  const allowedRepositoryIds = numberArrayField(raw, 'allowedRepositoryIds', index);
  const allowedToolsets = stringArrayField(raw, 'allowedToolsets', index);
  const apiBase = stringFieldOptional(raw, 'apiBase') ?? DEFAULT_API_BASE;
  const repositorySelection = parseRepositorySelection(raw.repositorySelection, index);
  const privateKey = resolvePrivateKey(raw, id, index, privateKeys);

  return {
    id,
    displayName,
    appId,
    installationId,
    repositorySelection,
    allowedRepositoryIds,
    allowedToolsets,
    apiBase,
    privateKey,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(raw: Record<string, unknown>, key: string, index: number): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError(`tenants[${index}].${key} must be a non-empty string`, {
      cause: { index, key },
    });
  }
  return value.trim();
}

function stringFieldOptional(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numberArrayField(
  raw: Record<string, unknown>,
  key: string,
  index: number,
): readonly number[] {
  const value = raw[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new InvalidInputError(`tenants[${index}].${key} must be an array of numbers`, {
      cause: { index, key },
    });
  }
  return value.map((v, i) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      throw new InvalidInputError(`tenants[${index}].${key}[${i}] must be a non-negative integer`, {
        cause: { index, key, value: v },
      });
    }
    return v;
  });
}

function stringArrayField(
  raw: Record<string, unknown>,
  key: string,
  index: number,
): readonly string[] {
  const value = raw[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new InvalidInputError(`tenants[${index}].${key} must be an array of strings`, {
      cause: { index, key },
    });
  }
  return value.map((v, i) => {
    if (typeof v !== 'string' || v.length === 0) {
      throw new InvalidInputError(`tenants[${index}].${key}[${i}] must be a non-empty string`, {
        cause: { index, key },
      });
    }
    return v;
  });
}

function parseRepositorySelection(raw: unknown, index: number): InstallationRepositorySelection {
  if (raw === undefined || raw === null) return 'all';
  if (raw === 'all' || raw === 'selected') return raw;
  throw new InvalidInputError(`tenants[${index}].repositorySelection must be "all" or "selected"`, {
    cause: { index, value: raw },
  });
}

function resolvePrivateKey(
  raw: Record<string, unknown>,
  id: string,
  index: number,
  privateKeys: ReadonlyMap<string, string>,
): string {
  const direct = raw.privateKey;
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return normalizePem(direct, id);
  }
  const path = raw.privateKeyPath;
  if (typeof path === 'string' && path.trim().length > 0) {
    const fromMap = privateKeys.get(id);
    if (typeof fromMap !== 'string' || fromMap.length === 0) {
      throw new InvalidInputError(
        `tenants[${index}] (${id}): privateKeyPath "${path}" not resolved; provide it via options.privateKeys`,
        { cause: { id, path } },
      );
    }
    return normalizePem(fromMap, id);
  }
  throw new InvalidInputError(
    `tenants[${index}] (${id}): either "privateKey" or "privateKeyPath" is required`,
    { cause: { id } },
  );
}

function normalizePem(pem: string, id: string): string {
  const trimmed = pem.trim();
  if (!trimmed.includes('BEGIN') || !trimmed.includes('END')) {
    throw new InvalidInputError(`tenant ${id}: private key does not look like a PEM block`, {
      cause: { id },
    });
  }
  return trimmed;
}
