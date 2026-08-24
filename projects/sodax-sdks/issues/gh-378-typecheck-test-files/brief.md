---
type: brief
repo: sodax-sdks
github: 378
status: Active
next: await review on PR #395 (now whole-repo scope); on merge fill outcome.md and set status Done
updated: 2026-08-24
---

# GH-378 Typecheck Test Files · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- **PR open: https://github.com/icon-project/sodax-sdks/pull/395**, retitled `test: typecheck .test files in every package` — 5 commits (head 2c40b3043), `no-changeset` label, CI green through commit 4; commit 5 CI pending at last check.
- ALL five packages now typecheck tests: sdk (138 errors fixed + 153-cast sweep) and types/swaps-api/dapp-kit/wallet-sdk-react (74 errors fixed; types via `tsconfig.check.json` since its tsc emits dist).
- Shared guard `scripts/check-tests-typechecked.mjs` (repo root) wired into all five `checkTs` scripts: test-in-program assert + `as unknown as` why-comment ratchet with per-package shrink-only baselines.
- 7-agent audit of the sdk half: 0 blockers/should-fix. Zero new escape hatches anywhere in the diff.
- Follow-ups flagged in the PR body (not tracker issues): GetAddressType wart, swaps-api schema factory generics, wallet-sdk-react chainRegistry keying.

## Next action

Await review on PR #395. On merge: fill `outcome.md`, set `status: Done` here. The PR body already carries the two out-of-scope notes (GetAddressType wart, sibling packages' exclude-gap).

## Map

| Question | File |
| --- | --- |
| What does the issue ask / what's in scope? | `issue.md` |
| How were the 138 errors clustered and fixed? | `plan.md` (plan) + `process.md` (root causes found) |
| What happened during the session, incidents included? | `process.md` |
| Final result | `outcome.md` (fill when PR lands) |

## Constraints that bite

- No `any` / `@ts-ignore` / `!` / cast-to-silence (AGENTS.md). Never run repo-wide biome/pretty. Never run `test:e2e` (live mainnet).
- Commit only when user asks; no `#378` in the commit message; no AI attribution.
