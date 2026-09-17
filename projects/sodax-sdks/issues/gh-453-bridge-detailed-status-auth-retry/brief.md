---
type: brief
repo: sodax-sdks
github: 453
status: Active
next: Step 1 in plan.md — copy the four auth changes from useLeverageYieldApiSubmitTxStatus.ts into the 10 bridgeApi hooks + the status hook, then settle the arm-2 contract (Step 2b) before writing the router
updated: 2026-09-17
tags: [bridge, bridge-api, detailed-status, api-key, dapp-kit, relay, docs, skills]
related_issues: [gh-452, gh-255, gh-305, gh-451, gh-429]
---

# GH-453 Bridge Detailed Status Auth Retry · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Bridge already has the backend submit-tx flow + per-action API key. Three swap-parity leftovers
remain: (1) a **src-tx status router**, (2) **stop retrying on 401/403** in the `bridgeApi` hooks,
(3) an **optional e2e pin**, blocked on a fixture. Scope is verified: **`sodax-sdks` only**.
**No code written yet.** `plan.md` is at **revision 3**: rev 1 was reviewed by a 9-agent panel
(19 defects), rev 2 by a second agent which found the auth stop unimplementable as written.
Both reviews are folded in; the plan is passed for implementation.

| Item | State |
| ---- | ----- |
| Scope: which repo(s), how big | done — `process.md` |
| Review of rev 1 (panel) + rev 2 (Codex) | done — folded in |
| Step 1: 10 hooks + status-hook auth stop | not started |
| Step 2: arm-2 contract + shared-symbol move, then the router | not started |
| Step 3: `useBridgeDetailedStatus` + the budget, stated exactly | not started |
| Step 4: `BRIDGE.md` / `BRIDGE_API.md` / 9 skills files | not started |
| Step 5: e2e bridge pin | blocked — no fixture |

## Blocked on

1. **Step 5 only.** Needs a real already-relayed bridge tx + its `relayData` `{ address, payload }`.
   Deferral is in-source at `packages/sdk/src/e2e-tests/e2e-relay.test.ts:11-14`.
2. Nothing else. Revision 1's four open design questions are closed in source; what is left is
   listed in `process.md` § Open questions and blocks nothing.

## Next action

**Step 1**, `plan.md` § Step 1 — and copy from
`packages/dapp-kit/src/hooks/leverageYieldApi/useLeverageYieldApiSubmitTxStatus.ts`, which
already has all four changes verbatim (`:2`, `:4`, `:30`, `:48`, `:51`), not from swap.
Ten one-line edits (table in the plan) + the status-hook guard + a net-new test.

## Settled — do not re-litigate

1. **No `sodax-backend` and no `sodax-frontend` work.** Endpoints, keying, 404, `abandonedAt`,
   401/403 semantics all already exist. Table in `process.md`.
2. **There is a filed third consumer.** #452 names `LeverageYieldService.getDetailedStatus` and
   `useLeverageYieldDetailedStatus` explicitly, filed 8 minutes before #453 by the same assignee.
   Only 3 features can ever want this (`ConfigService.ts:502/506/512`).
3. **Bridge owns its own router** — zero lines change under `packages/sdk/src/swap/` or
   `packages/dapp-kit/src/hooks/swap/`. Swap's 13-case fence stays untouched; #452 migrates it.
4. **Exactly one block is extracted**, the relay delivered-packet leg, as a pure function in
   `backendApi/detailedStatusRouting.ts` — because that block is *already* the second copy
   (`SwapService.ts:533-539` admits it). Not the router, not a parameterized core. The two shared
   symbols move there too, with swap re-exporting the public one (§ Step 2a-bis).
5. **Arm 2 carries no hoisted hash field** — `{ source: 'relay'; data: PacketData }`. `dst_tx_hash`
   is the hub settlement tx for spoke-source and a destination spoke tx for hub-source; no name is
   true in both.
6. **Arm 2 is terminal by construction** — that removes the *solver vocabulary*, not the budget.
   Bridge still needs the consecutive-miss counter, so `getSwapStatusRefetchInterval.ts` gets
   boolean-parameterized in place (~8 lines, no behaviour change); rev 2's "untouched" was wrong.
