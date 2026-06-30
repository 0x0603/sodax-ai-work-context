---
type: issue
repo: sodax-sdks
github: 255
status: Active
tags: [bridge, bridge-api, sdk, dapp-kit, demo, skills, valibot, backend-api-v2, swaps-api-reference, useBackendSubmitTx]
updated: 2026-06-30
related_issues: [gh-1417-swaps-api-sdk]
related_decisions: []
---

# GH-255 Bridge API across SDK, dapp-kit & demo

- Source: https://github.com/icon-project/sodax-sdks/issues/255
- Work repo: `sodax-sdks`
- Assignee: 0x0603 (me)
- Started: 2026-06-30
- Reference PR: #210 (`feat/swaps-api-v2`) — the "prime example" to mirror
- Bridge PR: #261 (https://github.com/icon-project/sodax-sdks/pull/261) → base `feat/swaps-api-v2`

## Problem

Build a **Bridge API** feature across five packages, mirroring the Swaps API v2
pattern established by reference PR #210. This is a NEW implementation task (not a
review of an existing PR). The Swaps API in #210 is the canonical example to copy.

Core product architecture (two-sided SDK consumption):

- **Backend** uses the SDK to **create raw / unsigned transactions** and talk to
  the bridge backend API. For bridge, `createBridgeIntent({ raw: true })` already
  returns `{ tx, relayData }` where `tx` is the unsigned spoke-deposit tx.
- **Frontend** uses the SDK to call the API, receives the raw tx, **signs it via a
  browser-extension wallet**, broadcasts it, then hands the tx hash back to the API
  (`submitTx`) and polls `getSubmitTxStatus` until a terminal state.
- Central mechanism: opt-in `useBackendSubmitTx`. When on, `bridge()` routes the
  spoke tx submission through the backend API; on ANY non-success it falls back to
  the existing client-side `relayTxAndWaitPacket` flow. Both share one deadline.

## Raw Issue

```text
Repo:    icon-project/sodax-sdks
Issue:   #255
Title:   feat(sdks,demo): Bridge API across SDK, dapp-kit & demo
State:   OPEN
Author:  R0bi7 (Robi)
Assignee: 0x0603
Project: New World (Ready)

Body (task list):
- Base example PR: Swaps API #210 (prime example).

@sodax/types:
- [ ] Types/interfaces for Bridge API in backendApiV2 (or co-locate if bloated)
- [ ] docs + tests

@sodax/sdk:
- [ ] Bridge Api Service (see SwapsApiService): valibot validation, error codes, handling
- [ ] config option (e.g. options.swapsOptions.useBackendSubmitTx) to optionally submit tx via API
- [ ] Refactor Bridge Service like SwapsService for submit-tx-to-API + fallback (see #210)
- [ ] docs + tests

@sodax/dapp-kit:
- [ ] bridgeApi directory with hooks exposing Bridge API (like swapsApi in #210)

@sodax/demo:
- [ ] bridge api page using only Bridge API (except allowance, sign & broadcast, minor utils)

@sodax/skills:
- [ ] add/update skills for the bridge API feature

Once complete: open a PR, then start backend work. Use `pnpm build:packages` to
create dist/ folders so the backend package.json can point at local sodax deps
without npm-published packages.
```

## Context

### Dependency reality (verified against the working tree)

The reference Swaps API code lives on branch `origin/feat/swaps-api-v2` (PR #210,
OPEN, 132 files, +7873/-1609 vs merge-base `3f71a0133d`). The current branch
(`feat/demo-solver-status-panel`) does NOT have #210's runtime foundation merged:

- ❌ Missing: `backendApi/api-utils.ts`, `backendApi/apiConfig.ts`,
  `backendApi/{swapsApiSchemas,rawTxSchemas,backendApiSchemas}.ts`,
  `SwapsApiService.ts`, the `BackendApiService` sub-service refactor
  (`public readonly swaps`), the `sodax.api` alias, `swapsOptions.useBackendSubmitTx`,
  and the per-chain `signAndSendTransaction` wallet-provider methods.
- ❌ Missing: `dapp-kit/src/hooks/swapsApi/` (entire hook family), the demo
  `apps/demo/src/pages/swaps-api/` page and `components/swaps-api/`.
