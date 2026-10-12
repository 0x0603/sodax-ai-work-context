---
type: issue
repo: sodax-sdks
github: 506
status: Active
tags: [bridge, leverage-yield, errors, detailed-status, submit-tx]
updated: 2026-10-09
related_issues: [gh-302, gh-328]
related_decisions: []
---

# GH-506 Post Broadcast Src Tx Hash

- Source: https://github.com/icon-project/sodax-sdks/issues/506
- Started: 2026-10-09
- Related PR: #509 (base `feat/302-swap-lifecycle` until #504 merges)

## Problem

PR #504 makes `swap()` failures that happen after the source tx is on-chain (verify, relay,
postExecution) carry `context.srcTxHash` + `srcChainKey`, so a caller keeps polling
`getDetailedStatus` instead of reporting the swap lost. Bridge and leverage-yield vault swaps have
the same gap:

- `BridgeService.fallbackBridgeSteps`: `verifyFailed` and `mapRelayFailure` don't pass `srcTxHash`.
- `LeverageYieldService.fallbackVaultSwapSteps`: same for verify, relay and solver errors.

`summarizeSwapStatus` also works for `DetailedLeverageYieldStatus` (same shape) — document it or
add an alias.

## Done when

- Post-broadcast bridge and vault-swap errors include `srcTxHash` and `srcChainKey`; earlier errors
  don't.
- Tests, plus BRIDGE.md, LEVERAGE_YIELD.md and skills updated.

## Notes (from the issue)

Depends on #504. No mainnet test needed. Leverage positions out of scope.
