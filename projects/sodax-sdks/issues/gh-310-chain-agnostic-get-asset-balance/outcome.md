---
type: outcome
repo: sodax-sdks
github: 310
status: Implemented (PR #311 open)
updated: 2026-07-24
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/311 (opened 2026-07-24, closes #310)
- Branch: `feat/chain-agnostic-get-asset-balance` (from `main`)
- Commits: `7e45a438` feat(sdk,dapp-kit,demo): chain agnostic get asset balance
- Tests: SDK 1723 pass (11 new); dapp-kit 362 pass (8 new); demo `checkTs` clean; skills `check:ai` green

## Summary

Shipped the chain-agnostic wallet-balance reader across all three layers. The core SDK now owns the
per-chain balance-read logic (`sodax.spoke.getWalletBalances`), dapp-kit exposes it as `useBalances`
(no wallet `xService`), and the demo reads balances through it. `useXBalances` and `wallet-sdk-react`
were left untouched (decision #3).

## What Changed

33 files (30 modified, 3 new):

- **sdk**: `spoke-types.ts` (+GetBalanceParams/GetBalancesParams), `SpokeService.ts` (router +
  `SpokeService.test.ts`), 10 per-chain services (Evm, Sonic, Solana, Sui, Stellar, Icon, Injective,
  Near, Stacks, Bitcoin) + `EvmSpokeService.test.ts` / `BitcoinSpokeService.test.ts` additions.
- **dapp-kit**: `useBalances.ts` + `useBalances.test.ts`, exported from `shared/index.ts`.
- **demo**: 9 call-sites → `useBalances` (`useSodaBalance`, swaps/swaps-api `SwapCard`, mm
  `SupplyModal`/`SupplyAssetsList`/`RepayModal`/`BorrowAssetsList`, dex `ManageLiquidity`,
  leverage-yield page) + `invalidateMmQueries.ts` comment + `swaps-api/lib/mappers.ts` comment.
- **skills**: `sodax-dapp-kit` docs (hooks-index, auxiliary-services, wallet-connectivity, SKILL.md).

Public API added: `sodax.spoke.getWalletBalance(params)` / `getWalletBalances(params)` and the
`useBalances` hook.

Verification run: `checkTs`, full test suites, `build:packages`, `check:ai`, and `biome lint` (0 new
errors vs `origin/main` — warnings are pre-existing).

## Follow-ups

- **Quality review:** see [`review.md`](./review.md) — adversarial multi-agent review, 18 raw → 14
  confirmed (all low/nit). Two clusters worth a future cleanup pass: (A) extractable fan-out
  duplication across 6 chain services; (B) error-handling parity — the new readers are mostly
  fail-loud vs the old resilient wallet-SDK path, and Stacks is inconsistent (still swallows → 0n).
  Decision this pass: record only, no code change.
- ~~Open the PR from the branch~~ — done: [#311](https://github.com/icon-project/sodax-sdks/pull/311),
  title `feat(sdk,dapp-kit,demo): chain agnostic get asset balance`, body from the commit message,
  `Closes #310`. Vercel preview deployed green; no human review yet.
- Manual QA: run the demo (`pnpm --filter sodax-demo-v2 dev`, :3000) and confirm balances render on
  swap / money-market / dex / leverage-yield for an EVM + at least one non-EVM wallet.
- Out-of-scope follow-up: make `wallet-sdk-react` `XService.getBalances` delegate to the SDK reader to
  remove the deliberate temporary duplication.
- Consider promoting the ICON `tryAggregate` multicall address into chain config (currently hardcoded,
  faithful to the wallet-sdk-react source).
