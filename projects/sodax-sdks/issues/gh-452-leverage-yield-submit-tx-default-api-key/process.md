---
type: process
repo: sodax-sdks
github: 452
updated: 2026-09-21
---

# Process

## Log

### Session 1 — 2026-09-21 · plan review against local source

Started from a plan drafted by another agent (reproduced in spirit by the issue body's "AI
suggestions" block, which that plan followed closely). Task was to check it against the real tree
rather than accept it. Every claim below was verified by reading the source at `origin/main` @
`898b7e6a`; nothing here is taken from a doc or another agent's report.

Claims in the draft plan that **checked out**:

- `ConfigService` LY default is `?? false` — at `:513`, not `:512`.
- `LeverageYieldOptions.useBackendSubmitTx` JSDoc calls it opt-in — `leverageYield.ts:239-243`.
- `LeverageYieldService.test.ts:115` is a bare module-level `new Sodax()`.
- The "flag is off (the default)" test exists — `:1518`, asserting both defaults at `:1540-1541`.
- `VaultSwapActionParams` has no `extras` slot — `LeverageYieldService.ts:580-584`, and
  `SpokeExecActionParams`'s `E` defaults to `never` (`common.ts:446-450`).
- `submitTx` does **not** pass `overrideConfig`; swap and bridge do (`SwapService.ts:890`,
  `BridgeService.ts:644`), and `runBackendSubmitTx` threads it to both legs (`:81`, `:94`).
- The demo never sets `leverageYield.useBackendSubmitTx` (`providers.tsx:150-151` sets only swaps and
  bridge).
- The LY demo page's own checkbox posts to the **swaps** route — `useSwapsApiSubmitTx()` at
  `pages/leverage-yield/page.tsx:255`, called at `:474`, with a body that omits `operation`
  (`:467-473`).
- `useLeverageYieldVaultSwap`'s docstring describes only the client-side path (`:19-30`).
- Docs say default OFF in three places in `CONFIGURE_SDK.md` (`:19`, `:45`, `:246-255`) and two in
  `LEVERAGE_YIELD.md` (`:207`, `:217`), plus two skills files.

Claims that **did not** check out — see `plan.md` § Approach:

1. The draft had LY re-deriving the relay leg into a new `leverageYield/detailedStatus.ts`, and
   "generalizing `getSwapStatusRefetchInterval.ts`". Both are already done by PR #468 (gh-453), which
   is open against `main`. Found it by noticing the sibling issue folder
   `gh-453-bridge-detailed-status-auth-retry`, then reading its `brief.md` — which states outright
   that #452 is the anticipated third consumer.
2. The draft's gate ("confirm the backend is production-ready") is much smaller than it reads. See
   Findings.
3. The draft proposed a new `LeverageYieldDetailedStatusError` "to avoid collision with swap's
   `DetailedStatusError`". The prefix is right, the reason is not: both are
   `SodaxError<Extract<SodaxErrorCode,'LOOKUP_FAILED'>>`, so there is no type collision — the real
   constraint is the flat `export *` root barrel, which is what forced bridge to prefix.
4. The draft proposed adding `getStatus` alongside the existing `getIntentStatus`.

## Findings

### The backend does not own a leverage-yield pipeline

`sodax-backend/apps/swaps-api/src/api/leverage-yield/leverage-yield.service.ts:365-379` strips the
wire `operation` and calls `this.swapsService.submitTx(swapDto, operation)` with the row-level
`leverage_deposit` / `leverage_withdraw`. The controller comment (`leverage-yield.controller.ts:71-80`)
says it explicitly: same `stateful_submit_swap_tx_v2` pipeline, "a vault swap tx IS a swap tx", and
the API-key scopes mirror `SwapsController` because of it.

A repo-wide grep for `leverage_deposit|leverage_withdraw` (excluding `node_modules` and `dist`) hits
only the DTO, the mapper, `SubmitTxOperationValues` (`api/swaps/types/submit-swap-tx.ts:75`) and
tests. No worker branches on it — it is a `$setOnInsert` tag
(`test/unit/submit-tx-db.service.spec.ts:76-80` shows the shape).

So the drain to `solved` is the same code path swaps runs with default ON in production. What is
unproven is the LY *body* end to end, which is gh-450 tier 3 — still not started, and blocked on the
demo edit that is this plan's Step 1.

### Auth asymmetry: LY is swap-shaped, not bridge-shaped

`GET /leverage-yield/submit-tx/status` (`leverage-yield.controller.ts:558`) has no `@RequireApiKey`.
Bridge's does (`bridge:read`), which is the whole reason gh-453 needed a 401/403-terminal arm and a
`context.status` lift. LY needs neither.

`POST /leverage-yield/submit-tx` is gated `swaps:write` (`:532-533`), exactly like swaps'
(`swaps.controller.ts:579-580`). Consequence of the flip for a keyless consumer: POST → 401 → warn
(`LeverageYieldService.ts:1380-1383`) → client-side fallback, every vault swap.

### LY's status arms are structurally swap's

`LeverageYieldApiService.getSubmitTxStatus(query, config?)` returns `SubmitTxStatusResponseV2`
(`:773-776`) — the same envelope swaps' read returns, and it already accepts a
`RequestOverrideConfig`. `submitTx` passes `terminalStatus: 'solved'` (`:1374-1376`), so a vault swap
resolves through the solver. Hence `backend | solver`, not bridge's terminal `relay` arm, and hence
dapp-kit's `toNotFoundBudgetRead` / `getDetailedStatusRefetchInterval` / `isSolverNotFound` apply to
LY unchanged.

### What #468 already shipped

Read at worktree `sodax-sdks-453` @ `444c736e`:

- `packages/sdk/src/backendApi/detailedStatusRouting.ts` — `resolveDeliveredPacket()`,
  `DETAILED_STATUS_NOT_DELIVERED` (moved out of `swap/detailedStatus.ts`), `isBackendSubmitTxAbandoned`
  widened to `BackendSubmitTxStatusEnvelope<unknown>`. Its own header comment says it is deliberately
  **not** exported from `backendApi/index.ts`.
- `SwapService.resolveHubTxHash` migrated onto it, ~45 lines deleted.
- `packages/dapp-kit/src/hooks/shared/notFoundStreak.ts` — the budget, now predicate-driven.
- `hooks/bridge/useBridgeDetailedStatus.ts` + `hooks/bridge/getBridgeDetailedStatusRefetchInterval.ts`
  — bridge kept its own refetch policy beside its hook because its arms differ. LY's do not, which is
  why Step 6 moves the swap helpers to `hooks/shared/` instead of copying them a third time.
- `bridge/detailedStatus.ts` is 25 lines — the size the LY equivalent should be.

### Ordering defect in the draft plan

The draft gated everything on a funded backend verification (its step 1) but put the demo toggle at
step 8. gh-450's `brief.md` § Blocked on #2 names the missing `providers.tsx` edit as the reason tier
3 cannot run, and flags the overlap with #452. So the gate blocked on a step scheduled after it.
Reordered: demo → funded run → flip.

## Changes During Work

Nothing implemented yet. No branch, no worktree.
