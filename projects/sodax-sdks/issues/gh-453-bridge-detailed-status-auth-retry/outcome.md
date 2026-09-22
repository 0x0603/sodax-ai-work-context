---
type: outcome
repo: sodax-sdks
github: 453
status: In review
updated: 2026-09-18
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/468 — **draft**, base `main`, `Closes #453`
- Branch: `fix/453-bridge-api-auth-retry`, worktree `sodax-sdks-453`
- Commits (all signed, all through husky):
  - `ad3c814a` `fix(dapp-kit): stop retrying the bridge API hooks on a rejected API key`
  - `8842ba38` merge `origin/main` (main moved 4 commits mid-work — see `process.md`)
  - `444c736e` `feat(bridge): resolve a bridge from its source tx`
- Gates, local, post-merge: install · build · `checkTs` · `test` 21/21 tasks · `lint` 15/15 ·
  `knip` · `check-exports` · `check:circular-deps` · `check:ai` 9/9 · `check:docs-pages` ·
  `check:doc-links` · `check:ai-dev-files` — all green.
- CI on `ad3c814a` was 14/14 green before the merge; re-running on `444c736e`.

Draft on purpose: the body says `Closes #453`, so leaving it ready-for-review before the content
was complete risked a merge that closed the issue early. `gh pr ready` when it is time.

## Summary

Items 1 and 2 of the issue shipped. Item 3 (the live e2e bridge pin) stays deferred — still no
`{ tx, relayData }` fixture, and the deferral is already recorded in-source.

**Item 2 — stop retrying a rejected key** (`ad3c814a`). Ten `useBridgeApi*` hooks moved from
`retry: 3` to `retryUnlessAuthFailure`; the submit-tx status hook additionally stops its 1s poll on
an auth failure, because `retry` bounds attempts within a tick and not the interval. Its interval
decision moved to a pure package-internal module so the policy is testable in dapp-kit's `node`
environment. `useBridgeApiApproveAndBroadcast` stayed untouched: it sets no `retry`, query-core
defaults a mutation to zero, and its swaps and leverage-yield twins do the same.

**Item 1 — the src-tx status router** (`444c736e`). `BridgeService.getDetailedStatus` plus
`useBridgeDetailedStatus`, built as `plan.md` rev 3 specifies, with three deliberate deviations
logged below. The relay leg is now shared (`backendApi/detailedStatusRouting.ts`) and swap calls it
too, so the duplication the plan identified is actually gone rather than increased.

## What Changed

| Area | Files |
| ---- | ----- |
| SDK, shared | `backendApi/detailedStatusRouting.ts` (new): `resolveDeliveredPacket`, plus `DETAILED_STATUS_NOT_DELIVERED` and `isBackendSubmitTxAbandoned` moved in and widened to `BackendSubmitTxStatusEnvelope` |
| SDK, swap | `swap/detailedStatus.ts` re-exports both symbols so the published surface is byte-identical; `SwapService.resolveHubTxHash` delegates to the shared leg; three now-unused imports dropped |
| SDK, bridge | `bridge/detailedStatus.ts` (new contract), `BridgeDetailedStatusError(Code)`, `BridgeService.getDetailedStatus` with the arm-1 auth-terminal branch, `bridge/index.ts` type exports |
| dapp-kit | `hooks/shared/notFoundStreak.ts` (new, predicate-parameterized), `hooks/bridge/getBridgeDetailedStatusRefetchInterval.ts` + `useBridgeDetailedStatus.ts`, `hooks/bridgeApi/getBridgeSubmitTxStatusRefetchInterval.ts`, 10 hooks' retry policy |
| Tests | 12 SDK cases for the router, 8 + 4 for the bridge-api policy and its wiring, 11 + 4 for the bridge detailed-status policy and its wiring; swap's 13 router cases and 23 hook-policy cases kept green **unedited** except one stale fixture string |
| Docs | `BRIDGE.md` § Get Detailed Status (+ Why it exists, When it fails), `BACKEND_API.md` correction, `BRIDGE_API.md` auth-failure paragraph, `dapp-kit/README.md` (bridge-API section + policy note + the new hook), 2 generated mirrors |
| Skills | `sodax-sdk/.../features/bridge.md`, `sodax-dapp-kit/.../features/{bridge,auxiliary-services}.md`, `reference/{hooks-index,querykey-conventions}.md` |

44 files, ~1250 insertions. No deletions of existing files.

## Deviations from plan rev 3, and why

1. **Swap was migrated onto the shared relay leg.** The plan said keep `resolveHubTxHash`
   byte-identical and let #452 migrate it. Doing that would have left a "shared" module with a
   single caller while the duplicate stayed in swap — the exact thing the plan and the second
   reviewer objected to. Swap's 13 unit cases fence the move and passed unedited.
   Cost: one observable delta, below.
2. **No `relayerApiEndpoint` field on `BridgeService`.** The plan wanted one "for symmetry with
   `SwapService`". `BridgeService` deliberately reads config live through getters — its own comment
   says so ("the config object and the behavior can never disagree") — so the method reads
   `this.config.relay.relayerApiEndpoint` inline, as `fallbackBridgeSteps` already does.
3. **No row added to `_apiKeyWire.test.ts`.** The package's `AGENTS.md` asks for one per
   `apiConfig`-accepting hook, but that manifest's charter is one request against one exact
   path+method, and `getDetailedStatus` can issue two (backend, then relay). `apiConfig` threading
   is covered instead at both layers it crosses: an SDK case asserting the override reaches
   `getSubmitTxStatus`, and a hook case asserting the hook forwards it.

## A criterion that needed a second pass

The acceptance criterion "`BRIDGE_API.md` gets the 401/403 paragraph" looked met and was not. That
page already said "A `401`/`403` is terminal: fix the API key rather than retrying" — but that
arrived with #308 and covers the **wire client's** retry budget, not the error *shape* a consumer
needs to write a guard (`context.status`, `isAuthFailure`) or the hook-level policy this issue adds.
`SWAPS_API.md:247` has that paragraph; bridge did not. Added, mirroring the swaps wording. The page
is on the map's `unpublished` list, so it produces no `docs:sync-pages` output — confirmed.

## The one observable behaviour delta

The `error.cause.message` on swap's relay-no-match path changed from
`'relay has not delivered the intent to the hub yet'` to
`'relay has not delivered a packet for this source tx yet'` — the shared helper cannot speak of
"the intent to the hub" for bridge. Nothing asserts that string (swap's tests use it only as an
`it.each` label), so it is not a contract, but a consumer logging `error.cause.message` will see
different text. A dapp-kit fixture quoting the old wording was realigned in the same commit.

## Breaking-change check (measured on the built artifacts, not inferred)

- `DETAILED_STATUS_NOT_DELIVERED` still public from `@sodax/sdk` with the same value.
- `isBackendSubmitTxAbandoned`, `resolveDeliveredPacket`, `DeliveredPacketResult`: absent from
  `sdk/dist/index.d.ts` — internal, unchanged in visibility.
- The six dapp-kit symbols whose signatures changed (`nextNotFoundStreak`,
  `advanceNotFoundStreak`, `getSwapStatusRefetchInterval`, `toNotFoundBudgetRead`,
  `INITIAL_NOT_FOUND_STREAK`, `STATUS_POLL_MS`): absent from `dapp-kit/dist/index.d.ts` — the
  module is in no barrel, so the change is package-internal.
- Everything new is additive. `getDetailedStatus`'s swap signature is untouched.

## Follow-ups

- **`useLeverageYieldApiStatus` has no auth stop** in its `refetchInterval`, unlike its swaps twin.
  Pre-existing, different family; raised in the PR body, and the docs wording here is narrowed so it
  does not overclaim.
- **`packages/dapp-kit/src/hooks/backend/`** has ~12 hooks on a bare `retry: 3` on the same
  `x-api-key` surface. PR thread, not a new issue.
- **The terminal + `abandonedAt` + auth-stop rule now lives in four places.** It converges only if
  the swaps and leverage-yield submit-tx status hooks are extracted the same way; their terminal
  literal differs (`solved` vs `executed`), so that is its own change — natural work for #452.
- **`useBridgeApiBridgeableAmount.ts`** carries a Biome format error that predates this branch
  (a 124-char `queryKey` line). Left alone so unrelated drift stays out of the diff.
- **e2e bridge pin** still waits on a real `{ tx, relayData }` fixture.
</content>