- ✅ Already present (committed earlier via #238/#239): the V2 *types*
  (`ISwapsApiV2`, `RelayExtraDataResponseV2`, `PacketDataV2`, `SubmitTxRequestV2`)
  in `packages/types/src/backend/backendApiV2.ts`, and `RawTxReturnType` +
  per-chain raw-tx types in `packages/types/src/common/common.ts`.
- ✅ Already present: `ConfigService.bridge` / `bridgePartnerFee`.

**Conclusion: the Bridge API runtime work MUST be built on top of PR #210**
(rebase the Bridge branch onto `feat/swaps-api-v2`, or wait until #210 merges to
`main` then branch from `main`). Standing alone would require re-creating #210's
entire HTTP/config/signing foundation and guarantees hard merge conflicts.

### Current Bridge baseline (the service to refactor)

`packages/sdk/src/bridge/BridgeService.ts` (850 lines) — vault-backed cross-chain
transfer (deposit into spoke vault → relay to Sonic hub → settle on destination).
Public surface:

- `getFee(inputAmount): bigint` (partner-fee only, pure client-side calc).
- `isAllowanceValid(params): Result<boolean>` / `approve(params): Result<TxReturnType>`
  (EVM-spoke + Stellar only; other chains skip approval).
- `bridge(params: BridgeParams<K,false>): Result<TxHashPair>` — full lifecycle:
  `createBridgeIntent` → `verifyTxHash` → `relayTxAndWaitPacket`. Instrumented with
  `analytics.trackResult('bridge','bridge', ...)`.
- `createBridgeIntent(params): Result<IntentTxResult<K,Raw>>` — spoke deposit only;
  `raw:true` returns encoded/unsigned tx + `relayData` (THIS is the backend's
  raw-tx creation path), `raw:false` signs+broadcasts. Bitcoin only `raw:false`.
- `buildBridgeData(...)`, `getBridgeableAmount(...)`, `isBridgeable(...)`,
  `getBridgeableTokens(...)`, `filterTokensWithSameVault(...)`,
  `findTokenBalanceInReserves(...)`.

Bridge has **no** intent/solver model: no `intent` struct, no `intent_hash`, no
quote/slippage/deadline, no limit orders, no cancel — the key delta vs Swaps.

### Current dapp-kit bridge hooks

`packages/dapp-kit/src/hooks/bridge/`: `useBridge`, `useBridgeAllowance`,
`useBridgeApprove`, `useGetBridgeableAmount`, `useGetBridgeableTokens`. These are
the on-chain ("direct") hooks; the new `bridgeApi/` family is the HTTP-API parallel.

### Current demo bridge UI

`apps/demo/src/components/bridge/{BridgeManager,BridgeDialog}.tsx` +
`apps/demo/src/pages/bridge/`. Surfaces max-bridgeable amount + route-availability
gate; closes the dialog on success with no status polling (the new API page adds
an `OrderStatus` poller).

## Acceptance Criteria

- `@sodax/types`: `IBridgeApiV2` + DTOs (co-located in a new `backendBridgeApiV2.ts`
  sibling), `bridgeOptions.useBackendSubmitTx` config option. Type-level guards.
- `@sodax/sdk`: `BridgeApiService implements ResultifiedBridgeApiV2` reachable as
  `sodax.api.bridge.*`; every method returns `Result<T>` and validates responses
  with valibot; `BridgeService` refactored for backend submit-tx + client fallback
  under `bridgeOptions.useBackendSubmitTx` (default OFF). Tests added.
- `@sodax/dapp-kit`: `bridgeApi/` hook family over `sodax.api.bridge.*`.
- `@sodax/demo`: a bridge-api page using only the Bridge API (+ allowance, sign &
  broadcast, minor utils), with status polling and no UX regression vs current
  bridge (keep max-bridgeable + route gate).
- `@sodax/skills` + `docs/`: new bridge-api SKILL/knowledge/doc; `pnpm check:ai` green.
- No new `SodaxErrorCode` required (reuse `EXTERNAL_API_ERROR` / `'backend'` feature).
- Standard gates green: lint, typecheck, build:packages, tests, circular-deps.
- `useBackendSubmitTx` ships default-OFF until bridge re-relay idempotency is
  independently verified (see Open Questions in plan.md §6).

## Related

- Knowledge:
- Decisions:
- Related issues: gh-1417-swaps-api-sdk (standalone `@sodax/swaps-api` package;
  same V2 contract + valibot + raw-tx patterns).
- Analysis artifacts in this folder: `plan.md` (full plan), `process.md` (how the
  analysis was done), `analysis-notes.md` (reference signatures + critic findings).
