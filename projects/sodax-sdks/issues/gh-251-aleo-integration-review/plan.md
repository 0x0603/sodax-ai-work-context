---
type: plan
repo: sodax-sdks
github: 251
updated: 2026-08-12
---

# Plan

## Goal

Keep this correctly parked, and record enough state that the eventual review starts from
today's facts rather than re-deriving them.

## Why it stays blocked

Reviewing 85 files of spoke integration against a solver that has not been deployed anywhere
produces a review that has to be redone. The 2026-07-24 blocker still holds, and nothing on the
PR has changed it — see `process.md`.

## Restart conditions

Pick this up when **either**:

- the solver is deployed somewhere reviewable (the original blocker clears), **or**
- the PR author asks for a review on a specific, narrower slice that does not depend on a live
  solver — e.g. the bech32m address codec and u64 bounds, which are self-contained and testable.

When it restarts, the two findings already on record (below) are the starting point, not
something to rediscover.

## Verification

n/a.

## Risks

The diff keeps growing while it waits (+3776/−55 now vs +3678/−47 when the issue was written),
and the fork is 28 commits behind `main`. The longer it sits the larger the eventual review.
