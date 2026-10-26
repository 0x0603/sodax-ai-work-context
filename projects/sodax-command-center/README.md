# sodax-command-center — context

Upstream: `github.com/icon-project/sodax-command-center` (default branch `main`)

## Overview

The team hub: core SODAX repos as git submodules under `repos/<layer>/<name>`, plus
repo cards (`docs/repos/`), cross-repo interfaces, the on-chain registry, hygiene
gate workflows, and a self-hosted web UI (`apps/command-center`, see
`docs/command-center.md`). Its `CLAUDE.md` is the router for code.

Setup on any machine: `scripts/setup-hub.sh` in this context repo (wraps the hub's
own `scripts/bootstrap.sh`). Hub tooling needs Python 3.11+; use `.venv/bin/python`.

## Layout

- `issues/` — dossiers for hub issues, mainly *Cross-repo feature* issues
  (`gh-<n>-<title>/`). Each repo's sub-issue goes in `related_issues`. Scaffold:
  `scripts/new-issue.sh sodax-command-center <n> <title...>`.
- `decisions/` — hub-scoped ADRs.
