---
type: brief
repo: sodax-sdks
github: 520
status: Active
next: Watch CI and review on PR #523
updated: 2026-10-15
---

# GH-520 useDetailedStatus never stops polling a cancelled intent · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- PR icon-project/sodax-sdks#523 open (2026-10-15): signed `7973e67f` (fix) + `c03aa17e`
  (helper moved into `detailedStatusRouting.ts`) on `fix/520-cancelled-intent-status`
  (worktree `sodax-sdks-520`). CI was green on `7973e67f`.
- Root cause confirmed on `origin/main` `77281f0c`: gave-up record → solver; solver `1`/`2` passes
  through; dapp-kit polls `1`/`2` with no cap. Leverage-yield has the same bug.
- Live: solver now says `-1` for the issue's intent (40 polls per mount, not infinite). The intent
  journal has an explicit `intent-cancelled` event.
- Fix: in `getDetailedStatus` only, reconcile every non-final solver answer against the intent
  journal; cancelled with no fill → solver `FAILED (4)`.

## Settled — do not re-litigate

- Signal is the backend intent journal (`getIntentByTxHash`), **not** hub `intentStates`: the hub
  deletes the mapping on full fill too, so it can't separate cancelled from filled (verified live).
- Not the submit-tx record's `intentCancelled` flag (backend drops it once `abandonedAt` is set).
- Answer is solver arm `FAILED`, not the backend failed record, not a new enum member or field.
- No gate on the record state (audit dropped it, see `process.md` § Audit).
- Public `getStatus` / `useStatus` and leverage `getIntentStatus` unchanged.
- Cancel after a partial fill: left as today.
- Leverage-yield in scope: a keeper cancels expired intents on the shared hub contract.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Problem, acceptance criteria | `issue.md` | 0.5k |
| Root cause, decisions, steps, tests, out of scope | `plan.md` | 2.8k |
| Live reads, audit, implementation log | `process.md` | 1.6k |
| Result | `outcome.md` | - |

## Landmines

- Local `sodax-sdks` checkout sits on `feat/tron-spoke` (#372). Read `origin/main`, work in a
  separate worktree.
- Solver state for the issue's intent changed between filing and planning (`2` → `-1`); the solver-`2`
  path is proven by unit tests only.
- Docs pages under `docs/developers/` are generated; edit `packages/sdk/docs/*.md` and run
  `pnpm docs:sync-pages`.
