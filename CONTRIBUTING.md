# Contributing

Thanks for your interest in GH-MCP-Org. This document covers the basics of
working on the codebase. For security disclosures, see `SECURITY.md`.

## Code of Conduct

Be respectful, assume good faith, and keep technical discussion on-topic.
Harassment of any kind is not tolerated.

## Ground Rules

- **Open an issue first** for non-trivial changes. The maintainers will
  help scope it and label it. Trivial fixes (typos, dead links) do not
  need an issue.
- **One logical change per pull request.** Squash noise out of history.
  Your PR title becomes the squashed commit subject.
- **No force-push after review has started.** We will review squashed
  PRs only. Once a review has been requested, please don't rebase.
- **Tests are required** for new behavior and bug fixes. We target 80%
  line / 75% branch coverage on touched packages.

## Development Setup

Requirements: Node 22 LTS, pnpm 9, and a POSIX shell.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Pre-commit and pre-push hooks are wired through `lefthook`. They run
Biome formatting, cspell, and a typecheck on save; on push they run the
test suite and a production build. Install hooks once after cloning:

```sh
pnpm exec lefthook install
```

## Commit Style

We use **Conventional Commits**, one subject line, no body unless the
subject cannot stand alone.

```
<type>(<scope>): <subject>
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `ci`, `refactor`, `test`,
`perf`, `build`, `deps`, `dev`. Scope is the affected package or area
(`core`, `github-app`, `security`, `tools`, `observability`, `ci`).
Subject is imperative, lowercase, no trailing period, ≤ 72 characters.

Examples:

```
feat(github-app): mint installation tokens with rs256 jwt
fix(tools): preserve issue id on dry-run response
docs(security): document prompt-injection hardening
```

## Branching and Releases

- `main` is the trunk. All changes land via PR.
- Releases are tagged `vX.Y.Z`. The version is managed by changesets
  in `.changeset/`. Each PR that changes public surface should
  include a changeset.
- We do **not** maintain long-lived feature branches. Cut from
  `main`, merge back, delete.

## Architecture Map

The repo is a pnpm monorepo:

```
apps/                   # deployment entrypoints
  http/                 # streamable-http server
  stdio/                # local stdio transport
packages/
  core/                 # MCP server, transport, tool registry
  github-app/           # auth, installation token cache
  security/             # OAuth 2.1, dryRun, prompt-injection guards
  observability/        # OTel, Pino, Prometheus
  tools/                # toolset implementations
```

Before adding a tool, read the **Tool Authoring Guide** in
`packages/tools/README.md` (written in Phase 5). Before touching auth
or transport, read the threat model in `SECURITY.md`.

## Review Process

1. Open a PR. The CI must be green.
2. A CODEOWNER will be auto-assigned for the area you touched.
3. We aim for a first review within **5 business days**.
4. Once approved, a maintainer will squash-merge.

## License

By contributing, you agree that your contributions will be licensed
under the Apache 2.0 License. See `LICENSE` for the full text.
