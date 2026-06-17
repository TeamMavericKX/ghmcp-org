// HTTP client for GitHub App authentication endpoints.
//
// Two responsibilities:
//   1. Mint an App JWT (using mintAppJwt from ./jwt.ts).
//   2. Exchange it for an installation access token via
//      POST /app/installations/{installation_id}/access_tokens.
//
// Both calls go through an injectable `HttpRequest` so the client is
// trivially testable. Production wires in a real fetch implementation.

import {
  type Installation,
  type InstallationToken,
  type InstallationTokenResponse,
  parseInstallationToken,
} from './installation.js';
import { type MintOptions, mintAppJwt } from './jwt.js';

export interface HttpRequest {
  readonly fetch: typeof fetch;
}

export interface GitHubAppClientOptions {
  /** App id (numeric string). */
  readonly appId: string;
  /** PEM private key as string or Buffer. */
  readonly privateKey: string | Buffer;
  /** API base, e.g. https://api.github.com. */
  readonly apiBase?: string;
  /** Optional request-init override. Useful for tests. */
  readonly http?: HttpRequest;
  /** Optional mint-options override (clock, lifetime). */
  readonly mint?: Omit<MintOptions, 'appId' | 'privateKey'>;
  /**
   * Permissions to request on each access-token mint. GitHub will narrow
   * to the App's actual permissions if these are a superset.
   */
  readonly permissions?: Installation['permissions'];
  /** Repository selection for the access-token request. */
  readonly repositorySelection?: Installation['repositorySelection'];
}

export interface AccessTokenRequest {
  /** Repositories to scope the token to (when selection = 'selected'). */
  readonly repositoryIds?: readonly number[];
}

const DEFAULT_API_BASE = 'https://api.github.com';
const ACCESS_TOKENS_PATH = (id: number) => `/app/installations/${id}/access_tokens`;

/**
 * GitHub App client. Stateless; safe to share across requests when paired
 * with an external token cache.
 */
export class GitHubAppClient {
  readonly #appId: string;
  readonly #privateKey: string | Buffer;
  readonly #apiBase: string;
  readonly #http: HttpRequest;
  readonly #mint: Omit<MintOptions, 'appId' | 'privateKey'> | undefined;
  readonly #permissions: Installation['permissions'] | undefined;
  readonly #repositorySelection: Installation['repositorySelection'] | undefined;

  constructor(options: GitHubAppClientOptions) {
    this.#appId = options.appId;
    this.#privateKey = options.privateKey;
    this.#apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
    this.#http = options.http ?? { fetch: globalThis.fetch.bind(globalThis) };
    this.#mint = options.mint;
    this.#permissions = options.permissions;
    this.#repositorySelection = options.repositorySelection;
  }

  /**
   * Mint a fresh App JWT (e.g. for explicit use beyond the installation
   * token flow, like GitHub Apps calling /app endpoints directly).
   */
  mintJwt(): string {
    return mintAppJwt({
      appId: this.#appId,
      privateKey: this.#privateKey,
      ...(this.#mint ?? {}),
    }).jwt;
  }

  /**
   * Exchange the App JWT for an installation access token for the given
   * installation. The caller is responsible for caching the result.
   */
  async createInstallationToken(
    installation: Installation,
    request: AccessTokenRequest = {},
  ): Promise<InstallationToken> {
    const jwt = this.mintJwt();
    const body = buildAccessTokenBody(this.#permissions, this.#repositorySelection, request);
    const url = `${this.#apiBase}${ACCESS_TOKENS_PATH(installation.id)}`;

    const res = await this.#http.fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ghmcp-org',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await httpError(res, 'create installation token');
    }

    const json = (await res.json()) as InstallationTokenResponse;
    return parseInstallationToken(json);
  }
}

function buildAccessTokenBody(
  permissions: Installation['permissions'] | undefined,
  selection: Installation['repositorySelection'] | undefined,
  request: AccessTokenRequest,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (permissions) body.permissions = permissions;
  if (selection) body.repository_selection = selection;
  if (request.repositoryIds && request.repositoryIds.length > 0) {
    body.repository_ids = [...request.repositoryIds];
  }
  return body;
}

async function httpError(res: Response, action: string): Promise<Error> {
  let detail = '';
  try {
    const text = await res.text();
    if (text.length > 0) detail = ` - ${text.slice(0, 512)}`;
  } catch {
    // ignore: the body may not be readable
  }
  return new Error(`github api: ${action} failed: ${res.status} ${res.statusText}${detail}`);
}
