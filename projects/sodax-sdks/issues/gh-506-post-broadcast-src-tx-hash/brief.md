---
type: brief
repo: sodax-sdks
github: 506
status: In review — PR #509 (stacked on #504)
next: Retarget PR #509 to main once #504 merges (merge main in, never rebase)
updated: 2026-10-12
tags: [bridge, leverage-yield, errors, detailed-status]
related_issues: [gh-302, gh-505, gh-507]
---

# GH-506 Post Broadcast Src Tx Hash · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

PR #509, commits `2ec0db1d` + `b33f91f9` (review doc fixes) on `feat/506-post-broadcast-src-tx-hash`, cut from #504's head
`ab1ec388`, base `feat/302-swap-lifecycle`. `fallbackBridgeSteps` and `fallbackVaultSwapSteps` now put `srcTxHash` +
`srcChainKey` on verify / relay / solver errors; tests; BRIDGE.md, LEVERAGE_YIELD.md (+ generated
`docs/` copies) and sdk + dapp-kit skills. All local gates green (process.md Session 1).

## Blocked on

1. **Merge** waits on #504 (draft, mainnet matrix pending). PR base should be
   `feat/302-swap-lifecycle` until #504 lands, then retarget to `main` (merge, never rebase).

## Next action

Review on PR #509. When #504 merges: merge `main` into this branch and retarget the PR to `main`
(GitHub only auto-closes #506 from a PR into the default branch).

## Settled — do not re-litigate

1. Scope = the two fallback step methods only. The outer `catch` in `bridge()` / `vaultSwap()`
   stays hash-less, same as #504's `swap()`.
2. `summarizeSwapStatus` is documented for leverage yield, not aliased.
3. Leverage positions out of scope (issue says so).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The issue body, done-when | `issue.md` | 0.4k |
| What was done, gates, corrected claims | `process.md` | 0.8k |

## Landmines

- A stale local checkout misled the first chat answers (leverage-yield backend default, missing
  `getDetailedStatus`). Read `origin/main` / the branch, not whatever is checked out.
- `pnpm checkTs` in sdk shows fake errors in #504 files until `@sodax/types` is rebuilt.
