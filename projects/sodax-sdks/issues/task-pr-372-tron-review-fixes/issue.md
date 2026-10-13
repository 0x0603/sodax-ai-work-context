---
type: issue
repo: sodax-sdks
github: 
status: Active
tags: [tron, mpc-relay, review, merge]
updated: 2026-10-13
related_decisions: []
---

# PR 372 Tron review fixes

- Source: (no GitHub issue) — review comment on icon-project/sodax-sdks#372
  (https://github.com/icon-project/sodax-sdks/pull/372#issuecomment-6135932036)
- Started: 2026-10-13
- Related PR: icon-project/sodax-sdks#372 (`gcranju:feat/tron-spoke`, a fork PR, maintainer edits allowed)

## Problem

PR 372 (Tron spoke + MPC relay settlement, by gcranju) was CONFLICTING with main (101 commits
behind) and the Claude review requested changes:

1. Blocker: money-market hub branches skip `verifyTxHash`.
2. Blocker: `tronBase58ToHex` has no checksum / version / length validation.
3. Should-fix: `TronWalletProvider` has no unit tests.
4. Should-fix: Tron broadcast failure drops the deterministic `txID`.

## Context

The user asked to resolve the conflict and address the feedback directly on the PR branch, but
chose **no commits** — work is left in a local worktree for review.
