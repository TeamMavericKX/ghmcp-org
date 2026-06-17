import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { McpToolAnnotations, McpToolDefinition } from '../types.js';
import { createRegistry, hashDescription } from './registry.js';

const annotations: McpToolAnnotations = {
  readOnly: true,
  destructive: false,
  openWorld: false,
};

const makeTool = (name: string, desc = `${name} description`): McpToolDefinition => ({
  name,
  description: desc,
  inputSchema: z.object({ x: z.string() }),
  annotations,
  handler: async (input) => ({ echoed: input }),
});

const opts = (names: readonly string[] = ['meta']) => {
  const enabled = new Set(names);
  const index = new Map<string, string>();
  for (const n of names) {
    index.set(n, n);
  }
  return { enabledToolsets: enabled, toolsetIndex: index };
};

describe('createRegistry', () => {
  it('starts empty', () => {
    const r = createRegistry(opts());
    expect(r.size()).toBe(0);
    expect(r.list()).toEqual([]);
  });

  it('registers a tool and reports its size', () => {
    const r = createRegistry(opts());
    r.register(makeTool('a'), 'meta');
    expect(r.size()).toBe(1);
    expect(r.get('a')).toBeDefined();
  });

  it('throws on duplicate tool names', () => {
    const r = createRegistry(opts());
    r.register(makeTool('a'), 'meta');
    expect(() => r.register(makeTool('a'), 'meta')).toThrow(/already registered/);
  });

  it('lists registered tools with their hash and toolset', () => {
    const r = createRegistry(opts(['meta']));
    r.register(makeTool('a', 'tool a'), 'meta');
    const list = r.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('a');
    expect(list[0]?.toolset).toBe('meta');
    expect(list[0]?.descriptionHash).toBe(hashDescription('tool a'));
  });

  it('isEnabled reflects the toolset gate', () => {
    const r = createRegistry(opts(['meta']));
    r.register(makeTool('a'), 'meta');
    r.register(makeTool('b'), 'issues');
    expect(r.isEnabled('a')).toBe(true);
    expect(r.isEnabled('b')).toBe(false);
  });

  it('isEnabled returns false for unknown names', () => {
    const r = createRegistry(opts());
    expect(r.isEnabled('ghost')).toBe(false);
  });

  it('listEnabled filters by enabled toolsets only', () => {
    const r = createRegistry(opts(['meta']));
    r.register(makeTool('a'), 'meta');
    r.register(makeTool('b'), 'issues');
    const enabled = r.listEnabled();
    expect(enabled.map((t) => t.name)).toEqual(['a']);
  });

  it('hashFor returns the description hash of a registered tool', () => {
    const r = createRegistry(opts());
    r.register(makeTool('a', 'desc-A'), 'meta');
    expect(r.hashFor('a')).toBe(hashDescription('desc-A'));
  });

  it('hashFor returns undefined for unknown tools', () => {
    const r = createRegistry(opts());
    expect(r.hashFor('ghost')).toBeUndefined();
  });

  it('get returns undefined for unknown tools', () => {
    const r = createRegistry(opts());
    expect(r.get('nope')).toBeUndefined();
  });
});

describe('hashDescription', () => {
  it('returns 16 hex chars', () => {
    expect(hashDescription('x')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic', () => {
    expect(hashDescription('hello')).toBe(hashDescription('hello'));
  });
});
