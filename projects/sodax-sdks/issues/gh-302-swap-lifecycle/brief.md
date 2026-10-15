---
type: brief
repo: sodax-sdks
github: 302
status: In review — PR #503 (#329) merged; PR #504 (#328 + #302) open, ready for review
next: #504 is APPROVED + CLEAN (R0bi7, 2026-10-14 21:00, on `5e5bed60`) — his 0n finding is fixed in `6aebb9c7` (demo guard + JSDoc) and `1e284102` (hook feeds the Stellar gate 1n on a 0n minimum, so the trustline check runs), both pushed 2026-10-15, approval kept. NOT yet merged into #509/#511/#512 (clean: they don't touch those files); #511/#512 need it before #504 squashes or the `-s ours` trick no longer applies (process.md 2026-10-15). Then mainnet matrices (#504 body rows, #511 playground, #512 demo; #509 needs none). Merge order #504 → #509 → #511 → #512; after each squash, `merge -s ours <squash>` into the child if its tree == old head, then main (process.md 2026-10-14)
updated: 2026-10-15
tags: [swap, dapp-kit, eip-5792, atomic-batch, detailed-status, submit-tx, lifecycle-hook]
related_issues: [gh-328, gh-329, gh-21, gh-208, gh-505, gh-506, gh-507]
---

# GH-302 Swap Lifecycle · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

All 11 commits of `plan.md` are done, on **2 branches** (user, 2026-10-07): `feat/329-swaps-client-options`
(#329) and `feat/302-swap-lifecycle` (#328 + #302 + `useSwapLifecycle`, 10 commits) — branch map in
outcome.md; pushed as **PR #503** (ready) and **PR #504** (draft). Issue comments on #328/#329 not
posted (drafts in outcome.md). Local `backup/302-all-11` can go once both merge. They close #302 (EIP-5792 batch approve +
create-intent), #328 / #329 tails (cores shipped in #371 / #362), plus `useSwapLifecycle` and the demo
SwapCard on it. Every local gate is green (outcome.md). Missing: the PR, the issue comments (both drafted
in outcome.md), and the funded mainnet matrix that gates the merge.

## Blocked on

Stacked on #504: PR #509 (gh-506), PR #511 (gh-505, reuses the batch logic via `approvalBatch.ts`) and
PR #512 (gh-507, stacked on #511). Any later change to the batch code here must be merged into them.
2026-10-13: `origin/main` (incl. squashed #503 + #486 Privy) merged into #504 as `b10deabf`; conflicts were
`SwapService.test.ts` (both sides appended a describe — kept both) and `apps/demo/AGENTS.md` (kept both).
2026-10-14: `d2cc44f7` merged into #509 (`f9074802`), #511 (`8a5f2042`, resume rebuilt on `confirmApprovalBatch`) and #512 (`7c54c819`).
2026-10-14: R0bi7 Low fix `5e5bed60` (`resumeBatchCallCount`) merged into #509 (`62735054`), #511 (`21421a2b`, ported to
`confirmApprovalBatch`) and #512 (`ece8d13b`). All pushed.
2026-10-15: R0bi7 review 5522430503 (CHANGES_REQUESTED 18:07) was superseded by his APPROVED 21:00 on the same
`5e5bed60`; #504 is APPROVED + CLEAN. The 0n finding: mechanism right, not a regression, documented gate behavior.
Ruleset: `dismiss_stale_reviews_on_push: false`, so a later push would keep the approval. process.md 2026-10-15.
2026-10-14: the fix for the R0bi7 dual-agent review (issuecomment-6057498745, late-landing batch never relayed)
is pushed as `d2cc44f7` on #504: `swapWithApproval({ ..., resumeBatchId })` re-waits the batch, relays the deposit by
hash, reads the intent back from the hub tx, post-executes; `useSwapLifecycle.next()` in `unconfirmed` resumes;
receipts that all share one tx hash map to the deposit. The resume wait shares the swap path's
`DEFAULT_RELAY_TX_TIMEOUT` floor (`batchWaitMs`) — a clean textual merge onto `b0cd50c0` had left it unfloored.
process.md Session 4. Merged into #509 / #511 / #512.


1. **Merge** is gated on the mainnet matrix (plan.md § Verification). Relayer acceptance of a 7702 batch
   hash is now **proven** on Base, both through the client relay (`0xa289…1775`, relayed upgrade tx) and
   through backend `POST /swaps/submit-tx` (self-call `0x3c06…cde9` and relayed `0xee1b…7e8c`, both
   `solved`, 0 retries); native `not-required` path `0x2f8b…363d` also `solved`. process.md Session 3. The rest of the matrix (other wallets/chains, fallback, rejections) is still open.

## Next action

Work `plan.md` § Implementation in commit order (11 commits). Tick them off here as they land.

