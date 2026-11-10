---
type: brief
repo: builders-sodax-mcp-server
github: 112
status: Active
next: nothing started; when picked up, group 1 (lockfile refresh) first, in a worktree off development, one commit per bump
updated: 2026-11-10
---

# GH-112 Dependabot alerts · brief

## State in five lines

- Issue filed 2026-11-10 (Task, Sodax board #1, Backlog, stream Builders MCP, assignee 0x0603): 91 open alerts across 24 packages
  (first filed as 30: one API page; corrected the same evening), none in this repo's code. Full grouping with fix paths in `issue.md`.
- Seen while pushing to PR #111 (the remote prints the Dependabot URL). No Dependabot PRs, no `.github/dependabot.yml`.
- Nothing fixed yet. The alerted versions were checked against the lockfile and the 14-day rule on 2026-11-10;
  dates are in the issue body, so re-check before bumping if a week has passed.

## Next action

Group 1 from `issue.md` (`pnpm update` inside existing ranges, express to 4.22.3 first), then group 2; group 3 needs an
issue in sodax-sdks (anchor/stellar/injective/solana bumps).

## Settled — do not re-litigate

- proxy-addr 142 (critical) is not exploitable here: `trust proxy` is `1` (hop count), the bug needs a subnet string.
- MCP SDK 137 and zod 134/135 are covered by the 100 kb body cap (#104); still bump, zod is a v4 migration.
- bigint-buffer 150 and elliptic 151 have no patched release: dismiss with a reason or leave open with a note.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Which alert, which package, which fix path, which dates | `issue.md` | 1.5k |
| Decisions while fixing | `plan.md` | 0 |
| Session notes | `process.md` (index) | 0 |
| Result | `outcome.md` | 0 |

## Landmines

- `gh api .../dependabot/alerts` paginates at 30 by default: use `--paginate` (and join the arrays) before counting.
