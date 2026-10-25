# sodax-backend — context

Upstream: `github.com/icon-project/sodax-backend`

## Overview

See the hub card `sodax-command-center/docs/repos/sodax-backend.md` (stack, layout,
build/test, interfaces, gotchas). Code: `sodax-command-center/repos/backend/sodax-backend/`.
Notes below are only what the card doesn't cover.

## Layout

- `issues/` — one folder per GitHub issue / task (`gh-<n>-<title>/` or
  `task-<title>/`), each with `issue.md` · `plan.md` · `process.md` ·
  `outcome.md`. Scaffold: `scripts/new-issue.sh sodax-backend <n> <title...>`.
- `decisions/` — repo-scoped ADRs (cross-cutting ones go in top-level `decisions/`).
