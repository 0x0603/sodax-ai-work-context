---
type: plan
repo: sodax-sdks
github: 520
updated: 2026-10-15
---

# Plan

Code refs: sodax-sdks `origin/main` @ `77281f0c`. Audited once (2026-10-15); see `process.md`
§ Audit for what changed and why.

## Goal

`getDetailedStatus` (swap and leverage-yield) gives a terminal answer for an intent cancelled on the
hub with nothing filled, so `useDetailedStatus` / `useLeverageYieldDetailedStatus` stop polling.
Public `getStatus` and the backend arm stay unchanged. No dapp-kit diff.

## Root cause

1. `SwapService.getDetailedStatus` (`swap/SwapService.ts:464`) sends any record the backend gave up on
   (`status: 'failed'` or `abandonedAt`, `isBackendSubmitTxAbandoned` in
   `backendApi/detailedStatusRouting.ts:49`) to relay + solver.
2. `resolveSolverStatus` (`SwapService.ts:392`) returns the solver answer as-is unless it is
   `NOT_FOUND` or an error. A cancelled intent the solver still reports as `2` comes back in-flight.
3. dapp-kit `getSolverStatusRefetchInterval` (`hooks/shared/solverStatusPolicy.ts:51`) polls `1`/`2`
   every 3s with no cap. Forever, and again after every reload.
