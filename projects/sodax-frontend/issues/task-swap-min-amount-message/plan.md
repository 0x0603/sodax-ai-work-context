---
type: plan
repo: sodax-frontend
github: 1869
updated: 2026-09-18
---

# Plan

## Goal

Tell the user the $1 floor on `/swap`, from the input when the price is known and
from the quote error otherwise.

## Approach

Error only. `isAmountTooSmallQuoteError(error)` in `apps/web/lib/swap-quote-error.ts`
walks `message` / `detail.message` / `context.body.message` /
`context.solverDetail.message` and a bounded `cause` chain. Code `-1` cannot be
used alone: the solver sends it for every refusal. A price × amount pre-check was
built first and dropped on the user's call: a floor change on the backend must not
need a client change.

Placement per the designer: the button keeps its "Quote unavailable" state and the
message replaces the support card on the line below it, in the support line's
text style.

## Steps

- `_constants/swap-messages.ts`: `MIN_SWAP_USD = 1`, `SWAP_AMOUNT_TOO_SMALL_MESSAGE`.
- `lib/swap-quote-error.ts`: `isAmountTooSmallQuoteError`.
- `page.tsx`: `isAmountTooSmall` flag and the line below the button.

## Verification

Biome on changed files; `pnpm checkTs` in `apps/web` (only the known pre-existing
stale `.next/types` + `isRealWorldAsset` errors remain). No test suite in this repo.

## Risks

- Swap once the SDK ships `isAmountTooSmallRefusal`: replace the local copy.
