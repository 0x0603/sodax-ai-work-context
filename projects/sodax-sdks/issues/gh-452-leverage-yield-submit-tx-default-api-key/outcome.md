---
type: outcome
repo: sodax-sdks
github: 452
status: Implemented, uncommitted — funded run outstanding
updated: 2026-09-21
---

# Outcome

- PR: not opened yet — branch pushed, waiting on the funded run
- Branch: `feat/452-leverage-yield-submit-tx-default`, pushed to origin; worktree `sodax-sdks-452`,
  based on `origin/fix/453-bridge-api-auth-retry` (#468 @ `444c736e`)
- Commits: 4, all signed —
  `2025b299` demo · `982f03f2` apiKey + status router · `24b4d08a` the flip (breaking, droppable) ·
  `57fff8de` docs
- Tests: 2894 sdk (84 files), 809 dapp-kit (36 files), all passing; three `checkTs` clean;
  `check:ai`, `check:doc-links`, `check:docs-nav`, `check:docs-pages` clean

## Summary

Leverage yield now behaves like swaps at the consumer surface: the backend submit-tx path is the
default, a per-action API key reaches both of its legs, a vault swap's status is readable from the
source tx through `getDetailedStatus`, and dapp-kit can poll it. The one thing not done is the funded
run that would prove the leverage-yield submit-tx body completes end to end; the flip was made on the
precedent that bridge shipped the same default three days after its path existed (`brief.md`
§ Settled 3), and is isolated in its own commit so it can be dropped alone.

## What Changed

**SDK**

- `shared/config/ConfigService.ts` — `leverageYieldUseBackendSubmitTx` returns `?? true`.
- `types/leverageYield/leverageYield.ts` — the option's JSDoc.
- `leverageYield/LeverageYieldService.ts` — `LeverageYieldExtras { apiKey? }` and the 4th type
  argument on `VaultSwapActionParams`; `overrideConfig` threaded into `runBackendSubmitTx`; private
  `resolveSolverStatus` (bounded + durable-intent reconcile) that `getIntentStatus` now routes
  through; `getDetailedStatus` + `resolveHubTxHash` + `detailedStatusLookupFailed`; two timeout
  constants; the four opt-in comments rewritten.
- `leverageYield/detailedStatus.ts` (new, 22 lines) — `DetailedLeverageYieldStatus` / `…Key`.
- `leverageYield/errors.ts` — `LeverageYieldDetailedStatusErrorCode` / `…Error`.
- `leverageYield/index.ts` — the two types, deliberately not `DETAILED_STATUS_NOT_DELIVERED`.

**dapp-kit**

- `hooks/shared/solverStatusPolicy.ts` (new) — `getSolverStatusRefetchInterval`, `isSolverNotFound`,
  `toNotFoundBudgetRead`, `getSolverDetailedStatusRefetchInterval`, with structurally-declared read
  types so both features satisfy them.
- `hooks/swap/getSwapStatusRefetchInterval.ts` — now a thin swap-named face over that module.
- `hooks/leverageYield/useLeverageYieldDetailedStatus.ts` (+ test, 5 cases).
- `hooks/leverageYield/useLeverageYieldVaultSwap.ts` — docstring corrected to the backend-default flow.

**Demo**

- `lib/sodaxSettings.ts`, `components/shared/SodaxSettingsModal.tsx`, `providers.tsx`,
  `constants.ts` — a Leverage Yield SDK submit-tx row, Auto keyed on the effective solver endpoint.
- `pages/leverage-yield/page.tsx` — deleted the local checkbox that POSTed a vault swap to the
  **swaps** submit-tx route without `operation` and with no relay fallback; `handleSwap` is now one
  `vaultSwap()` call.

**Tests** — 14 new SDK cases (default + wiring, `extras.apiKey` at spy and wire level, 10
`getDetailedStatus` routing cases) and 6 dapp-kit cases.

**Docs / skills** — `CONFIGURE_SDK.md`, `LEVERAGE_YIELD.md` (new `getDetailedStatus` /
`getIntentStatus` sections), `dapp-kit/README.md`, 5 skills files, 3 mirrored docs pages.

## How it was committed

Four commits, not the five first sketched: `extras.apiKey` and `getDetailedStatus` both live in
`LeverageYieldService.ts`, and `git add -p` is unavailable here, so splitting them would have needed
hand-built patches. They went in together.

The flip **was** isolated, which was the point of splitting at all. Done by saving the four
flip-touched files, reverse-applying just the flip edits, committing the feature work, then
restoring. Both states were run green before their commit, so `24b4d08a` reverts cleanly and the
rest of the branch stands.

Two edits fell out of that exercise and are improvements in their own right:

- The `extras.apiKey` call-through tests had been relying on the new default; they now set
  `useBackendSubmitTx: true` explicitly, like `sodaxBE` does, so they keep testing the backend legs
  whatever the default is.
- `useLeverageYieldVaultSwap`'s docstring asserted which way the default points. It now describes
  both transports and tells the reader to check `config.leverageYieldUseBackendSubmitTx`.

## Follow-ups

- The funded run (gh-450 tier 3 F07/F08).
- An LY counterpart of `detailedStatus.e2e.test.ts` — fixture-blocked, same gap as gh-453 Step 5.
  Defer in-source; no tracker issue.
