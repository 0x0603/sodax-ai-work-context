---
type: brief
repo: sodax-sdks
github: 453
status: Active
next: Step 1 in plan.md — swap `retry: 3` for `retryUnlessAuthFailure` in the 10 bridgeApi hooks, plus the auth stop in useBridgeApiSubmitTxStatus's refetchInterval
updated: 2026-09-17
tags: [bridge, bridge-api, detailed-status, api-key, dapp-kit, relay, docs, skills]
related_issues: [gh-255, gh-305, gh-451, gh-452, gh-429]
---

# GH-453 Bridge Detailed Status Auth Retry · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Bridge already has the backend submit-tx flow + per-action API key. Three swap-parity leftovers
remain: (1) a **src-tx status router** (`getDetailedStatus` analog), (2) **stop retrying on
401/403** in the `bridgeApi` hooks, (3) an **optional e2e pin**, blocked on a fixture. Scoping is
**done and verified**, **no code written yet**, and the whole issue lands in **`sodax-sdks` only**
(packages `sdk`, `dapp-kit`, `skills`, `packages/sdk/docs`).

| Item | State |
| ---- | ----- |
| Scope: which repo(s), how big | done — `process.md` |
| Step 1: `retryUnlessAuthFailure` × 10 hooks + status-hook auth stop | not started |
| Step 2: `BridgeService.getDetailedStatus` | not started (4 design points open) |
| Step 3: dapp-kit poll hook + bridge refetch policy | not started |
| Step 4: `BRIDGE.md` / `BRIDGE_API.md` / 9 skills files | not started |
| Step 5: e2e bridge pin | blocked — no fixture |

## Blocked on

1. **Step 5 only.** The bridge e2e pin needs a real already-relayed bridge tx plus its
   `relayData` `{ address, payload }` to hardcode. The deferral is already written in-source at
   `packages/sdk/src/e2e-tests/e2e-relay.test.ts:11-14`. Harvest from #451 if a funded run happens.
2. Four design choices inside Step 2/3 (per-call `apiConfig`, arm-2 payload shape, hook
   name/location, generalise-vs-sibling for the refetch policy) — listed in `process.md`
   § Open questions. None blocks Step 1.

## Next action

**Step 1**, `plan.md` § Step 1. Ten one-line edits (file + line table is in the plan), plus the
four-part port of `useSwapsApiSubmitTxStatus`'s auth handling into `useBridgeApiSubmitTxStatus`,
plus a net-new `useBridgeApiSubmitTxStatus.test.ts`. Mergeable on its own; do it first.

## Settled — do not re-litigate

1. **No `sodax-backend` work.** `POST /bridge/submit-tx` and `GET /bridge/submit-tx/status`
   already exist on `apps/bridge-api`, already keyed by `(txHash, srcChainKey)`, already 404 on a
   missing record, already expose `abandonedAt` / `failed` / `dstIntentTxHash` / `packetData`.
   401/403 already match the SDK's `isAuthStatus`. Full table: `process.md`.
2. **No `sodax-frontend` work.** Zero references to `useBridgeApi*` / `getDetailedStatus` there.
3. **Arm 2 is the relay, and it already exists** — `getTransactionPackets({chain_id, tx_hash})`
   where `tx_hash` IS the src tx hash, unauthenticated, already exported from `@sodax/sdk`, and
   already proven against bridge txs by `sodax-backend`'s own `relay-poll.ts`.
4. **Bridge's router is smaller than swap's**: 2 legs, not 3 — no solver, no hub-source
   short-circuit, no `isHex` validation. One branch, order retry → router → docs.
5. **No new `docs/developers/http-api/` bridge page**, and **`hooks/backend/`'s 12 identical
   `retry: 3` hooks are out of scope** (PR thread, not a new issue).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What exactly do I build, in what order, with which snippets to copy? | `plan.md` | 4.7k |
| Why is there no backend work — and what did the verify pass correct? | `process.md` | 3.0k |
| The issue body verbatim + acceptance criteria | `issue.md` | 1.3k |
| What shipped | `outcome.md` | 0.4k |

## Landmines

- **`isBackendSubmitTxAbandoned` will not typecheck against a bridge record** (swap's `status` is a
  closed union, bridge widens to `string`) — widen the param to `BackendSubmitTxStatusEnvelope`
  (`pollBackendSubmitTx.ts:13-18`), do not cast.
- **`getSwapStatusRefetchInterval.ts` is solver-coupled** (`toNotFoundBudgetRead` mints a synthetic
  `SolverIntentStatusCode.NOT_FOUND`) — not reusable as-is for bridge.
- **The status-hook fix is not one line.** `retry` bounds attempts within a tick; without the
  `isAuthFailure(query.state.error)` guard in `refetchInterval`, the 1s poll keeps firing.
- **PR #308 (`feat/bridge-api-package`) will conflict** — ~61 commits ahead, adds a tracked
  `packages/bridge-api/`; what is on disk there is only its leftover `dist/`+`node_modules/`.
- **Never hand-edit `sodax-sdks/docs/developers/**`** — generated via `pnpm docs:sync-pages`.
- **Hook count is 10** files with `retry: 3` (11 hook files total). Subagents said 10, 11 and 12.
- **Local `sodax-sdks` checkout is on `test/450-leverage-yield-manual`**, not `main`; every line
  number here is from `origin/main` @ `b5aaca0e` (2026-09-17). Re-stamp before trusting.
- **`dst_tx_hash` differs per feature**: hub tx for swaps, destination-chain tx for bridge.
</content>
