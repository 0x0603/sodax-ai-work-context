---
type: brief
repo: sodax-backend
github: 1090
status: Active
next: undraft PR #1097 once CI is green
updated: 2026-09-04
---

# GH-1090 bridge-api Bound auth + USDT approve · brief

## State in five lines

- PR [#1097](https://github.com/icon-project/sodax-backend/pull/1097) is **draft**, base
  `development`, `MERGEABLE`, 26 files, +1162/−31. CI running at time of writing.
- Both halves of #1090 are implemented: RadFi/Bound HMAC auth (with #1069's degrade model) and
  `resetTx` from `POST /bridge/approve`.
- Local verification is green: bridge-api 172 unit + 130 e2e, `checkTs` 20/20, `pnpm test` 35/35.
- The branch reached `development` by **two merges**, never a rebase — see Landmines.
- Bound has **not** been exercised end to end on this branch with a real credential; the successful
  bitcoin bridge (`4cd19135…`) predates the degrade-model rewrite.

## Blocked on

1. CI green → then undraft. Nothing else.

## Next action

Undraft #1097. Its description is already rewritten and correct; nothing to edit first.

## Settled — do not re-litigate

- **Merge, never rebase** on this branch (user's call). No force-push.
- **bridge-api follows swaps-api** (user's call), so the branch adopts #1069's degrade model rather
  than the fail-fast it was originally written with.
- **No shared RadFi package in this PR** — it would edit production `apps/swaps-api`, outside #1090.
- The `packages/incident-manager` index-race fix rides along deliberately (user approved); it blocks
  the pre-commit gate for every unrelated change.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Why the design changed mid-flight; what shipped | `plan.md` | 0.8k |
| The squash-merge trap, the audit, what was nearly missed | `process.md` | 1.3k |
| — (open) | `outcome.md` | — |

## Landmines

- **#975 was SQUASH-merged**, so `development` has bridge-api's content but not its history.
  `git merge origin/development` into this branch gives **155** conflicts; going through a branch
  built from `origin/feat/bridge-api` gives **6**. Method in `process.md`.
- PR #1097's Commits tab lists ~74 commits for the same reason. Files changed is the real diff.
- `apps/bridge-api/.env` on this machine carries the Bound pair. It no longer breaks
  `radfi-config.spec` (the spec stopped asserting a throw), but it did before.
- `@repo/incident-manager`'s `unique_active_per_target` test failed 14 consecutive local runs before
  the fix in this branch. If it reappears elsewhere, the cause is an un-awaited index build.
