---
type: brief
repo: sodax-backend
github: 1090
status: Merged
next: open a follow-up PR for the uncommitted winston `message` fix, then exercise Bound end to end with a real credential
updated: 2026-09-09
---

# GH-1090 bridge-api Bound auth + USDT approve · brief

## State in five lines

- PR [#1097](https://github.com/icon-project/sodax-backend/pull/1097) **merged into
  `development`** 2026-09-09 12:21 UTC, merge commit `9d3d8b06`. Approved by R0bi7, zero inline
  comments. #1090 auto-closed.
- Both halves shipped: RadFi/Bound HMAC auth (on #1069's degrade model) and `resetTx` from
  `POST /bridge/approve`.
- **Not done:** a +9/−1 fix sits **uncommitted** in the local checkout on the now-merged branch
  (`apps/bridge-api/src/api/bridge/bridge.service.ts`). See Next action.
- Bound has **never** been exercised end to end with a real credential on this code. The
  successful bitcoin bridge (`4cd19135…`) predates the degrade-model rewrite. A quiet review
  did not change this.
- The branch reached `development` by **two merges**, never a rebase — see Landmines.

## Next action

1. **Rescue the uncommitted fix.** The local `sodax-backend` checkout is on
   `feat/bridge-api-bound-auth-usdt-approve` with `bridge.service.ts` modified: the 504 warn log
   omits `message`, so winston nests an object with no truthy `.message` under `message` and the
   format renders the header as literal `undefined` — observed on the first live 504. That
   branch's PR is closed, so this needs a **new branch off `development`** and its own PR.
2. Then: exercise Bound end to end with a real credential (the standing headline risk).

## Blocked on

Nothing. #1097 is merged.

## Settled — do not re-litigate

- **Merge, never rebase** on this branch (user's call). No force-push.
- **bridge-api follows swaps-api** (user's call), so the branch adopts #1069's degrade model
  rather than the fail-fast it was originally written with.
- **No shared RadFi package in this PR** — it would edit production `apps/swaps-api`, outside
  #1090. Still true, but see `outcome.md` §Follow-ups: gh-425 is about to edit both apps anyway.
- The `packages/incident-manager` index-race fix rode along deliberately (user approved).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What shipped, what is still unverified, what to do next | `outcome.md` | 1.1k |
| Why the design changed mid-flight | `plan.md` | 0.8k |
| The squash-merge trap, the audit, what was nearly missed | `process.md` | 1.3k |

## Landmines

- **#975 was SQUASH-merged**, so `development` has bridge-api's content but not its history.
  Merging `origin/development` into the PR branch gives **155** conflicts; going through a
  branch built from `origin/feat/bridge-api` gives **6**. Method in `process.md`. This still
  bites any future branch cut from the old bridge-api lineage — cut from `development` instead.
- PR #1097's Commits tab lists ~70 commits for the same reason. Files changed is the real diff.
- `apps/bridge-api/.env` on this machine carries the Bound pair.
- `@repo/incident-manager`'s `unique_active_per_target` test failed 14 consecutive local runs
  before the fix in this branch. If it reappears elsewhere, the cause is an un-awaited index
  build.
