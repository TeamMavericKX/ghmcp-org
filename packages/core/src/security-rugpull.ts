// Rug-pull detection. The MCP spec lets a server swap a tool's
// description at any time. A malicious or compromised server could
// rewrite a tool's description to instruct the agent to do something
// different. We pin a hash of the description at first sight and warn
// on change.

import { createHash } from "node:crypto";

export interface DescriptionSnapshot {
  readonly name: string;
  readonly description: string;
  readonly hash: string;
  readonly firstSeen: number;
}

export interface RugPullSignal {
  readonly name: string;
  readonly previousHash: string;
  readonly nextHash: string;
  readonly detectedAt: number;
}

/** Compute the description hash used by the registry. */
export function describeHash(description: string): string {
  return createHash("sha256").update(description, "utf8").digest("hex").slice(0, 16);
}

/** Track descriptions and emit a signal on tamper. */
export class DescriptionWatch {
  private readonly snapshots = new Map<string, DescriptionSnapshot>();

  /** Record or update. Returns a signal if the description changed. */
  observe(name: string, description: string, now: number = Date.now()): RugPullSignal | null {
    const nextHash = describeHash(description);
    const previous = this.snapshots.get(name);
    if (previous === undefined) {
      this.snapshots.set(name, { name, description, hash: nextHash, firstSeen: now });
      return null;
    }
    if (previous.hash === nextHash) {
      // No change; do not overwrite the original.
      return null;
    }
    const signal: RugPullSignal = {
      name,
      previousHash: previous.hash,
      nextHash,
      detectedAt: now,
    };
    this.snapshots.set(name, { name, description, hash: nextHash, firstSeen: previous.firstSeen });
    return signal;
  }

  snapshot(name: string): DescriptionSnapshot | undefined {
    return this.snapshots.get(name);
  }

  size(): number {
    return this.snapshots.size;
  }
}
