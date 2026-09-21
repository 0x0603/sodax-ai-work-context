---
type: issue
repo: sodax-sdks
github: 452
status: Active
tags: [leverage-yield, leverage-yield-api, submit-tx, detailed-status, api-key, dapp-kit, demo, docs, skills]
updated: 2026-09-21
related_decisions: []
---

# GH-452 Leverage Yield Submit Tx Default Api Key

- Source: https://github.com/icon-project/sodax-sdks/issues/452
- Opened: 2026-09-14 by `R0bi7`, assigned to `0x0603`
- No parent issue, no sub-issues (`gh api repos/icon-project/sodax-sdks/issues/452/sub_issues` → `[]`,
  `sub_issues_summary` → `{total: 0}`)
- Filed 8 minutes before #453; same author, same assignee, deliberately the same shape of work
- Started: 2026-09-21
- Related PR: none yet

## Problem

Leverage yield already has the backend submit-tx orchestrator — `vaultSwap` → `submitTx` →
`fallbackVaultSwapSteps` is a copy of swap's. Four things still differ from swaps, and all four are
what a consumer actually touches:

1. **The default is off.** `ConfigService.leverageYieldUseBackendSubmitTx` returns
   `?? false` where swap and bridge return `?? true`.
2. **No per-action API key.** `VaultSwapActionParams` has no `extras` slot, so `submitTx` cannot
   pass `overrideConfig: { apiKey }` into `runBackendSubmitTx` the way swap and bridge do.
3. **No status router.** A caller holding only the source-chain tx hash cannot tell a vault swap the
   client-side fallback completed from one whose backend record is stuck. Swap has
   `getDetailedStatus`; bridge is getting one in #468; leverage yield has neither.
