---
type: brief
repo: sodax-sdks
github: 302
status: Active — implementing (plan approved 2026-10-07)
next: Step 8 of plan.md — useSwapApprovalStrategy + useSwapWithApproval in dapp-kit
updated: 2026-10-07
tags: [swap, dapp-kit, eip-5792, atomic-batch, detailed-status, submit-tx, lifecycle-hook]
related_issues: [gh-328, gh-329, gh-21, gh-208]
---

# GH-302 Swap Lifecycle · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

One PR in `sodax-sdks` closing #302 (EIP-5792 batch approve + create-intent), #328 (status tail) and
#329 (options tail), plus a new dapp-kit `useSwapLifecycle` and the demo `SwapCard` rebuilt on it.
#328/#329 cores already shipped in #371/#362 (R0bi7) — only their tails are in scope. Plan approved;
worktree `sodax-sdks-302`, branch `feat/302-swap-lifecycle` off `origin/main` @ `93f86c5d`.

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
| 8 | dapp-kit: useSwapApprovalStrategy + useSwapWithApproval | — |
| 9 | dapp-kit: useSwapLifecycle | — |
| 10 | demo: swaps-sdk status from useDetailedStatus | — |
| 11 | demo: SwapCard on useSwapLifecycle | — |

Node 24 for the hook: `. <scratchpad>/env.sh` (downloaded v24.21.0 + corepack pnpm wrapper); recreate if the scratchpad is gone.

## Settled — do not re-litigate

1. `supported` **and** `ready` are batch-capable; `forceAtomic: true`; 4001/5750 → `USER_REJECTED`,
   no fallback after a batch send attempt (user, 2026-10-07).
2. One PR for all three issues + the lifecycle hook (user).
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
| What shipped in this PR | `outcome.md` | — |

## Landmines

- Commit with **Node 24** on PATH (Node 26 breaks the pre-commit hook; corepack pnpm shebang).
- dapp-kit resolves `@sodax/sdk` from `dist/` — rebuild the sdk before dapp-kit `checkTs`.
- `SwapService.test.ts` module-level `sodax` is pinned `useBackendSubmitTx: false` — keep it.
- Demo env-pinned orders keep `SolverLiveCard` on purpose (gh-452) — don't "unify" them away.
- `main` has Biome drift — format only touched files, never a blanket `pnpm pretty`.