4. Solver `NOT_FOUND` (what it says for the issue's intent as of 2026-10-15): the reconcile finds no
   fill, `NOT_FOUND` stands, the hook stops after 40 polls (~2 min) and starts over on the next mount.

`LeverageYieldService` (`resolveSolverStatus` `:1596`, `getDetailedStatus` `:1681`) is the same code.
It is in scope for real: expired intents are cancelled by an intent-canceller keeper straight on the
hub Intents contract (the issue's cancel tx came from `0x7Ec046…64cf`, not the creator), and vault
intents sit on that contract with deadlines too.

## Decision 1: signal = backend intent journal, not hub `intentStates`

The hub contract deletes `intentStates` on full fill as well as on cancel (live, 2026-10-15):

| intent | journal | `intentStates` |
| --- | --- | --- |
| `0x82cd…3240` (the issue's) | `intent-cancelled` | `false, 0, 0, false` |
| `0x5a99…413f` | `intent-filled`, remaining 0 | `false, 0, 0, false` |
| `0xc418…6930` | `intent-filled`, remaining 0 | `false, 0, 0, false` |

The issue's hub rule would mark a fallback-completed swap failed whenever the solver lags or forgot
it and the journal hasn't indexed the fill, and polling would stop on a wrong final answer. Backend
says the same (`sodax-backend/apps/swaps-api/src/tasks/submit-swap-txs/intent-journal-api.client.ts:9`).

Use `backendApi.getIntentByTxHash(hubTxHash)` (`BackendApiService.ts:426`), already read by the
NOT_FOUND reconcile. For the issue's intent it returns `open: false` and
`{ eventType: 'intent-cancelled', txHash: 0x4267… }`: an indexed on-chain event, not the submit-tx
record's derived `intentCancelled` flag, which the backend drops once `abandonedAt` is set.

**Cancelled** = `open === false` && an `intent-cancelled` event && no `intent-filled` event. A cancel
after a partial fill stays as today (no status code fits; FAILED and SOLVED would both lie).

## Decision 2: answer = solver arm with `FAILED (4)`

`{ source: 'solver', dstTxHash, data: { status: SolverIntentStatusCode.FAILED } }`, produced in
`resolveSolverStatus` next to the existing NOT_FOUND→SOLVED reconcile. dapp-kit already stops on FAILED
(`solverStatusPolicy.ts:53`). #504's demo renders FAILED as a terminal red card with no cancel action;
sodax-frontend does not consume detailed status at all.

Rejected: the backend arm with the failed record (an abandoned record can carry `relaying`, which the
hook polls forever with no budget); a new `CANCELLED` member (`SolverIntentStatusCode` is in
`@sodax/types`, consumers switch on it); an extra `cancelled` field (no caller needs it yet).

## Decision 3: reconcile every non-final solver answer in `getDetailedStatus`; `getStatus` untouched

`resolveSolverStatus` gets an option (e.g. `reconcileInFlight`) that only `getDetailedStatus` sets.
With it, the journal is read for solver `NOT_FOUND`, solver error, **and** `1`/`2`. Without it
(`getStatus`), behaviour is byte-for-byte today's.

No gate on the record state. The first plan gated on "backend gave up", claiming it kept healthy swaps
free of extra reads. That was wrong: fallback-completed swaps are the common solver-arm case and are
healthy while the solver says `2`. The gate bought no safety either: an explicit cancel event is
terminal whatever the record says. Without it, backend opt-out (404) and swaps-api outages are covered
too (the journal is `apps/api`, a different service). Cost: one GET per tick, only while the solver
arm is non-final, which already costs backend + relay + solver per tick.

Outcomes with the option set, in order:

- solver `SOLVED` / `FAILED` → return it, no journal read.
- journal settled fill (`remainingInput === '0'`) → `SOLVED` (existing rule, now also for `1`/`2`).
- journal cancelled (rule above) → `FAILED`.
- solver `1`/`2`, journal open / 404 / unreadable → the solver's answer. Never an error: an
  unreadable journal must not turn an in-flight read into `LOOKUP_FAILED`.
- solver `NOT_FOUND` / error, no evidence → existing `backendAnswered` handling, unchanged.

## Steps

1. Worktree `sodax-sdks-520` off fresh `origin/main`, branch `fix/520-cancelled-intent-status`. Main's
   `.husky/pre-commit` already unsets `GIT_DIR` (#301), so committing from the worktree is safe; check
   `git config core.bare` stays `false`. `pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages` first.
2. `backendApi/backendApiSchemas.ts`: `CancelEventSchema` (`eventType: v.literal('intent-cancelled')`).
   `backendApi/guards.ts`: `isCancelEvent`, internal (not in `backendApi/index.ts`).
3. One pure helper both services call (e.g. `backendApi/intentJournal.ts`):
   `journalOutcome(intent)` → `{ kind: 'solved'; fillTxHash } | { kind: 'cancelled' } | undefined`.
   Moves the fill rule out of both `resolveSolverStatus` copies unchanged.
4. `SwapService.resolveSolverStatus`: options object `{ timeoutMs?, reconcileInFlight? }`, flow per
   Decision 3; `getDetailedStatus` passes `reconcileInFlight: true`. `getStatus` passes nothing.
5. Same in `LeverageYieldService` (options `{ timeoutMs?, apiKey?, reconcileInFlight? }`).
6. Comments and docs that become false:
   - TSDoc of both `getDetailedStatus` ("Routes; does not translate… payload unmodified":
     `SwapService.ts:450`, `LeverageYieldService.ts:1652`) and both `resolveSolverStatus`.
   - Worst-case comments on `DETAILED_STATUS_SOLVER_TIMEOUT_MS` (`SwapService.ts:216-232`,
     `LeverageYieldService.ts:~170-186`): the journal leg now also runs on in-flight reads.
   - `packages/sdk/docs/SWAPS.md` § Get Detailed Status (`:1054` says solver `data` is "from
     `sodax.swaps.getStatus`") and `packages/sdk/docs/LEVERAGE_YIELD.md` § getDetailedStatus. Say that
     FAILED here can mean "cancelled, funds refunded", so a caller must not offer to cancel again.
     These are the sources; regenerate `docs/developers/...` with `pnpm docs:sync-pages`, never hand-edit.
   - `packages/skills/skills/sodax-sdk/integration/knowledge/features/swap.md:74,79` ("payload
     unmodified", "same as getStatus").
7. Tests (below). Stage explicit paths. Commit `fix(sdk): …` without `#520`, `TURBO_CONCURRENCY=2`,
   600s timeout. PR body links the issue and lists the out-of-scope items below.

## Verification

Unit, `swap/SwapService.test.ts` › `getDetailedStatus`, mirrored in `LeverageYieldService.test.ts`.
Every new case mocks `getIntentByTxHash` explicitly (no existing case drives solver `1`/`2`, so none
breaks, but an unmocked call goes to the network). Extend the `intentResponse` fixture
(`SwapService.test.ts:1781`, which ties `open` to `allowPartialFill`) to take `open` directly.

- failed record + solver `2` + journal cancelled → `FAILED`.
- abandoned `relaying` record + solver `2` + cancelled → `FAILED`.
- 404 record + solver `2` + cancelled → `FAILED`.
- failed record + solver `NOT_FOUND` + cancelled → `FAILED`.
- failed record + solver request error + cancelled → `FAILED`.
- solver `2` + journal open → `2`; + journal 404 → `2`; + journal 5xx → `2`, not `LOOKUP_FAILED`.
- solver `2` + partial fill then cancel → `2`.
- solver `2` + journal full fill → `SOLVED`.
- solver `SOLVED` / `FAILED` → journal not called.
- record in play → solver and journal not called (existing case still green).
- `getStatus`: solver `2` → journal not called; `NOT_FOUND` + cancelled → still `NOT_FOUND`.
- `guards.test.ts`: `isCancelEvent` takes the live shape, rejects `intent-filled` / unknown types.

e2e (`packages/sdk/src/e2e-tests/detailedStatus.e2e.test.ts`): pin the backend contract this now
depends on, in the file's style: `getIntentByTxHash('0xb723…d988')` → `open: false` + an
`intent-cancelled` event. Not the full `getDetailedStatus` path: that also depends on the submit-tx
record being kept, which the SDK doesn't control.

Manual: a script on the branch calling `sodax.swaps.getDetailedStatus({ srcChainKey: '0x2105.base',
srcTxHash: '0x6c89…a5d' })` → solver arm `FAILED` on the first call (today: `NOT_FOUND`). The #504
preview only shows the fix once main is merged into #504; then the card should go terminal on its
first tick and stay static across reloads (the demo caches terminal results).

Gates: `pnpm checkTs`, `pnpm lint`, `pnpm --filter @sodax/sdk test`, `pnpm check:docs-pages`,
`pnpm check:knip`, `pnpm check-exports`; the pre-commit hook runs the rest.

## Risks

- `getIntentByTxHash` is `findOne({ txHash })`; a hub tx creating several intents could return a
  sibling. The fill reconcile already accepts this; SDK swaps and vault swaps create one intent per tx.
- Journal indexing lag: cancel not yet indexed → keeps polling until it is.
- #504 inserts constants right after `DETAILED_STATUS_SOLVER_TIMEOUT_MS` (whose comment step 6 edits),
  #512 edits other regions of both services. Adjacent, not overlapping. Merge, don't rebase.

## Out of scope (PR thread, no new issues)

- `getStatus` / `useStatus` and leverage `getIntentStatus`: solver `1`/`2` on a cancelled intent still
  polls forever. Their contract is deliberately un-reconciled for in-flight answers.
- Cancel after a partial fill.
- Every tick still calls relay `get_transaction_packets` although the record carries
  `result.dstIntentTxHash`.
- Backend drops `intentCancelled` once `abandonedAt` is set for generic failure reasons
  (`submit-tx-db.service.ts:411-440`).
- Solver answered `2` for a cancelled intent (now `-1`, likely a restart).
