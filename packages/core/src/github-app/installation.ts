// GitHub App installation token model.
//
// An installation token is a per-installation, per-repo-scope credential
// returned by GitHub's POST /app/installations/{id}/access_tokens endpoint.
// It is short-lived (1 hour by default) and tied to the repos the App is
// installed on for a given installation.
//
// Reference: https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app

import { InvalidInputError } from '../errors/index.js';

/** Maximum token lifetime GitHub will issue: 60 minutes. */
export const MAX_INSTALLATION_TOKEN_LIFETIME_SECONDS = 60 * 60;

/** Refresh window: how early we re-mint before the token's official expiry. */
export const DEFAULT_REFRESH_WINDOW_SECONDS = 5 * 60;

/** Repository selections the App can ask GitHub to bind the token to. */
export type InstallationRepositorySelection = 'all' | 'selected';

/** What the App is permitted to do with the issued token. */
export interface InstallationPermissions {
  readonly [permission: string]: 'read' | 'write' | 'admin' | 'none';
}

/** A GitHub installation (an App installed into an account or org). */
export interface Installation {
  /** The numeric installation id, used in the access-tokens URL path. */
  readonly id: number;
  /** The account the App is installed into (org or user). */
  readonly account: InstallationAccount;
  /** Repository selection for this token request. */
  readonly repositorySelection: InstallationRepositorySelection;
  /** Permissions to request. */
  readonly permissions: InstallationPermissions;
}

export interface InstallationAccount {
  /** Numeric account id. */
  readonly id: number;
  /** Login (org or user name). */
  readonly login: string;
  readonly type: 'Organization' | 'User' | 'Enterprise';
}

/** An installation token returned by GitHub, with parsed timestamps. */
export interface InstallationToken {
  /** The opaque bearer string, sent in `Authorization: Bearer <token>`. */
  readonly token: string;
  /** Unix seconds, when the token was issued by GitHub. */
  readonly issuedAt: number;
  /** Unix seconds, when the token becomes invalid. */
  readonly expiresAt: number;
  /** Permissions bound to the token. */
  readonly permissions: InstallationPermissions;
  /** Repositories the token is scoped to (logins). */
  readonly repositorySelection: InstallationRepositorySelection;
  /** Concrete repositories, if `repositorySelection === 'selected'`. */
  readonly repositories: readonly InstallationRepository[];
}

export interface InstallationRepository {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
}

/** Wire-format of the GitHub response, before we coerce to InstallationToken. */
export interface InstallationTokenResponse {
  readonly token: string;
  readonly expires_at: string;
  readonly permissions: InstallationPermissions;
  readonly repository_selection: InstallationRepositorySelection;
  readonly repositories?: readonly InstallationRepository[] | undefined;
}

/** Coerce a wire-format response to a typed InstallationToken. */
export function parseInstallationToken(resp: InstallationTokenResponse): InstallationToken {
  if (typeof resp.token !== 'string' || resp.token.length === 0) {
    throw new InvalidInputError('installation token response missing token string');
  }
  if (typeof resp.expires_at !== 'string' || resp.expires_at.length === 0) {
    throw new InvalidInputError('installation token response missing expires_at');
  }
  const expiresAt = Date.parse(resp.expires_at);
  if (!Number.isFinite(expiresAt)) {
    throw new InvalidInputError('installation token response has invalid expires_at', {
      cause: { expires_at: resp.expires_at },
    });
  }
  return {
    token: resp.token,
    issuedAt: Math.floor(expiresAt / 1000) - MAX_INSTALLATION_TOKEN_LIFETIME_SECONDS,
    expiresAt: Math.floor(expiresAt / 1000),
    permissions: resp.permissions,
    repositorySelection: resp.repository_selection,
    repositories: resp.repositories ?? [],
  };
}

/**
 * Has the token's expiry passed? Pure helper; uses an injected clock.
 */
export function isTokenExpired(token: InstallationToken, nowSeconds: number): boolean {
  return nowSeconds >= token.expiresAt;
}

/**
 * Should we proactively refresh, given the refresh window? Returns true
 * when the token is within `windowSeconds` of expiry, or already expired.
 */
export function shouldRefreshToken(
  token: InstallationToken,
  nowSeconds: number,
  windowSeconds: number = DEFAULT_REFRESH_WINDOW_SECONDS,
): boolean {
  if (windowSeconds < 0) {
    throw new InvalidInputError('refresh window must be non-negative', {
      cause: { windowSeconds },
    });
  }
  return nowSeconds >= token.expiresAt - windowSeconds;
}

/** Seconds remaining until expiry, clamped at 0. */
export function tokenRemainingSeconds(token: InstallationToken, nowSeconds: number): number {
  return Math.max(0, token.expiresAt - nowSeconds);
}
