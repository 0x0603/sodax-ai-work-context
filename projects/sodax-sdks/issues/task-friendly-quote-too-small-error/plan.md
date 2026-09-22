---
type: plan
repo: sodax-sdks
github: 471
updated: 2026-09-18
---

# Plan

## Goal

Recognise the solver's "amount too small" refusal once, in the SDK, and let each
client render its own copy.

## Approach

SDK owns classification, client owns wording. The match must read the message
(the code is a shared `-1`), so it lives in one tested place rather than in every
UI. The SDK exposes no copy: the demo and the production web app phrase it
themselves.

## Steps

1. `packages/sdk/src/swap/quoteRefusal.ts` — `isAmountTooSmallRefusal(error)`,
   reading `detail.message`, `message`, `context.body.message`,
   `context.solverDetail.message` and a bounded `cause` chain; matches the current
   wording and the floated "Quote too small" rename. Exported from `swap/index.ts`.
2. Tests beside it covering raw solver response, backend 422 chain, solverDetail,
   the `-1` routing refusal (negative), non-errors, cause-depth bound.
3. `apps/demo`: `MIN_SWAP_USD`, `AMOUNT_TOO_SMALL_MESSAGE` + `formatSolverQuoteError` in
   `src/lib/utils.ts` (direct solver page), `formatSwapsApiQuoteError` in
   `components/swaps-api/lib/swapsApi.ts` (swaps-api page).
4. Docs at the generated pages' sources (`packages/sdk/docs/SWAPS.md`,
   `SOLVER_API_ENDPOINTS.md`) + `pnpm docs:sync-pages`; skills swap knowledge;
   `useQuote` remark.

## Verification

`vitest run src/swap/quoteRefusal.test.ts`, sdk `checkTs`, sdk build, demo
`checkTs`, biome on changed files, `check:docs-pages`, `check:doc-links`,
`check:docs-nav`, skills `check:ai`.

## Risks

- Solver wording changes: the regex names both known wordings; a third one
  falls back to the raw message, not a crash.
- Production web (`sodax-frontend`) still shows the generic support card; it
  needs its own change to use the predicate once this ships.
