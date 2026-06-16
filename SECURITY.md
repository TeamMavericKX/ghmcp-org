# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

The `main` branch receives security fixes that ship as the next `0.1.x` patch.
We do not backport to unreleased development tags.

## Reporting a Vulnerability

**Please do not file a public issue for security problems.**

Email **10xdev4u@gmail.com** with:

- A clear description of the vulnerability and its impact.
- A minimal proof-of-concept or reproduction steps.
- The commit SHA or release tag affected.
- Your assessment of severity and CVSS vector, if known.

You should receive an acknowledgement within **72 hours**. We aim to triage
within **7 days** and ship a fix or mitigation within **30 days** for
High/Critical issues, longer for Medium/Low.

## Threat Model

GH-MCP-Org sits between an LLM agent and the GitHub API. We treat the
agent's tool arguments and GitHub's responses as **untrusted** text. The
hardening layers are:

- **OAuth 2.1 with PKCE** and installation-token scoping per request.
- **Tool annotations** (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
  declared by the tool, enforced by the host.
- **`dryRun` two-phase confirmation** for any state-changing call.
- **ID-over-content** preference: tools accept GitHub IDs (numeric,
  `owner/name#n`) rather than free-form text, to limit prompt-injection
  surface.
- **`UNTRUSTED_GH` delimiters** around GitHub-rendered text so the agent
  can mechanically separate platform data from instructions.
- **Tool description hash + rug-pull detection**: the server pins a hash
  of every tool's description at first use and warns on change.
- **Origin and Host header allowlists** on the streamable-HTTP transport.

A response from GitHub is never re-interpreted as an instruction to the
agent, even if it contains text that looks like one. The server is the
trust boundary; everything downstream is treated as data.

## Secrets

Never commit tokens, private keys, or PEM material. The repo's
`.gitignore` covers `.env*`, `*.pem`, `*.key`, `*.p8`, and `secrets/**`.
The `lefthook` pre-commit hook runs `cspell` and will not block secrets,
so use a separate scanner (`gitleaks` is recommended) in your fork.

## Disclosure Policy

We follow **coordinated disclosure**. We will credit reporters in the
release notes unless asked to stay anonymous. We will not pursue legal
action against good-faith research that stays within this policy.