| # | Commit | State |
| - | ------ | ----- |
| 1 | types: optional EIP-5792 methods | `2c67bc83` |
| 2 | wallet-sdk-core: EvmWalletProvider batches | `80599e5e` |
| 3 | sdk: summarizeSwapStatus + srcTxHash on post-broadcast errors | `c944f535` |
| 4 | docs(dapp-kit): useDetailedStatus as the status read | `7c7b68e0` |
| 5 | sdk: deprecated SwapService useBackendSubmitTx override | `9c2bcb33` |
| 6 | sdk: extract completeSwap (now awaits the fallback inside swap()'s guard) | `e9f8744b` |
| 7 | sdk: getApprovalStrategy + swapWithApproval | `ac929426` |
| 8 | dapp-kit: useSwapApprovalStrategy + useSwapWithApproval | `96137e3c` |
| 9 | dapp-kit: useSwapLifecycle | `5730b9db` |
| 10 | demo: swaps-sdk status from useDetailedStatus | `ac35612c` |
| 11 | demo: SwapCard on useSwapLifecycle | `7c7b9533` |

Node 24 for the hook: `. <scratchpad>/env.sh` (downloaded v24.21.0 + corepack pnpm wrapper); recreate if the scratchpad is gone.

## Settled — do not re-litigate

1. `supported` **and** `ready` are batch-capable; `forceAtomic: true`; 4001/5750 → `USER_REJECTED`,
   no fallback after a batch send attempt (user, 2026-10-07). A wallet that reports atomic support and then
   fails `sendCalls` is a wallet bug, not a risk to carry (user, 2026-10-14).
2. PR shape (user, 2026-10-07, after two reversals): **#329 alone; #328 + #302 + lifecycle together**,
   so the user tests status and batching in one pass.
3. No viem bump — 2.29.2 already ships stable 5792 actions.
4. No new error code (repo rule) — detail in `error.context`.
5. Batch on EVM spokes only; Sonic hub stays sequential in v1.
6. Public SDK surface: `getApprovalStrategy` + `swapWithApproval` only.
7. Bridge's identical ctor-param gap (#329) is out of scope — mention in the PR.
8. The deprecated `swapsOptions` / `bridgeOptions` / `SwapsClientOptions` / `BridgeClientOptions` (and the
   `SwapServiceConstructorParams.useBackendSubmitTx` field) are **removed in v3** — confirmed by the user
   2026-10-07 after claude[bot] on #503 asked for a source for "removed in v3". Keep that wording.
9. Declined smart-account upgrade (user, 2026-10-08): the SDK only offers `allowAccountUpgrade` (default
   `true`; `false` keeps a `ready` wallet sequential, `supported` still batches) and tags 5750 with
   `context.reason: ACCOUNT_UPGRADE_DECLINED`. Forcing the upgrade or remembering the choice is the
   **frontend's** job — dapp-kit stores nothing. Commit `5f4d1574`.
10. No breaking of existing logic (user, 2026-10-08): fixes stay inside the new API (`swapWithApproval`,
   `waitForBatch`, `useSwapLifecycle`). The one existing-behaviour delta is `swap()` returning `UNKNOWN`
   instead of rejecting when the fallback path throws — kept, called out in the PR body.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What do I build, in what order, with which signatures, tests, verification? | `plan.md` (use `rg -n "^#" plan.md`) | 5.3k |
| The three issue bodies + added scope | `issue.md` | 0.9k |
| What already shipped, the gaps found, raw facts behind the decisions | `process.md` | 1.6k |
| What shipped, commit by commit; deviations; draft PR body + issue comments; follow-up issues #505-#507 | `outcome.md` | 2.8k |

## Landmines

- Commit with **Node 24** on PATH (Node 26 breaks the pre-commit hook; corepack pnpm shebang).
- dapp-kit resolves `@sodax/sdk` from `dist/` — rebuild the sdk before dapp-kit `checkTs`.
- `SwapService.test.ts` module-level `sodax` is pinned `useBackendSubmitTx: false` — keep it.
- Demo env-pinned orders keep `SolverLiveCard` on purpose (gh-452) — don't "unify" them away.
- `main` has Biome drift — format only touched files, never a blanket `pnpm pretty`.
- dapp-kit invalidations live in `onSuccess` only (`shared/types.ts` convention) — not `onSettled`.
- dapp-kit composite-hook tests call the hook as a plain function with sub-hooks mocked — so
  `useSwapLifecycle` holds no React state beyond one `useRef` (the `next()` in-flight guard), which the
  test mocks via `vi.mock('react')`. Adding real state means those tests need a renderer.
- `summarizeSwapStatus` drops non-hex hashes — test fixtures need real hex (`'0xfill'` is not).
- A cancelled intent polls forever in `useDetailedStatus` (solver stays at 2); tracked as #520, not #504 — process.md 2026-10-14.
