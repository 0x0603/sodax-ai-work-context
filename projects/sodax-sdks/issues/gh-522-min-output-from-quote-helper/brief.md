---
type: brief
repo: sodax-sdks
github: 522
status: Open — not started
next: Not started. Settle the helper's shape (name, Result vs throw, where it lives) before coding; call sites in issue.md
updated: 2026-10-15
tags: [swap, leverage-yield, slippage, min-output, sdk-helper]
related_issues: [gh-302]
---

# GH-522 Min Output From Quote Helper · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Opened 2026-10-15 at the user's ask, out of the gh-302 session (R0bi7's 0n-minimum review on #504). Nothing
built, no branch. Labels `enhancement`, assigned 0x0603. NOT in the "New World" project: the gh token lacks
the `project` scope (`gh auth refresh -s project`, then `gh issue edit 522 --add-project "New World"`).
Body/title updated the same day to propose two helpers (slippage parse + min output); see issue.md.
Also found, not filed (user's call): the playground sends `deadline: '0'`, which the backend treats as a
no-expiry limit order (`sodax-backend` swaps-api `shared/utils/utils.ts:80`).

## Settled — do not re-litigate

- Deliberately not linked to PR #504 (user: keep it out of that PR's history). Never write that PR's number or
  URL in this issue's thread, its PR body or its commits.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the issue asks, every copy of the math | `issue.md` | 0.5k |

## Landmines

- The call-site list was grepped on `origin/main` 2026-10-15. Re-grep before coding.