4. **No poll hook.** dapp-kit has `useDetailedStatus` (swap) and `useBridgeDetailedStatus` (#468),
   nothing for leverage yield.

## Context

The issue body carries an "AI suggestions (do not take for granted)" block. It is reproduced
verbatim below because it is the issue's own text, but **two of its items are already stale** — see
`plan.md` § Approach and `brief.md` § Landmines. It was written before #453 / PR #468 existed.

### Issue body (verbatim)

> Main goal is to enable same/similar submit tx flow feel like in swaps api, meaning submit tx true
> by default and being able to propagate api key, get detailed status, etc..
>
> ## AI suggestions (do not take for granted)
>
> The orchestrator is already a copy of swaps (`vaultSwap` → `submitTx` → `fallbackVaultSwapSteps`).
> What is still different is **default**, **per-action API key**, **status routing**, and **consumer
> surface**. To make the submit flow the same:
>
> **Default: backend path on, client-side is opt-out**
>
> - Flip `ConfigService.leverageYieldUseBackendSubmitTx` from `?? false` to `?? true` (same as
>   `swapUseBackendSubmitTx`).
> - Update `LeverageYieldOptions.useBackendSubmitTx` JSDoc: omitted means on, not off.
> - Flip comments on `LeverageYieldService.useBackendSubmitTx`, `vaultSwap()`, and `submitTx()` from
>   "opt-in" to "default on / opt-out with `false`".
> - Invert unit tests that pin the current default:
>   - `LeverageYieldService.test.ts` — module-level `new Sodax()` must pass
>     `leverageYield: { useBackendSubmitTx: false }` (same pattern as `SwapService.test.ts`).
>   - The test currently titled "flag is off (the default)" must assert the default is **on**.
>   - Any Sodax-wiring tests (e.g. `BridgeService.test.ts`) that should pin LY independently of
>     swap/bridge.
> - Confirm backend `/leverage-yield/submit-tx` is production-ready before flipping — the off default
>   exists because that path is still bedding in.
>
> **Per-action API key (swap `extras.apiKey`)**
>
> - Add an `extras` (or equivalent) slot on `VaultSwapActionParams` with `apiKey?: string`.
> - Pass it through `submitTx` as `overrideConfig: { apiKey: _params.extras?.apiKey }` into
>   `runBackendSubmitTx` (swap already does this).
> - Cover it with an api-key-on-wire test (swap has `useSwap.test.ts` + `SwapService` keyed tests; LY
>   only has instance-level `apiKey` today).
>
> **Status from the source tx (swap `getDetailedStatus`)**
>
> - Add `LeverageYieldService.getDetailedStatus({ srcChainKey, srcTxHash })` that routes:
>   - live `sodax.api.leverageYield.getSubmitTxStatus` record while it is in play
>   - otherwise relay → hub hash → solver, same abandoned/404/outage rules as swaps
>     (`DETAILED_STATUS_NOT_DELIVERED`, `isBackendSubmitTxAbandoned`)
> - Optionally add `getStatus` with the durable-record reconcile swap uses when the solver answers
>   `NOT_FOUND`.
> - Mirror the swap unit tests and, if you want E2E parity, a LY counterpart of
>   `detailedStatus.e2e.test.ts`.
>
> **dapp-kit**
>
> - Add `useLeverageYieldDetailedStatus` (or generalize `useDetailedStatus` to take a feature) with
>   the same 3s poll / not-found budget as `useDetailedStatus`.
> - Fix `useLeverageYieldVaultSwap` docs: they still describe only "create → verify → relay →
>   notify", which is the **client-side** path. After the default flip they should match `useSwap`
>   (backend 2-step + fallback).
>
> **Demo**
>
> - Add a Leverage Yield submit-tx toggle to Sodax Settings (`sodaxSettings` + `providers.tsx`), same
>   as Swap SDK / Bridge SDK. Demo currently never sets `leverageYield.useBackendSubmitTx`.
>
> **Docs / skills (required after the default flip)**
>
> - `packages/sdk/docs/LEVERAGE_YIELD.md` — backend 2-step is the default; `useBackendSubmitTx: false`
>   is the opt-out.
> - `packages/sdk/docs/CONFIGURE_SDK.md` — LY table row currently says default **OFF**.
> - `packages/skills` leverage-yield + leverage-yield-api knowledge (and dapp-kit leverage-yield if
>   hooks change).
> - Run `pnpm check:ai` and `pnpm docs:sync-pages` so published docs match.
>
> **Keep LY-specific (do not flatten to swaps)**
>
> - Keep `operation: 'deposit' | 'withdraw'` on the submit-tx body — swaps has no equivalent.
> - Keep vault flows on `sodax.leverageYield.vaultSwap`, not `sodax.swaps.swap`.
> - Do not copy swap-only surface (limit orders, `cancelIntent`, Bitcoin `bound` extras,
>   `getSwapSpeedTier`).
>
> **Already in place — no rewrite needed**
>
> - `runBackendSubmitTx` + `createSubmitTxAttempt` + per-attempt `timeout` + `RELAY_FALLBACK_FLOOR_MS`.
> - Fallback on any backend non-success, with idempotent re-relay / re-post.
> - `terminalStatus: 'solved'` and `VaultSwapResponse` reconstructed like `SwapResponse`.
> - Backend HTTP client (`sodax.api.leverageYield.submitTx` / `getSubmitTxStatus`) and
>   `useLeverageYieldApiSubmitTx*` hooks.
> - Unit coverage of the backend path when the flag is on.
>
> The one-line product change is: **default `leverageYield.useBackendSubmitTx` to `true`**, then add
> the swap-parity status + `extras.apiKey` surfaces so consumers can poll and key the same way.

## Acceptance Criteria

Derived from the body; the issue states no explicit checklist.

1. `new Sodax()` resolves `config.leverageYieldUseBackendSubmitTx === true`;
   `new Sodax({ leverageYield: { useBackendSubmitTx: false } })` keeps the client-side relay and
   never touches the backend submit API.
2. A per-action key on a vault swap reaches both `POST /leverage-yield/submit-tx` and
   `GET /leverage-yield/submit-tx/status`, beating the instance key.
3. `sodax.leverageYield.getDetailedStatus({ srcChainKey, srcTxHash })` answers from the backend
   record while it is in play and from the solver otherwise, with the same abandoned / 404 / outage
   classification as swap, including `DETAILED_STATUS_NOT_DELIVERED` on the budgetable relay miss.
4. `useLeverageYieldDetailedStatus` polls it on the same 3s / 40-ambiguous-read budget.
5. Demo can switch the leverage-yield submit-tx path from Sodax Settings, like Swap SDK and Bridge SDK.
6. Published docs and skills say the default is ON, with `false` as the opt-out.
7. Position flows (`openPosition` / `operatePosition` / `openLeveragePosition`) are untouched.

## Related

- Knowledge:
- Decisions:
- Issues: gh-453 (the same work for bridge; **PR #468 is a hard dependency**), gh-450 (the funded
  manual test that gates the default flip)
