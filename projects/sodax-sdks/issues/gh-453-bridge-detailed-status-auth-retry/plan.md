---
type: plan
repo: sodax-sdks
github: 453
updated: 2026-09-17
---

# Plan

All line numbers are against `sodax-sdks` `origin/main` @ `b5aaca0e` and `sodax-backend`
`9d3d8b06` (2026-09-17). Re-stamp before trusting them.

**Revision 2.** Revision 1 was reviewed by a 9-agent panel (3 probes, 2 architectures, 3
judges) and by hand; it had 19 defects, including three that do not compile, two false
sentences it would have shipped in `BRIDGE.md`, and one design bug that reintroduced the
exact defect this issue exists to fix. The corrections are folded in below and logged in
`process.md` § Review of revision 1.

## Goal

1. `BridgeService.getDetailedStatus` + a dapp-kit poll hook, so a caller holding only the
   spoke tx hash can resolve a bridge whose backend record is missing, stale or abandoned.
2. `retryUnlessAuthFailure` across the `bridgeApi` hooks, plus an auth stop in the status
   hook's `refetchInterval`.
3. The docs/skills text both changes need. The e2e pin stays deferred.

## Approach

Order: **retry first, contract second, router third, docs last.** One branch.

- The retry fix is 10 one-line edits plus one guard line, with the helper, its test and an
  exact template already in the repo. Mergeable on its own; it de-risks the branch.
- The **arm-2 contract is settled before any code**, because it is the one decision that
  cannot be revised after release without a `!`, and both the router and the docs wait on it.
- Docs last, one pass.

### The three facts that shape the design

1. **There is a filed third consumer.** #452 (OPEN, same assignee, filed 2026-09-14T10:03:50Z
   — eight minutes *before* #453) specifies `LeverageYieldService.getDetailedStatus({ srcChainKey,
   srcTxHash })` by name, with the same routing rules and the same two symbols
   (`DETAILED_STATUS_NOT_DELIVERED`, `isBackendSubmitTxAbandoned`), plus
   `useLeverageYieldDetailedStatus` "(or generalize `useDetailedStatus` to take a feature)".
   Revision 1 called leverage-yield "no precedent … eventually wants one". That was wrong and
   it was the premise pushing the design toward copy-per-feature.
2. **Exactly three features can ever want this**, so the abstraction has a hard ceiling:
   `ConfigService.ts:502/506/512` (`swap|bridge|leverageYield UseBackendSubmitTx`), three
   `runBackendSubmitTx` call sites (`SwapService.ts:885`, `BridgeService.ts:639`,
   `LeverageYieldService.ts:1360`), three clients with `getSubmitTxStatus`. No fourth exists.
3. **Leverage-yield is a clone of swap, not of bridge** — it relays, then calls the solver
   (`LeverageYieldService.ts:1286→1300→1303`), it *has* the hub-source short-circuit bridge
   lacks (`:1283` vs `BridgeService.ts:555` "Bridge always relays"), and it reuses swap's wire
   types verbatim (`leverageYieldApiV2.ts:462` returns `SubmitTxStatusResponseV2`). Bridge is
   the outlier on every axis. So "bridge is smaller than swap" is an argument for a copy only
   if bridge is the last consumer — and it is not.

### What that buys, and what it does not

**Bridge still owns its own router.** Zero lines change under `packages/sdk/src/swap/` or
`packages/dapp-kit/src/hooks/swap/` in this PR. Swap's router is fenced by 13 unit cases
(`SwapService.test.ts:1954-2321`) and a 195-line hook-policy test; reshaping it belongs to
#452, where leverage-yield forces the third caller anyway.

**But exactly one block gets extracted, not the router** — see Step 2a. Its justification is
not "future features": that block is *already the second copy*. `SwapService.ts:533-539` says
so out loud ("Same envelope, attribution and delivery guards `pollForExecutedPacket` applies"),
duplicating `IntentRelayApiService.ts:412-426`. A bridge copy makes three, #452 makes four. The
`backendAnswered` rule is likewise already written twice inside `SwapService.ts` alone (`:423`
under a comment at `:418` saying "Same reading as `getDetailedStatus`", and `:477`).

## Step 1 — `retryUnlessAuthFailure` in the bridgeApi hooks

Helper: `packages/dapp-kit/src/hooks/shared/retryUnlessAuthFailure.ts:17` (18 lines, has its
own test).

**Copy from the leverage-yield hook, not from swap.**
`packages/dapp-kit/src/hooks/leverageYieldApi/useLeverageYieldApiSubmitTxStatus.ts` already
contains all four changes verbatim — `:2` imports `isAuthFailure`, `:4` imports the helper,
`:30` carries the exact `@remarks` sentence ("or once the backend rejects the API key (401/403
is terminal — a retry cannot fix it)"), `:48` `retry: retryUnlessAuthFailure`, `:51`
`if (isAuthFailure(query.state.error)) return false;`. `leverageYieldApi/` has 32 files on the
helper and zero on `retry: 3`; `bridgeApi/` has 0 and 10. Bridge is the only feature left.

**Exactly 10 files** hard-code `retry: 3,` (hand-verified on `origin/main`):

| File (`packages/dapp-kit/src/hooks/bridgeApi/`) | Line |
| ----------------------------------------------- | ---: |
| `useBridgeApiAllowance.ts`                       |   39 |
| `useBridgeApiApprove.ts`                         |   40 |
| `useBridgeApiBridgeableAmount.ts`                |   42 |
| `useBridgeApiCreateBridgeIntent.ts`              |   37 |
| `useBridgeApiFee.ts`                             |   41 |
| `useBridgeApiIsBridgeable.ts`                    |   42 |
| `useBridgeApiSubmitTx.ts`                        |   45 |
| `useBridgeApiSubmitTxStatus.ts`                  |   50 |
| `useBridgeApiTokens.ts`                          |   32 |
| `useBridgeApiTokensByChain.ts`                   |   37 |

`useBridgeApiApproveAndBroadcast.ts` is the 11th hook and sets no `retry` — leave it.
`useBridgeApiSubmitTx.ts:23` mentions `retry: 3` in prose — update that line too.

The status hook needs all four parts, not just `retry`: without the `refetchInterval` guard the
1s poll keeps firing, because `retry` bounds attempts *within* a tick.

**Test:** `bridgeApi/` has one test file today (`useBridgeApiApproveAndBroadcast.test.ts`), so
`useBridgeApiSubmitTxStatus.test.ts` ("stops polling on 401") is net-new.

**Out of scope:** `packages/dapp-kit/src/hooks/backend/` has ~12 more hooks on a bare
`retry: 3` (`useBackendOrderbook.ts:38`, `useBackendIntentByTxHash.ts:38`,
`useBackendUserIntents.ts:40`, …). Raise in the PR thread; do not widen the diff, do not open
a follow-up issue.

## Step 2 — settle the public contract, then build the router

### 2a. Extract the relay delivered-packet leg (the one shared piece)

New module, `packages/sdk/src/backendApi/` — chosen from precedent, not taste: that folder
already holds the 3-caller submit-tx machinery (`runBackendSubmitTx.ts`, `pollBackendSubmitTx.ts`,
`submitTxAttempt.ts`) and nothing under it imports `swap/`, whereas a core under `shared/`
would deepen the existing `shared/entities/Sodax.ts` → `SwapService` edge.

A module-level **pure function**, not a private method, so the four relay outcomes are testable
without constructing a `Sodax`:

```ts
// packages/sdk/src/backendApi/resolveDeliveredPacket.ts
export type DeliveredPacketResult =
  | { ok: true; packet: PacketData }
  | { ok: false; cause: unknown; budgetable: boolean };

export async function resolveDeliveredPacket(params: {
  srcChainKey: SpokeChainKey;
  srcTxHash: string;
  relayerApiEndpoint: string;
  backendAnswered: boolean;
}): Promise<DeliveredPacketResult>;
```

- Untagged cause + a boolean, no `SodaxError` and no feature tag — the same shape
  `runBackendSubmitTx.ts:32` already uses, so the caller owns the wrapping.
- Body is `SwapService.ts:511-570` minus the hub short-circuit and the `isHex` guard: relay 404
  → `budgetable: true`; garbage envelope → `budgetable: false`; no matching packet →
  `budgetable: true`; match on all four fields (`src_tx_hash`, `src_chain_id`,
  `status === 'executed'`, non-empty `dst_tx_hash`) → `{ ok: true, packet }`.
- Keep `RELAY_REQUEST_TIMEOUT_MS` (15s); a budget expiry is **not** budgetable.
- **Do not export it from `packages/sdk/src/backendApi/index.ts`** — that barrel is curated
  (25 lines; `pollBackendSubmitTx` is deliberately absent). Exporting it would make
  `DETAILED_STATUS_NOT_DELIVERED` ambiguous under the flat `export *`s in `sdk/src/index.ts`.
- Swap keeps its own `resolveHubTxHash` byte-identical in this PR. #452 migrates both.

### 2b. The arm-2 contract — settle this first, it cannot be revised cheaply

```ts
// packages/sdk/src/bridge/detailedStatus.ts
import type { PacketData } from '../shared/types/relay-types.js';   // NOT from @sodax/types
import { DETAILED_STATUS_NOT_DELIVERED, isBackendSubmitTxAbandoned } from '../swap/detailedStatus.js';

export type DetailedBridgeStatusKey = { srcChainKey: SpokeChainKey; srcTxHash: string };

export type DetailedBridgeStatus =
  | { source: 'backend'; data: BridgeSubmitTxStatusDataV2 }
  | { source: 'relay'; data: PacketData };          // no hoisted hash field
```

Four decisions, each forced by source:

1. **No hoisted `dstTxHash` / `hubTxHash` field.** For a spoke-source bridge the packet's
   `dst_tx_hash` is the **hub settlement tx** (`BridgeService.ts:468`: "`dstChainTxHash` is the
   hub settlement tx"), and the hub→destination hop is not tracked for spoke→spoke. For a
   hub-source bridge (a first-class flow — `BridgeService.ts:217`, `:373`) the same field is a
   **destination spoke** tx. No name is true in both directions, so invent none: the caller
   reads `data.dst_tx_hash` with the packet's own semantics. This also kills the
   `Hex`-vs-`string` sub-question, since nothing downstream consumes the hash.
2. **`PacketData` is declared in `@sodax/sdk`** at `packages/sdk/src/shared/types/relay-types.ts:24`.
   `@sodax/types` has only the structural twin `PacketDataV2` (`backendApiV2.ts:665`). Copying
   swap's single `from '@sodax/types'` import line does not compile.
3. **Import `DETAILED_STATUS_NOT_DELIVERED`, never re-declare it.** `sdk/src/index.ts:5` and
   `:8` are both flat `export *` over the swap and bridge barrels, and swap already exports it
   (`swap/index.ts:11`). A same-named bridge export is an ambiguous star export.
   `isBackendSubmitTxAbandoned` is deliberately *not* exported (`swap/index.ts:8-9`), so import
   it from the module path and widen its parameter to
   `BackendSubmitTxStatusEnvelope` (`pollBackendSubmitTx.ts:13-18`) — a one-line change fenced
   by `packages/sdk/src/swap/detailedStatus.test.ts` (24 lines, 2 cases). Bridge widens `status`
   to `string` (`backendBridgeApiV2.ts:214`), so a literal reuse does not typecheck.
4. **Error alias must be prefixed.** Swap's `DetailedStatusError` (`swap/errors.ts:24,:43`) is
   the one unprefixed feature-error alias in the SDK and dapp-kit already imports it by that
   name. Use `BridgeDetailedStatusError = SodaxError<Extract<SodaxErrorCode, 'LOOKUP_FAILED'>>`
   (tighter than the existing `BridgeLookupError`, whose union also carries
   `VALIDATION_FAILED | UNKNOWN`).

### 2c. `BridgeService.getDetailedStatus` — routing, with one deliberate difference from swap

```
record = await this.backendApi.bridge.getSubmitTxStatus({ txHash, srcChainKey })

if (record.ok && record.value.success && !isBackendSubmitTxAbandoned(record.value.data))
    -> { source: 'backend', data: record.value.data }

if (!record.ok && isAuthFailure(record.error))        // <-- NOT in swap. See below.
    -> { ok: false, error: lookupFailed(...) } with the auth error as cause, terminal

backendAnswered = record.ok || (isSodaxError(record.error) && record.error.context?.status === 404)
-> resolveDeliveredPacket({ ..., backendAnswered })
   ok    -> { source: 'relay', data: packet }
   !ok   -> lookupFailed('bridge', 'getDetailedStatus', cause,
                          { srcChainKey, action: 'bridge', reason: budgetable ? DETAILED_STATUS_NOT_DELIVERED : undefined })
```

**Why the auth branch exists, and why swap does not have it.**
`GET /swaps/submit-tx/status` carries **no** `@RequireApiKey` (`sodax-backend
apps/swaps-api/src/api/swaps/swaps.controller.ts`, the `@Get('submit-tx/status')` block — only
`@ApiOperation`/`@ApiOkResponse`/`@ApiNotFoundResponse`; no class-level decorator either).
`GET /bridge/submit-tx/status` carries `@RequireApiKey('bridge:read')`
(`apps/bridge-api/src/api/bridge/bridge.controller.ts:219`). So swap's arm 1 can never 401;
bridge's can. Without the branch, on an enforcing deployment a rejected or wrong-scope key
gives `record.ok === false` with `context.status` 401/403 → `backendAnswered === false` →
`DETAILED_STATUS_NOT_DELIVERED` is **never** emitted → the new hook polls every 3s forever, and
the 401 is invisible to it because the outer `LOOKUP_FAILED` wraps the *relay* error as `cause`.
That is precisely the defect Step 1 exists to fix, reintroduced by Step 2 in the same branch.

Fix it in the SDK, not the hook — the repo already treats 401/403 as terminal at
`pollBackendSubmitTx.ts:105` ("A rejected key cannot become success by waiting") and documents
it at `SWAPS_API.md:247`. One network-free unit case covers it (arm 1 is a spy).

Note for #452: swap has the same shape latent, and its route is unguarded *today* — the swaps
controller's own comment says enforcement is not yet on for that deployment. Mention it in the
PR thread; do not change swap here.

**Plumbing:** `BridgeService` has no `relayerApiEndpoint` field (unlike `SwapService.ts:280`);
it reads `this.config.relay.relayerApiEndpoint` inline at `:581`. Add the field for symmetry.
`BridgeService` has no status-read method at all today — this is its first.

**Per-call `apiConfig`:** swap's `getDetailedStatus` takes none, but
`BridgeApiService.getSubmitTxStatus` accepts a `RequestOverrideConfig` and
`useBridgeApiSubmitTxStatus.ts:47` passes one. Add an optional trailing `RequestOverrideConfig`
that reaches arm 1 only — the relay leg is unauthenticated. Dropping it would silently remove
the per-action key surface the issue says bridge already has.

## Step 3 — dapp-kit poll hook (smaller than revision 1 thought)

**Arm 2 is terminal by construction.** The router returns a relay packet only after matching it
as `status === 'executed'` with a non-empty `dst_tx_hash`, so a successful arm-2 read *is* the
end state. There is no in-flight relay answer, no solver status to compare, and nothing to mint
a synthetic `NOT_FOUND` from. Therefore:

- Bridge needs **none** of the not-found streak machinery. The only budgetable condition is a
  `LOOKUP_FAILED` whose `context.reason === DETAILED_STATUS_NOT_DELIVERED`.
- `packages/dapp-kit/src/hooks/swap/getSwapStatusRefetchInterval.ts` stays **untouched**. The
  revision-1 question "generalise vs sibling" is deleted, not answered. (For the record:
  revision 1 claimed a sibling was the smaller diff and listed `advanceNotFoundStreak` /
  `nextNotFoundStreak` as "reusable as-is" — both wrong. They are typed on
  `SwapStatusResult`, so reusing them requires the solver laundering the same plan rejected.
  #452, which *does* need the streak, should boolean-parameterize that module in place — it is
  package-internal with two consumers and its own test file, ~8 changed lines.)
- Bridge's policy is ~25 lines: terminal on `status === 'executed' | 'failed'` or `abandonedAt`
  for the backend arm, stop on any relay arm, stop on auth failure, 3s otherwise, with an
  optional budget on the not-delivered reason.

**Name and location.** `packages/dapp-kit/src/hooks/bridge/` already exists with five
SDK-backed hooks calling `sodax.bridge.*` (`useBridge.ts`, `useBridgeAllowance.ts`,
`useBridgeApprove.ts`, `useGetBridgeableAmount.ts`, `useGetBridgeableTokens.ts`) — the
`hooks/bridge` (SDK) vs `hooks/bridgeApi` (backend API) split already mirrors
`hooks/swap` vs `hooks/swapsApi`, so the folder is settled convention, not an open question.
But the symbol **cannot** be `useDetailedStatus`: `hooks/index.ts` flat-exports both `swap/`
and `bridge/`, and `hooks/swap/index.ts:4` already exports `useDetailedStatus`,
`UseDetailedStatusResult` and `UseDetailedStatusParams`. Use `useBridgeDetailedStatus`
(and `UseBridgeDetailedStatus*`), which is also the vocabulary #452 implies for LY.

**Consumer:** `sodax-frontend@aa73a308` has zero references to either symbol.
`apps/demo/src/components/bridge-api/{BridgeCard,OrderStatus}.tsx` consume the bridgeApi hooks,
so the demo is the plausible first caller — wire it there rather than shipping surface for nobody.

## Step 4 — docs and skills

Bridge docs have **zero** hits for `401`, `403`, `retry` or "detailed status".

| Target | Size | Change |
| ------ | ---: | ------ |
| `packages/sdk/docs/BRIDGE.md` | 35 KB | new `## Get Detailed Status` + `### Why it exists` + `### When it fails`, mirroring `SWAPS.md:1035` / `:1066` / `:1081` |
| `packages/sdk/docs/BRIDGE_API.md` | 9.2 KB | the 401/403 paragraph, mirroring `SWAPS_API.md:247` |
| `packages/skills/skills/sodax-sdk/bridge/SKILL.md` | 3.4 KB | the new method |
| `packages/skills/skills/sodax-sdk/bridge-api/SKILL.md` | 6.6 KB | 401/403 terminal-ness |
| `packages/skills/skills/sodax-sdk/integration/knowledge/features/bridge.md` | 12 KB | method + caveat |
| `packages/skills/skills/sodax-sdk/integration/knowledge/features/bridge-api.md` | 9.3 KB | 401/403 |
| `packages/skills/skills/sodax-dapp-kit/bridge/SKILL.md` | 5.4 KB | the new hook |
| `packages/skills/skills/sodax-dapp-kit/integration/knowledge/features/bridge.md` | 4.1 KB | the new hook |
| `packages/skills/skills/sodax-dapp-kit/integration/knowledge/reference/hooks-index.md` | 20 KB | add the hook row |

