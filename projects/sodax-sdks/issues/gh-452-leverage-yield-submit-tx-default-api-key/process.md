---
type: process
repo: sodax-sdks
github: 452
updated: 2026-09-22
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

### Session 2 — 2026-09-21 · implementation

Branched `feat/452-leverage-yield-submit-tx-default` off `origin/fix/453-bridge-api-auth-retry`
(#468 @ `444c736e`) into worktree `sodax-sdks-452`. Ran all seven steps except the funded run.

Two questions were settled mid-session with evidence rather than judgement:

**1. Does the repo actually gate a default flip on verification?** No. `git log -S` on
`ConfigService.ts` gives three commits, all one change: `73549b5b` (2026-08-07) → reverted same day by
`b66725de` → re-landed as `c5a2b007` / PR #362 (2026-08-09) with an added "give submit-tx and relay
separate timeouts" fix, i.e. a review catch, not a production incident. Swap's flag was born
2026-07-01 (#210), bridge's 2026-08-06 (#261) — so **bridge was defaulted ON three days after its
backend path existed**, and `runBackendSubmitTx.ts` / `submitTxAttempt.ts` were *created in the flip
commit itself*. PR #362's body argues entirely from the fallback ("On any backend non-success, the
SDK automatically falls back to the client-side relay") and contains no verification evidence.
`defaultUseBackendSubmitTx` in the demo (#402, 2026-09-03) is a demo-only staging guard, not a
walk-back. Nothing since 2026-08-09 has turned a default back off. Decision: flip, as its own commit.

**2. Does the durable-intent reconcile apply to leverage yield?** Yes — this was the one unverified
claim in `plan.md` § 5c. `LeverageYieldService.createVaultIntent` builds through
`EvmSolverService.constructCreateIntentData(..., this.config, ...)`, the same helper `SwapService`
uses, so the intent lands on `config.solver.intentsContract`. Backend side,
`GET /intent/tx/:txHash` reads `intent_journal`, which `data-transformator`'s
`intent-journal-transform.service.ts` builds from `IntentCreated` / `IntentFilled` / `IntentCancelled`
events off that contract. So the reconcile ships.

Deviations from `plan.md`:

1. **The demo's Auto default reuses swap's helper rather than getting its own.** `plan.md` § 1a left
   it open. `defaultUseBackendSubmitTx(solverApiEndpoint)` already encodes exactly the right rule
   (gh-401: the backend route is served by the production solver), and a vault swap is a solver
   intent, so its JSDoc was widened to cover both features instead of duplicating the predicate.
2. **`getSwapStatusRefetchInterval.ts` was not deleted.** The plan said move the three helpers to
   `hooks/shared/`. Done — but swap's module stays as a thin named face re-exporting them, so swap's
   import site and its 33 test cases are untouched. That is what made the move verifiable.
3. **`getIntentStatus` gained the reconcile too**, not just `getDetailedStatus`. Both public reads go
   through one private `resolveSolverStatus`; splitting them would have meant two solver reads with
   different amnesia behaviour.
4. **One extra test beyond the plan's list**: the LY hook counts a solver `NOT_FOUND` on the same
   budget as a relay miss, and a real status resets it. Bridge has no equivalent because its second
   arm has no solver vocabulary.

Gates, all green at the end of the session: `pnpm --filter @sodax/sdk checkTs`,
`--filter @sodax/dapp-kit checkTs`, demo `checkTs`, 2894 sdk tests, 809 dapp-kit tests, `check:ai`,
`docs:sync-pages` (3 mirrored pages regenerated), `check:doc-links`, `check:docs-nav`,
`check:docs-pages`. Formatted only the touched files — `main` has Biome drift.

Nothing committed. The user triggers commits.

### Session 3 — 2026-09-21 · backend readiness probe, and a correction

Asked whether the backend side was already handled. Checked both halves.

**Merged and deployed: yes.** `POST /leverage-yield/submit-tx` and `GET /leverage-yield/submit-tx/status`
arrived in `b0bba989` / PR #928 (2026-07-30) and are on `origin/development` (the default branch) and on
`origin/main`. Live probe of `api.sodax.com`: the status route answers
`{"message":"Vault swap transaction not found",...,"statusCode":404}` — the controller's own message, not
the router's `Cannot GET`, which a deliberately-bogus path returns for comparison. Swaps' equivalent
answers the same shape. Canary matches. So the route is deployed, not just merged.

**A claim from session 2 was wrong.** I had written, in four places, that a keyless caller gets a 401 on
the submit POST because the route carries `@RequireApiKey('swaps:write')`. An unkeyed
`POST /v1/leverage-yield/submit-tx` on production actually returns **400 validation errors** — the guard
did not reject. `packages/api-auth-client/src/api-key.guard.ts` explains why: it has `off` / `monitor` /
`enforce` modes and only `enforce` rejects a failed check (`:94`), and `API_KEY_ENFORCEMENT` defaults to
`'off'` (`apps/swaps-api/src/config/configuration.ts:77`), with a comment saying enforcement "has to be an
explicit act on a specific deployment, never something a deploy inherits". `POST /v1/swaps/submit-tx`
behaves identically, so this was never leverage-yield-specific.

Corrected in `CONFIGURE_SDK.md`, `LEVERAGE_YIELD.md`, the `leverage-yield-api` skill and the `vaultSwap`
comment: the scope is *declared*, enforcement is per-deployment, and where it is enforced the caller
spends one rejected attempt. Re-ran `docs:sync-pages`, `check:ai`, `check:doc-links`, `check:docs-pages`,
`checkTs` and the leverage-yield suites — all green.

This does not change the flip decision. If anything it removes the one cost the flip was going to impose
on keyless consumers today.

### Session 4 — 2026-09-22 · two bot review rounds, and the demo finally reads the router

**Round 1** (`#issuecomment-5761030903`, on `c1ffca21`) — one Low finding: `resolveSolverStatus`
calls `getIntentByTxHash(request.intent_tx_hash, { timeout })` without the per-request `apiKey`,
"contradicting the new JSDoc". The observation is true; the impact is not.

- `/be/intent/tx/:txHash` is served by `apps/api`, which has **no** API-key machinery at all — every
  `@ln()` / `RequireApiKey` in `sodax-backend` is under `apps/swaps-api`, and `apps/api/src` has no
  global guard either. Live probe: `GET https://api.sodax.com/v1/be/intent/tx/0x00…00` returns the
  app's own `{"message":"Intent not found …","statusCode":404}` with **and** without a key. So the
  401 branch the finding's impact rests on does not exist on this deployment.
- The leg was never keyless anyway: `BackendApiService` bakes the instance key into its headers
  (`:287-288`), so only a *per-request* key that differs from the instance one was dropped.
- `SwapService.ts:411` carries the identical un-keyed line on `main`, so `Scope: introduced` is
  arguable. Swap is left alone: its `getDetailedStatus(params)` takes no `RequestOverrideConfig`
  (`:456-458`), so it has no override to forward — fixing it means adding a public param.

Fixed anyway in `844535b8` (one line + JSDoc + `LEVERAGE_YIELD.md` + a test). The test was checked
for vacuousness by reverting the source line: it fails without the fix.

**Round 2** (`#issuecomment-5770866129`, on `844535b8`) — Low: `LEVERAGE_YIELD_API.md:204` still said
"opt in … (default OFF, unlike the swaps and bridge toggles)". True, and it had survived two rounds
because that page is in `docs-pages-map.json` § `unpublished` — no docs gate reads it. `44e51f47`
had updated only the mirrored pages and the skills. Fixed in `a27d9a14`, together with the dapp-kit
recipe's hook table, which still described the vault swap as create → relay → notify solver.

**The round-2 disputed Medium** — "storing completed leverage-yield operations as generic solver
orders can regress persisted history" — is not a regression. `OrderStatus.tsx:295` `isSettled` plus
the `final` snapshot means a settled order renders statically with zero requests, so a completed
vault swap never re-reads the solver. The pre-change *default* path already stored `mode: 'solver'`
orders; the opt-in ON path it replaced was the broken POST to `/swaps/submit-tx`. Only a
non-terminal order during a solver restart shows `NOT_FOUND`, exactly as before.

**But it surfaced a real gap.** Neither detailed-status API had a consumer in the demo: no
`useDetailedStatus` (shipped by #468) and no `useLeverageYieldDetailedStatus` anywhere in
`apps/demo/src`; solver cards ran the local `hooks/useSolverStatus.ts` `fetch`. `d3b106d3` wires the
leverage-yield page onto the router via an `OrderStatus` `feature` prop, reusing the submit-tx
derivation for the backend arm (it now takes the record, not the response envelope). An order whose
`statusEndpoint` is not the current env keeps the old poll — that field exists precisely because the
router only knows the env the SDK is currently on.

Left deliberately: `/swaps-sdk` on its own poll (pulling swap into this diff), and no `extras.apiKey`
field in the demo (`grep 'extras:' apps/demo/src` is empty; the instance key covers it).

CI on `844535b8`: 20/20 green, including Build and Test, Docs site and AI files drift.

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

Listed as deviations under Session 2 above. Nothing outside `sodax-sdks`; `sodax-backend` was read
only, never edited.
