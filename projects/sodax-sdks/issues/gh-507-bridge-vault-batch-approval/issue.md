---
type: issue
repo: sodax-sdks
github: 507
status: Active
tags: [eip-5792, atomic-batch, bridge, leverage-yield, dapp-kit, demo]
updated: 2026-10-12
related_issues: [gh-302, gh-506, gh-505]
related_decisions: []
---

Source: https://github.com/icon-project/sodax-sdks/issues/507 (opened by the user as a #504 follow-up).
Started: 2026-10-12. Related PR: — (not opened yet).

Body verbatim:

## feat(sdk,dapp-kit,demo): approve + deposit in one signature for bridge and leverage-yield vaults

Follow-up to #302 / #504. #302 already planned to take the swap batching to bridge once it's proven.

Approvals are for the exact amount, so almost every ERC-20 bridge or vault deposit from an EVM spoke needs two signatures today. On the SDK lane this affects intents-whitelabel deposits (it needs to upgrade from 2.0.0-rc.12 first), the demo bridge dialog and leverage-yield page, and the leverage-yield starter.

## Plan

- Move the batch logic out of `SwapService` into a shared helper so swap, bridge and leverage yield use the same code.
- Bridge: split `completeBridge` out of `bridge()`, add `getApprovalStrategy` and `bridgeWithApproval`, add the new error codes, add dapp-kit hooks, and use one button in the demo dialog.
- Leverage yield: add `vaultSwapWithApproval` on top of `createVaultIntent({ raw: true })`. Don't reuse `swapWithApproval`: it would apply the swap fee and post to `/swaps/submit-tx` without the vault `operation`. Withdraws don't need an approval.
- Same rules as #504 (Sonic stays sequential, no fallback after the wallet has the batch).

## Done when

- [ ] Shared helper in place, existing swap tests pass unchanged
- [ ] `bridgeWithApproval` and `vaultSwapWithApproval` with tests and dapp-kit hooks
- [ ] Demo updated, checked on mainnet with MetaMask, docs and skills updated

## Notes

Depends on #504 and its mainnet test. Out of scope: leverage positions, the hub-side `LeverageYieldService.approve`, the API lanes (#505) and money market.
