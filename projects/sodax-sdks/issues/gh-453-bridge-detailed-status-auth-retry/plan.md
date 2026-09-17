---
type: plan
repo: sodax-sdks
github: 453
updated: 2026-09-17
---

# Plan

All line numbers are against `sodax-sdks` `origin/main` @ `b5aaca0e` (2026-09-17).
Re-stamp with `git -C sodax-sdks rev-parse --short origin/main` before trusting them.

## Goal

Close the two real gaps the issue names, in one branch:

1. `BridgeService.getDetailedStatus` + a dapp-kit poll hook, so a caller holding only the
   spoke tx hash can resolve a bridge whose backend record is missing, stale or abandoned.
2. `retryUnlessAuthFailure` across the `bridgeApi` hooks, plus an auth stop in the status
   hook's `refetchInterval`.

Plus the docs/skills text both changes need. The e2e pin stays deferred.

## Approach

Order: **retry first, router second, docs third.** Reasons:

- The retry fix is 10 one-line edits plus one guard line, with the helper and its test
  already in the repo. It is mergeable on its own and de-risks the branch early.
- The router is the only design work, and its docs text (`BRIDGE.md`) can only be written
  once the arm-2 return shape is settled.
- Docs last, in one pass, so `pnpm docs:sync-pages` runs once. One branch for the whole
  issue (no stacked branches).

Bridge's router is **strictly smaller than swap's**: swap needs 3 legs (backend record →
relay packet only to extract the hub tx hash → solver `/status`), bridge has no solver so
the relay packet *is* the terminal answer. 2 legs. Also no hub-source short-circuit —
`BridgeService.ts:555` states "Bridge always relays — there is no hub-source short-circuit",
so swap's `isHubChainKeyType` branch and its trailing `isHex` validation both drop out.

## Step 1 — `retryUnlessAuthFailure` in the bridgeApi hooks

Helper already exists, 18 lines, with a unit test:
`packages/dapp-kit/src/hooks/shared/retryUnlessAuthFailure.ts:17`

```ts
export const retryUnlessAuthFailure = (failureCount: number, error: unknown): boolean =>
  !isAuthFailure(error) && failureCount < MAX_RETRIES;   // MAX_RETRIES = 3
```

**Exactly 10 files** hard-code `retry: 3,` (verified by hand on `origin/main`; earlier
estimates of 11 and 12 were wrong — see `process.md` § Corrections):

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
`useBridgeApiSubmitTx.ts:23` also mentions `retry: 3` in its doc comment — update that line too.

**The status hook is not a one-line swap.** `useBridgeApiSubmitTxStatus.ts` is a near-exact
twin of `useSwapsApiSubmitTxStatus.ts`; port all four differences:

1. import `isAuthFailure` from `@sodax/sdk` and `retryUnlessAuthFailure` from `../shared/`
2. `retry: retryUnlessAuthFailure`
3. first line of `refetchInterval`, under the same comment swap uses
   (`useSwapsApiSubmitTxStatus.ts:52-53`):
   ```ts
   // `retry` bounds attempts within a tick, not the interval itself — so stop it here too.
   if (isAuthFailure(query.state.error)) return false;
   ```
4. extend the `@remarks` bullet with "or once the backend rejects the API key (401/403 is
   terminal — a retry cannot fix it)"

Without (3) the defect the issue names survives: `retry` bounds attempts *within* a tick,
the 1s interval keeps firing.

**Test:** `bridgeApi/` has exactly one test file today
(`useBridgeApiApproveAndBroadcast.test.ts`), so a `useBridgeApiSubmitTxStatus.test.ts`
covering "stops polling on 401" is net-new. The helper itself needs no new test
(`retryUnlessAuthFailure.test.ts` exists).

**Out of scope, do not grow into it:** `packages/dapp-kit/src/hooks/backend/` has ~12 more
hooks on a bare `retry: 3` (`useBackendOrderbook.ts:38`, `useBackendIntentByTxHash.ts:38`,
`useBackendUserIntents.ts:40`, …) on the same `x-api-key` surface. Raise it in the PR thread,
do not open a follow-up issue and do not widen the diff.

## Step 2 — `BridgeService.getDetailedStatus`

Reference implementation to mirror, with its own doc comments intact:

- `packages/sdk/src/swap/detailedStatus.ts` — 43 lines, the whole pure contract
- `packages/sdk/src/swap/SwapService.ts:457-495` — `getDetailedStatus`
- `packages/sdk/src/swap/SwapService.ts:503-581` — `resolveHubTxHash` (the relay leg)
- `packages/sdk/src/swap/SwapService.ts:585-590` — `detailedStatusLookupFailed`
- exports at `packages/sdk/src/swap/index.ts:10-11`

### New file: `packages/sdk/src/bridge/detailedStatus.ts`

