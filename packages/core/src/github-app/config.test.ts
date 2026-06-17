import { describe, expect, it } from 'vitest';
import { InvalidInputError } from '../errors/index.js';
import { TEST_PRIVATE_KEY_PEM } from './__fixtures__/test-keys.js';
import { loadGitHubAppConfig } from './config.js';

const BASE_SOURCE = {
  GITHUB_APP_ID: '123456',
  GITHUB_INSTALLATION_ID: '7890',
  GITHUB_APP_PRIVATE_KEY: TEST_PRIVATE_KEY_PEM,
};

describe('loadGitHubAppConfig', () => {
  it('loads required fields from an explicit source', () => {
    const cfg = loadGitHubAppConfig({ source: BASE_SOURCE });
    expect(cfg.appId).toBe('123456');
    expect(cfg.installationId).toBe('7890');
    expect(cfg.privateKey).toBe(TEST_PRIVATE_KEY_PEM.trim());
    expect(cfg.apiBase).toBe('https://api.github.com');
    expect(cfg.repositorySelection).toBe('all');
  });

  it('trims whitespace from string fields', () => {
    const cfg = loadGitHubAppConfig({
      source: { ...BASE_SOURCE, GITHUB_APP_ID: '  42  ', GITHUB_INSTALLATION_ID: '  99  ' },
    });
    expect(cfg.appId).toBe('42');
    expect(cfg.installationId).toBe('99');
  });

  it('honours a custom apiBase option', () => {
    const cfg = loadGitHubAppConfig({
      source: BASE_SOURCE,
      apiBase: 'https://github.example/api/v3',
    });
    expect(cfg.apiBase).toBe('https://github.example/api/v3');
  });

  it('honours a GITHUB_API_BASE override from the source', () => {
    const cfg = loadGitHubAppConfig({
      source: { ...BASE_SOURCE, GITHUB_API_BASE: 'https://ghe.local/api/v3' },
    });
    expect(cfg.apiBase).toBe('https://ghe.local/api/v3');
  });

  it('passes through optional OAuth and webhook secrets when set', () => {
    const cfg = loadGitHubAppConfig({
      source: {
        ...BASE_SOURCE,
        GITHUB_APP_CLIENT_ID: 'Iv1.abc',
        GITHUB_APP_CLIENT_SECRET: 'client_secret_placeholder',
        GITHUB_APP_WEBHOOK_SECRET: 'webhook_secret_placeholder',
      },
    });
    expect(cfg.clientId).toBe('Iv1.abc');
    expect(cfg.clientSecret).toBe('client_secret_placeholder');
    expect(cfg.webhookSecret).toBe('webhook_secret_placeholder');
  });

  it('omits optional secrets when not provided', () => {
    const cfg = loadGitHubAppConfig({ source: BASE_SOURCE });
    expect(cfg.clientId).toBeUndefined();
    expect(cfg.clientSecret).toBeUndefined();
    expect(cfg.webhookSecret).toBeUndefined();
  });

  it('omits optional secrets when they are empty strings', () => {
    const cfg = loadGitHubAppConfig({
      source: {
        ...BASE_SOURCE,
        GITHUB_APP_CLIENT_ID: '',
        GITHUB_APP_CLIENT_SECRET: '   ',
        GITHUB_APP_WEBHOOK_SECRET: '',
      },
    });
    expect(cfg.clientId).toBeUndefined();
    expect(cfg.clientSecret).toBeUndefined();
    expect(cfg.webhookSecret).toBeUndefined();
  });

  it('reads private key from a file when given a path', () => {
    const cfg = loadGitHubAppConfig({
      source: {
        ...BASE_SOURCE,
        GITHUB_APP_PRIVATE_KEY: undefined,
        GITHUB_APP_PRIVATE_KEY_PATH: '/keys/app.pem',
      },
      readFile: () => TEST_PRIVATE_KEY_PEM,
    });
    expect(cfg.privateKey).toBe(TEST_PRIVATE_KEY_PEM.trim());
  });

  it('reads private key from a file as a Buffer', () => {
    const cfg = loadGitHubAppConfig({
      source: {
        ...BASE_SOURCE,
        GITHUB_APP_PRIVATE_KEY: undefined,
        GITHUB_APP_PRIVATE_KEY_PATH: '/keys/app.pem',
      },
      readFile: () => Buffer.from(TEST_PRIVATE_KEY_PEM, 'utf8'),
    });
    expect(cfg.privateKey).toBe(TEST_PRIVATE_KEY_PEM.trim());
  });

  it('prefers the direct PEM over the file path when both are set', () => {
    const cfg = loadGitHubAppConfig({
      source: { ...BASE_SOURCE, GITHUB_APP_PRIVATE_KEY_PATH: '/keys/app.pem' },
      readFile: () => '-----BEGIN PRIVATE KEY-----\nWRONG\n-----END PRIVATE KEY-----',
    });
    expect(cfg.privateKey).toBe(TEST_PRIVATE_KEY_PEM.trim());
  });

  it('rejects a non-numeric app id', () => {
    expect(() => loadGitHubAppConfig({ source: { ...BASE_SOURCE, GITHUB_APP_ID: 'abc' } })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects an empty app id', () => {
    expect(() => loadGitHubAppConfig({ source: { ...BASE_SOURCE, GITHUB_APP_ID: '   ' } })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects a non-numeric installation id', () => {
    expect(() =>
      loadGitHubAppConfig({ source: { ...BASE_SOURCE, GITHUB_INSTALLATION_ID: 'oops' } }),
    ).toThrow(InvalidInputError);
  });

  it('rejects when neither PEM nor PEM path is provided', () => {
    expect(() =>
      loadGitHubAppConfig({
        source: {
          ...BASE_SOURCE,
          GITHUB_APP_PRIVATE_KEY: undefined,
          GITHUB_APP_PRIVATE_KEY_PATH: undefined,
        },
      }),
    ).toThrow(/GITHUB_APP_PRIVATE_KEY/);
  });

  it('rejects a private key that is not a PEM block', () => {
    expect(() =>
      loadGitHubAppConfig({
        source: { ...BASE_SOURCE, GITHUB_APP_PRIVATE_KEY: 'not-a-pem-block' },
      }),
    ).toThrow(/PEM/);
  });

  it('defaults repositorySelection to "all" when unset', () => {
    const cfg = loadGitHubAppConfig({ source: BASE_SOURCE });
    expect(cfg.repositorySelection).toBe('all');
  });

  it('accepts repositorySelection="all"', () => {
    const cfg = loadGitHubAppConfig({
      source: { ...BASE_SOURCE, GITHUB_REPOSITORY_SELECTION: 'all' },
    });
    expect(cfg.repositorySelection).toBe('all');
  });

  it('accepts repositorySelection="selected"', () => {
    const cfg = loadGitHubAppConfig({
      source: { ...BASE_SOURCE, GITHUB_REPOSITORY_SELECTION: 'selected' },
    });
    expect(cfg.repositorySelection).toBe('selected');
  });

  it('also reads GITHUB_APP_REPOSITORY_SELECTION for parity', () => {
    const cfg = loadGitHubAppConfig({
      source: { ...BASE_SOURCE, GITHUB_APP_REPOSITORY_SELECTION: 'selected' },
    });
    expect(cfg.repositorySelection).toBe('selected');
  });

  it('prefers GITHUB_APP_REPOSITORY_SELECTION over the bare one when both are set', () => {
    const cfg = loadGitHubAppConfig({
      source: {
        ...BASE_SOURCE,
        GITHUB_APP_REPOSITORY_SELECTION: 'selected',
        GITHUB_REPOSITORY_SELECTION: 'all',
      },
    });
    expect(cfg.repositorySelection).toBe('selected');
  });

  it('rejects an invalid repositorySelection', () => {
    expect(() =>
      loadGitHubAppConfig({
        source: { ...BASE_SOURCE, GITHUB_REPOSITORY_SELECTION: 'everything' },
      }),
    ).toThrow(InvalidInputError);
  });
});
