---
type: brief
repo: sodax-sdks
github: 
status: Active
next: real-phone check on the Vercel preview, then review on PR #494
updated: 2026-09-30
---

# Demo Mobile Responsive · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- PR https://github.com/icon-project/sodax-sdks/pull/494 — `fix/demo-mobile-responsive`
  @ `33dbba28`: `f6e516ad` responsive fix (52 files), then `591077c8` Staking/Dex and
  `33dbba28` Oracle moved under More (user requests 2026-09-30). All signed, on
  `origin/main` 9377dd46. Top level: Money Market, Swaps, Bridge, Leverage Yield, More.
  `cd4ab4bf` polish: swap balance font/label, partner-fee contrast, leverage-yield-api
  spacing, no nested table scroll on phones. `42720626` token picker no longer clipped
  under wide triggers; header fits 320px. Verified 320px on every route plus the
  reachable dialogs/menus (`artifacts/harness/extra.mjs`).
- Mobile/tablet: 0/104 page loads overflow (with and without a stubbed wallet);
  `main` overflows on every route at 360/390/768.
- Desktop 1280/1440 pixel diff vs `main` (replayed network): identical except live
  data (one LTV digit, one balance, one icon load).
- Tooltips open on tap; mouse behaviour unchanged. Results table in `outcome.md`.

## Blocked on

Nothing.

## Next action

CI on PR #494 is all green (Build and Test, E2E advisory, AI drift, Docs site,
security scans). Preview: https://sodax-frontend-demo-v2-git-fix-demo-mobi-18c3c6-icon-foundation.vercel.app
— next is a real-phone pass with a wallet, then review.
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
