import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_PRIVATE_KEY_PEM } from './__fixtures__/test-keys.js';
import { GitHubAppClient, type HttpRequest } from './client.js';
import type { Installation, InstallationTokenResponse } from './installation.js';
import { decodeJwtHeader, decodeJwtPayload } from './jwt.js';

const APP_ID = '123456';
const NOW = 1_700_000_000;
const FUTURE_EXPIRES = '2023-11-14T23:13:20Z';

function makeInstallation(): Installation {
  return {
    id: 4242,
    account: { id: 9999, login: 'acme', type: 'Organization' },
    repositorySelection: 'all',
    permissions: { contents: 'read' },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeFetcher(impl: (url: string, init: RequestInit) => Promise<Response>): HttpRequest {
  return {
    fetch: vi.fn(impl) as unknown as typeof fetch,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GitHubAppClient', () => {
  it('mints a JWT signed with the configured private key', () => {
    const http = makeFetcher(() => Promise.resolve(jsonResponse(200, {})));
    const client = new GitHubAppClient({
      appId: APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      http,
      mint: { now: () => NOW, lifetimeSeconds: 600 },
    });
    const jwt = client.mintJwt();
    const [headerB64, payloadB64, signatureB64] = jwt.split('.');
    expect(headerB64).toBeDefined();
    expect(payloadB64).toBeDefined();
    expect(signatureB64).toBeDefined();
    expect(signatureB64?.length).toBeGreaterThan(0);
    const header = decodeJwtHeader(jwt) as { alg: string; typ: string };
    expect(header.alg).toBe('RS256');
    expect(header.typ).toBe('JWT');
    const payload = decodeJwtPayload(jwt) as { iss: string; iat: number; exp: number };
    expect(payload.iss).toBe(APP_ID);
    expect(payload.iat).toBe(NOW);
    expect(payload.exp).toBe(NOW + 600);
  });

  it('POSTs to /app/installations/{id}/access_tokens with the JWT', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const http = makeFetcher(async (url, init) => {
      captured.url = url;
      captured.init = init;
      const body: InstallationTokenResponse = {
        token: 'ghs_abc',
        expires_at: FUTURE_EXPIRES,
        permissions: { contents: 'read' },
        repository_selection: 'all',
        repositories: [],
      };
      return jsonResponse(201, body);
    });
    const client = new GitHubAppClient({
      appId: APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      http,
      apiBase: 'https://api.github.com',
      mint: { now: () => NOW },
    });
    const token = await client.createInstallationToken(makeInstallation());
    expect(captured.url).toBe('https://api.github.com/app/installations/4242/access_tokens');
    expect(captured.init?.method).toBe('POST');
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(headers['User-Agent']).toBe('ghmcp-org');
    expect(token.token).toBe('ghs_abc');
    expect(token.expiresAt).toBe(NOW + 3600);
  });

  it('strips trailing slashes from apiBase', async () => {
    const http = makeFetcher(async (url) => {
      expect(url).toBe('https://ghe.local/api/v3/app/installations/1/access_tokens');
      return jsonResponse(201, {
        token: 'ghs_x',
        expires_at: FUTURE_EXPIRES,
        permissions: {},
        repository_selection: 'all',
        repositories: [],
      });
    });
    const client = new GitHubAppClient({
      appId: APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      http,
      apiBase: 'https://ghe.local/api/v3///',
    });
    await client.createInstallationToken({
      id: 1,
      account: { id: 1, login: 'a', type: 'User' },
      repositorySelection: 'all',
      permissions: {},
    });
  });

  it('sends permissions and repository_selection when configured', async () => {
    let parsed: Record<string, unknown> | undefined;
    const http = makeFetcher(async (_url, init) => {
      parsed = JSON.parse(init.body as string) as Record<string, unknown>;
      return jsonResponse(201, {
        token: 'ghs_x',
        expires_at: FUTURE_EXPIRES,
        permissions: { issues: 'write' },
        repository_selection: 'selected',
        repositories: [],
      });
    });
    const client = new GitHubAppClient({
      appId: APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      http,
      permissions: { issues: 'write' },
      repositorySelection: 'selected',
      mint: { now: () => NOW },
    });
    await client.createInstallationToken(makeInstallation(), { repositoryIds: [7, 8] });
    expect(parsed).toEqual({
      permissions: { issues: 'write' },
      repository_selection: 'selected',
      repository_ids: [7, 8],
    });
  });

  it('omits permissions and selection when not configured', async () => {
    let parsed: Record<string, unknown> | undefined;
    const http = makeFetcher(async (_url, init) => {
      parsed = JSON.parse(init.body as string) as Record<string, unknown>;
      return jsonResponse(201, {
        token: 'ghs_x',
        expires_at: FUTURE_EXPIRES,
        permissions: {},
        repository_selection: 'all',
        repositories: [],
      });
    });
    const client = new GitHubAppClient({
      appId: APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      http,
      mint: { now: () => NOW },
    });
    await client.createInstallationToken(makeInstallation());
    expect(parsed).toEqual({});
  });

  it('throws a descriptive error on non-2xx response', async () => {
    const http = makeFetcher(async () => jsonResponse(401, { message: 'Bad credentials' }));
    const client = new GitHubAppClient({
      appId: APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      http,
    });
    await expect(client.createInstallationToken(makeInstallation())).rejects.toThrow(
      /401.*Bad credentials/,
    );
  });

  it('throws on 5xx without reading the body if empty', async () => {
    const http = makeFetcher(async () => new Response(null, { status: 502 }));
    const client = new GitHubAppClient({
      appId: APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      http,
    });
    await expect(client.createInstallationToken(makeInstallation())).rejects.toThrow(/502/);
  });

  it('uses globalThis.fetch by default', async () => {
    const original = globalThis.fetch;
    const fake = vi.fn(async () =>
      jsonResponse(201, {
        token: 'ghs_default',
        expires_at: FUTURE_EXPIRES,
        permissions: {},
        repository_selection: 'all',
        repositories: [],
      }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fake;
    try {
      const client = new GitHubAppClient({
        appId: APP_ID,
        privateKey: TEST_PRIVATE_KEY_PEM,
        mint: { now: () => NOW },
      });
      const token = await client.createInstallationToken(makeInstallation());
      expect(token.token).toBe('ghs_default');
      expect(fake).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
