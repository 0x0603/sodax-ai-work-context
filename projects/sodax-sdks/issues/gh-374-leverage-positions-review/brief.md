---
type: brief
repo: sodax-sdks
github: 374
status: Active
next: Decide useLegQuote.ts — its comment is proven wrong and now contradicts the shipped skill; then the two open audit items (minCollateralOut sanity, operatePosition arbitrary-calldata doc)
updated: 2026-09-12
tags: [leverage-positions, review, security-audit, solver, bitcoin, partner-fee]
---

# PR 374 Leverage Positions · review + audit · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Reviewing **PR 374** (`feat/leverage-positions`, author AntonAndell, OPEN, → `main`). Verdict was
**request-changes**: 1 blocker, 7 should-fix. Most have since been fixed on the branch — three commits
are mine, the rest the user's. Three mainnet positions were opened during review and all three
diagnosed; no funds lost. **Two audit items and one demo contradiction remain open.**

| Item | State |
| --- | --- |
| Review of PR 374 | done — findings in `plan.md` |
| Security audit (hack / fund loss) | done — no third-party theft path; 2 input-validation holes, 1 fixed |
| Docs + skills audit | done — 4 claimed gaps adjudicated down to 1 real edit, shipped |
| Mainnet debugging | done — see `process.md`, solver economics is the reusable part |

## The three things a resuming agent must not re-litigate

1. **`sodax.leverageYield.getQuote` WORKS for hub reserve pairs.** `useLegQuote.ts:15-19` claims it
   does not. That comment is wrong — verified three times independently, twice by running it. Two
   sub-agents that only *read* the code reached the wrong conclusion. Do not trust the comment.
2. **Bitcoin is now refused outright** by `openPosition` / `openPositionFromDebtToken` /
   `operatePosition`. That was a deliberate fail-closed choice, not an oversight — see `plan.md`
   §Finding A for what re-enabling it would require.
3. **The solver charges a flat ~$0.005 per fill, not a percentage.** Everything about why small
   positions fail follows from that one measurement. `process.md` §Solver economics.

## Next action

Pick one of the three open items in `outcome.md` §Still open. The `useLegQuote.ts` one is the most
urgent: the skill now tells partner agents to use the SDK method, while the reference demo still
hand-rolls a `fetch` and explains why with a false statement.

## File map — open ONE

| Question | File |
| --- | --- |
| What is the PR, what was the review scope, what did the bot review already say? | `issue.md` |
| What did the review and the security audit find, and what is fixed vs open? | `plan.md` |
| How did the mainnet positions behave, and why did the solver refuse them? | `process.md` |
| Which commits landed, what is still open, what would I do next? | `outcome.md` |

Repo state: branch is at `1fd72462`, tree clean, local == origin. `pnpm checkTs`, the full 2812-test
suite and the docs/skills gates were green at that commit.
