---
type: brief
repo: sodax-sdks
github: 603
status: Active, review written, not delivered
next: user decides how to deliver the #603 review (post a review only, or also push the type test to R0bi7's branch)
updated: 2026-11-05
tags: review, types, execution-mode
---

# PR 603 review (R0bi7, infer action result type from execution mode) · brief

## State

- gosodax/sodax-sdks#603 `feat/infer-raw-execution-mode` @ `f86cf06e` (unchanged on 2026-11-05), by R0bi7.
- Reviewed locally on 2026-11-05. Verdict: **approve with suggestions**. All gates pass on the head;
  nothing blocks the merge. Nothing posted, committed or pushed.
- The local review worktree `repos/client/sodax-sdks-wt-603-review` exists only on the first Mac.
  On another machine, rebuild from the PR head and `git apply` the patches here.

## Next action

Deliver the review. Two options, the user's call:

1. Post a PR review with the suggestions only.
2. Also push `improved-type-tests.patch` (and optionally `spoke-deposit-default.patch`) to R0bi7's
   branch. Pushing to a teammate's branch needs an explicit yes first, then a courtesy PR comment.

Keep the posted text terse: a few human lines, not the report structure.

## Suggestions to post (detail in `review.md`)

- The PR's own `expectTypeOf` assertions miss most regressions (§1, §2). The table-driven test in
  `improved-type-tests.patch` fails under every mutation tried and passes on the head.
- Two methods still lack the `= false` default: `SpokeService.deposit` / `verifyDepositSimulation`
  and `SonicSpokeService.createSwapIntent` (`spoke-deposit-default.patch`).
- An undisclosed compile break: an inline ternary argument whose signed branch omits `raw` fails
  with TS2345 (§5). Add it to the PR body next to the disclosed TS2352 one. `!` is the maintainer's call.
- `.changeset/infer-execution-mode-result.md` does nothing; changesets are dead machinery (§5).
- `packages/skills` still says omitting `raw` is a compile error (§7 lists the lines).
- The 18 `as unknown as` fixture casts are avoidable with per-mode helpers
  (`cast-free-fixture-example.patch`); follow-up scope, low (§6).
- Nit: unrelated Biome reformat hunks in `IconSpokeService.test.ts` and `SpokeService.test.ts`.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Full review: gates, mutations, coverage, edge cases, findings | `review.md` (read by `## ` section) | 7k |
| Proposed type test `Sodax.execution-mode.test.ts` | `improved-type-tests.patch` | 5k |
| Missing `= false` defaults + test row | `spoke-deposit-default.patch` | 0.8k |
| Cast-free fixture prototype | `cast-free-fixture-example.patch` | 0.6k |
