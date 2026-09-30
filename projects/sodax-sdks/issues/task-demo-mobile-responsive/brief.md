---
type: brief
repo: sodax-sdks
github: 
status: Active
next: push branch + open PR once the user says go
updated: 2026-09-30
---

# Demo Mobile Responsive · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- `sodax-sdks` `fix/demo-mobile-responsive` @ `7711e93b` (one signed commit, 52 files,
  hook green on Node 24). Not pushed.
- Mobile/tablet: 0/104 page loads overflow (with and without a stubbed wallet);
  `main` overflows on every route at 360/390/768.
- Desktop 1280/1440 pixel diff vs `main` (replayed network): identical except live
  data (one LTV digit, one balance, one icon load).
- Tooltips open on tap; mouse behaviour unchanged. Results table in `outcome.md`.

## Blocked on

1. Push + PR: waiting for the user's go-ahead (outward-facing).

## Next action

On the user's go-ahead: `git push -u origin fix/demo-mobile-responsive` in
`sodax-sdks`, then `gh pr create` with the body built from `outcome.md` (title
`fix(demo): make every demo page usable on phones`; demo-only, so Docs Drift passes
without a label).

## Settled — do not re-litigate

- Header on phones: compact labels (`max-sm:sr-only`), not two rows or a menu move.
- Money-market tables scroll sideways (`min-w-[56rem]`), no card layout.
- ⓘ tooltips open on tap (in `ui/tooltip.tsx`, touch only).
- `ui/*` never gets `a sm:b` pairs (tailwind-merge variant trap).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What was planned, per-file line list | `plan.md` (Appendix) | 6.3k |
| What was found / changed vs plan | `process.md` | 1.6k |
| Result, verification table, follow-ups | `outcome.md` | 0.8k |
| Harness scripts, key screenshots | `artifacts/` | — |

## Landmines

- The main `sodax-sdks` checkout was on merged `fix/460…`; this branch was cut from a
  fresh `origin/main`, upstream unset (push with `-u origin fix/demo-mobile-responsive`).
- Commits need Node 24 (pre-commit runs checkTs/build/test; Node 26 breaks
  wallet-sdk-react tests).