**Three sentences revision 1 would have shipped wrong — do not write them:**

1. ❌ "`dstTxHash` is the destination-chain hash." It is the **hub settlement** tx for a
   spoke-source bridge and a destination spoke tx for a hub-source one. Arm 2 proves *the
   deposit reached the hub*, not *the funds landed*. Say that, and name no field.
2. ❌ "Arm 1 already answers where it landed." `dstIntentTxHash` is required only *inside*
   `result?`, which is "present when executed" (`backendBridgeApiV2.ts:223-224`,
   `bridgeApiSchemas.ts:114`). A pending / relaying / abandoned record carries no hash at all.
3. ❌ "`BackendSubmitTxStatusEnvelope` is the swap+bridge shared piece." That doc comment
   (`runBackendSubmitTx.ts:7-9`, `SwapService.ts:869`, `BridgeService.ts:622`) is stale —
   leverage-yield is a live third caller (`LeverageYieldService.ts:1360`), and only
   `LeverageYieldService.ts:1342` says so. Do not propagate it.

**Mirror rules:**

- `BRIDGE.md` is mirrored (`scripts/docs-pages-map.json:37-42`) → edit the source under
  `packages/sdk/docs/`, then `pnpm docs:sync-pages`. Never hand-edit `docs/developers/**`.