Pure, no I/O, mirroring swap's:

```ts
export type DetailedBridgeStatusKey = { srcChainKey: SpokeChainKey; srcTxHash: string };

export type DetailedBridgeStatus =
  | { source: 'backend'; data: BridgeSubmitTxStatusDataV2 }
  | { source: 'relay'; dstTxHash: string; data: PacketData };   // shape to settle, see below

export const DETAILED_STATUS_NOT_DELIVERED = 'relay_not_delivered';   // reuse swap's literal
```

Open design points, decide before writing:

1. **Arm-2 payload.** Swap's arm 2 is `{ source: 'solver'; dstTxHash; data: SolverIntentStatusResponse }`.
   Bridge has no solver, so the natural analog is the delivered `PacketData` itself plus its
   `dst_tx_hash`. Returning the raw packet keeps the "each arm returns that source's payload
   unmodified" contract (`detailedStatus.ts:12-13`) and drops nothing.
2. **`dstTxHash` type.** Swap types it `Hex` because the hash is handed to the solver next and
   must validate (`SwapService.ts:573`). Bridge hands it to nobody, and non-EVM destinations
   are in play, so `string` is right — `BridgeService.ts:604` already returns
   `dstChainTxHash: packetResult.value.dst_tx_hash` as a plain string. Do **not** copy the
   `isHex` guard.
3. **Reuse the `DETAILED_STATUS_NOT_DELIVERED` literal** rather than minting a second one —
   dapp-kit's budget policy keys off the string value.

### `isBackendSubmitTxAbandoned` does not compile against a bridge record

`detailedStatus.ts:41` types its parameter as swap's `SubmitTxStatusDataV2`, whose `status` is
the closed union `SubmitSwapTxStatusV2` (`packages/types/src/backend/backendApiV2.ts:710`).
Bridge deliberately widens `status` to `string` (`backendBridgeApiV2.ts:214`).

Fix is one line, not a twin: widen the parameter to the envelope that already exists for
exactly this purpose — `BackendSubmitTxStatusEnvelope<TResult>` at
`packages/sdk/src/backendApi/pollBackendSubmitTx.ts:13-18`, whose own doc comment says both
`SubmitTxStatusDataV2` and `BridgeSubmitTxStatusDataV2` are assignable to it. The predicate
touches only `status` and `abandonedAt`, so nothing else changes.

### `BridgeService.getDetailedStatus` body

Copy the routing verbatim from `SwapService.ts:461-478`, then replace the solver leg:

```
record = await this.backendApi.bridge.getSubmitTxStatus({ txHash, srcChainKey })
if (record.ok && record.value.success && !isBackendSubmitTxAbandoned(record.value.data))
    -> { source: 'backend', data: record.value.data }
backendAnswered = record.ok || (isSodaxError(record.error) && record.error.context?.status === 404)
-> resolveDeliveredPacket(key, backendAnswered)   // the relay leg, no solver call after it
```

The relay leg is `SwapService.ts:511-570` minus the hub/solver framing:

- `getIntentRelayChainId(srcChainKey)` → `getTransactionPackets({ action: 'get_transaction_packets',
  params: { chain_id, tx_hash: srcTxHash } }, endpoint, RELAY_REQUEST_TIMEOUT_MS)`
- `packets.error instanceof HttpRelayError && status === 404` → budgetable miss
- envelope guard (`!packets.value?.success || !Array.isArray(packets.value.data)`) → unbudgeted
- match on `(src_tx_hash, src_chain_id, status === 'executed', non-empty dst_tx_hash)` — match,
  do not take the first executed entry
- no delivered packet → budgetable miss with `missReason`

Plumbing notes:

- `BridgeService` has **no `relayerApiEndpoint` field** (unlike `SwapService.ts:280`). It reads
  `this.config.relay.relayerApiEndpoint` inline at `BridgeService.ts:581`. Either add the field
  or keep reading inline; adding it is the tidier match to every other service.
- `BridgeService` has **no status-read method at all** today (public surface: `getFee:184`,
  `isAllowanceValid:204`, `approve:276`, `buildApproveTxs:383`, `bridge:490`,
  `getBridgeableAmount:997`, `isBridgeable:1108`, `getBridgeableTokens:1157`, …). This is the
  first one.
- Error plumbing is already there: `BridgeLookupError` / `LOOKUP_FAILED`
  (`packages/sdk/src/bridge/errors.ts:43,57,65,91`) and the shared wrapper
  `lookupFailed(feature, method, cause, ctx)` (`packages/sdk/src/errors/wrappers.ts:123`).
  So `detailedStatusLookupFailed` is a 3-line private method.
