# GH-MCP-Org

> Multi-tenant GitHub MCP server for AI agents — production-grade, observable, secure.

Exposes the full GitHub platform (org, repo, issue, PR, code-security, actions, projects, audit) as **typed MCP tools** that AI agents can call. One MCP server = one GitHub App installation = one org's surface area, with full audit trail and zero secret leakage to agents.

## Why

The official `github/github-mcp-server` ships as a monolithic tool surface on a single PAT identity. `ghmcp-org` is the **enterprise fork**:

- **Multi-tenant** — one process per org/install, secrets never cross tenants
- **GitHub App auth** — installation tokens, 15k/hr rate limit, 60-min auto-rotate
- **OAuth 2.1 + PKCE** on the MCP side, RFC 8707 resource indicators, RFC 9728 metadata
- **Tool safety** — `dryRun` and two-phase `confirmDestructive` on every write
- **Prompt-injection hardened** — `UNTRUSTED_GH` delimiters, prefer IDs over content, description-hash rug-pull detection
- **Streamable HTTP** primary transport (MCP spec 2025-11-25), stdio for local IDEs
- **Observable** — OTel traces, Pino logs, Prom metrics, Grafana dashboards

## Quickstart (stdio, local IDE)

```bash
# Clone
git clone https://github.com/TeamMavericKX/ghmcp-org.git
cd ghmcp-org

# Install
pnpm install

# Configure
cp .env.example .env
# Edit .env: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH, GITHUB_INSTALLATION_ID

# Run (stdio mode)
pnpm dev:stdio
```

Then point your IDE (VS Code, Zed) MCP config at `pnpm dev:stdio`.

## Quickstart (streamable HTTP, hosted)

```bash
pnpm dev:http   # listens on 127.0.0.1:3000 by default
```

Test:

```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

## Tool surface (v0.1)

| Toolset | Tools | Read/Write |
|---|---|---|
| `meta` | 4 | read |
| `orgs` | 5 | r/w + confirm |
| `repos` | 9 | r/w + destructive |
| `issues` | 8 | r/w |
| `prs` | 10 | r/w + confirm |
| `dynamic` | 3 | discovery |

## Status

**v0.1.0** — bootstrap. See `docs/research.md` and `docs/plan.md` for the design and commit-by-commit plan.

## License

Apache 2.0 — see `LICENSE`.

## Contributing

See `CONTRIBUTING.md`. Commits are signed conventional, identity `10xdev4u-alt <10xdev4u@gmail.com>`.
