---
type: brief
repo: builders-sodax-mcp-server
github: 118
status: Active
next: shared groundwork on branch feat/118-swap-from-non-evm (base feat/115-swap-from-hub): step shape per family, tx hash rule, held quote + hub check after relay
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
- No code yet. Worktree `.claude/worktrees/118-swap-from-non-evm` in the MCP submodule.

## Blocked on

1. #117 (and #111 under it) merging before this PR can target development. Work goes ahead meanwhile.

## Next action

Shared groundwork, see the issue's "Shared work" (`issue.md`). Per-family facts with SDK/backend/relay line refs are in
`research.md`.

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
