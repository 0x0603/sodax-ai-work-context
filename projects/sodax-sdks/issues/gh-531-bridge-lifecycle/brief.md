---
type: brief
repo: sodax-sdks
github: 531
status: Active — issue created 2026-10-16, no code; waits on #512
next: after #512 merges, design from useSwapLifecycle + the demo's hand-written copy
related_issues: [gh-532, gh-507, gh-529]
updated: 2026-10-16
---

# GH-531 useBridgeLifecycle · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

Keep it under ~80 lines. It is a router plus the current state — not a summary of
the other files. If a section here starts explaining something, that explanation
belongs in `plan.md` or a knowledge note, and this file should link to it.

## State in five lines

Issue #531 created 2026-10-16 from R0bi7's review 5539657046 on #512 (comment 4, hold state machine hand-rolled
per page). Plain-paragraph body, label enhancement, assignee 0x0603. Nothing in the repo yet.

## Blocked on

1. #512 (gh-507) must merge first.

## Next action

Wait for #512. Then read `useSwapLifecycle.ts` + `utils/swapLifecycle.ts` and the demo copy, write `plan.md`.

## Settled — do not re-litigate

1. Same state union and `next()`/`reset()` as `useSwapLifecycle`. 2. The demo UI is the first consumer in the same PR.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What and why | `issue.md` | 0.3k |
| Design (empty) | `plan.md` |  |
|  | `process.md` (index) |  |
|  | `outcome.md` |  |

<!-- ~tok ≈ bytes / 3800. Refresh with:
     for f in *.md; do printf "%5.1fk  %s\n" \
       "$(echo "scale=2; $(wc -c <"$f")/3800" | bc)" "$f"; done -->

## Landmines


