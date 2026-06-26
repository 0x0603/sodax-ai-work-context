---
type: outcome
repo: sodax-sdks
github: 1417
status: Active
tags: [swaps-api, sdk, context-migration]
updated: 2026-06-26
related_decisions: [0001-swaps-api-throwing-minimal]
---

# Outcome

- PR:
- Commits:
- Tests:
  - Context migration reviewed manually.

## Summary

The issue context has been moved out of the SDK repo's gitignored
`.claude/docs/` folder and into the synced context repo.

The architecture is now locked (ADR `0001-swaps-api-throwing-minimal`): a single
throwing `SwapsApi implements ISwapsApiV2`, depending only on `@sodax/types` +
`valibot`, responses validated, standalone (no SDK migration in this issue).

Implementation of `@sodax/swaps-api` is not complete yet. This workspace now
contains the issue context, locked decisions, and implementation plan needed to
continue the task from any synced machine.

## What Changed

- Created `projects/sodax-sdks/issues/gh-1417-swaps-api-sdk/`.
- Split the prior monolithic planning note into:
  - `issue.md`
  - `plan.md`
  - `process.md`
  - `outcome.md`
- Preserved source references, open questions, implementation steps, testing
  strategy, and definition of done.

## Follow-ups

- Architecture decisions resolved (see ADR `0001`); a courtesy heads-up to Robi
  on the throwing-only / standalone direction is optional, not blocking.
- Deferred: get real staging/production base URLs from Robi before the e2e
  smoke test of `apps/swap-api-example`.
- Start implementation in `sodax-sdks` (see `plan.md` Implementation Steps).
- Separate follow-up (out of scope here): migrate `@sodax/sdk` `SwapService` /
  `PartnerFeeClaimService` from v1 `SolverApiService` to v2 swaps-api, gated on
  backend v2 parity.
- Update `process.md` as implementation proceeds.
- Update `outcome.md` with PR, commits, tests, and final status when complete.
