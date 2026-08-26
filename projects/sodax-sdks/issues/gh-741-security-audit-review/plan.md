---
type: plan
repo: sodax-sdks
github: 741
updated: 2026-08-26
---

# Plan

## Goal

Review the 2026-08-22 AI-generated sodax-sdks security audit, judge its accuracy
and severity calibration against the current codebase, estimate fix effort, and
produce a sign-off with caveats. No code fixes in scope (review/sign-off only).

## Approach

Cross-check against a read-only export of origin/main (`75dec7011`), not by
trusting the audit's own verdicts. Fan out one verification agent per finding
cluster (deps, CI/supply-chain, blind-signing, Bound session, migration,
refutations, fund-flow, money-market/wallet, Low-understated), each required to
cite file:line and query OSV/npm where advisories are load-bearing. Judge every
finding three ways: code accuracy, severity (fair/overblown/understated), fix
effort in engineer-days.

## Steps (done)

1. Pulled issue + both report artifacts. Read audit structure, High + Medium
   sections, composition chains, scope/limitations.
2. Exported origin/main to a read-only tree; confirmed working tree is on a demo
   branch, so verification used the export.
3. Ran 10-agent verification workflow (`wf_e75878f8`). 6 finished first pass, 4
   died on a session limit and were resumed from cache after reset — all 10
   completed.
4. Synthesized into `outcome.md` (per-finding table + over/understatement lists +
   effort roadmap) and drafted the sign-off comment.

## Verification

- `rg "^github: 741"` in this repo resolves to this folder.
- Every claim in `review-comment.md` traces to a file:line row in `outcome.md`.
- Re-check any git-state claim against actual `origin/main` before the user posts.

## Risks

- Audit line numbers drift from post-audit refactors — verify by symbol.
- On-chain halves of the 3 refutations rely on sodax-contracts (not in this repo);
  they were corroborated from shipped ABIs only — flagged as "plausible, locally
  unverifiable" in outcome.md.
