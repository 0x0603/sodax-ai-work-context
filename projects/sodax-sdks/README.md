# sodax-sdks — context

Upstream: `github.com/icon-project/sodax-sdks`

## Overview

See the hub card `sodax-command-center/docs/repos/sodax-sdks.md` (stack, layout,
build/test, interfaces, gotchas). Code: `sodax-command-center/repos/client/sodax-sdks/`.
Notes below are only what the card doesn't cover.

## Layout

- `issues/` — one folder per GitHub issue / task (`gh-<n>-<title>/` or
  `task-<title>/`), each with `issue.md` · `plan.md` · `process.md` ·
  `outcome.md`. Scaffold: `scripts/new-issue.sh sodax-sdks <n> <title...>`.
- `decisions/` — repo-scoped ADRs (cross-cutting ones go in top-level `decisions/`).
