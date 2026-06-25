# sodax-backend — context

Upstream: `github.com/icon-project/sodax-backend`

## Overview

TODO: what this service does, key entry points, how it's run locally.

## Layout

- `issues/` — one folder per GitHub issue / task (`gh-<n>-<title>/` or
  `task-<title>/`), each with `issue.md` · `plan.md` · `process.md` ·
  `outcome.md`. Scaffold: `scripts/new-issue.sh sodax-backend <n> <title...>`.
- `decisions/` — repo-scoped ADRs (cross-cutting ones go in top-level `decisions/`).
