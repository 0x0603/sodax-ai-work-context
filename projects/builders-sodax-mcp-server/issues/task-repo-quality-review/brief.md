---
type: brief
repo: builders-sodax-mcp-server
github: 
status: Review done, nothing implemented
next: pick a step from plan.md with the user and open its issue
updated: 2026-11-26
---

# Repo Quality Review · brief

**The entry point. Read this, then open the one file the map points at.**

## State in five lines

- Whole-repo review of sodax-mcp done on 2026-11-26 at `feat/147-bridge-tools` `3a06fb4` + working tree; code only.
- Findings are in `review.md` (A cross-cutting, B infra, C data tools, D swap and tests), each re-opened in code.
- Bridge-specific findings are in `../gh-147-bridge-tools/code-quality-review.md`.
- Nothing implemented, no GitHub issue. One stale test import was fixed in the 147 worktree, uncommitted.
- `plan.md` holds a proposed order, the `nextAction` agent-friendliness steps (review section E), and what fits
  the bridge branch now; the user has not agreed to an order.

## Next action

Agree a first step with the user (proposal: plan.md step 1, guard rails), open its issue, then implement.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the user asked | `issue.md` | 0.2k |
| Every finding, with file:line evidence (A-D code, E nextAction for agents) | `review.md` | 3.2k |
| Proposed order, nextAction improvements, bridge-branch quick starts | `plan.md` | 1.6k |
| Bridge-branch findings | `../gh-147-bridge-tools/code-quality-review.md` | 1.4k |

## Landmines

- Line numbers are for `3a06fb4` + the 147 worktree; re-check after #147 or #125 merges.
- Upstream behaviour (bridge-api, solver, relay, MCP SDK internals) was not verified; B9 and C6 say so.
