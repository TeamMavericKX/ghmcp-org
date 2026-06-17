import { describe, expect, it } from 'vitest';
import { InvalidInputError } from '../errors/index.js';
import { TEST_APP_ID, TEST_FROZEN_NOW, TEST_PRIVATE_KEY_PEM } from './__fixtures__/test-keys.js';
import { base64UrlDecode, decodeJwtHeader, decodeJwtPayload, mintAppJwt } from './jwt.js';

const now = (): number => TEST_FROZEN_NOW;

describe('mintAppJwt', () => {
  it('returns a three-segment dot-separated JWT', () => {
    const { jwt } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
    });
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('embeds the registered claims in the payload', () => {
    const { claims } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
    });
    expect(claims.iss).toBe(TEST_APP_ID);
    expect(claims.iat).toBe(TEST_FROZEN_NOW);
    expect(claims.exp).toBe(TEST_FROZEN_NOW + 600);
  });

  it('signs with RS256 and includes the alg in the header', () => {
    const { jwt } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
    });
    const header = decodeJwtHeader(jwt);
    expect(header.alg).toBe('RS256');
    expect(header.typ).toBe('JWT');
  });

  it('produces a 256-byte RSA signature for a 2048-bit key', () => {
    const { jwt } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
    });
    const sig = base64UrlDecode(jwt.split('.')[2] ?? '');
    // 2048-bit key -> 256 byte signature. base64url of 256 bytes is 342 chars.
    expect(sig).toHaveLength(256);
  });

  it('changes the signature when the iat changes', () => {
    const a = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
      issuedAtSeconds: TEST_FROZEN_NOW,
    });
    const b = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
      issuedAtSeconds: TEST_FROZEN_NOW + 1,
    });
    expect(a.jwt).not.toBe(b.jwt);
  });

  it('rejects a non-numeric app id', () => {
    expect(() => mintAppJwt({ appId: 'abc', privateKey: TEST_PRIVATE_KEY_PEM, now })).toThrow(
      InvalidInputError,
    );
  });

  it('rejects an empty app id', () => {
    expect(() => mintAppJwt({ appId: '   ', privateKey: TEST_PRIVATE_KEY_PEM, now })).toThrow(
      /github app id/,
    );
  });

  it('rejects a missing private key', () => {
    expect(() => mintAppJwt({ appId: TEST_APP_ID, privateKey: undefined as never, now })).toThrow(
      /private key/,
    );
  });

  it('clamps lifetimes to the GitHub 15-minute ceiling', () => {
    const { claims } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
      lifetimeSeconds: 24 * 60 * 60,
    });
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it('clamps lifetimes up to a 60-second minimum', () => {
    const { claims } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
      lifetimeSeconds: 5,
    });
    expect(claims.exp - claims.iat).toBe(60);
  });

  it('rejects a non-positive lifetime', () => {
    expect(() =>
      mintAppJwt({
        appId: TEST_APP_ID,
        privateKey: TEST_PRIVATE_KEY_PEM,
        now,
        lifetimeSeconds: 0,
      }),
    ).toThrow(/positive/);
  });

  it('rejects a NaN lifetime', () => {
    expect(() =>
      mintAppJwt({
        appId: TEST_APP_ID,
        privateKey: TEST_PRIVATE_KEY_PEM,
        now,
        lifetimeSeconds: Number.NaN,
      }),
    ).toThrow(/positive/);
  });

  it('uses the issuedAtSeconds override when provided', () => {
    const { claims } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
      issuedAtSeconds: 1_000_000_000,
    });
    expect(claims.iat).toBe(1_000_000_000);
  });

  it('uses the lifetimeSeconds override when in range', () => {
    const { claims } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
      lifetimeSeconds: 300,
    });
    expect(claims.exp - claims.iat).toBe(300);
  });

  it('accepts a numeric appId and stringifies it in the claim', () => {
    const { claims } = mintAppJwt({
      appId: 987654,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
    });
    expect(claims.iss).toBe('987654');
  });

  it('exposes the requested lifetime in the result', () => {
    const { lifetimeSeconds } = mintAppJwt({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY_PEM,
      now,
      lifetimeSeconds: 120,
    });
    expect(lifetimeSeconds).toBe(120);
  });
});

describe('decodeJwtHeader / decodeJwtPayload', () => {
  const sample = mintAppJwt({
    appId: TEST_APP_ID,
    privateKey: TEST_PRIVATE_KEY_PEM,
    now,
  });

  it('decodes the header JSON', () => {
    const header = decodeJwtHeader(sample.jwt);
    expect(header).toMatchObject({ alg: 'RS256', typ: 'JWT' });
  });

  it('decodes the payload JSON', () => {
    const payload = decodeJwtPayload<{ iss: string }>(sample.jwt);
    expect(payload.iss).toBe(TEST_APP_ID);
  });

  it('rejects a malformed header', () => {
    expect(() => decodeJwtHeader('not-a-jwt')).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decodeJwtPayload('malformed-token-string')).toThrow();
  });

  it('rejects an empty jwt', () => {
    expect(() => decodeJwtHeader('')).toThrow();
  });
});

describe('base64UrlDecode', () => {
  it('round-trips a UTF-8 string', () => {
    const original = 'hello world';
    const encoded = Buffer.from(original, 'utf8')
      .toString('base64')
      .replace(/=+$/u, '')
      .replace(/\+/gu, '-')
      .replace(/\//gu, '_');
    expect(base64UrlDecode(encoded).toString('utf8')).toBe(original);
  });

  it('round-trips a binary buffer', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 255]);
    const encoded = buf
      .toString('base64')
      .replace(/=+$/u, '')
      .replace(/\+/gu, '-')
      .replace(/\//gu, '_');
    const out = base64UrlDecode(encoded);
    expect(buf.equals(out)).toBe(true);
  });

  it('rejects input with illegal characters', () => {
    expect(() => base64UrlDecode('not!valid@')).toThrow(InvalidInputError);
  });

  it('rejects input with a space', () => {
    expect(() => base64UrlDecode('a b c')).toThrow(InvalidInputError);
  });
});
