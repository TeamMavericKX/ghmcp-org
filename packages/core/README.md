# @ghmcp-org/core

MCP server core for ghmcp-org. Owns:

- the **server factory** that wires transport + registry + capabilities
- **transport adapters** for `stdio` and `streamable-http`
- the **tool registry** with annotation-aware registration
- the **error model** that maps to JSON-RPC error codes
- **capabilities** and protocol-version negotiation
- **toolset gating** so callers can enable or disable groups of tools
- **tool description hashing** for rug-pull detection

This package is transport-neutral. It does not know about Fastify or
Octokit; those live in `apps/*` and `packages/github-app/`.

```ts
import { createServer } from "@ghmcp-org/core";

const server = createServer({
  name: "ghmcp-org",
  version: "0.1.0",
  toolsets: ["meta", "orgs", "repos", "issues", "pulls"],
});
```
