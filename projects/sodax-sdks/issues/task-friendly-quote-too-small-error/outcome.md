---
type: outcome
repo: sodax-sdks
github: 471
status: In review
updated: 2026-09-22
---

# Outcome

- PR: icon-project/sodax-sdks#478 (closes #471)
- Commits: `43481bf6` on `feat/quote-too-small-refusal`, plus merge `13114054`
  bringing `origin/main` `ae857f57` in (no conflicts, incl. the three docs files
  both sides touched)
- Tests: `packages/sdk/src/swap/quoteRefusal.test.ts` — 7 passing

## Summary

`isAmountTooSmallRefusal` in `@sodax/sdk` recognises the solver's too-small
refusal across the raw solver response, the swaps-api 422 chain and plain
wrappers. Both demo swap pages show
"Swap value must be at least $1. Increase to continue." instead of the solver text;
the floor lives in one demo constant (`MIN_SWAP_USD`).

## What Changed

- `packages/sdk/src/swap/quoteRefusal.ts` (+ test), exported via `swap/index.ts`
- `apps/demo/src/lib/utils.ts`, `components/swaps/SwapCard.tsx`,
  `components/swaps-api/lib/swapsApi.ts`, `components/swaps-api/SwapCard.tsx`
- `packages/sdk/docs/SWAPS.md`, `SOLVER_API_ENDPOINTS.md` (+ regenerated `docs/`)
- `packages/skills/.../features/swap.md`, `dapp-kit/src/hooks/swap/useQuote.ts` remark

## Follow-ups

- `sodax-frontend` swap page: done separately with a local matcher, see
  `projects/sodax-frontend/issues/task-swap-min-amount-message/`; switch it to
  `isAmountTooSmallRefusal` once this SDK change is released.
- `apps/playground/src/lib/errors.ts` has a regex→copy table; add an entry if
  the playground should match.
