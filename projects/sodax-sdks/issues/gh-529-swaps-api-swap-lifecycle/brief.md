---
type: brief
repo: sodax-sdks
github: 529
status: Active — issue created, no code; waits on #511 merging
next: after #511 merges, read the playground's per-family signing and write plan.md with an estimate
updated: 2026-10-16
---

# GH-529 useSwapsApiSwapLifecycle · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

Keep it under ~80 lines. It is a router plus the current state — not a summary of
the other files. If a section here starts explaining something, that explanation
belongs in `plan.md` or a knowledge note, and this file should link to it.

## State in five lines

Issue #529 created 2026-10-16 (label enhancement, assignee 0x0603). Nothing in the repo yet. A hook with
`useSwapLifecycle`'s state union + `next()`/`reset()` for the swaps-API lane. Source: issue.md.

## Blocked on

1. #511 (gh-505) must merge first: the hook builds on `useSwapsApiBroadcastWithApproval` and its
   `fallbackOnRefusal: false` default.

## Next action

Read `apps/playground/src/lib/execution.ts` (`broadcast`, `executeSwap`, `checkHeldBatch`) and decide the open
questions in issue #529, then write `plan.md`. No estimate before that (memory: verify approach before estimating).

## Settled — do not re-litigate

1. Separate hook, not a `lane` option on `useSwapLifecycle` (input, resume data, status source all differ).
2. Playground is the first consumer in the same PR — no API surface without a real caller.
3. Moving sodax.com onto it is a separate ticket.
4. Multi-chain from the start like `useSwapLifecycle` (user, 2026-10-16), not EVM-first. Signing goes through each
   family's wallet provider, moved from the playground's `broadcast`. Still open: Bitcoin (Bound trading wallet) and ICON.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the hook must do, open questions | `issue.md` | 0.6k |
| Design + estimate (empty) | `plan.md` |  |
|  | `process.md` (index) |  |
|  | `outcome.md` |  |

<!-- ~tok ≈ bytes / 3800. Refresh with:
     for f in *.md; do printf "%5.1fk  %s\n" \
       "$(echo "scale=2; $(wc -c <"$f")/3800" | bc)" "$f"; done -->

## Landmines


