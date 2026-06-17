import { describe, expect, it } from 'vitest';
import { SHIPPED_TOOLSETS, resolveToolset, validateSpec } from './toolset.js';

const sampleSpec = (name: string, members: readonly string[] = ['t1', 't2']) => ({
  name,
  description: `${name} toolset`,
  members,
});

describe('validateSpec', () => {
  it('passes a well-formed spec', () => {
    expect(() => validateSpec(sampleSpec('meta'))).not.toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => validateSpec(sampleSpec(''))).toThrow(/non-empty/);
  });

  it('rejects an empty member list', () => {
    expect(() => validateSpec(sampleSpec('empty', []))).toThrow(/no members/);
  });

  it('rejects a single-member spec with the duplicate-member error', () => {
    expect(() => validateSpec(sampleSpec('dup', ['a', 'a']))).toThrow(/duplicate member/);
  });
});

describe('resolveToolset', () => {
  it('enables only the requested groups', () => {
    const r = resolveToolset({
      available: [sampleSpec('a'), sampleSpec('b')],
      enabledNames: ['a'],
    });
    expect(r.enabled.has('a')).toBe(true);
    expect(r.enabled.has('b')).toBe(false);
  });

  it('throws on an unknown enabled name', () => {
    expect(() =>
      resolveToolset({
        available: [sampleSpec('a')],
        enabledNames: ['nope'],
      }),
    ).toThrow(/unknown toolset/);
  });

  it('throws on duplicate available specs', () => {
    expect(() =>
      resolveToolset({
        available: [sampleSpec('a'), sampleSpec('a')],
        enabledNames: [],
      }),
    ).toThrow(/duplicate toolset/);
  });

  it('carries disabled tools through to the resolved sets', () => {
    const r = resolveToolset({
      available: [sampleSpec('a', ['x', 'y'])],
      enabledNames: ['a'],
      disabledTools: ['y'],
    });
    expect(r.disabledTools.has('y')).toBe(true);
    expect(r.disabledTools.has('x')).toBe(false);
  });

  it('defaults disabled tools to empty', () => {
    const r = resolveToolset({
      available: [sampleSpec('a')],
      enabledNames: ['a'],
    });
    expect(r.disabledTools.size).toBe(0);
  });

  it('accepts an empty enabled list', () => {
    const r = resolveToolset({
      available: [sampleSpec('a'), sampleSpec('b')],
      enabledNames: [],
    });
    expect(r.enabled.size).toBe(0);
  });
});

describe('SHIPPED_TOOLSETS', () => {
  it('contains the five v0.1 groups', () => {
    const names = SHIPPED_TOOLSETS.map((s) => s.name);
    expect(names).toEqual(['meta', 'orgs', 'repos', 'issues', 'pulls']);
  });

  it('every shipped spec is well-formed', () => {
    for (const s of SHIPPED_TOOLSETS) {
      expect(() => validateSpec(s)).not.toThrow();
    }
  });

  it('every shipped spec has at least one member', () => {
    for (const s of SHIPPED_TOOLSETS) {
      expect(s.members.length).toBeGreaterThan(0);
    }
  });

  it('the meta toolset is the introspection group', () => {
    const meta = SHIPPED_TOOLSETS.find((s) => s.name === 'meta');
    expect(meta?.members).toContain('server_info');
    expect(meta?.members).toContain('list_toolsets');
  });
});
