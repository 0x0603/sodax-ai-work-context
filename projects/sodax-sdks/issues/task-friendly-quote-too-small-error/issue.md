---
type: issue
repo: sodax-sdks
github: 471
status: Active
tags: [swap, solver, quote, error-handling, demo]
updated: 2026-09-18
related_decisions: []
---

# Friendly Quote Too Small Error

- Source: icon-project/sodax-sdks#471 (parent; sub-issue sodax-frontend#1869) — teammate chat: "I wonder if we should just not
  quote below 1$ … and in the error message saying like: 'Quote too small'"
- Started: 2026-09-18
- Related PR:

## Problem

A swap quote below the solver's floor fails with the solver's raw body
`{ detail: { code: -1, message: "Input amount too low" } }`. The demo rendered
that text verbatim; the production web app (`sodax-frontend`) shows a generic
support card for every quote failure. Neither tells the user to raise the amount.

## Context

- `-1` is not a `SolverIntentErrorCode` member and is the same code the solver
  uses for a routing refusal ("No path was found"). Only the message
  distinguishes the two — see `packages/sdk/src/leverageYield/positionLegQuote.ts`
  (`isNoRouteRefusal`) and `sodax-backend/apps/swaps-api/src/api/swaps/error-mapper.ts`.
- The swaps-api backend relays the solver text as a 422
  `{ message: "Failed to get quote: Input amount too low", code: -1 }`; the SDK
  wraps it as `SodaxError('EXTERNAL_API_ERROR')` with the `SwapsApiError` on `cause`.
- The solver's floor is not in any repo. Measured 2026-09-18 on api.sodax.com with
  USDC → USDC (Solana hub asset): $1.00 refused, $1.01 quoted. So the floor is $1.

## Acceptance Criteria

- One SDK predicate recognises the refusal in every shape a quote can fail with.
- Both demo swap pages show friendly copy instead of the solver text.
- Docs and skills describe the check.

## Related

- Knowledge: none yet
- Decisions: none
