// Toolset gating. Tools are declared in groups ("meta", "orgs", ...);
// the server runs only the groups a deployment explicitly enabled. A
// `disabled` list can opt specific tools out of an enabled group.

export type ToolsetName = string;

export interface ToolsetSpec {
  readonly name: ToolsetName;
  readonly description: string;
  /** Names of tools that belong to this group, in registration order. */
  readonly members: readonly string[];
}

export interface ResolvedToolset {
  readonly enabled: ReadonlySet<ToolsetName>;
  readonly disabledTools: ReadonlySet<string>;
}

export interface ToolsetConfig {
  readonly available: readonly ToolsetSpec[];
  readonly enabledNames: readonly ToolsetName[];
  /** Tools to remove from an otherwise-enabled group. */
  readonly disabledTools?: readonly string[];
}

/** Resolve a toolset config into sets for O(1) checks. Throws on unknown name. */
export function resolveToolset(config: ToolsetConfig): ResolvedToolset {
  const available = new Map<ToolsetName, ToolsetSpec>();
  for (const spec of config.available) {
    if (available.has(spec.name)) {
      throw new Error(`duplicate toolset: ${spec.name}`);
    }
    available.set(spec.name, spec);
  }
  const enabled = new Set<ToolsetName>();
  for (const name of config.enabledNames) {
    if (!available.has(name)) {
      throw new Error(`unknown toolset: ${name}`);
    }
    enabled.add(name);
  }
  const disabledTools = new Set<string>(config.disabledTools ?? []);
  return { enabled, disabledTools };
}

/** A `ToolsetSpec` is well-formed if members are unique and non-empty. */
export function validateSpec(spec: ToolsetSpec): void {
  if (spec.name.length === 0) {
    throw new Error('toolset name must be non-empty');
  }
  if (spec.members.length === 0) {
    throw new Error(`toolset ${spec.name} has no members`);
  }
  const seen = new Set<string>();
  for (const m of spec.members) {
    if (seen.has(m)) {
      throw new Error(`toolset ${spec.name} has duplicate member ${m}`);
    }
    seen.add(m);
  }
}

/** Compose the v0.1 toolset catalog (the five shipped groups). */
export const SHIPPED_TOOLSETS: readonly ToolsetSpec[] = [
  {
    name: 'meta',
    description: 'Server introspection: health, capabilities, version, toolset listing.',
    members: ['server_info', 'list_toolsets', 'describe_tool'],
  },
  {
    name: 'orgs',
    description: 'Read-only org and member inspection.',
    members: ['org_get', 'org_list_members', 'org_get_member', 'org_list_repos'],
  },
  {
    name: 'repos',
    description: 'Repo read and, behind dryRun, write operations.',
    members: [
      'repo_get',
      'repo_list_branches',
      'repo_get_content',
      'repo_create',
      'repo_update',
      'repo_archive',
    ],
  },
  {
    name: 'issues',
    description: 'Issue read and, behind dryRun, write operations.',
    members: [
      'issue_get',
      'issue_list',
      'issue_create',
      'issue_update',
      'issue_comment_list',
      'issue_comment_create',
    ],
  },
  {
    name: 'pulls',
    description: 'Pull request read and, behind dryRun, write operations.',
    members: ['pr_get', 'pr_list', 'pr_list_files', 'pr_create', 'pr_merge'],
  },
];
