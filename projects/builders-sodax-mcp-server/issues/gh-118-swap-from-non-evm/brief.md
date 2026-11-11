---
type: brief
repo: builders-sodax-mcp-server
github: 118
status: Active
next: user decides commit/push; then update the #118 issue body to the implemented design (plan.md) and open the PR (base feat/115-swap-from-hub)
related_issues: [79, 115, 117]
updated: 2026-11-11
---

# GH-118 Swap from non-EVM chains · brief

## State in five lines

- Split out of #115 on 2026-11-11 (user): Sonic ships in PR #117 first; non-EVM follows in one PR for all five
  families (NEAR, Stellar, Sui, Solana, Injective). Not a sub-issue of #79 (user asked).
- Out: Bitcoin (Bound trading wallet), Stacks (public key, post-conditions, SDK cancel bug), ICON (retired).
- Approach in the issue body: keep the Swaps API as builder and check its build per family at quote; track proves the
  swap on the hub after the relay (held quote, `IntentCreated` = quoted intent hash), Solana checks keccak(relayData)
  in the tx before submit. Differs from #79 D5 (a draft the user may adjust); the issue says why, the PR body repeats it
  for review.
- 2026-11-11: implemented, uncommitted, in worktree `.claude/worktrees/118-swap-from-non-evm` (branch
  feat/118-swap-from-non-evm off feat/115-swap-from-hub). 1119 unit + 37 contract tests green after the review round (canary), incl. a live
  Solana quote and real-deposit fixtures for all five families. Design differs from the issue body: see plan.md
  (local SDK build of the swap tx; payload-in-tx check before submit; no hub check, no held quote).
- Bug caught by the live test and fixed: toAddress defaulted to a non-EVM sender's address on an EVM destination.

## Blocked on

1. #117 (and #111 under it) merging before this PR can target development. Work goes ahead meanwhile.

## Next action

Review findings, then the issue body. Design and verified facts: `plan.md`; per-family research: `research.md`.

## Settled — do not re-litigate

- One PR for all five families, not one per family (user 2026-11-11).
- Bitcoin, Stacks, ICON out; README in #117 says so.
- Swaps API stays the builder (#79 D2/D3); the quote-time check of what the user signs stays.
- Decoders live in the MCP behind one interface per family, replaceable by an SDK helper later.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Scope, approach, per-family table, done-when | `issue.md` | 2k |
| What each family's tx, proof and cancel look like, with code refs; effort | `research.md` | 2k |
| Plan | `plan.md` | |
| History | `process.md` | |

- 2026-11-11: moved under the follow-up epic #119 ("Sodax MCP: agent-executable swaps (follow-up)"); #79 keeps phase 1 (#99, #103 stay there).
