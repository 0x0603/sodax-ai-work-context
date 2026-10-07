---
type: brief
repo: sodax-sdks
github: 302
status: In review — PR #503 (#329) open; PR #504 (#328 + #302) open as draft
next: User runs the mainnet matrix on #504 (checklist in its body); fix the waitForBatch timeout gap before marking it ready
updated: 2026-10-07
tags: [swap, dapp-kit, eip-5792, atomic-batch, detailed-status, submit-tx, lifecycle-hook]
related_issues: [gh-328, gh-329, gh-21, gh-208]
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

1. **Merge** is gated on the mainnet matrix (plan.md § Verification): backend/relayer acceptance of a
   7702 batch tx hash is unverified. Code work is not blocked.

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
   no fallback after a batch send attempt (user, 2026-10-07).
2. PR shape (user, 2026-10-07, after two reversals): **#329 alone; #328 + #302 + lifecycle together**,
   so the user tests status and batching in one pass.
3. No viem bump — 2.29.2 already ships stable 5792 actions.
4. No new error code (repo rule) — detail in `error.context`.
5. Batch on EVM spokes only; Sonic hub stays sequential in v1.
6. Public SDK surface: `getApprovalStrategy` + `swapWithApproval` only.
7. Bridge's identical ctor-param gap (#329) is out of scope — mention in the PR.

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
  `useSwapLifecycle` holds **no React state**; keep it that way or those tests need a renderer.
- `summarizeSwapStatus` drops non-hex hashes — test fixtures need real hex (`'0xfill'` is not).