7. **Arm 1 must treat 401/403 as terminal** instead of degrading to arm 2, **and must lift
   `context.status` onto the `LOOKUP_FAILED`** — otherwise the hook's guard cannot see it and the
   router reintroduces the exact defect Step 1 fixes. See landmines.
8. **No new `docs/developers/http-api/` bridge page**; **`hooks/backend/`'s 12 identical
   `retry: 3` hooks are out of scope** (PR thread, not a new issue).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What exactly do I build, in what order, with which snippets? | `plan.md` | 7.8k |
| Why no backend work; what the two reviews corrected and why | `process.md` | 6.2k |
| The issue body verbatim + acceptance criteria | `issue.md` | 1.4k |
| What shipped | `outcome.md` | 0.4k |

`plan.md` is past a cheap full read — `rg -n "^## |^### " plan.md`, then open the one step you are
on. Step 1 is self-contained; Steps 2 and 3 are coupled (see Risks 6).

## Landmines

- **The auth trap.** `GET /bridge/submit-tx/status` has `@RequireApiKey('bridge:read')`
  (`bridge.controller.ts:219`) while swap's has none. A rejected key on arm 1 → `backendAnswered`
  false → `DETAILED_STATUS_NOT_DELIVERED` never emitted → the hook polls every 3s forever, and the
  401 is invisible (the outer `LOOKUP_FAILED` wraps the *relay* error). Follow
  `pollBackendSubmitTx.ts:105`.
- **Two contracts for "a failure" in this package, and they are not interchangeable.** Step 1's
  hooks `unwrapResult` → **throw** → `query.state.error`. The detailed-status hook returns the raw
  `Result` (`useDetailedStatus.ts:56`) → a failure is `query.state.data.error` and
  `query.state.error` is `undefined`. And `isAuthFailure` reads `context.status` only, never
  `.cause` (`errors/guards.ts:61-62`). So the status lift (Step 2c) and the data-side guard
  (Step 3a) must land together or the auth stop silently never fires.
- **Three compile collisions under the flat barrels**: never re-declare
  `DETAILED_STATUS_NOT_DELIVERED` (`swap/index.ts:11` + `sdk/src/index.ts:5,:8`); the hook must be
  `useBridgeDetailedStatus` (`hooks/swap/index.ts:4` already owns `useDetailedStatus`); the error
  alias must be prefixed (swap's `DetailedStatusError` is unprefixed).
- **`PacketData` is in `@sodax/sdk`** (`shared/types/relay-types.ts:24`), not `@sodax/types`
  (only `PacketDataV2` there). And **`backendApi/index.ts` is a curated barrel** — do not export
  the new shared module from it.
- **Two sentences that must not be written**: `dst_tx_hash` as "the destination chain" (settled #5),
  and "arm 1 already answers where it landed" — `dstIntentTxHash` sits inside optional `result?`,
  "present when executed", so a pending record carries no hash.
- **`isBackendSubmitTxAbandoned` will not typecheck against a bridge record** (bridge widens
  `status` to `string`) — widen the param to `BackendSubmitTxStatusEnvelope`, fenced by
  `swap/detailedStatus.test.ts`.
- **`BRIDGE_API.md` is in `docs-pages-map.json`'s `unpublished` array** — not a Docs Drift signal,
  no `docs:sync-pages` output. `BRIDGE.md` is mirrored and does produce one.
- **PR #308 (`feat/bridge-api-package`) will conflict** — ~61 commits ahead, adds a tracked
  `packages/bridge-api/`; on disk there is only its leftover `dist/`+`node_modules/`.
- **Numbers**: 10 files with `retry: 3` (11 hook files), 13 swap test cases. Subagent runs said
  10/11/12 and 19 — both hand-recounted.
- **Local `sodax-sdks` checkout is on `test/450-leverage-yield-manual`**, not `main`; every line
  number here is from `origin/main` @ `b5aaca0e` (2026-09-17). Re-stamp before trusting.
