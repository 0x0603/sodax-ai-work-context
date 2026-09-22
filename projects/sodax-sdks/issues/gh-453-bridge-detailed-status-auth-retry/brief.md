---
type: brief
repo: sodax-sdks
github: 453
status: In review
next: Watch CI on PR 468, then `gh pr ready` to take it out of draft — the body says Closes #453, which is why it is held as a draft
updated: 2026-09-18
tags: [bridge, bridge-api, detailed-status, api-key, dapp-kit, relay, docs, skills]
related_issues: [gh-452, gh-255, gh-305, gh-451, gh-429]
---

# GH-453 Bridge Detailed Status Auth Retry · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Bridge already has the backend submit-tx flow + per-action API key. Three swap-parity leftovers
remain: (1) a **src-tx status router**, (2) **stop retrying on 401/403** in the `bridgeApi` hooks,
(3) an **optional e2e pin**, blocked on a fixture. Scope is verified: **`sodax-sdks` only**.
**Items 1 and 2 are implemented and pushed** as **PR #468** (draft, `Closes #453`), 3 signed
commits, every local gate green. `plan.md` is at revision 3 and was followed with three logged
deviations. Only the e2e pin is left, and it is still fixture-blocked.

| Item | State |
| ---- | ----- |
| Scope: which repo(s), how big | done — `process.md` |
| Review of rev 1 (panel) + rev 2 (Codex) | done — folded in |
| Step 1: 10 hooks + status-hook auth stop | **done** — `ad3c814a` |
| Step 2: arm-2 contract + shared extraction + the router | **done** — `444c736e` |
| Step 3: `useBridgeDetailedStatus` + the budget | **done** — `444c736e` |
| Step 4: `BRIDGE.md`, `BACKEND_API.md`, README, 4 skills files | **done** — `444c736e` |
| Step 5: e2e bridge pin | blocked — no fixture |

## Blocked on

1. **Step 5 only.** Needs a real already-relayed bridge tx + its `relayData` `{ address, payload }`.
   Deferral is in-source at `packages/sdk/src/e2e-tests/e2e-relay.test.ts:11-14`. Harvest it if
   gh-451's funded run happens.
2. **Review.** PR #468 needs a reviewer; nothing in it waits on more work.

## Next action

Watch CI on PR #468 — the two checks worth reading are **Docs ship with code** (mapped docs are in
the diff for both packages, so it should pass) and **AI files match the code they describe** (an
agent reads the prose; 6 docs/skills files changed here). Then `gh pr ready`.

## Settled — do not re-litigate

1. **No `sodax-backend` and no `sodax-frontend` work.** Endpoints, keying, 404, `abandonedAt`,
   401/403 semantics all already exist. Table in `process.md`.
2. **There is a filed third consumer.** #452 names `LeverageYieldService.getDetailedStatus` and
   `useLeverageYieldDetailedStatus` explicitly, filed 8 minutes before #453 by the same assignee.
   Only 3 features can ever want this (`ConfigService.ts:502/506/512`).
3. **Bridge owns its own router**, but swap **was** migrated onto the shared relay leg after all
   (deviation 1 in `outcome.md`): leaving it would have meant a shared module with one caller and
   the duplicate still in place. Swap's 13 cases fenced the move and passed unedited.
4. **Exactly one block is extracted**, the relay delivered-packet leg, as a pure function in
   `backendApi/detailedStatusRouting.ts` — because that block is *already* the second copy
   (`SwapService.ts:533-539` admits it). Not the router, not a parameterized core. The two shared
   symbols move there too, with swap re-exporting the public one (§ Step 2a-bis).
5. **Arm 2 carries no hoisted hash field** — `{ source: 'relay'; data: PacketData }`. `dst_tx_hash`
   is the hub settlement tx for spoke-source and a destination spoke tx for hub-source; no name is
   true in both.
6. **Arm 2 is terminal by construction** — that removes the *solver vocabulary*, not the budget.
   Bridge needs the consecutive-miss counter, so the counter moved to
   `hooks/shared/notFoundStreak.ts` and now takes a predicate instead of a solver-shaped read;
   `getSwapStatusRefetchInterval.ts` keeps the solver-specific parts and re-exports the rest.
7. **Arm 1 must treat 401/403 as terminal** instead of degrading to arm 2, **and must lift
   `context.status` onto the `LOOKUP_FAILED`** — otherwise the hook's guard cannot see it and the
   router reintroduces the exact defect Step 1 fixes. See landmines.
8. **No new `docs/developers/http-api/` bridge page**; **`hooks/backend/`'s 12 identical
   `retry: 3` hooks are out of scope** (PR thread, not a new issue).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What exactly do I build, in what order, with which snippets? | `plan.md` | 7.8k |
| Why no backend work; what the reviews corrected; the implementation session | `process.md` | 7.4k |
| The issue body verbatim + acceptance criteria | `issue.md` | 1.4k |
| What shipped, the 3 plan deviations, the breaking-change measurements | `outcome.md` | 1.9k |

`plan.md` is past a cheap full read — `rg -n "^## |^### " plan.md`. It is now history: Steps 1-4
shipped. Read `outcome.md` first unless you need the reasoning behind a specific step.

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
- **PR #308 merged** (`57ceebdb`), so that conflict risk is void — but it rewrote
  `BridgeApiService.ts` and **deleted `bridgeApiSchemas.ts`**, so any plan citation of that file is
  stale. `getSubmitTxStatus` now sits at `BridgeApiService.ts:307`.
- **`#463` removed "v2" from prose** (READMEs, skills, comments) while keeping every `*V2`
  identifier and the skill *trigger phrases*. Do not reintroduce "Bridge API v2" in prose, and do
  not "fix" the trigger phrases that still say it.
- **Numbers**: 10 files with `retry: 3` (11 hook files), 13 swap test cases. Subagent runs said
  10/11/12 and 19 — both hand-recounted.
- **Line numbers here were stamped at `origin/main` @ `b5aaca0e` (2026-09-17); main has since
  moved past `898b7e6a`.** The work lives in worktree `sodax-sdks-453` on
  `fix/453-bridge-api-auth-retry`. Re-stamp before trusting any citation.