- `BRIDGE_API.md` sits in the map's **`unpublished`** array (`docs-pages-map.json:5-14`, line 9),
  not a publish list. Per `:3`, editing an unpublished page is not a Docs Drift signal — expect
  **no** `docs:sync-pages` output from it.
- No new page under `docs/developers/http-api/`. The published 401/403 text already lives at
  `docs/developers/how-to/api-keys.md:181-184`, which already names `sodax.api.bridge` at `:128`.

## Step 5 — e2e pin (deferred, no work)

`packages/sdk/src/e2e-tests/e2e-relay.test.ts:11-14` carries the deferral in-source: relay
idempotency is covered by the shared swap case, and the bridge assertion waits on a real
already-relayed bridge tx plus its `relayData` `{ address, payload }` to hardcode. Nothing to do
until such a fixture exists. (Revision 1 said to harvest it from #451 — that was this plan's own
inference; #451's body is one sentence, "Manually test feature (SDK and API demo flows)", and
mentions no fixture.)

## Verification

```bash
cd sodax-sdks && pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages   # fresh branch, or the hook fails

pnpm --filter @sodax/sdk test -- src/bridge src/backendApi src/swap/detailedStatus.test.ts
pnpm --filter @sodax/dapp-kit test -- src/hooks/bridgeApi src/hooks/bridge

pnpm check:ai-dev-files      # skills gate
pnpm docs:sync-pages         # after a BRIDGE.md edit only; commit the generated diff
```

Regression fence to keep green untouched: `SwapService.test.ts:1954-2321` (13 cases),
`packages/dapp-kit/src/hooks/swap/{useDetailedStatus,getSwapStatusRefetchInterval}.test.ts`.
Format only the files touched — `main` carries Biome drift.

## Risks

1. **PR #308 conflict.** `origin/feat/bridge-api-package` is ~61 commits ahead of main and adds
   a tracked standalone `@sodax/bridge-api` client. Unmerged and unreferenced from main, but any
   bridge file touched here conflicts there.
2. **A hook nobody calls.** No frontend consumer. Wire the demo or it is surface for nobody.
3. **Relay auth assumption.** The SDK reaches the relay unauthenticated at
   `https://api.sodax.com/v1/relay` (`packages/types/src/common/constants.ts:29`), a public
   HAProxy edge; `sodax-backend` deliberately bypasses it (`shared-utils/src/constants.ts:38-51`).
   Swap's shipped router already depends on that call, so bridge adds no new exposure — but both
   break together if the edge starts enforcing a key.
4. **Enforcement mode.** `@RequireApiKey` only rejects in `mode === 'enforce'`; under
   `monitor`/`off` a bad key still gets a 200, so Step 1 and the arm-1 auth branch are both
   no-ops on such a deployment. Bridge-api's current mode is unknown from source.
5. **Extraction blast radius.** Step 2a adds a module and one caller; it must not be added to
   `backendApi/index.ts`, or `DETAILED_STATUS_NOT_DELIVERED` becomes an ambiguous re-export.
6. **Scope creep into `hooks/backend/`.** 12 more hooks share the retry defect. PR thread only.
</content>
