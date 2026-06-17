// GitHub App configuration loader.
//
// Reads and validates the configuration that the server needs in order to
// mint App JWTs and exchange them for installation tokens. The loader
// supports both `process.env` (default) and an explicit source object for
// testing. The private key may come from either an env var (PEM string)
// or a file path on disk.

import { readFileSync } from 'node:fs';
import { InvalidInputError } from '../errors/index.js';
import type { InstallationRepositorySelection } from './installation.js';

export interface GitHubAppConfigSource {
  readonly GITHUB_APP_ID?: string;
  readonly GITHUB_APP_PRIVATE_KEY?: string;
  readonly GITHUB_APP_PRIVATE_KEY_PATH?: string;
  readonly GITHUB_INSTALLATION_ID?: string;
  readonly GITHUB_APP_CLIENT_ID?: string;
  readonly GITHUB_APP_CLIENT_SECRET?: string;
  readonly GITHUB_APP_WEBHOOK_SECRET?: string;
  readonly GITHUB_API_BASE?: string;
  readonly GITHUB_APP_REPOSITORY_SELECTION?: string;
  readonly GITHUB_REPOSITORY_SELECTION?: string;
}

export interface GitHubAppConfig {
  readonly appId: string;
  readonly privateKey: string;
  readonly installationId: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly webhookSecret?: string;
  readonly apiBase: string;
  readonly repositorySelection: InstallationRepositorySelection;
}

export const DEFAULT_GITHUB_API_BASE = 'https://api.github.com';

export interface LoadConfigOptions {
  /** Source to read config from; defaults to `process.env`. */
  readonly source?: GitHubAppConfigSource;
  /** Filesystem reader for the private key path. Defaults to `readFileSync`. */
  readonly readFile?: (path: string) => string | Buffer;
  /** Override the default API base (used in tests). */
  readonly apiBase?: string;
}

/**
 * Resolve the GitHub App config from the given source. Throws
 * `InvalidInputError` when required fields are missing.
 */
export function loadGitHubAppConfig(options: LoadConfigOptions = {}): GitHubAppConfig {
  const source = options.source ?? (process.env as GitHubAppConfigSource);
  const appId = (source.GITHUB_APP_ID ?? '').trim();
  const installationId = (source.GITHUB_INSTALLATION_ID ?? '').trim();

  if (!/^\d+$/.test(appId)) {
    throw new InvalidInputError('GITHUB_APP_ID must be a numeric string', {
      cause: { value: source.GITHUB_APP_ID },
    });
  }
  if (!/^\d+$/.test(installationId)) {
    throw new InvalidInputError('GITHUB_INSTALLATION_ID must be a numeric string', {
      cause: { value: source.GITHUB_INSTALLATION_ID },
    });
  }

  const privateKey = resolvePrivateKey(source, options.readFile);

  const repositorySelection = parseRepositorySelection(
    source.GITHUB_APP_REPOSITORY_SELECTION ?? source.GITHUB_REPOSITORY_SELECTION,
  );

  return {
    appId,
    installationId,
    privateKey,
    ...includeIfSet('clientId', source.GITHUB_APP_CLIENT_ID),
    ...includeIfSet('clientSecret', source.GITHUB_APP_CLIENT_SECRET),
    ...includeIfSet('webhookSecret', source.GITHUB_APP_WEBHOOK_SECRET),
    apiBase: (options.apiBase ?? source.GITHUB_API_BASE ?? DEFAULT_GITHUB_API_BASE).trim(),
    repositorySelection,
  };
}

function resolvePrivateKey(
  source: GitHubAppConfigSource,
  readFile: ((path: string) => string | Buffer) | undefined,
): string {
  const direct = source.GITHUB_APP_PRIVATE_KEY;
  if (typeof direct === 'string' && direct.length > 0) {
    return normalizePem(direct);
  }
  const path = source.GITHUB_APP_PRIVATE_KEY_PATH;
  if (typeof path === 'string' && path.length > 0) {
    const reader = readFile ?? ((p: string) => readFileSync(p, 'utf8'));
    const raw = reader(path);
    return normalizePem(typeof raw === 'string' ? raw : raw.toString('utf8'));
  }
  throw new InvalidInputError(
    'either GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH must be set',
  );
}

function normalizePem(pem: string): string {
  const trimmed = pem.trim();
  if (!trimmed.includes('BEGIN') || !trimmed.includes('END')) {
    throw new InvalidInputError('github app private key does not look like a PEM block', {
      cause: { head: trimmed.slice(0, 32) },
    });
  }
  return trimmed;
}

function parseRepositorySelection(raw: string | undefined): InstallationRepositorySelection {
  if (raw === undefined || raw === '') {
    return 'all';
  }
  const lower = raw.trim().toLowerCase();
  if (lower === 'all' || lower === 'selected') {
    return lower;
  }
  throw new InvalidInputError('GITHUB_APP_REPOSITORY_SELECTION must be "all" or "selected"', {
    cause: { value: raw },
  });
}

function includeIfSet<K extends string>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return { [key]: trimmed } as Partial<Record<K, string>>;
    }
  }
  return {};
}
