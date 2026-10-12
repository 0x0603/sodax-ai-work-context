---
type: brief
repo: sodax-sdks
github: 507
status: In review — PR #512 (base feat/505-api-lane-batch-approval), commit 6ed8448e
next: Mainnet rows on the demo preview (PR #512 body); retarget after #511 merges (merge, never rebase)
updated: 2026-10-12
tags: [eip-5792, atomic-batch, bridge, leverage-yield, dapp-kit, demo]
related_issues: [gh-505, gh-302, gh-506]
---

# GH-507 Bridge + vault batch approval · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

**PR #512**, one commit `6ed8448e` on `feat/507-bridge-vault-batch-approval`, cut from PR #511's commit `67bd317a`.
SDK: `bridgeWithApproval` / `getApprovalStrategy` (bridge), `vaultSwapWithApproval` / `getApprovalStrategy`
(leverage yield, own spender, withdraw → not-required), `completeBridge` / `completeVaultSwap` split out,
`confirmApproval` + `ApprovalStrategyError` moved into `approvalBatch.ts`. Four dapp-kit hooks; demo
bridge dialog + LY deposit on one button with an unconfirmed-batch hold. Docs + skills. Detail: process.md.

## Blocked on

1. gh-505 § A1/A2 (the helper this PR reuses).
2. **Merge** waits on #504 and PR A.

## Next action

`plan.md` § B1 — extract `completeBridge` (`BridgeService.bridge()` L517-531) and `completeVaultSwap`
(`LeverageYieldService.vaultSwap()` L1256-1275); existing tests unchanged.

## Settled — do not re-litigate

1. Leverage yield resolves the swap spender itself (hub → `solver.intentsContract`, EVM spoke →
   `assetManager`) and calls `SpokeService` directly — no `SwapService` dependency, never `swapWithApproval`.
2. "New error codes" = per-method unions (`BridgeWithApprovalErrorCode`, …) — both codes already exist
   in the broad feature unions; nothing added to the global code list.
3. Withdraw (`hubWalletSwap`) → `'not-required'`. Hub-side `LeverageYieldService.approve`, leverage
   positions, API lanes, money market are out of scope.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Decisions, steps B1–B6, verification | `plan.md` (use `rg -n "^#" plan.md`) | 2.2k |
| Shared context + the helper this PR reuses (A1/A2) | `../gh-505-api-lane-batch-approval/plan.md` | 2.8k |
| The issue body | `issue.md` | 0.5k |

## Landmines

- PR #509 (gh-506) also edits `BRIDGE.md` / `LEVERAGE_YIELD.md` and the bridge/vault fallback steps.
  B1 only moves the code around them, but expect doc merges when `main` comes in.
- Bridge `isAllowanceValid` on the hub uses `getUserRouter` while `approve` uses
  `getUserHubWalletAddress` (`BridgeService.test.ts:1351` asserts they agree) — hub is sequential anyway.
- PR #501 (R0bi7) rewrites the leverage-yield demo page — B5 keeps the LY demo edit minimal and names #501; port into its `useFlows.ts` if it merges first. Do not comment on #501.
- Raw creation is safe before the approval lands: raw EVM deposit only builds the tx (`EvmSpokeService.ts:157-175`); SDK simulation is hub-side (`SpokeService.ts:604-627`).
