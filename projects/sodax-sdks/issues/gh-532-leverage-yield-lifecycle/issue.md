---
type: issue
repo: sodax-sdks
github: 532
status: Active
tags: [dapp-kit, leverage-yield, eip-5792, lifecycle]
updated: 2026-10-16
related_decisions: []
---

# GH-532 useLeverageYieldLifecycle

- Source: https://github.com/icon-project/sodax-sdks/issues/532
- Started: 2026-10-16
- Related PR: none yet (came from #512 review)

## Problem

Same gap as #531 for `useLeverageYieldVaultSwapWithApproval` (#512); the demo leverage-yield page has its own copy
(held batch in page state, unlike the bridge's parent state). Proposal: `useLeverageYieldLifecycle` wrapping the
vault-swap-with-approval, approval-strategy and detailed-status hooks; deposit and withdraw (withdraw never batches);
the page is the first consumer.

## Context

## Acceptance Criteria

## Related

- Knowledge:
- Decisions:
