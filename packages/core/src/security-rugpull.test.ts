import { describe, expect, it } from 'vitest';
import { DescriptionWatch, describeHash } from './security-rugpull.js';

describe('describeHash', () => {
  it('returns a 16-character hex string', () => {
    const h = describeHash('hello world');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same input', () => {
    expect(describeHash('foo')).toBe(describeHash('foo'));
  });

  it('produces different hashes for different inputs', () => {
    expect(describeHash('foo')).not.toBe(describeHash('bar'));
  });

  it('changes on a single-character difference', () => {
    expect(describeHash('Read a file')).not.toBe(describeHash('Read  a file'));
  });

  it('is case-sensitive', () => {
    expect(describeHash('Hello')).not.toBe(describeHash('hello'));
  });
});

describe('DescriptionWatch', () => {
  it('records the first observation and returns null', () => {
    const w = new DescriptionWatch();
    expect(w.observe('search_repos', 'Search repos', 1000)).toBeNull();
    expect(w.size()).toBe(1);
  });

  it('returns null when the description is unchanged', () => {
    const w = new DescriptionWatch();
    w.observe('tool_a', 'desc', 1000);
    expect(w.observe('tool_a', 'desc', 2000)).toBeNull();
  });

  it('emits a signal when the description changes', () => {
    const w = new DescriptionWatch();
    w.observe('tool_a', 'original', 1000);
    const signal = w.observe('tool_a', 'malicious override', 2000);
    expect(signal).not.toBeNull();
    expect(signal?.name).toBe('tool_a');
    expect(signal?.previousHash).toBe(describeHash('original'));
    expect(signal?.nextHash).toBe(describeHash('malicious override'));
    expect(signal?.detectedAt).toBe(2000);
  });

  it('preserves firstSeen across a description change', () => {
    const w = new DescriptionWatch();
    w.observe('tool_a', 'first', 1000);
    w.observe('tool_a', 'second', 5000);
    expect(w.snapshot('tool_a')?.firstSeen).toBe(1000);
  });

  it('updates to the latest description after a signal', () => {
    const w = new DescriptionWatch();
    w.observe('tool_a', 'first', 1000);
    w.observe('tool_a', 'second', 2000);
    expect(w.snapshot('tool_a')?.description).toBe('second');
  });

  it('does not re-emit a signal if the description changes back and forward', () => {
    const w = new DescriptionWatch();
    w.observe('tool_a', 'a', 1000);
    expect(w.observe('tool_a', 'b', 2000)).not.toBeNull();
    // back to a
    expect(w.observe('tool_a', 'a', 3000)).not.toBeNull();
  });

  it('tracks multiple tools independently', () => {
    const w = new DescriptionWatch();
    w.observe('a', 'a1', 1000);
    w.observe('b', 'b1', 1000);
    expect(w.observe('a', 'a2', 2000)).not.toBeNull();
    expect(w.observe('b', 'b1', 2000)).toBeNull();
    expect(w.size()).toBe(2);
  });

  it('returns undefined for unknown tool snapshots', () => {
    const w = new DescriptionWatch();
    expect(w.snapshot('nope')).toBeUndefined();
  });
});
