// Tool registry. Holds the set of McpToolDefinitions, the active toolset
// gate, and per-tool description hashes for rug-pull detection.

import { createHash } from 'node:crypto';
import type { ToolsetName } from '../toolset/index.js';
import type { McpToolAnnotations, McpToolDefinition } from '../types.js';

export interface RegistryOptions {
  readonly enabledToolsets: ReadonlySet<ToolsetName>;
  readonly toolsetIndex: ReadonlyMap<string, ToolsetName>;
}

export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly descriptionHash: string;
  readonly annotations: McpToolAnnotations;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  readonly toolset: ToolsetName;
}

export interface Registry {
  register(definition: McpToolDefinition, toolset: ToolsetName): void;
  get(name: string): McpToolDefinition | undefined;
  list(): readonly RegisteredTool[];
  listEnabled(): readonly RegisteredTool[];
  hashFor(name: string): string | undefined;
  isEnabled(name: string): boolean;
  size(): number;
}

class DefaultRegistry implements Registry {
  private readonly tools = new Map<string, McpToolDefinition>();
  private readonly toolset = new Map<string, ToolsetName>();
  private readonly opts: RegistryOptions;

  constructor(opts: RegistryOptions) {
    this.opts = opts;
  }

  register(definition: McpToolDefinition, toolset: ToolsetName): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`tool already registered: ${definition.name}`);
    }
    this.tools.set(definition.name, definition);
    this.toolset.set(definition.name, toolset);
  }

  get(name: string): McpToolDefinition | undefined {
    return this.tools.get(name);
  }

  isEnabled(name: string): boolean {
    const ts = this.toolset.get(name);
    if (ts === undefined) return false;
    return this.opts.enabledToolsets.has(ts);
  }

  list(): readonly RegisteredTool[] {
    const out: RegisteredTool[] = [];
    for (const [name, def] of this.tools) {
      out.push(toProject(name, def, this.toolset.get(name) ?? 'default'));
    }
    return out;
  }

  listEnabled(): readonly RegisteredTool[] {
    return this.list().filter((t) => this.opts.enabledToolsets.has(t.toolset));
  }

  hashFor(name: string): string | undefined {
    const def = this.tools.get(name);
    if (def === undefined) return undefined;
    return hashDescription(def.description);
  }

  size(): number {
    return this.tools.size;
  }
}

function toProject(name: string, def: McpToolDefinition, toolset: ToolsetName): RegisteredTool {
  return {
    name,
    description: def.description,
    descriptionHash: hashDescription(def.description),
    annotations: def.annotations,
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema ?? null,
    toolset,
  };
}

/** Stable, short SHA-256 of a tool description; used to detect tampering. */
export function hashDescription(description: string): string {
  return createHash('sha256').update(description, 'utf8').digest('hex').slice(0, 16);
}

export function createRegistry(opts: RegistryOptions): Registry {
  return new DefaultRegistry(opts);
}