- Keep the relay read budgeted (`RELAY_REQUEST_TIMEOUT_MS`, 15s, from
  `packages/sdk/src/shared/services/intentRelay/IntentRelayApiService.ts`), and keep a budget
  expiry **unbudgeted** — it is a dependency failing now, not an ambiguous miss.

### Free simplification bridge gets and swap does not

The bridge status record **already carries the destination hash and the packet**:
`dstIntentTxHash!: string` (required) and `packetData?` in
`sodax-backend apps/bridge-api/src/api/bridge/dto/submit-bridge-tx-status.dto.ts:23,26`, typed
SDK-side at `packages/types/src/backend/backendBridgeApiV2.ts:195-200`. So arm 1 already answers
"where did it land". Arm 2 exists **only** for the missing/404/abandoned case — i.e. precisely
the post-fallback hole the issue describes. Say this in the docs; it is the clearest statement
of why the method exists for bridge.

### Per-call `apiConfig` — an open question swap's signature cannot answer

`getDetailedStatus` takes no `RequestOverrideConfig` (`SwapService.ts:457-459`), while the
bridge status hook does pass one (`useBridgeApiSubmitTxStatus.ts:47`) and
`BridgeApiService.getSubmitTxStatus` accepts one. Copying swap's signature silently drops the
per-action API-key surface the issue says bridge already has. **Decide:** add an optional
trailing `RequestOverrideConfig` on the bridge method (it only reaches arm 1 — the relay leg is
unauthenticated), or match swap exactly and document the omission.

## Step 3 — dapp-kit poll hook

Reference: `packages/dapp-kit/src/hooks/swap/useDetailedStatus.ts` (70 lines) plus its policy
module `packages/dapp-kit/src/hooks/swap/getSwapStatusRefetchInterval.ts` (126 lines).

What is reusable and what is not:

- **Reusable as-is:** `advanceNotFoundStreak`, `INITIAL_NOT_FOUND_STREAK`, `nextNotFoundStreak`
  shape, `MAX_NOT_FOUND_POLLS = 40`, `STATUS_POLL_MS = 3000`, and the composite `pollKey`
  (`${srcChainKey}:${srcTxHash}`) so a new bridge starts its own budget.
- **Not reusable:** `toNotFoundBudgetRead` and `getDetailedStatusRefetchInterval` are written in
  solver vocabulary — they launder a read into a `SolverIntentStatusResponse` and mint a synthetic
  `SolverIntentStatusCode.NOT_FOUND` (`getSwapStatusRefetchInterval.ts:99-126`). Bridge needs its
  own terminal predicate. Either generalise the module over a terminal-predicate callback or write
  a `getBridgeStatusRefetchInterval.ts` sibling; a sibling is the smaller, lower-risk diff.
- Bridge's terminal vocabulary: backend arm stops on `status === 'executed' | 'failed'` or
  `abandonedAt` (same rule `useBridgeApiSubmitTxStatus.ts:51-57` already applies); relay arm is
  terminal the moment it answers at all — a delivered `executed` packet is the end state.
- Keep the module free of React/context imports so it stays unit-testable in dapp-kit's `node`
  test env (the reason swap split it out — `getSwapStatusRefetchInterval.ts:33-35`).

Naming: swap's is `useDetailedStatus` under `hooks/swap/`. Bridge's SDK-backed hooks live under
`hooks/bridgeApi/` but this one wraps `sodax.bridge.*`, not `sodax.api.bridge.*`. Settle on
`hooks/bridge/useDetailedStatus.ts` (mirrors swap's layout) and export it from `hooks/bridge/index.ts`.

**Consumer check:** `sodax-frontend@aa73a308` has zero references to `useDetailedStatus` /
`useBridgeApiSubmitTxStatus`, so the hook ships with no external caller. `apps/demo`'s
`src/components/bridge-api/{BridgeCard,OrderStatus}.tsx` do consume the bridgeApi hooks, so the
demo is the plausible first caller — wire it there rather than shipping surface for nobody.

## Step 4 — docs and skills

Bridge docs currently have **zero** hits for `401`, `403`, `retry` or "detailed status"
(`git grep -c -E "401|403|[Dd]etailed [Ss]tatus" origin/main -- packages/sdk/docs/BRIDGE.md
packages/sdk/docs/BRIDGE_API.md` → no output).

| Target | Size | Change |
| ------ | ---: | ------ |
| `packages/sdk/docs/BRIDGE.md` | 35 KB | new `## Get Detailed Status` + `### Why it exists` + `### When it fails`, mirroring `SWAPS.md:1035-1097` |
| `packages/sdk/docs/BRIDGE_API.md` | 9.2 KB | the 401/403 paragraph, mirroring `SWAPS_API.md:238-251` |
| `packages/skills/skills/sodax-sdk/bridge/SKILL.md` | 3.4 KB | the new method |
| `packages/skills/skills/sodax-sdk/bridge-api/SKILL.md` | 6.6 KB | 401/403 terminal-ness |
| `packages/skills/skills/sodax-sdk/integration/knowledge/features/bridge.md` | 12 KB | method + caveat |
| `packages/skills/skills/sodax-sdk/integration/knowledge/features/bridge-api.md` | 9.3 KB | 401/403 |
| `packages/skills/skills/sodax-dapp-kit/bridge/SKILL.md` | 5.4 KB | the new hook |
| `packages/skills/skills/sodax-dapp-kit/integration/knowledge/features/bridge.md` | 4.1 KB | the new hook |
| `packages/skills/skills/sodax-dapp-kit/integration/knowledge/reference/hooks-index.md` | 20 KB | add the hook row (already lists `useDetailedStatus`) |

Text to mirror, in order of usefulness:

- `SWAPS.md:1061` "### Why it exists" — the stale-vs-404 explanation, including
  "abandonment — not a 404 — is what usually signals the fallback ran".
- `SWAPS.md:1075` "### When it fails" — the `LOOKUP_FAILED` / `context.reason` retry-budget split.
- `SWAPS_API.md:247` — "Auth failures surface as `EXTERNAL_API_ERROR` with `context.status` 401
  (missing/invalid key) or 403 (suspended organisation / missing scope) — terminal config problems
  — while the transient verification 503 is retried by the wire client."

Docs mirror rules:

- `BRIDGE.md` is mirrored (`scripts/docs-pages-map.json:38-41` → `developers/packages/foundation/
  sdk/functional-modules/bridge.md`). Edit the source under `packages/sdk/docs/`, then run
  `pnpm docs:sync-pages`. **Never hand-edit `docs/developers/**`** — it is generated.
- `BRIDGE_API.md` is in the map's flat list (`docs-pages-map.json:9`).
- **No new page under `docs/developers/http-api/`.** There is no bridge page there, and
  `docs/bridge/index.mdx:19` currently states "No Bridge write API yet" — adding one is a
  launch-posture change the issue never asks for. The published 401/403 semantics already live in
  `docs/developers/how-to/api-keys.md:181-184`, which already names `sodax.api.bridge` at :128.

## Step 5 — e2e pin (deferred, no work)

`packages/sdk/src/e2e-tests/e2e-relay.test.ts:11-14` already carries the deferral in-source:
relay idempotency is covered by the shared swap case, and the bridge-specific assertion waits on
a real already-relayed bridge tx plus its `relayData` `{ address, payload }` to hardcode.
Nothing to do until such a fixture exists. If #451 (bridge manual test) produces a funded bridge
run, harvest the fixture there and close this bullet.

## Verification

```bash
# fresh branch: install + build first, or the pre-commit hook fails on unrelated packages
cd sodax-sdks && pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages

# unit
pnpm --filter @sodax/sdk test -- src/bridge
pnpm --filter @sodax/dapp-kit test -- src/hooks/bridgeApi src/hooks/bridge

# gates
pnpm check:ai-dev-files        # skills gate
pnpm docs:sync-pages           # after any packages/sdk/docs edit; commit the generated diff
```

Format only the files touched (`main` carries Biome drift — a repo-wide `pnpm pretty` would
sweep unrelated files into the diff).

## Risks

1. **PR #308 conflict.** `origin/feat/bridge-api-package` is ~61 commits ahead of main and adds a
   tracked standalone `@sodax/bridge-api` client (20 files under `packages/bridge-api/`). It is
   unmerged and unreferenced from main (`git grep "@sodax/bridge-api" origin/main` → nothing), but
   any bridge file touched here will conflict there. What sits in the working tree at
   `packages/bridge-api/` is only that branch's leftover `dist/` + `node_modules/`.
2. **A hook nobody calls.** No frontend consumer exists. Wire the demo, or the router ships as
   surface for a hypothetical caller.
3. **Relay auth assumption.** The SDK reaches the relay unauthenticated at
   `https://api.sodax.com/v1/relay` (`DEFAULT_RELAYER_API_ENDPOINT`,
   `packages/types/src/common/constants.ts:29`), which is a public HAProxy edge in front of the
   relay origin. Source proves the SDK *sends* no credential, not that the edge accepts anonymous
   traffic forever. Mitigation: swap's `getDetailedStatus` already ships against that exact call in
   production, so bridge inherits no *new* exposure — but if the gateway ever enforces a key, both
   features break together.
4. **`status: string` widening.** Bridge's tolerant wire types mean a literal copy of swap's
   predicates will not typecheck; widen via `BackendSubmitTxStatusEnvelope` rather than casting.
5. **Scope creep into `hooks/backend/`.** 12 more hooks share the defect. Out of scope; PR thread.
</content>
