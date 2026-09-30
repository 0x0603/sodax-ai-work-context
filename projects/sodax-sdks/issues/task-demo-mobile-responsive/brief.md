---
type: brief
repo: sodax-sdks
github: 
status: Active
next: watch CI and review on PR #494
updated: 2026-09-30
---

# Demo Mobile Responsive · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- PR https://github.com/icon-project/sodax-sdks/pull/494 — `fix/demo-mobile-responsive`
  @ `f6e516ad` (rebased onto `origin/main` 9377dd46; one signed commit, 52 files).
- Mobile/tablet: 0/104 page loads overflow (with and without a stubbed wallet);
  `main` overflows on every route at 360/390/768.
- Desktop 1280/1440 pixel diff vs `main` (replayed network): identical except live
  data (one LTV digit, one balance, one icon load).
- Tooltips open on tap; mouse behaviour unchanged. Results table in `outcome.md`.

## Blocked on

Nothing.

## Next action

Watch PR #494 CI (`gh pr checks 494 --repo icon-project/sodax-sdks`) and answer review.
Open PRs #483/#478/#372/#486 touch the same demo files; whichever merges second rebases.

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
