---
type: plan
repo: sodax-sdks
github: 453
updated: 2026-09-17
---

# Plan

All line numbers are against `sodax-sdks` `origin/main` @ `b5aaca0e` and `sodax-backend`
`9d3d8b06` (2026-09-17). Re-stamp before trusting them.

**Revision 3.** Revision 1 was reviewed by a 9-agent panel (3 probes, 2 architectures, 3
judges) and by hand; it had 19 defects, including three that do not compile, two false
sentences it would have shipped in `BRIDGE.md`, and one design bug that reintroduced the
exact defect this issue exists to fix. Revision 2 folded those in and was then reviewed by a
second agent (Codex), which found that rev 2's own auth-stop was **unimplementable as
written** and that its "no streak machinery" line contradicted its own budget requirement.
Both are fixed in § Step 2c and § Step 3. Log: `process.md` § Review of revision 1 and
§ Review of revision 2.

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
without constructing a `Sodax`. The module also becomes the neutral home for the two symbols
bridge would otherwise import out of `swap/` (see 2a-bis):

```ts
// packages/sdk/src/backendApi/detailedStatusRouting.ts
export type DeliveredPacketResult =
  | { ok: true; packet: PacketData }
  | { ok: false; cause: unknown; budgetable: boolean };

export async function resolveDeliveredPacket(params: {
  srcChainKey: SpokeChainKey;
  srcTxHash: string;
  relayerApiEndpoint: string;
  backendAnswered: boolean;
}): Promise<DeliveredPacketResult>;

export const DETAILED_STATUS_NOT_DELIVERED = 'relay_not_delivered';
export function isBackendSubmitTxAbandoned(data: BackendSubmitTxStatusEnvelope<unknown>): boolean;
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

### 2a-bis. Move the two shared symbols, do not cross-import them

Revision 2 had bridge import `DETAILED_STATUS_NOT_DELIVERED` and `isBackendSubmitTxAbandoned`
from `../swap/detailedStatus.js`. That compiles, but it makes `swap/` the owner of two things
three features share — the same ownership smell the relay-leg extraction exists to remove. Move
both into `backendApi/detailedStatusRouting.ts` and have `swap/detailedStatus.ts` **re-export**
them:

```ts
// packages/sdk/src/swap/detailedStatus.ts
export { DETAILED_STATUS_NOT_DELIVERED } from '../backendApi/detailedStatusRouting.js';
```

- The public name and value stay byte-identical, so `swap/index.ts:11` keeps exporting
  `DETAILED_STATUS_NOT_DELIVERED` and no consumer breaks. Safe **only** because
  `backendApi/index.ts` does not re-export the new module (above) — otherwise the flat
  `export *` over both barrels sees the same name twice.
- `isBackendSubmitTxAbandoned` is not public (`swap/index.ts:8-9` says so deliberately), so
  moving it is invisible outside the package. Widen its parameter to
  `BackendSubmitTxStatusEnvelope` in the same move — bridge widens `status` to `string`
  (`backendBridgeApiV2.ts:214`), so the swap-typed signature does not typecheck for bridge.
- Fence: `packages/sdk/src/swap/detailedStatus.test.ts` (24 lines, 2 cases) must stay green
  unchanged; it is the cheapest proof the widening is behaviour-neutral.
- Swap's `SwapService` keeps importing both by name — the import path changes, nothing else.

### 2b. The arm-2 contract — settle this first, it cannot be revised cheaply

```ts
// packages/sdk/src/bridge/detailedStatus.ts
import type { PacketData } from '../shared/types/relay-types.js';   // NOT from @sodax/types
import {
  DETAILED_STATUS_NOT_DELIVERED,
  isBackendSubmitTxAbandoned,
} from '../backendApi/detailedStatusRouting.js';   // neutral owner — see 2a-bis, not swap/

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
3. **Never re-declare `DETAILED_STATUS_NOT_DELIVERED`; import it from the neutral module.**
   `sdk/src/index.ts:5` and `:8` are both flat `export *` over the swap and bridge barrels, and
   the name is already public via `swap/index.ts:11`. A second declaration — in bridge or in a
   barrel-exported shared module — is an ambiguous star export. See 2a-bis for the move.
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
    -> { ok: false, error: lookupFailed('bridge', 'getDetailedStatus', record.error,
                                        { srcChainKey, action: 'bridge',
                                          status: record.error.context?.status }) }   // LIFT THE STATUS

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

**`status:` in that context arg is load-bearing, not decoration.** `isAuthFailure(error)` is
`isSodaxError(error) && isAuthStatus(error.context?.status)` (`errors/guards.ts:61-62`) — it
reads `context.status` and **does not walk `error.cause`**. `lookupFailed` builds its context as
`{ phase: 'lookup', method, ...context }` (`errors/wrappers.ts:123-134`), so without an explicit
`status` the outer `LOOKUP_FAILED` has `context.status === undefined` and `isAuthFailure` returns
**false** on it, even though a 401 is sitting on `.cause`. `Ctx` is `Partial<SodaxErrorContext>`
(`wrappers.ts:17`) and `SodaxErrorContext.status?: number` exists (`errors/codes.ts:126+`), so
lifting it typechecks and is exactly what the guard's own doc promises: "Reads the status the
service lifted onto `context`, so it works for any `SodaxError` carrying one."

Assert both halves in the unit test: `result.ok === false`, `isAuthFailure(result.error) === true`,
`result.error.context.status === 401`, and that the relay was **never called** (the spy proves the
router did not degrade to arm 2).

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

## Step 3 — dapp-kit poll hook

### 3a. The hook reads failures from `data`, never from `query.state.error`

This is the detail revision 2 got wrong, and it would have shipped a hook whose auth stop never
fires. Two different contracts are in play in this package:

| Hook family | queryFn | A failure surfaces as |
| ----------- | ------- | --------------------- |
| `hooks/bridgeApi/useBridgeApiSubmitTxStatus` (Step 1) | `unwrapResult(await …)` → **throws** (`shared/unwrapResult.ts`) | `query.state.error` ✅ |
| `hooks/swap/useDetailedStatus`, and the new bridge hook | returns the raw `Result` (`useDetailedStatus.ts:56`) | `query.state.data.error`, and `query.state.error` stays **undefined** |

So Step 1's `if (isAuthFailure(query.state.error)) return false;` is correct **there** and
meaningless **here**. The detailed-status hook must branch on the data:

```ts
refetchInterval: query => {
  const read = query.state.data;                       // Result<DetailedBridgeStatus, …> | undefined
  if (read && !read.ok && isAuthFailure(read.error)) return false;   // needs Step 2c's lifted status
  …
}
```

`isAuthFailure` works on `read.error` **only because** Step 2c lifts `context.status` onto the
`LOOKUP_FAILED`; it does not inspect `.cause` (`errors/guards.ts:61-62`). If that lift is dropped,
this guard silently never fires — so the two changes must land together. Note also that neither
`hooks/swap/` nor `hooks/bridge/` contains a single `isAuthFailure` reference today: this hook is
the first in either folder to need one.

### 3b. The ambiguous-read budget, stated exactly

**Arm 2 is terminal by construction** — the router returns a relay packet only after matching it
as `status === 'executed'` with a non-empty `dst_tx_hash`, so a successful arm-2 read *is* the end
state. There is no in-flight relay answer and nothing to mint a synthetic solver status from. That
removes the solver *vocabulary*, **not** the budget: acceptance still needs one, because a relay
miss cannot be told apart from a bridge still in flight.

Revision 2 said "bridge needs none of the not-found streak machinery" and, two lines later, "with
an optional budget on the not-delivered reason". Those contradict. The resolution: bridge needs
the **counter**, not the laundering.

Budget contract, to implement literally:

- **Advance** only when the read is `!ok` **and** `error.context.reason === DETAILED_STATUS_NOT_DELIVERED`.
- **Reset to 0** on every other outcome — a backend arm (any status, including `pending` /
  `relaying`), a relay arm, or a `LOOKUP_FAILED` with no reason (a dependency failing right now).
  This is what makes a long backend-pending stretch unable to exhaust the budget: those reads
  reset it, they do not advance it.
- **Key it** on `${srcChainKey}:${srcTxHash}`; a key change starts a fresh streak so a previous
  bridge's count cannot stop the next one.
- **Advance once per fetch**, not once per `refetchInterval` call — React Query may invoke the
  callback more than once per update, so de-dup on `dataUpdateCount`. (`dataUpdateCount` is the
  de-dup guard, not the counter itself; revision 2's reviewer was right that a naive global
  counter is wrong, and this is the mechanism swap already uses to avoid it.)
- **Cap at `MAX_NOT_FOUND_POLLS` (40)** consecutive, ≈2 min at the 3s interval — same number as
  swap, so the two features do not diverge for no reason.

### 3c. Where that code lives

`packages/dapp-kit/src/hooks/swap/getSwapStatusRefetchInterval.ts` already implements exactly that
counter — `NotFoundStreakState`, `INITIAL_NOT_FOUND_STREAK`, `nextNotFoundStreak`,
`advanceNotFoundStreak`, plus `STATUS_POLL_MS` and `MAX_NOT_FOUND_POLLS`. The only solver-shaped
part is the comparison inside `nextNotFoundStreak` (`status === SolverIntentStatusCode.NOT_FOUND`).

**Boolean-parameterize it in place** rather than copying it or leaving it untouched: change
`nextNotFoundStreak(data, prev)` / `advanceNotFoundStreak(state, pollKey, data, count)` to take an
already-computed `isAmbiguousMiss: boolean` instead of a `SwapStatusResult`, and let each feature
supply its own predicate (`toNotFoundBudgetRead(...)` for swap, a two-line
`reason === DETAILED_STATUS_NOT_DELIVERED` check for bridge). ~8 changed lines, one existing test
file to extend, and the module is package-internal — absent from `hooks/swap/index.ts` and from
dapp-kit's public surface, with exactly two consumers (`useStatus.ts:46,52` and
`useDetailedStatus.ts:60,66`). Revision 1's claim that a sibling was "the smaller, lower-risk diff"
was backwards: a sibling re-copies the streak machinery and a second test file.

This is the one place where swap files change, and it changes no swap **behaviour** — swap keeps
passing its own laundered read through its own predicate. Keep
`getSwapStatusRefetchInterval.test.ts` and `useDetailedStatus.test.ts` green as the fence. #452
then inherits the parameterized counter for free, which is the whole point.

Bridge's own policy file is then ~30 lines: stop on auth failure (3a), stop on a terminal backend
arm (`status === 'executed' | 'failed'` or `abandonedAt` — the rule
`useBridgeApiSubmitTxStatus.ts:51-57` already applies), stop on any relay arm, stop once the
not-delivered streak hits 40, else 3s.

### 3d. Tests this step must add

1. **`401/403 stops polling`** — a `LOOKUP_FAILED` read carrying `context.status: 401` returns
   `false` from `refetchInterval`. Fails loudly if Step 2c's status lift is missing.
2. **`a not-delivered streak stops at 40, a backend-pending stretch does not`** — 40 consecutive
   not-delivered reads stop; 40 backend `pending` reads followed by a not-delivered read do not.
3. **`a new (srcChainKey, srcTxHash) starts a fresh budget`** — key change resets the streak.
4. **`an unreasoned LOOKUP_FAILED keeps polling`** — a relay 5xx must not consume budget.

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
pnpm --filter @sodax/dapp-kit test -- src/hooks/bridgeApi src/hooks/bridge src/hooks/swap

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
5. **Extraction blast radius.** Step 2a/2a-bis adds a module, moves two symbols and re-exports
   them from swap; it must not be added to `backendApi/index.ts`, or
   `DETAILED_STATUS_NOT_DELIVERED` becomes an ambiguous re-export. Step 3c changes one swap file
   (`getSwapStatusRefetchInterval.ts`) — signature only, no behaviour. Both are fenced by tests
   that must stay green unedited.
6. **Two changes that must land together.** Step 2c's `status` lift and Step 3a's
   `isAuthFailure(read.error)` guard are useless apart: without the lift the guard never fires,
   and without the guard the lift is never read. Test 1 of § 3d fails loudly if either is missing.
7. **Scope creep into `hooks/backend/`.** 12 more hooks share the retry defect. PR thread only.
