---
type: outcome
repo: sodax-sdks
github: 251
status: Blocked — unchanged since 2026-07-24; no action taken, on purpose
updated: 2026-08-12
---

# Outcome

- PR: none of mine. The subject is #95 (open, unreviewed).
- Commits: none
- Tests: n/a

## Summary

Correctly parked. The 2026-07-24 blocker — the solver has not been deployed anywhere — still
holds, Aleo has not reached `main` by any other route, and PR #95 has had **zero formal
reviews** and no new commits since 2026-07-27.

Reviewing 85 files against a solver that does not exist would have to be redone, so the
per-feature checklist stays unstarted.

## What Changed

Nothing.

## Follow-ups

- Restart when the solver is deployed, or if the author asks for a narrower slice that does not
  need one (the bech32m codec and u64 bounds are self-contained and reviewable today).
- Two things are already on record and should not be rediscovered: a **High** from the
  2026-07-27 dual-agent review — `SpokeService.ts:473`, `resolveSimulationEncoding` has no Aleo
  branch, so Aleo deposits fail default preflight simulation — and an earlier run reporting the
  `wallet-sdk-core` DTS build and the `wallet-sdk-react` type-check failing.
- Worth someone asking upstream whether #95 is still intended to land at all. It has been open
  since 2026-05-12, is 28 commits behind `main`, and the diff keeps growing.
