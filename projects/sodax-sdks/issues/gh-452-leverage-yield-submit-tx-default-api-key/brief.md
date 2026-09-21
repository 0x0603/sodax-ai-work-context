---
type: brief
repo: sodax-sdks
github: 452
status: Planned
next: Decide the base branch (§ Blocked on 1) — then Step 1 of `plan.md`, the demo settings toggle, because gh-450's funded run is blocked on it
updated: 2026-09-21
tags: [leverage-yield, leverage-yield-api, submit-tx, detailed-status, api-key, dapp-kit, demo, docs, skills]
related_issues: [gh-453, gh-450]
---

# GH-452 Leverage Yield Submit Tx Default Api Key · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Make LY's submit-tx flow feel like swaps': **default ON**, **per-action `extras.apiKey`**,
**`getDetailedStatus`**, **`useLeverageYieldDetailedStatus`**. Nothing is implemented; no branch
exists. The plan is written and reviewed against source at `origin/main` @ `898b7e6a`. Scope is
**`sodax-sdks` only** — the backend already has everything, because LY's `submit-tx` delegates to
swaps' pipeline verbatim. Two hard external dependencies: **PR #468** (gh-453) supplies the shared
routing module this plan builds on, and **gh-450 tier 3** is the funded run that justifies the flip.

| Item | State |
| ---- | ----- |
| Plan reviewed against source | done — `plan.md`, `process.md` |
| Step 0: branch off #468 | **blocked on a decision** |
| Step 1: demo settings toggle + kill the wrong local checkbox | not started |
| Step 2: funded run (gh-450 tier 3 F07/F08) — the gate | not started |
| Step 3: flip the default + tests | not started, gated by Step 2 |
| Step 4: `extras.apiKey` | not started |
| Step 5: `LeverageYieldService.getDetailedStatus` | not started, needs #468 |
| Step 6: `useLeverageYieldDetailedStatus` + move the policy helpers to `hooks/shared/` | not started, needs #468 |
| Step 7: docs + skills | not started |

## Blocked on

1. **Base branch decision.** Off `origin/fix/453-bridge-api-auth-retry` (#468, open, not merged), or
   wait for it to merge into `main`? Off `main` this work conflicts in `swap/detailedStatus.ts`,
   `SwapService.ts` and `getSwapStatusRefetchInterval.ts`, and duplicates a module about to land.
   Recommendation in `plan.md` § Approach: branch off #468, merge `main` in after it lands.
2. **The funded run.** Step 3 only. gh-450 tier 3 has not started and its own blocker #2 is this
   plan's Step 1, so Step 1 unblocks it. Everything except Step 3 can ship without it.
3. **One unverified claim**, `plan.md` § 5c: does a leverage-yield vault intent appear in
   `backendApi.getIntentByTxHash`? If not, ship `getDetailedStatus` without swap's
   durable-intent reconcile.

## Next action

Answer Blocked-on 1, then Step 1 of `plan.md` — `sodaxSettings.ts` + `SodaxSettingsModal.tsx` +
`providers.tsx`, and delete the local checkbox at `apps/demo/src/pages/leverage-yield/page.tsx:267`
that posts a vault swap to the *swaps* submit-tx route. The demo default must mirror
`defaultUseBackendSubmitTx(solverApiEndpoint)`, not a hardcoded `?? true`.

## Settled — do not re-litigate

1. **No `sodax-backend` work.** `leverage-yield.service.ts:365-379` calls
   `swapsService.submitTx(swapDto, operation)`; `operation` is a `$setOnInsert` row tag with no worker
   branching on it. Same `stateful_submit_swap_tx_v2` pipeline swaps runs with default ON in
   production. Evidence in `process.md` § Findings.
2. **#468 is a dependency, not a parallel effort.** It already shipped `resolveDeliveredPacket`, moved
   `DETAILED_STATUS_NOT_DELIVERED` + `isBackendSubmitTxAbandoned` into
   `backendApi/detailedStatusRouting.ts`, migrated swap onto it, and extracted the poll budget into
   `hooks/shared/notFoundStreak.ts`. gh-453's brief names #452 as the anticipated third consumer.
3. **No 401/403-terminal arm.** `GET /leverage-yield/submit-tx/status` is ungated
   (`leverage-yield.controller.ts:558`), unlike bridge's. LY is swap-shaped here.
4. **LY's arms are `backend | solver`**, not bridge's terminal `relay` — a vault swap IS a solver
   intent (`terminalStatus: 'solved'`). So the swap refetch policy applies unchanged.
5. **No new `getStatus`.** Extend the existing `getIntentStatus` (`LeverageYieldService.ts:1475`) via
   a shared private `resolveSolverStatus`.
6. **Position flows are out of scope** — they never touch submit-tx; the body admits only
   `deposit|withdraw`.
7. **`partnerFee` / `hubWalletSwap` stay intersected at the alias site**, not moved into `extras`.
8. **No follow-up issue for the deferred LY e2e pin** — defer in-source, same fixture gap as gh-453
   Step 5.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What do I build, in what order, with which citations and snippets? | `plan.md` | 6.2k |
| The issue body verbatim + acceptance criteria | `issue.md` | 2.1k |
| What was verified vs. what the draft plan got wrong, and why | `process.md` | 1.7k |
| What shipped | `outcome.md` | — |

## Landmines

- **The issue body's "AI suggestions" block is stale in two places.** It predates #468: it tells you
  to re-derive the relay leg and to generalise `getSwapStatusRefetchInterval.ts`. Both are done.
- **Line numbers here and in `plan.md` were stamped at `origin/main` @ `898b7e6a` (2026-09-21)** and
  at `origin/fix/453-bridge-api-auth-retry` @ `444c736e`. The #468 branch's own base was `b5aaca0e`,
  so its citations predate two `main` commits. Re-stamp before trusting one.
- **Never re-export `DETAILED_STATUS_NOT_DELIVERED` from `leverageYield/index.ts`** — swap's barrel
  already publishes it and the root barrel is a flat `export *`. Same for exporting anything from
  `backendApi/index.ts`, which is a curated barrel.
- **`LeverageYieldLookupError` is not a substitute** for a prefixed detailed-status alias: it admits
  `VALIDATION_FAILED` / `UNKNOWN` too. And there is no *type* collision with swap's
  `DetailedStatusError` — both are `SodaxError<Extract<SodaxErrorCode,'LOOKUP_FAILED'>>`. The barrel
  is the constraint, not the type.
- **`LeverageYieldService.test.ts:115`'s bare `new Sodax()` is load-bearing** for every client-side
  assertion in a 139 KB file. Flipping the default without pinning it there fails a lot of tests for
  the wrong reason.
- **Step 6 moves code out from under swap's dapp-kit tests.** Run `src/hooks/swap` before committing;
  the cases should pass unedited, and if they do not the move is wrong.
- **`main` has Biome drift** — format only the files you touched, never a blanket `pnpm pretty`.
- **Fresh worktree needs `pnpm i && pnpm build:packages`** before the first commit, or the pre-commit
  hook fails on unrelated packages. `TURBO_CONCURRENCY=2`.
