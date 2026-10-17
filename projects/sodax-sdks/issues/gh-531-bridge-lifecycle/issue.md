---
type: issue
repo: sodax-sdks
github: 531
status: Active
tags: [dapp-kit, bridge, eip-5792, lifecycle]
updated: 2026-10-16
related_decisions: []
---

# GH-531 useBridgeLifecycle

- Source: https://github.com/icon-project/sodax-sdks/issues/531
- Started: 2026-10-16
- Related PR: none yet (came from #512 review)

## Problem

`useBridgeWithApproval` (#512) returns raw results; the demo's bridge dialog (`BridgeDialog.tsx` + `BridgeManager.tsx`)
hand-writes the unconfirmed-batch hold, recheck (`resumeBatchId`), start over and no-upgrade retry. Missing the hold =
possible double deposit. Proposal: `useBridgeLifecycle` with `useSwapLifecycle`'s states and `next()`/`reset()`,
wrapping `useBridgeWithApproval` + `useBridgeApprovalStrategy` + Stellar/NEAR gates; the dialog is the first consumer.

## Context

## Acceptance Criteria

## Related

- Knowledge:
- Decisions:
