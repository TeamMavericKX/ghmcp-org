import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../errors/index.js';
import { requireGithubToken } from './stdio.js';

describe('requireGithubToken', () => {
  it('passes when GITHUB_TOKEN is a non-empty string', () => {
    expect(() => requireGithubToken({ GITHUB_TOKEN: 'ghp_abc' })).not.toThrow();
  });

  it('throws UnauthorizedError when GITHUB_TOKEN is missing', () => {
    expect(() => requireGithubToken({})).toThrow(UnauthorizedError);
  });

  it('throws when GITHUB_TOKEN is an empty string', () => {
    expect(() => requireGithubToken({ GITHUB_TOKEN: '' })).toThrow(/required/);
  });

  it('throws when GITHUB_TOKEN is not a string', () => {
    // Process env values are always strings or undefined, but the type
    // allows unknown, so exercise the non-string branch defensively.
    expect(() => requireGithubToken({ GITHUB_TOKEN: 123 as unknown as string })).toThrow();
  });

  it('error has the unauthorized code', () => {
    try {
      requireGithubToken({});
    } catch (e) {
      expect(e).toBeInstanceOf(UnauthorizedError);
      expect((e as UnauthorizedError).code).toBe('unauthorized');
    }
  });
});
