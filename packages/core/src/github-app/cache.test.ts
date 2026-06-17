import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallationTokenCache } from './cache.js';
import type { Installation, InstallationToken } from './installation.js';

function makeInstallation(id: number): Installation {
  return {
    id,
    account: { id: 100 + id, login: `acct-${id}`, type: 'Organization' },
    repositorySelection: 'all',
    permissions: { contents: 'read' },
  };
}

function makeToken(
  installationId: number,
  expiresAt: number,
  issuedAt?: number,
): InstallationToken {
  return {
    token: `ghs_${installationId}_${expiresAt}`,
    issuedAt: issuedAt ?? expiresAt - 3600,
    expiresAt,
    permissions: { contents: 'read' },
    repositorySelection: 'all',
    repositories: [],
  };
}

const NOW = 1_700_000_000;
let clockNow = NOW;

function newClock(): () => number {
  return () => clockNow;
}

function advanceClock(seconds: number): void {
  clockNow += seconds;
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  clockNow = NOW;
});

describe('InstallationTokenCache', () => {
  it('mints a new token on first call', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeToken(1, NOW + 3600));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const inst = makeInstallation(1);
    const token = await cache.getToken(inst);
    expect(token.token).toBe(`ghs_1_${NOW + 3600}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(inst);
  });

  it('reuses a cached token that is still within the refresh window', async () => {
    const fetcher = vi.fn().mockResolvedValue(makeToken(1, NOW + 3600));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const inst = makeInstallation(1);
    await cache.getToken(inst);
    advanceClock(60);
    const second = await cache.getToken(inst);
    expect(second.token).toBe(`ghs_1_${NOW + 3600}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the token enters the default 5-minute refresh window', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeToken(1, NOW + 3600))
      .mockResolvedValueOnce(makeToken(1, NOW + 7200));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const inst = makeInstallation(1);
    await cache.getToken(inst);
    // 6 minutes from expiry: still fresh.
    advanceClock(3600 - 6 * 60);
    await cache.getToken(inst);
    // 4 minutes from expiry: inside the refresh window.
    advanceClock(2 * 60);
    const refreshed = await cache.getToken(inst);
    expect(refreshed.token).toBe(`ghs_1_${NOW + 7200}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refreshes an already-expired token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeToken(1, NOW + 3600))
      .mockResolvedValueOnce(makeToken(1, NOW + 7200));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const inst = makeInstallation(1);
    await cache.getToken(inst);
    advanceClock(3601);
    const refreshed = await cache.getToken(inst);
    expect(refreshed.token).toBe(`ghs_1_${NOW + 7200}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('honours a custom refresh window', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeToken(1, NOW + 3600))
      .mockResolvedValueOnce(makeToken(1, NOW + 7200));
    const cache = new InstallationTokenCache({
      fetcher,
      clock: newClock(),
      refreshWindowSeconds: 900, // 15 min
    });
    const inst = makeInstallation(1);
    await cache.getToken(inst);
    // 46 min later: 14 min before expiry, inside 15-min window, refresh.
    advanceClock(46 * 60);
    const refreshed = await cache.getToken(inst);
    expect(refreshed.token).toBe(`ghs_1_${NOW + 7200}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps separate tokens for separate installations', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeToken(1, NOW + 3600))
      .mockResolvedValueOnce(makeToken(2, NOW + 3600));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const t1 = await cache.getToken(makeInstallation(1));
    const t2 = await cache.getToken(makeInstallation(2));
    expect(t1.token).toBe(`ghs_1_${NOW + 3600}`);
    expect(t2.token).toBe(`ghs_2_${NOW + 3600}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('single-flights a concurrent refresh of the same installation', async () => {
    let resolveMint: ((t: InstallationToken) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<InstallationToken>((resolve) => {
          resolveMint = resolve;
        }),
    );
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const inst = makeInstallation(1);
    const p1 = cache.getToken(inst);
    const p2 = cache.getToken(inst);
    const p3 = cache.getToken(inst);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveMint?.(makeToken(1, NOW + 3600));
    const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
    expect(t1.token).toBe(t2.token);
    expect(t2.token).toBe(t3.token);
  });

  it('invalidates a single installation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeToken(1, NOW + 3600))
      .mockResolvedValueOnce(makeToken(1, NOW + 7200));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const inst = makeInstallation(1);
    await cache.getToken(inst);
    cache.invalidate(inst);
    const t = await cache.getToken(inst);
    expect(t.token).toBe(`ghs_1_${NOW + 7200}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidates every cached token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(makeToken(1, NOW + 3600))
      .mockResolvedValueOnce(makeToken(2, NOW + 3600))
      .mockResolvedValueOnce(makeToken(1, NOW + 7200))
      .mockResolvedValueOnce(makeToken(2, NOW + 7200));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    await cache.getToken(makeInstallation(1));
    await cache.getToken(makeInstallation(2));
    cache.invalidateAll();
    await cache.getToken(makeInstallation(1));
    await cache.getToken(makeInstallation(2));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('snapshot reflects current state and refreshing flag', async () => {
    let resolveMint: ((t: InstallationToken) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<InstallationToken>((resolve) => {
          resolveMint = resolve;
        }),
    );
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const inst = makeInstallation(42);
    const pending = cache.getToken(inst);
    const snap = cache.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]?.installationId).toBe(42);
    expect(snap[0]?.refreshing).toBe(true);
    resolveMint?.(makeToken(42, NOW + 3600));
    await pending;
    const snap2 = cache.snapshot();
    expect(snap2[0]?.refreshing).toBe(false);
    expect(snap2[0]?.token).toBe(`ghs_42_${NOW + 3600}`);
  });

  it('propagates fetcher errors so callers can handle them', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    await expect(cache.getToken(makeInstallation(1))).rejects.toThrow('boom');
  });

  it('clears the inflight marker even when the fetcher rejects', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(makeToken(1, NOW + 3600));
    const cache = new InstallationTokenCache({ fetcher, clock: newClock() });
    const inst = makeInstallation(1);
    await expect(cache.getToken(inst)).rejects.toThrow('transient');
    const recovered = await cache.getToken(inst);
    expect(recovered.token).toBe(`ghs_1_${NOW + 3600}`);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
