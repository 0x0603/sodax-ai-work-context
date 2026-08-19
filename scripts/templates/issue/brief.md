---
type: brief
repo: __REPO__
github: __GITHUB__
status: Active
next:
updated: __DATE__
---

# __HEADING__ · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

Keep it under ~80 lines. It is a router plus the current state — not a summary of
the other files. If a section here starts explaining something, that explanation
belongs in `plan.md` or a knowledge note, and this file should link to it.

## State in five lines

<!-- Where the work actually stands. What exists in the real repo, what doesn't. -->

## Blocked on

<!-- Numbered. Each one: what is blocked, who/what unblocks it. Delete if nothing is. -->

## Next action

<!-- One concrete thing. Name the file that already holds the material for it. -->

## Settled — do not re-litigate

<!-- Decisions that are closed, so a fresh agent does not reopen them. -->

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
|  | `plan.md` |  |
|  | `process.md` (index) |  |
|  | `outcome.md` |  |

<!-- ~tok ≈ bytes / 3800. Refresh with:
     for f in *.md; do printf "%5.1fk  %s\n" \
       "$(echo "scale=2; $(wc -c <"$f")/3800" | bc)" "$f"; done -->

## Landmines

<!-- Things that already burned someone: stale claims, branches not on default,
     notes that were wrong. Delete if none yet. -->
