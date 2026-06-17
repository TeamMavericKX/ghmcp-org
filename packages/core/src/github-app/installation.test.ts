import { describe, expect, it } from 'vitest';
import { InvalidInputError } from '../errors/index.js';
import {
  DEFAULT_REFRESH_WINDOW_SECONDS,
  type InstallationToken,
  type InstallationTokenResponse,
  isTokenExpired,
  parseInstallationToken,
  shouldRefreshToken,
  tokenRemainingSeconds,
} from './installation.js';

const NOW_SECONDS = 1_700_000_000; // 2023-11-14T22:13:20Z

const baseToken: InstallationToken = {
  token: 'ghs_test',
  issuedAt: NOW_SECONDS,
  expiresAt: NOW_SECONDS + 3600,
  permissions: { issues: 'write' },
  repositorySelection: 'all',
  repositories: [],
};

const sampleResponse: InstallationTokenResponse = {
  token: 'ghs_abc',
  expires_at: '2023-11-14T23:13:20Z',
  permissions: { issues: 'write', contents: 'read' },
  repository_selection: 'selected',
  repositories: [{ id: 1, name: 'hello', fullName: 'acme/hello', private: false }],
};

describe('parseInstallationToken', () => {
  it('parses a valid wire-format response', () => {
    const parsed = parseInstallationToken(sampleResponse);
    expect(parsed.token).toBe('ghs_abc');
    expect(parsed.repositorySelection).toBe('selected');
    expect(parsed.repositories).toHaveLength(1);
    expect(parsed.permissions).toEqual({ issues: 'write', contents: 'read' });
  });

  it('computes issuedAt as 1 hour before expiresAt', () => {
    const parsed = parseInstallationToken(sampleResponse);
    expect(parsed.expiresAt - parsed.issuedAt).toBe(3600);
  });

  it('treats missing repositories as an empty list', () => {
    const { repositories: _drop, ...rest } = sampleResponse;
    const parsed = parseInstallationToken({ ...rest, repositories: undefined });
    expect(parsed.repositories).toEqual([]);
  });

  it('rejects a missing token string', () => {
    expect(() => parseInstallationToken({ ...sampleResponse, token: '' })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects a missing expires_at', () => {
    expect(() => parseInstallationToken({ ...sampleResponse, expires_at: '' })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects a malformed expires_at', () => {
    expect(() => parseInstallationToken({ ...sampleResponse, expires_at: 'not-a-date' })).toThrow(
      /invalid/,
    );
  });
});

describe('isTokenExpired', () => {
  it('returns false before expiry', () => {
    expect(isTokenExpired(baseToken, NOW_SECONDS + 100)).toBe(false);
  });

  it('returns true at exact expiry second', () => {
    expect(isTokenExpired(baseToken, NOW_SECONDS + 3600)).toBe(true);
  });

  it('returns true after expiry', () => {
    expect(isTokenExpired(baseToken, NOW_SECONDS + 7200)).toBe(true);
  });
});

describe('shouldRefreshToken', () => {
  it('returns false far from expiry', () => {
    expect(shouldRefreshToken(baseToken, NOW_SECONDS + 60)).toBe(false);
  });

  it('returns true once inside the refresh window', () => {
    expect(shouldRefreshToken(baseToken, NOW_SECONDS + 3600 - 60)).toBe(true);
  });

  it('uses the default 5-minute refresh window', () => {
    // 6 minutes from expiry: false.
    expect(shouldRefreshToken(baseToken, NOW_SECONDS + 3600 - 6 * 60)).toBe(false);
    // 4 minutes from expiry: true.
    expect(shouldRefreshToken(baseToken, NOW_SECONDS + 3600 - 4 * 60)).toBe(true);
  });

  it('honours a custom window', () => {
    expect(shouldRefreshToken(baseToken, NOW_SECONDS + 3500, 200)).toBe(true);
  });

  it('rejects a negative window', () => {
    expect(() => shouldRefreshToken(baseToken, NOW_SECONDS, -1)).toThrow(InvalidInputError);
  });

  it('exposes the default refresh window as a public constant', () => {
    expect(DEFAULT_REFRESH_WINDOW_SECONDS).toBe(5 * 60);
  });
});

describe('tokenRemainingSeconds', () => {
  it('returns the difference to expiry when positive', () => {
    expect(tokenRemainingSeconds(baseToken, NOW_SECONDS + 100)).toBe(3500);
  });

  it('clamps at zero when already expired', () => {
    expect(tokenRemainingSeconds(baseToken, NOW_SECONDS + 7200)).toBe(0);
  });

  it('clamps at zero at the exact expiry second', () => {
    expect(tokenRemainingSeconds(baseToken, NOW_SECONDS + 3600)).toBe(0);
  });
});
