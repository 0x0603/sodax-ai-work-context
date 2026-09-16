---
type: issue
repo: sodax-sdks
github: 450
status: Active
tags: [leverage-yield, manual-test, demo, backend-api]
updated: 2026-09-16
related_decisions: []
related_issues: [gh-256, gh-451, gh-452, gh-453, gh-325]
---

# #450 — test(leverage-yield): demo leverage yield api and sdk manual test

**State:** OPEN · assignee `0x0603` · created 2026-09-14 · no labels, no milestone, no comments.

## Body, verbatim

> Manually test feature (SDK and API demo flows)

That is the entire issue.

## What it actually means

Filed the same day #256 (*feat(sdks,demo): Leverage Yield API across SDK, dapp-kit & demo*) was
closed — #450 is the hindsight check on that delivery, and the input to #452.

The two "demo flows" are the two vault pages:

| Route | Nav label | Path |
| ----- | --------- | ---- |
| `/leverage-yield` | Leverage Yield (SDK) | `apps/demo/src/pages/leverage-yield/page.tsx` |
| `/leverage-yield-api` | Leverage Yield (API) | `apps/demo/src/pages/leverage-yield-api/page.tsx` + `components/leverage-yield-api/LeverageCard.tsx` |

## The acceptance bar, which is not in this issue

`sodax-backend/docs/leverage-yield-api-sdk-mapping.md` §Open items:

> ⏳ **Empirical P0 validation** of the deposit/withdraw submit-tx flow (see "Row shapes" above)
> — the trace is static. This is the one substantive item still owed: an EVM-spoke deposit, an
> EVM-spoke withdraw, and a split-tx (Solana/Bitcoin) withdraw, each end-to-end through
> `submit-tx → relay → postExecution → getStatus → solved`.

The backend traced those row shapes statically and explicitly flagged that the trace was never
run against a live chain. That is the deliverable.

## Sibling issues, all filed 2026-09-14

| # | Title | Relation |
| - | ----- | -------- |
| 451 | test(bridge): demo bridge api and sdk manual test | the same exercise for bridge |
| 452 | feat(leverage-yield): submit tx by default + api key | follows this; needs its findings |
| 453 | chore(bridge): submit tx + api key + detailed status | bridge counterpart of 452 |

Related: **#256** (closed, the delivery under test), **#325** (partnerFee missing from withdraw
params — **stale**, the field exists at `LeverageYieldService.ts:334-344`).

## Scope decision

Two vault pages only. `/leverage-positions` is out of scope: it shipped with #374, merged
2026-09-15 — *after* this issue was filed — and was already hand-tested during that review.
