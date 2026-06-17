// Stdio transport entry point.
//
// Wires the shared MCP server factory to the stdio transport so local
// IDEs (Claude Code, Cursor) can launch the server as a child process.
// The full lifecycle is implemented in @ghmcp-org/core (runStdio); this
// file only selects the adapter, supplies a default auth gate, and
// delegates.

import { requireGithubToken, runStdio } from '@ghmcp-org/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

await runStdio({
  buildTransport: () => new StdioServerTransport(),
  authorize: (env) => {
    requireGithubToken(env);
  },
});
