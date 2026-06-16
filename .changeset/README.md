# Changesets

This directory uses [Changesets](https://github.com/changesets/changesets)
to track version bumps and changelog entries for public packages.

## For Contributors

When you change anything in a package's public surface — its exports,
its behavior, or its dependencies in a way that affects consumers — add
a new markdown file in this directory describing the change.

Filename pattern: `<short-slug>.md`. Example: `feat-orgs-toolset.md`.

```md
---
"@ghmcp-org/tools": minor
---

Add `orgs` toolset with `list_members`, `get_member`, and `list_repos`.
All read-only; safe by default.
```

Allowed bump levels: `patch` (bugfix), `minor` (new feature, backward
compatible), `major` (breaking change). Internal-only refactors do not
need a changeset.

## For Maintainers

```sh
pnpm changeset version   # consume pending changesets, bump versions
pnpm changeset publish   # publish to npm (private first via .npmrc)
```

A release PR is opened by the bot, or generated locally by
`pnpm changeset version`, and merges into `main` once CI is green.
That merge tags and publishes.
