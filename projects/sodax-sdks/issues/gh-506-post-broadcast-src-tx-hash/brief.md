---
type: brief
repo: sodax-sdks
github: 506
status: In review — PR #509 (stacked on #504)
next: Retarget PR #509 to main once #504 merges (merge main in, never rebase)
updated: 2026-10-15
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

0. 2026-10-14: merge of `origin/feat/302-swap-lifecycle` (`d2cc44f7`, the batch resume fix) is pushed as merge
   `f9074802` (worktree `../sodax-sdks-509`) — no conflicts, gates green. Origin had been rebased onto `b0cd50c0` elsewhere;
   the local branch was reset to it (the two local commits were identical patches).

1. **Merge** waits on #504 (draft, mainnet matrix pending). PR base should be
   `feat/302-swap-lifecycle` until #504 lands, then retarget to `main` (merge, never rebase).

## Review 6169002449 (R0bi7 dual-agent, on `62735054`) — fixed in `d9cc138d`, pushed 2026-10-15

Both findings valid (docs gaps, not fund loss). Bridge `TX_SUBMIT_FAILED`: docs now say resubmit the same tx with
`submitTransaction` when no packet ever shows (EVM needs only the hash; Solana/Bitcoin need `relayData`, not
exposed — deliberately, no API for that rare case). Post-execution failures now carry `dstTxHash` (hub tx) in
`vaultSwap` and in `swap()` (fallback + resume) so `notifySolver` / `postExecution` can be retried; docs + skills
say so. Swap was included on purpose (same gap, user OK'd 2026-10-15). sdk 3003 tests, checkTs, check:ai,
doc gates, Biome green.

2026-10-15: #504 squash-merged to main as `5ee56ff8`; the branch was force-pushed elsewhere as main + `af88125b` +
`f30cbb9d` (PR base now `main`). `d9cc138d` sits on that. Local worktree was reset (`--keep`) onto it — the
touched files were identical between the old and new bases.

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
