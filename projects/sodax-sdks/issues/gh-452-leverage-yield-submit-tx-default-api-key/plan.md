---
type: plan
repo: sodax-sdks
github: 452
updated: 2026-09-21
---

# Plan

**All line numbers in this file were stamped at `origin/main` @ `898b7e6a` (2026-09-21) and at
`origin/fix/453-bridge-api-auth-retry` @ `444c736e` (PR #468, open, not merged). Re-stamp before
trusting any citation.** The #468 tree is checked out at worktree `sodax-sdks-453`.

## Goal

Make the leverage-yield submit-tx flow feel like swaps': backend path on by default, a per-action
API key, a status read keyed on the source tx, and a dapp-kit poll hook for it — without flattening
vault flows onto the swap surface.

Scope is **`sodax-sdks` only**. No `sodax-backend` work: the endpoints, the scopes, the 404 shape and
the `abandonedAt` semantics already exist, and `submit-tx` reuses swaps' pipeline verbatim (§ Fact 2).

## Approach

### Fact 1 — this is the third copy of the same work, and the second one already extracted the shared piece

PR #468 (gh-453) is open against `main` and is a **hard dependency**. It already built what the issue
body tells us to build from scratch:

| Shipped in #468 | Where |
| --- | --- |
| `resolveDeliveredPacket()` — the whole relay delivered-packet leg, with the 404 → budgetable rule, the envelope guard and the `(src_tx_hash, src_chain_id)` match | `packages/sdk/src/backendApi/detailedStatusRouting.ts` |
| `DETAILED_STATUS_NOT_DELIVERED` **moved** there out of `swap/detailedStatus.ts` | same file |
| `isBackendSubmitTxAbandoned` moved there and **widened** to `BackendSubmitTxStatusEnvelope<unknown>` | same file |
| Swap migrated onto that leg — `SwapService.resolveHubTxHash` lost ~45 lines | `packages/sdk/src/swap/SwapService.ts` |
| The consecutive-ambiguous-read budget, feature-agnostic (takes a boolean predicate) | `packages/dapp-kit/src/hooks/shared/notFoundStreak.ts` |
| `getSwapStatusRefetchInterval.ts` reduced to the solver-specific parts, re-exporting the rest | `packages/dapp-kit/src/hooks/swap/getSwapStatusRefetchInterval.ts` |
| `BridgeDetailedStatusError` / `DetailedBridgeStatus` / `useBridgeDetailedStatus` as the per-feature pattern to copy | `bridge/errors.ts`, `bridge/detailedStatus.ts`, `hooks/bridge/` |

So two items in the issue body are **stale**:

- "otherwise relay → hub hash → solver, same abandoned/404/outage rules as swaps" — do not re-derive
  the relay leg. Call `resolveDeliveredPacket`.
- "generalize `useDetailedStatus` to take a feature" / generalise the refetch helper — #468 already
  split the generalisable half into `hooks/shared/notFoundStreak.ts`.

**Base decision:** branch off `origin/fix/453-bridge-api-auth-retry`, not `main`. Off `main` this work
conflicts with #468 in `swap/detailedStatus.ts`, `SwapService.ts` and
`getSwapStatusRefetchInterval.ts`, and would duplicate a module that is about to land. Merge `main`
into the branch once #468 is merged (merge, never rebase).

### Fact 2 — the backend gate is much smaller than the issue body implies

`LeverageYieldController.submitTx` does not own a pipeline. It delegates:

- `sodax-backend/apps/swaps-api/src/api/leverage-yield/leverage-yield.service.ts:365-379` —
  `return this.swapsService.submitTx(swapDto, operation)`, where `operation` is the wire
  `deposit|withdraw` mapped to the row-level `leverage_deposit` / `leverage_withdraw`.
- The controller's own comment (`leverage-yield.controller.ts:71-80`) states it: the routes reuse the
  swaps wire types and, for `submit-tx`, the **same `stateful_submit_swap_tx_v2` pipeline** — "a vault
  swap tx IS a swap tx".
- A grep for `leverage_deposit|leverage_withdraw` across `sodax-backend` finds it only in the DTO, the
  mapper, `SubmitTxOperationValues` (`api/swaps/types/submit-swap-tx.ts:75`) and tests. **No worker
  filters on it** — it is a tag set via `$setOnInsert`.

So "is the backend production-ready" is not a question about a new pipeline: it is the same drain the
swaps default-ON path runs in production. What is genuinely unproven is the **LY body** —
`intent` + `relayData` + the `hubWalletSwap` withdraw variant — actually completing end to end. That
needs one funded run, which is gh-450 tier 3, still not started.

And gh-450's own blocker #2 *is* this plan's demo step: without `leverageYield: { useBackendSubmitTx:
true }` reaching the demo, the path is unreachable from the UI. **So the demo step comes first**, not
last. The issue body's ordering (demo second-to-last) makes the gate block on itself.

### Fact 3 — leverage yield's two arms are swap's, not bridge's

A vault deposit/withdraw **is** a solver intent (`submitTx` passes `terminalStatus: 'solved'`,
`LeverageYieldService.ts:1374-1376`). So the arms are `backend | solver`, exactly swap's — not
bridge's terminal `relay` arm. Consequences:

- The union is structurally identical to `DetailedSwapStatus`: LY's `getSubmitTxStatus` returns the
  same `SubmitTxStatusResponseV2` as swaps' (`LeverageYieldApiService.ts:773-776`).
- Therefore dapp-kit's `toNotFoundBudgetRead` / `getDetailedStatusRefetchInterval` /
  `isSolverNotFound` work for LY unchanged — see Step 6 for where they should live.
- The hub-source skip applies (a hub-sourced vault swap has no relay leg), and LY already uses
  `isHubChainKeyType` for exactly that in `fallbackVaultSwapSteps` (`LeverageYieldService.ts:1283`).

### Fact 4 — the auth trap that bit bridge does not apply here

`GET /leverage-yield/submit-tx/status` (`leverage-yield.controller.ts:558`) carries **no**
`@RequireApiKey`, same as swaps' and unlike bridge's `bridge:read`. So LY needs no 401/403-terminal
arm and no `context.status` lift. Keep the `config?: RequestOverrideConfig` second parameter anyway
for parity — `LeverageYieldApiService.getSubmitTxStatus` already accepts one.

But `POST /leverage-yield/submit-tx` **is** gated (`swaps:write`, `:532-533`). After the flip, a
keyless consumer POSTs, gets 401, logs the warn at `LeverageYieldService.ts:1380-1383` and falls back
to the client-side relay on every vault swap. Swaps has the identical shape
(`swaps.controller.ts:579-580`) with default ON, so this is accepted behaviour, not a blocker — but
it must be **written into the docs**, which the issue body does not ask for.

## Step 0 — branch and folder

- Branch `feat/452-leverage-yield-submit-tx-default` off `origin/fix/453-bridge-api-auth-retry`.
- One branch for the whole feature; do not split per sub-step.
- Fresh worktree, then `pnpm i && pnpm build:packages` before the first commit — the pre-commit hook
  fails on unrelated packages otherwise. Throttle with `TURBO_CONCURRENCY=2`.

## Step 1 — demo first, because the gate depends on it

The demo is the only way to run the funded verification, so it lands before the flip.

### 1a. Settings plumbing

- `apps/demo/src/lib/sodaxSettings.ts` — add `leverageYieldUseBackendSubmitTx: boolean | null`
  alongside `swapUseBackendSubmitTx` (`:8`) and `bridgeUseBackendSubmitTx` (`:10`); default `null`
  (`:30-31`); parse it in `StoredPayload` / the loader the same way (`:109-123`). No legacy storage
  key to honour — LY never had one.
- `apps/demo/src/components/shared/SodaxSettingsModal.tsx` — add a third `SubmitTxChoice` row
  (`:43-44`, `:76-77`, `:137-139`, the debug JSON at `:165-172`, the reset at `:386-387`, the control
  at `:422`).
- `apps/demo/src/providers.tsx:150-151` — add
  `leverageYield: { useBackendSubmitTx: s.leverageYieldUseBackendSubmitTx ?? <default> }`.

**`<default>` is not `true`.** Swap uses `defaultUseBackendSubmitTx(solverApiEndpoint)`
(`apps/demo/src/constants.ts:33-35`), which is ON only when the demo points at the production solver.
Mirror that helper for LY, or the demo will POST to the backend while quoting against a staging
solver. Decide and record it; do not hardcode `?? true`.

### 1b. Kill the wrong local toggle

`apps/demo/src/pages/leverage-yield/page.tsx` has its own checkbox (`:267`, `:836-842`) that calls
`useSwapsApiSubmitTx()` (`:255`, `:474`) and builds a `SubmitTxRequestV2` **without `operation`**
(`:467-473`) — i.e. a vault swap posted to the *swaps* submit-tx route. It also has no relay fallback
(gh-450 blocker #1 flags the same thing).

Remove the local checkbox and let `vaultSwap()` route itself off the SDK setting. The order card
already renders two modes (`'solver'` / `'submit-tx'`, `:429-446` and `:480-489`) — after the change
the mode is a property of the *response*, not of a local boolean, so pick it from what `vaultSwap`
returns rather than from `useSubmitTxApi`.

## Step 2 — the gate: one funded run

Before flipping the default, run gh-450 tier 3 F07/F08 with the new toggle ON: an EVM-spoke deposit
and an EVM-spoke withdraw through `submit-tx → relay → postExecution → getStatus → solved`.

- The acceptance bar is stated in the other repo:
  `sodax-backend/docs/leverage-yield-api-sdk-mapping.md` § Open items. Do not re-derive it.
- gh-450's F00 prereqs come first (`apps/demo/.env` points swaps at a dead `localhost:3108`).
- If the run cannot happen, **stop at Step 1 and ship it separately**. Steps 4-7 (API key, status
  router, hook, docs) do not depend on the flip and can ship without it; only Step 3 does.

## Step 3 — flip the default

- `packages/sdk/src/shared/config/ConfigService.ts:511-514` — `?? false` → `?? true`, and rewrite the
  comment: it currently says "Opt-in (default OFF), unlike the swaps/bridge toggles above". Note LY
  has **no** deprecated second-precedence key to honour (swap reads `sodax.swapsOptions`, bridge
  `sodax.bridgeOptions`, `:503`/`:507`) — leave it that way.
- `packages/types/src/leverageYield/leverageYield.ts:233-243` — JSDoc: omitted means on; `false` is
  the opt-out. Drop "opt-in while it beds in".
- `packages/sdk/src/leverageYield/LeverageYieldService.ts` — three comment sites: the
  `useBackendSubmitTx` getter (`:660-668`), `vaultSwap`'s "Opt-in backend 2-step flow" (`:1215-1218`)
  and `submitTx`'s doc. Add the keyless-POST consequence from Fact 4 to the `vaultSwap` comment.

### Tests this step must change

- `LeverageYieldService.test.ts:115` — module-level `const sodax = new Sodax()` becomes
  `new Sodax({ leverageYield: { useBackendSubmitTx: false } })`, the pattern `SwapService.test.ts`
  uses. Every client-side-path assertion in that file hangs off this instance.
- `LeverageYieldService.test.ts:1518-1541` — the test titled "does not touch the backend submit API
  when the flag is off (the default)" splits in two: the default is ON, and an explicit `false` opts
  out without touching the backend API.
- The other `new Sodax()` sites in that file (`:1001`, `:1015`, `:1033`, `:1040`, `:1101`, `:1120`,
  `:2291`) are `getQuote` / builder tests that never reach `vaultSwap` — leave them, they document
  that the default config resolves.
- `positionFunding.test.ts:6` — position flows do not use submit-tx (§ Out of scope). No change.
- Add the wiring assertions the issue asks for: swap off does not pull LY off, bridge off does not
  pull LY off, LY off leaves swap and bridge on. There is currently no test anywhere that reads
  `leverageYieldUseBackendSubmitTx` except through the service getter — grep confirmed only
  `ConfigService.ts` and `LeverageYieldService.ts` mention it.

## Step 4 — per-action API key

- Add `LeverageYieldExtras = { apiKey?: string }` (follow `BridgeExtras`,
  `bridge/BridgeService.ts:95-104`).
- `VaultSwapActionParams` (`LeverageYieldService.ts:580-584`) gains the 4th type argument:
  `SpokeExecActionParams<K, Raw, CreateIntentParams<K>, LeverageYieldExtras>`. `E` defaults to
  `never` today (`packages/types/src/common/common.ts:446-450`), so `extras` is currently absent.
- **Do not move `hubWalletSwap` or `partnerFee` into `extras`.** They are intersected at the alias
  site on purpose, and the JSDoc above the alias says why ("The two vault-specific execution
  modifiers live HERE"). Moving them is a breaking change outside this issue's scope, even though
  swap and bridge keep `partnerFee` in `extras`.
- `submitTx` (`LeverageYieldService.ts:1360`) passes
  `overrideConfig: { apiKey: _params.extras?.apiKey }` into `runBackendSubmitTx`, exactly as
  `SwapService.ts:890` and `BridgeService.ts:644` do. `runBackendSubmitTx` already threads it to both
  legs (`runBackendSubmitTx.ts:81` POST, `:94` status).
- Tests: extend `LeverageYieldService.apiKeyWire.test.ts` (today only covers `getQuote` and
  `notifySolver` against a stubbed global fetch) with the two submit-tx legs —
  `extras.apiKey` beats the instance key on `POST /leverage-yield/submit-tx` *and*
  `GET /leverage-yield/submit-tx/status`; an empty string falls back to the instance key.
- dapp-kit: `useLeverageYieldVaultSwap` takes `Omit<VaultSwapActionParams<K, false>, 'raw'>`, so
  `extras` arrives for free. Add a case to `packages/dapp-kit/src/hooks/_apiKeyWire.test.ts`
  (§ "apiConfig.apiKey reaches the wire", `:821`).

## Step 5 — `LeverageYieldService.getDetailedStatus`

Copy bridge's shape (`BridgeService.getDetailedStatus`, #468) and swap's arms.

### 5a. Types and errors

- `packages/sdk/src/leverageYield/detailedStatus.ts` — ~25 lines, like `bridge/detailedStatus.ts`:
  `DetailedLeverageYieldStatusKey` and
  `DetailedLeverageYieldStatus = { source: 'backend'; data: SubmitTxStatusDataV2 } | { source: 'solver'; dstTxHash: Hex; data: SolverIntentStatusResponse }`.
  Nothing else. **Do not declare a relay leg, a not-delivered constant or an abandoned helper** —
  import all three from `backendApi/detailedStatusRouting.js`.
- `leverageYield/errors.ts` — `LeverageYieldDetailedStatusErrorCode = Extract<SodaxErrorCode, 'LOOKUP_FAILED'>`
  and `LeverageYieldDetailedStatusError`, mirroring bridge's addition. Note the *real* reason for the
  prefix: swap's `DetailedStatusError` is unprefixed and the root barrel is a flat `export *`. The
  existing `LeverageYieldLookupError` is wider (it admits `VALIDATION_FAILED` / `UNKNOWN`), so it is
  not a substitute.
- `leverageYield/index.ts` — export the two types. **Never** re-export
  `DETAILED_STATUS_NOT_DELIVERED`: swap's barrel already publishes it and the root barrel would then
  have two paths to the same name (ambiguous star export). Same rule bridge followed.

### 5b. The router

```
getDetailedStatus(params: DetailedLeverageYieldStatusKey, config?: RequestOverrideConfig)
  → Result<DetailedLeverageYieldStatus, LeverageYieldDetailedStatusError>
```

1. `this.backendApi.leverageYield.getSubmitTxStatus({ txHash, srcChainKey }, config)`. Return
   `{ source: 'backend', data }` when `record.ok && record.value.success &&
   !isBackendSubmitTxAbandoned(record.value.data)`.
2. `backendAnswered = record.ok || (isSodaxError(record.error) && record.error.context?.status === 404)`.
   No auth arm (Fact 4).
3. Resolve the hub tx hash: skip the relay entirely when `isHubChainKeyType(srcChainKey)` (the source
   tx *is* the hub tx), otherwise `resolveDeliveredPacket({ srcChainKey, srcTxHash, relayerApiEndpoint,
   backendAnswered })` and take `packet.dst_tx_hash`. Validate with `isHex` rather than casting — the
   hash reaches the solver next.
4. Ask the solver with a bounded budget, then return `{ source: 'solver', dstTxHash, data }`.
5. `LOOKUP_FAILED` on every failure, with `context.reason = DETAILED_STATUS_NOT_DELIVERED` **only**
   when `delivered.budgetable` (which `resolveDeliveredPacket` already sets only if
   `backendAnswered`). A private `detailedStatusLookupFailed(cause, srcChainKey, reason?)` like both
   existing ones, `action: 'vaultSwap'` in the context.
6. Wrap the whole body in `try/catch` — the relay client asserts on empty identifiers instead of
   returning a `Result`.

### 5c. The solver leg — extend `getIntentStatus`, do not add `getStatus`

The issue body says "optionally add `getStatus`". **Do not.** LY already has a public solver read:
`getIntentStatus` (`LeverageYieldService.ts:1475-1510`), which already passes `this.config.apiKey` as
the 5th argument to `SolverApiService.getStatus` and is unbounded by design. A second method would be
two near-identical public reads.

Instead: a private `resolveSolverStatus(request, timeoutMs?)` returning the raw
`Result<SolverIntentStatusResponse, SolverErrorResponse>`, with swap's durable-intent reconcile;
`getIntentStatus` wraps it into `LeverageYieldPostExecutionError` as it does today (unbounded), and
`getDetailedStatus` calls it with a `DETAILED_STATUS_SOLVER_TIMEOUT_MS` equivalent. The two public
methods keep their current, different error vocabularies.

**Unverified, check before copying the reconcile:** swap's reconcile reads
`this.backendApi.getIntentByTxHash(...)` (`SwapService.ts:414`) and claims `SOLVED` only for a fill
whose `intentState.remainingInput === '0'`. Confirm a leverage-yield vault intent appears in that
index at all. If it does not, ship `getDetailedStatus` without the reconcile and say so in the
docstring — the reconcile is an enhancement, not part of the routing contract.

### 5d. Tests

Mirror swap's cases in `LeverageYieldService.test.ts`, extending the mocks with
`SolverApiService.getStatus` and `getTransactionPackets`: backend record in flight; backend terminal
or abandoned → solver; backend 404 → solver; hub-source skips the relay; spoke-source delivered
packet → solver; relay 404 with backend answered → budgetable reason; relay 404 behind a backend
outage → **no** reason; malformed hub hash fails. Add `getDetailedStatus` to
`LeverageYieldService.apiKeyWire.test.ts`: the instance key on both the backend status read and the
solver `/status`.

## Step 6 — dapp-kit `useLeverageYieldDetailedStatus`

`packages/dapp-kit/src/hooks/leverageYield/useLeverageYieldDetailedStatus.ts`, copying
`useBridgeDetailedStatus.ts` structurally:

- `queryKey: ['leverageYield', 'detailedStatus', srcChainKey, srcTxHash]`.
- `pollKey = ${srcChainKey}:${srcTxHash}`, `useRef({ ...INITIAL_NOT_FOUND_STREAK })`,
  `advanceNotFoundStreak(...)` from `../shared/notFoundStreak.js`.
- `params.apiConfig?: RequestOverrideConfig` forwarded as the second argument, like bridge's.
- Export from `hooks/leverageYield/index.ts` (the root barrel already re-exports that group,
  `hooks/index.ts:15`).

**The policy helpers do not need rewriting — they need moving.** LY's arms are swap's, so
`toNotFoundBudgetRead`, `isSolverNotFound` and `getDetailedStatusRefetchInterval` (all in
`hooks/swap/getSwapStatusRefetchInterval.ts` after #468) apply verbatim. Importing them from
`hooks/leverageYield/` across features is the smell; this is the *second* caller, which is the exact
trigger gh-453 settled on for extraction (§ Settled 4 there). So: move those three to
`hooks/shared/solverDetailedStatusPolicy.ts` and have `getSwapStatusRefetchInterval.ts` re-export
them, the same way #468 handled `notFoundStreak.ts`. Swap's existing cases should fence the move and
pass unedited; if they do not, the move is wrong.

Also fix `useLeverageYieldVaultSwap`'s docstring (`useLeverageYieldVaultSwap.ts:19-30`) — it says
"create intent → verify → relay → notify solver", which is only the client-side path. Match
`useSwap`'s description: backend 2-step by default, with the client-side fallback.

## Step 7 — docs and skills

| File | Change |
| --- | --- |
| `packages/sdk/docs/CONFIGURE_SDK.md:19` | the prose that names `leverageYieldUseBackendSubmitTx` "(default `false`)" |
| `packages/sdk/docs/CONFIGURE_SDK.md:45` | the `leverageYield` table row says "default **OFF**" |
| `packages/sdk/docs/CONFIGURE_SDK.md:246-255` | the whole § "Backend submit-tx (`leverageYield.useBackendSubmitTx`)" is written around it being "the one that defaults `false`" |
| `packages/sdk/docs/LEVERAGE_YIELD.md:207,217,236` | "opt in with … `true`" / "defaults **off** while the …"; add `getDetailedStatus` and `extras.apiKey` sections |
| `packages/dapp-kit/README.md` | add `useLeverageYieldDetailedStatus`; fix the `useLeverageYieldVaultSwap` description |
| `packages/skills/.../sodax-sdk/integration/knowledge/features/leverage-yield.md:9` | "Opting into … `true`" |
| `packages/skills/.../sodax-sdk/integration/knowledge/features/leverage-yield-api.md:207-210` | "except that it defaults **off**" |
| `packages/skills/.../sodax-dapp-kit/integration/knowledge/features/leverage-yield.md` | the new hook |
| `packages/skills/.../sodax-dapp-kit/integration/knowledge/reference/hooks-index.md` | hook row |
| `packages/skills/.../sodax-dapp-kit/integration/knowledge/reference/querykey-conventions.md` | the `['leverageYield', 'detailedStatus', …]` key |

Add the keyless-POST consequence (Fact 4) to `CONFIGURE_SDK.md` § leverageYield and to
`LEVERAGE_YIELD.md`: with the default ON and no API key configured, every vault swap POSTs, is
rejected with 401, and falls back to the client-side relay. That is the one behaviour change a
keyless consumer will actually notice.

`LEVERAGE_YIELD.md` is mirrored to
`docs/developers/packages/foundation/sdk/functional-modules/leverage_yield.md`, so `docs:sync-pages`
will produce output and the "Docs ship with code" check needs the mapped page in the diff.

## Out of scope — record it so it is not reopened

- **Position flows.** `openPosition`, `openPositionFromDebtToken`, `operatePosition`,
  `openLeveragePosition`, `submitLeveragePositionIntent`, `runLeveragePositionOperation` never touch
  submit-tx; the backend body only admits `deposit|withdraw`
  (`SubmitTxOperationValues`, backend `api/swaps/types/submit-swap-tx.ts:75`). Untouched.
- **Swap-only surface**: limit orders, `cancelIntent`, Bitcoin `bound` extras, `getSwapSpeedTier`.
- **Moving `partnerFee` / `hubWalletSwap` into `extras`** (Step 4).
- **An LY e2e pin.** Swap's `detailedStatus.e2e.test.ts` counterpart needs a real already-relayed
  vault-swap tx plus its `relayData`; the same fixture problem blocks gh-453 Step 5. Defer in-source
  with a comment, do not open a follow-up issue.

## Verification

Targeted, then the package gates:

```
cd packages/sdk && npx vitest run \
  src/leverageYield/LeverageYieldService.test.ts \
  src/leverageYield/LeverageYieldService.apiKeyWire.test.ts \
  src/swap/SwapService.test.ts src/swap/detailedStatus.test.ts
cd packages/dapp-kit && npx vitest run \
  src/hooks/leverageYield src/hooks/swap src/hooks/_apiKeyWire.test.ts
```

Swap's suites are in that list deliberately: Step 6 moves code out from under them, and they are the
fence for that move.

```
pnpm --filter @sodax/sdk checkTs
pnpm --filter @sodax/dapp-kit checkTs
pnpm check:ai
pnpm docs:sync-pages
pnpm check:doc-links && pnpm check:docs-nav && pnpm check:docs-pages
```

Format only the files touched — `main` has Biome drift, so a blanket `pnpm pretty` rewrites unrelated
files.

## Risks

1. **#468 does not merge, or merges changed.** The whole Step 5/6 reuse story is built on it. If it
   is rejected in review, re-plan Steps 5-6; do not silently fall back to duplicating swap's leg.
2. **The funded run never happens.** Then Step 3 cannot be justified. Ship Steps 1, 4-7 and leave the
   default off, rather than flipping on the strength of "it is the same pipeline". Fact 2 makes the
   flip *likely* safe; it does not make it *verified*.
3. **Keyless consumers get a slower default.** One rejected POST per vault swap before the fallback.
   Mitigated only by docs. Swap already behaves this way.
4. **The reconcile may not apply** (Step 5c). Verify before copying; shipping a reconcile that reads
   an index LY intents never enter would be dead code that looks load-bearing.
5. **Step 6's extraction touches swap.** A shared-module move across a feature boundary is how a
   green suite turns red in an unrelated package. Run swap's dapp-kit suites before committing.
