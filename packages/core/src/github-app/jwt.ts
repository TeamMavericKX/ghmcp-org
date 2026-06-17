// RS256 JWT minting for GitHub App authentication.
//
// GitHub Apps identify themselves with a short-lived (15-minute max)
// JSON Web Token signed with the App's private key using RS256. The
// JWT is then exchanged at `/app/installations/{id}/access_tokens`
// for a per-installation token that lasts 60 minutes.
//
// Reference: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app

import { type KeyObject, createSign } from 'node:crypto';
import { InternalError, InvalidInputError } from '../errors/index.js';

/** PEM-encoded private key (with or without surrounding whitespace). */
export type PrivateKeyPem = string | Buffer | KeyObject;

/** Clock function; injectable for tests. */
export type Now = () => number;

/** Hard upper bound GitHub allows for `exp - iat`. */
const MAX_LIFETIME_SECONDS = 15 * 60; // 15 minutes

/** Standard registered claims GitHub requires. */
export interface GitHubAppJwtClaims {
  /** Issuer: the App's numeric id, as a string. */
  readonly iss: string;
  /** Issued-at, in seconds since epoch. */
  readonly iat: number;
  /** Expiration, in seconds since epoch. */
  readonly exp: number;
}

export interface MintOptions {
  /** GitHub App id (numeric). */
  readonly appId: string | number;
  /** App's private key, PEM-encoded. */
  readonly privateKey: PrivateKeyPem;
  /** Override `Date.now()` (seconds). Useful for tests. */
  readonly now?: Now;
  /** Override lifetime in seconds. Default: 10 minutes. Clamped to [60, 900]. */
  readonly lifetimeSeconds?: number;
  /** Override iat for testing; defaults to `now()`. */
  readonly issuedAtSeconds?: number;
}

export interface MintResult {
  readonly jwt: string;
  readonly claims: GitHubAppJwtClaims;
  /** Seconds the JWT will remain valid. */
  readonly lifetimeSeconds: number;
}

const DEFAULT_LIFETIME_SECONDS = 10 * 60; // 10 minutes

/**
 * Mint a GitHub App JWT. The returned token is the value to send in
 * the `Authorization: Bearer <jwt>` header when calling GitHub's
 * App-management endpoints (e.g. listing installations).
 */
export function mintAppJwt(options: MintOptions): MintResult {
  const appId = String(options.appId ?? '').trim();
  if (appId === '' || !/^\d+$/.test(appId)) {
    throw new InvalidInputError('github app id must be a positive integer string', {
      cause: { appId: options.appId },
    });
  }
  if (options.privateKey === undefined || options.privateKey === null) {
    throw new InvalidInputError('github app private key is required');
  }

  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const iat = options.issuedAtSeconds ?? now();
  const requested = options.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS;
  const lifetime = clampLifetime(requested);

  const claims: GitHubAppJwtClaims = {
    iss: appId,
    iat,
    exp: iat + lifetime,
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  let signature: Buffer;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    signature = signer.sign(toCryptoKey(options.privateKey));
  } catch (err) {
    throw new InternalError('failed to sign github app jwt', { cause: err });
  }

  return {
    jwt: `${signingInput}.${base64UrlEncode(signature)}`,
    claims,
    lifetimeSeconds: lifetime,
  };
}

function clampLifetime(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new InvalidInputError('jwt lifetime must be a positive number of seconds', {
      cause: { requested },
    });
  }
  return Math.min(MAX_LIFETIME_SECONDS, Math.max(60, Math.floor(requested)));
}

function toCryptoKey(key: PrivateKeyPem): string | Buffer | KeyObject {
  if (typeof key === 'string' || Buffer.isBuffer(key)) {
    return key;
  }
  return key;
}

/**
 * Encode a Buffer or string as a URL-safe base64 string with no
 * padding, per RFC 7515 §2.
 */
function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=+$/u, '').replace(/\+/gu, '-').replace(/\//gu, '_');
}

/** Decode a base64url string back to its underlying bytes. */
export function base64UrlDecode(input: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/u.test(input)) {
    throw new InvalidInputError('invalid base64url input');
  }
  const padded = input.replace(/-/gu, '+').replace(/_/gu, '/');
  const pad = padded.length % 4;
  const final = pad === 0 ? padded : padded + '='.repeat(4 - pad);
  return Buffer.from(final, 'base64');
}

/** Pull a base64url-encoded JSON header out of a JWT. */
export function decodeJwtHeader(jwt: string): Record<string, unknown> {
  const head = jwt.split('.')[0];
  if (head === undefined || head === '') {
    throw new InvalidInputError('malformed jwt: missing header');
  }
  return JSON.parse(base64UrlDecode(head).toString('utf8'));
}

/** Pull a base64url-encoded JSON payload out of a JWT. */
export function decodeJwtPayload<T = Record<string, unknown>>(jwt: string): T {
  const parts = jwt.split('.');
  const body = parts[1];
  if (body === undefined || body === '') {
    throw new InvalidInputError('malformed jwt: missing payload');
  }
  return JSON.parse(base64UrlDecode(body).toString('utf8')) as T;
}
