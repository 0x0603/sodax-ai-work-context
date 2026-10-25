# sodax-frontend — context

Upstream: `github.com/icon-project/sodax-frontend`

## Overview

See the hub card `sodax-command-center/docs/repos/sodax-frontend.md` (stack, layout,
build/test, interfaces, gotchas). Code: `sodax-command-center/repos/client/sodax-frontend/`.
Notes below are only what the card doesn't cover.

## Layout

- `issues/` — one folder per GitHub issue / task (`gh-<n>-<title>/` or
  `task-<title>/`), each with `issue.md` · `plan.md` · `process.md` ·
  `outcome.md`. Scaffold: `scripts/new-issue.sh sodax-frontend <n> <title...>`.
- `decisions/` — repo-scoped ADRs (cross-cutting ones go in top-level `decisions/`).
