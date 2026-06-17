// Stdio transport adapter.
//
// The local IDE host (Claude Code, Cursor, etc.) launches the server as
// a child process and speaks JSON-RPC over its stdin/stdout. The MCP
// SDK provides the framing; we add a single-shot auth gate that runs
// against the process env (GITHUB_TOKEN or an installation id+key).

import type { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { UnauthorizedError } from '../errors/index.js';

export interface StdioOptions {
  /** Build the SDK transport. */
  readonly buildTransport: () => StdioServerTransport;
  /** Optional auth gate. Throws UnauthorizedError to refuse to start. */
  readonly authorize: (env: NodeJS.ProcessEnv) => Promise<void> | void;
}

/** Run the stdio transport. Resolves when stdin closes. */
export async function runStdio(opts: StdioOptions): Promise<void> {
  await opts.authorize(process.env);
  const transport = opts.buildTransport();
  await transport.start();
  // Block until stdin closes (the host has disconnected).
  await new Promise<void>((resolve) => {
    if (process.stdin.readableEnded) {
      resolve();
      return;
    }
    process.stdin.once('end', () => resolve());
    process.stdin.once('close', () => resolve());
  });
  await transport.close();
}

/** Default auth gate: require a GITHUB_TOKEN env var or refuse to start. */
export function requireGithubToken(env: NodeJS.ProcessEnv): void {
  const token = env.GITHUB_TOKEN;
  if (typeof token !== 'string' || token.length === 0) {
    throw new UnauthorizedError('GITHUB_TOKEN env var is required for stdio transport');
  }
}
