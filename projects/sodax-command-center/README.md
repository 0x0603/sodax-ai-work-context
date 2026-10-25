# sodax-command-center — context

Upstream: `github.com/icon-project/sodax-command-center` (default branch `main`)

## Overview

The team hub: core SODAX repos as git submodules under `repos/<layer>/<name>`, plus
repo cards (`docs/repos/`), cross-repo interfaces, the on-chain registry, hygiene
gate workflows, and a self-hosted web UI (`apps/command-center`, see
`docs/command-center.md`). Its `CLAUDE.md` is the router for code.

Setup: `gh auth setup-git`, clone with `--recurse-submodules --shallow-submodules`,
then `scripts/bootstrap.sh`. Hub tooling needs Python 3.11+ (`python3.12` here).

## Layout

- `issues/` — dossiers for hub issues, mainly *Cross-repo feature* issues
  (`gh-<n>-<title>/`). Each repo's sub-issue goes in `related_issues`. Scaffold:
  `scripts/new-issue.sh sodax-command-center <n> <title...>`.
- `decisions/` — hub-scoped ADRs.
