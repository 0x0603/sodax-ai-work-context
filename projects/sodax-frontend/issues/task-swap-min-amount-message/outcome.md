---
type: outcome
repo: sodax-frontend
github: 1869
status: In review
updated: 2026-09-18
---

# Outcome

- PR: icon-project/sodax-frontend#1870 (open, base `main`)
- Commits: `61e1d31f` feat(web): tell the user the $1 swap floor (amended once)
- Tests: none (repo has no test suite); Biome + checkTs run

## Summary

`/swap` shows "Swap value must be at least $1. Increase to continue" on the line
below the button when the solver refuses a quote as too small; the button stays
"Quote unavailable". Other quote failures keep the support card.

## What Changed

- New: `apps/web/lib/swap-quote-error.ts`
- Edited: `swap/_constants/swap-messages.ts`, `swap/page.tsx`
- Tree clean; PR carries the final version.

## Follow-ups

- When `@sodax/sdk` ships `isAmountTooSmallRefusal`, replace the local
  `isAmountTooSmallQuoteError` with it.
