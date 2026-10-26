---
type: process
repo: sodax-sdks
github: 520
updated: 2026-10-21
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

- 2026-10-15 — Investigation only, no code. Read the status path on sodax-sdks `origin/main`
  `77281f0c` (local checkout was on `feat/tron-spoke`). Live reads below. Plan in `plan.md`.
- 2026-10-21 — Merged `origin/main` `d02515c8` into #523 as signed `fdb4c7e1` (merge, no rebase).
  See § Main catch-up merge.

## Findings

Live reads, 2026-10-15, for the issue's swap (src `0x6c89…a5d` on `0x2105.base`, hub
`0xb723…d988`, intent hash `0x82cd…3240`):

- Solver `POST https://api.sodax.com/v1/intent/status` → `{"status":-1}`. No longer `2`, so the
  issue's repro now gives 40 polls (~2 min) per mount, not infinite. Infinite needs solver `1`/`2`.
- Submit-tx `GET https://api.sodax.com/v1/swaps/submit-tx/status` → `status: failed`,
  `failedAtStep: posted_execution`, `failureReason: "Intent deadline expired"`,
  `abandonedAt: 2026-10-14T07:48:07Z`, no `intentCancelled`, `result.dstIntentTxHash` present.
- Intent journal `GET https://api.sodax.com/v1/be/intent/tx/0xb723…d988` → `open: false`,
  `events: [{ eventType: 'intent-cancelled', txHash: 0x4267c7be…a052 }]`.
- Hub `intentStates` on Sonic `0x6382D6cc…96ef`: all-zero for the cancelled intent **and** for two
  fully filled intents (`0x5a99…413f`, `0xc418…6930`). The contract deletes the mapping on full
  fill, so `exists: false, receivedOutput: 0` cannot tell cancelled from filled. Kills the issue's
  hub-based rule.
- Backend event types (`sodax-backend/packages/shared-enums/src/enums/enums.ts:31`):
  `intent-created`, `intent-cancelled`, `intent-filled`, `external-fill-failed`.
- Backend drops `intentCancelled` once `abandonedAt` is set unless `failureReason` is
  `SOLVER_NOT_INGESTED`/`SOLVER_FAILED` (`apps/swaps-api/src/api/swaps/submit-tx-db.service.ts:411-440`).
- `LeverageYieldService.getDetailedStatus` / `resolveSolverStatus` (`:1596`, `:1685`) mirror the swap
  code: same bug. Its public `getIntentStatus` deliberately doesn't reconcile.
- Open PRs #504 and #512 touch `SwapService.ts` / `LeverageYieldService.ts` imports only, not the
  status region.

- Who cancels: the issue's cancel tx `0x4267…a052` calls `cancelIntent` (`0xca25d319`) directly on
  the hub Intents contract from `0x7Ec046CEB0C01A2Ef16C77d2e6bB56E3AF3464cf` (nonce ~47.8k, a keeper),
  not the creator `0x3cA8…B485`. Backend logs name it "intent-canceller"
  (`submit-swap-txs.task.ts:847`). Expired vault intents go the same way, so leverage-yield is in scope.
- #504 demo (`apps/demo/src/components/swaps/OrderStatus.tsx:102`) treats `FAILED` as terminal, caches
  it, no cancel action. sodax-frontend `origin/main` has no detailed-status or solver-FAILED consumer.
- Docs: `packages/sdk/docs/SWAPS.md` and `LEVERAGE_YIELD.md` are the sources;
  `scripts/docs-pages-map.json` generates `docs/developers/...` (`pnpm docs:sync-pages`,
  `check:docs-pages` gates it).
- No existing `getDetailedStatus` unit test drives solver `1`/`2`, so the new journal read on
  in-flight answers breaks none; `intentResponse` fixture (`SwapService.test.ts:1781`) ties `open` to
  `allowPartialFill`.

## Audit (2026-10-15)

Re-checked every claim in `plan.md` against code and live state. Changes:

- **Dropped the "backend gave up" gate.** Its justification ("no extra reads for healthy swaps") was
  wrong: fallback-completed swaps are the common solver-arm case and are healthy at solver `2`. The
  gate added no safety, since an explicit cancel event is terminal whatever the record says. Now: every
  non-final solver answer in `getDetailedStatus` is reconciled; `getStatus` stays untouched. Covers
  opt-out (404) and swaps-api outages too.
- Solver request error + cancelled → `FAILED` stated explicitly; unreadable journal on an in-flight
  read must never become `LOOKUP_FAILED`.
- Docs: edit the `packages/sdk/docs` sources and regenerate, not the generated pages. Added the skill
  knowledge file and both `DETAILED_STATUS_SOLVER_TIMEOUT_MS` worst-case comments to the list.
- e2e pins the journal contract only, not the full path (submit-tx record retention isn't ours).
- Leverage-yield scope now backed by the keeper evidence above.
- #504/#512 overlap restated: adjacent to, not only, imports.
- Worktree commit is safe on a fresh main base (`.husky/pre-commit` unsets `GIT_DIR`).

## Implementation (2026-10-15)

Worktree `sodax-sdks-520`, branch `fix/520-cancelled-intent-status` off `origin/main` `77281f0c`,
upstream unset. Committed as `7973e67f` (signed), pushed, PR #523.

- `backendApi/intentJournal.ts` — `readIntentJournalOutcome(intent)` → `solved` / `cancelled` /
  `undefined`; both services' fill rule moved into it.
- `SwapService.resolveSolverStatus(request, { timeoutMs, reconcileNonFinal })`; only
  `getDetailedStatus` sets the flag.
- `LeverageYieldService.resolveSolverStatus` signature unchanged; it is already detailed-only.
- Docs: `SWAPS.md` new § "The solver answer is reconciled"; `LEVERAGE_YIELD.md` step 2; regenerated
  pages; skill `swap.md`.
- Tests: `intentJournal.test.ts` (7), swap +12 cases, leverage +6, e2e journal pin. The new
  reconcile cases fail against `origin/main`'s services (swap 7, leverage 4) and pass on the branch.
- Gates green: sdk `checkTs`, sdk `test` (2935), `lint`, `check:docs-pages`, `check:doc-links`,
  `check:ai`, sdk `check:knip`, `check:circular-deps`; e2e `detailedStatus` (3) live.
- Live run from the built dist: `getDetailedStatus({0x2105.base, 0x6c89…a5d})` →
  `{ source: 'solver', data: { status: 4 } }`; `getStatus(0xb723…)` still `-1`.

## Changes During Work

- No `CancelEventSchema` / `isCancelEvent`. A loose `IntentEventTypeSchema` (`eventType: string`)
  instead, so an `intent-filled` entry too malformed for `isFillEvent` still rules a cancel out. The
  cancel event carries nothing the SDK reads.
- dapp-kit untouched. `useDetailedStatus` / `useLeverageYieldDetailedStatus` TSDoc say each variant
  carries "that source's payload unmodified": still true of the hook (it passes the SDK result
  through), and editing dapp-kit `src/` would need its own Docs Drift signal.
- Review follow-up (user asked why not `shared`/`utils`): moved `readIntentJournalOutcome` out of
  its own `backendApi/intentJournal.ts` into `backendApi/detailedStatusRouting.ts`, the existing
  home for pieces every detailed-status router shares. `shared/utils` holds generic helpers and
  never imports `backendApi`; this reads `IntentResponse`, its schema and `isFillEvent`. Pushed to
  #523 as `c03aa17e` (refactor commit; PR squash-merges).

## Main catch-up merge (2026-10-21)

- One conflict: import list in `LeverageYieldService.test.ts` (#520 added `IntentResponse`, #512
  added the batch types). Kept both.
- Line audit: every +/- line from both sides survives (`git diff` line sets, base `77281f0c`), except
  three stale mocks replaced on purpose (below).
- `main` itself was red at `d02515c8`: #509's test "keeps the hub tx on a postExecution failure"
  mocked `submitTransaction` / `waitUntilIntentExecuted`, but the resume path from #511 relays
  directly (`relayTxAndWaitPacket`), so `packet` was undefined → `UNKNOWN`. Code was right, the test
  was stale after the squash merges. Fixed in the merge commit by mocking the relay (+1/-3),
  because the pre-commit hook and #523's CI would fail otherwise. main's CI stays red until #523 or
  a separate fix lands.
- #504's `useSwapLifecycle` polls `getDetailedStatus`, so a journal cancel now ends it as
  `kind: 'failed'` (via `detailedStatus.ts` solver `FAILED` → `failed`). #511's API lane
  (`useSwapsApiStatus` → `sodax.api.swaps.getStatus`) does not go through this fix; whether the
  backend reports a cancelled intent there is unverified.
- Gates on `fdb4c7e1`: hook (checkTs, build, test 21/21), `pnpm lint`, `check:ai`,
  `check:doc-links`, `check:docs-pages`, `check:docs-nav` all green.

