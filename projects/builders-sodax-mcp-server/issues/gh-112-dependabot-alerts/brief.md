---
type: brief
repo: builders-sodax-mcp-server
github: 112
status: Active, in review — PR #114 open (2026-11-11), reviewer R0bi7
next: R0bi7 reviews PR #114 (branch chore/112-dependabot-alerts at 62d4a4d, rebased on development 144b3bc); then Dependabot dismissals for bigint-buffer/elliptic, sodax-sdks issue for stream-json, a zod strict-schema issue
updated: 2026-11-11
---

# GH-112 Dependabot alerts · brief

## State in five lines

- Issue filed 2026-11-10 (Task, Sodax board #1, Backlog, stream Builders MCP, assignee 0x0603): 91 open alerts across 24 packages
  (first filed as 30: one API page; corrected the same evening), none in this repo's code. Full grouping with fix paths in `issue.md`.
- Seen while pushing to PR #111 (the remote prints the Dependabot URL). No Dependabot PRs, no `.github/dependabot.yml`.
- 2026-11-11: committed `62d4a4d` `chore(deps): clear the open Dependabot alerts` (Refs #112), rebased on development
  144b3bc (#113, no overlap) and pushed `chore/112-dependabot-alerts`: 949 tests, tsc, lint, build green. PR #114 → development opened the same day
  (body `pr-body.md`), reviewer R0bi7.

## What the commit holds

Body draft: `pr-body.md`. In short: exact pins for the MCP SDK 1.32.2, express 4.22.3, vitest + coverage-v8 5.0.5,
vite 6.4.5 (a devDependency, vitest 5 has it as a peer only). Transitive fixes are pinned by the lockfile alone (each
patch is inside its parent's range); overrides change only where needed: follow-redirects hold removed,
`@hono/node-server@<2.1.3: 2.1.3` (exact; the old `^1.19.14` floor kept 1.x), toml 5.0.1, uuid 11.1.1. Exact
override targets were a first attempt and got reverted: on pnpm 9 an override rewrites every intersecting parent range,
so an exact target is a ceiling and a cooldown hold never lifts itself. `vitest.config.ts` has `mockReset: true`
(vitest 5's restoreAllMocks restores spies only). Dependabot 91 → 7 left: zod (decision: wait, see pr-body),
stream-json (upstream), bigint-buffer and elliptic (no patch: dismiss). Verified as listed in pr-body.md.

## Next action

After #114 merges, the 7 left: dismiss bigint-buffer and elliptic with a reason,
file a sodax-sdks issue for stream-json (anchor/stellar/injective/solana bumps), a zod strict-schema issue.

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
