---
type: brief
repo: sodax-sdks
github: 603
status: Active, follow-up pushed, waiting for CI and re-review
next: check CI on 9c41017c, then ask for a re-review (R0bi7-sodax-worker only reviewed f86cf06)
updated: 2026-11-08
tags: review, types, execution-mode
---

# PR 603 review (R0bi7, infer action result type from execution mode) · brief

## State

- gosodax/sodax-sdks#603 `feat/infer-raw-execution-mode` @ `aa3a72df`. The review was delivered as
  commits on 2026-11-06 (0x0603): the table-driven type test, the Bitcoin Bound-auth fix for a
  signed call that omits `raw`, the missing `= false` defaults, cast-free fixtures, changeset removed.
- PR body rewritten on 2026-11-08 to match `aa3a72df` (runtime Bitcoin change, both compile breaks,
  no changeset, CI on `aa3a72d`). Old body: none kept here.
- R0bi7-sodax-worker approved only `f86cf06`; the three later commits are unreviewed.
- Pushed 2026-11-08 as `202d9d04` (fix) + `f69552c3` (chore) + `9c41017c` (test: drop the per-service
  result-type copies), from worktree `repos/client/sodax-sdks/.claude/worktrees/603-infer-raw-execution-mode`
  on the first Mac. Detail in `process.md`.
  - `scripts/check-execution-mode.mjs` (+ `.test.mjs`): bans `raw === false` and requires `Raw = false`
    on public methods; tail of sdk `checkTs`, in `test:ci-scripts`, turbo `checkTs` inputs.
  - `PartnerFeeClaimService.setSwapPreference` + `SetSwapPreferenceAction`: `K extends HubChainKey` (result was `string` /
    every chain's raw tx because `K` has no inference site).
  - `Sodax.execution-mode.test.ts`: rows for `setSwapPreference` and the BALN lock actions.
  - `packages/sdk/AGENTS.md`: one Service Pattern bullet for dual-mode actions.
  - dapp-kit `useSetSwapPreference` + `UseSetSwapPreferenceVars`: `K extends HubChainKey`, same reason.
  - Verified: repo `checkTs`, `test:ci-scripts`, `check:ai`, `check:ai-dev-files`, sdk partner /
    migration / execution-mode vitest. The check fails on `main` (2 `raw === false`, many missing defaults).

## Next action

1. Check CI on `9c41017c` (CI on `f69552c3` was green; the body's Validation cites it plus local results on `9c41017c`).
2. Ask for a re-review on the new head; the user decides whether to trigger R0bi7-sodax-worker.

## Follow-ups (not in #603)

- Dropping `K` from `setSwapPreference` and its hook (like the sibling methods) breaks explicit type args.
- `packages/sdk/docs/STAKING.md` and skills `features/swap.md:50`, `features/recovery.md:16` restate
  signatures without `= false`.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| 2026-11-08 session: full-feature audit, guard design, verification | `process.md` | 1k |
| Original review: gates, mutations, coverage, edge cases, findings | `review.md` (read by `## ` section) | 7k |
| Proposed type test (now landed in `a6ebe164`) | `improved-type-tests.patch` | 5k |
| Missing `= false` defaults (now landed in `aa3a72df`) | `spoke-deposit-default.patch` | 0.8k |
| Cast-free fixture prototype (now landed in `aa3a72df`) | `cast-free-fixture-example.patch` | 0.6k |
