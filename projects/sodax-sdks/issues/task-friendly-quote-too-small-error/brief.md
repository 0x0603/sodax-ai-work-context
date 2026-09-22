---
type: brief
repo: sodax-sdks
github: 471
status: Active
next: PR 478 review — CI, then merge
updated: 2026-09-22
---

# Friendly Quote Too Small Error · brief

## State in five lines

Committed as `43481bf6` on `feat/quote-too-small-refusal` and opened as
**PR icon-project/sodax-sdks#478** (2026-09-22), closing #471. `origin/main`
(`ae857f57`) merged in as `13114054`, no conflicts; GitHub reports MERGEABLE.
SDK predicate `isAmountTooSmallRefusal` + 7 tests; demo shows friendly copy on
both swap pages; docs/skills updated at source and regenerated. All gates
re-run green on the merged tree (checkTs, build, test 2869, check:docs-pages,
check:doc-links, check:docs-nav, check:ai). Production web not touched.

## Next action

Watch PR 478's CI and review. Then a follow-up in `sodax-frontend` to use the
predicate on the swap page (`outcome.md` § Follow-ups).

## Settled — do not re-litigate

- Classification in the SDK, wording in the client. No copy in the SDK.
- Match on the message, not `detail.code` (`-1` is shared with "no path").
- No new `SolverIntentErrorCode` member for this: the solver does not send one.
- Floor is $1, measured on the live solver (see `process.md`). Demo copy names it:
  "Swap value must be at least $1. Increase to continue." (user's wording).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Why SDK vs client, what was built | `plan.md` | 0.5k |
| Where the error comes from, shapes it takes | `issue.md` | 0.5k |
| Gotchas hit (generated docs, dist re-export) | `process.md` | 0.4k |
| Files changed, follow-ups | `outcome.md` | 0.4k |

## Landmines

- `docs/developers/**` pages for swaps and solver endpoints are generated; edit
  `packages/sdk/docs/*.md` and run `pnpm docs:sync-pages`.
