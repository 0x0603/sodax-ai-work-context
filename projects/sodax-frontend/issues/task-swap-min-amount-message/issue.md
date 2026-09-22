---
type: issue
repo: sodax-frontend
github: 1869
status: Active
tags: [swap, solver, quote, error-handling]
updated: 2026-09-18
related_decisions: []
---

# Swap Min Amount Message

- Source: icon-project/sodax-frontend#1869, sub-issue of icon-project/sodax-sdks#471
  (parent for the whole theme; the SDK side is `task-friendly-quote-too-small-error`).
- Started: 2026-09-18
- Related PR: icon-project/sodax-frontend#1870

## Problem

On `/swap`, an input worth less than $1 makes the solver refuse the quote
(`Input amount too low`, code `-1`). The page showed "Quote unavailable" on the
button and a generic "Need help?" support card, neither of which says what to do.

## Context

- `apps/web` pins `@sodax/* 2.2.0-rc.3` from npm, so the SDK helper added in
  `sodax-sdks` (`isAmountTooSmallRefusal`) is not available here yet. The
  frontend carries its own copy of the message match.
- Quote path: `useSwapsApiQuote` → backend 422
  `{ message: "Failed to get quote: Input amount too low", code: -1 }` →
  `SodaxError` with the `SwapsApiError` (body on `context.body`) as `cause`.
- `getTokenPrice` returns `0` for an unpriced token; the input check treats that
  as "unknown" and leaves the decision to the solver's refusal.

## Acceptance Criteria

- Input worth < $1 with a known price: button says
  "Swap value must be at least $1. Increase to continue", no quote is sent.
- Unpriced token or fee-adjusted edge: the solver refusal is mapped to the same
  message; the support card is not shown for it.
- Other quote failures keep "Quote unavailable" + support card.

## Related

- Knowledge: none
- Decisions: none
- Sibling: `projects/sodax-sdks/issues/task-friendly-quote-too-small-error/`
