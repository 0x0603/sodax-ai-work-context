---
type: issue
repo: sodax-sdks
github: 533
status: Active
tags: [sdk, leverage-yield, swap, approval, refactor]
updated: 2026-10-16
related_decisions: []
---

# GH-533 Share intent-deposit approval between swap and leverage yield

- Source: https://github.com/icon-project/sodax-sdks/issues/533
- Started: 2026-10-16
- Related PR: none yet (from #512 review)

## Problem

Three LY privates (`LeverageYieldService.ts:1613,1651,1670` at `407add8e`) near-copy `SwapService.ts:1255,1316,1405`.
Proposal: neutral helper beside `intentDepositSpender` returning raw spoke results; each service wraps errors.

## Context

## Acceptance Criteria

## Related

- Knowledge:
- Decisions:
