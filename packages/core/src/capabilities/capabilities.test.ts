import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_PROTOCOL_VERSIONS,
  VENDOR,
  buildInitializeResult,
  negotiateProtocolVersion,
} from './capabilities.js';

describe('negotiateProtocolVersion', () => {
  it('returns the requested version when supported', () => {
    const result = negotiateProtocolVersion('2025-11-25');
    expect(result.negotiated).toBe('2025-11-25');
    expect(result.requested).toBe('2025-11-25');
    expect(result.supported).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
  });

  it('accepts the newest RC version', () => {
    const result = negotiateProtocolVersion('2026-07-28');
    expect(result.negotiated).toBe('2026-07-28');
  });

  it('falls back to newest supported version when client requests an unknown one', () => {
    const result = negotiateProtocolVersion('1999-01-01');
    expect(result.negotiated).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect(result.requested).toBe('1999-01-01');
  });

  it('falls back when client sends empty string', () => {
    const result = negotiateProtocolVersion('');
    expect(result.negotiated).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('supported versions are sorted newest first', () => {
    const versions = SUPPORTED_PROTOCOL_VERSIONS;
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i - 1] > versions[i]).toBe(true);
    }
  });
});

describe('buildInitializeResult', () => {
  const result = buildInitializeResult({
    requestedVersion: '2025-11-25',
    serverName: 'ghmcp-org',
    serverVersion: '0.1.0',
  });

  it('returns the negotiated protocol version', () => {
    expect(result.protocolVersion).toBe('2025-11-25');
  });

  it('advertises dynamic tool listing', () => {
    expect(result.capabilities.tools).toEqual({ listChanged: true });
  });

  it('does not expose resources in v0.1', () => {
    expect(result.capabilities.resources).toEqual({
      subscribe: false,
      listChanged: false,
    });
  });

  it('does not expose prompts in v0.1', () => {
    expect(result.capabilities.prompts).toEqual({ listChanged: false });
  });

  it('logging is empty (server-side only)', () => {
    expect(result.capabilities.logging).toEqual({});
  });

  it('attaches vendor to serverInfo', () => {
    expect(result.serverInfo).toEqual({
      name: 'ghmcp-org',
      version: '0.1.0',
      vendor: VENDOR,
    });
  });

  it('vendor is ghmcp-org', () => {
    expect(VENDOR).toBe('ghmcp-org');
  });
});
