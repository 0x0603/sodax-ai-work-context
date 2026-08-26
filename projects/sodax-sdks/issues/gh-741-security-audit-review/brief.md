---
type: brief
repo: sodax-sdks
github: 741
status: Active
next: User to post sign-off comment (draft in review-comment.md) or request fixes
updated: 2026-08-26
---

# GH-741 Security Audit Review · brief

## State in five lines

Reviewed the 2026-08-22 AI-generated security audit of sodax-sdks and cross-checked
the entire High + Medium tier (plus a Low spot-check) against origin/main
`75dec7011` via a 10-agent verification fan-out — every conclusion carries
file:line evidence. Verdict: **accurate, no fabricated findings, 0 Critical is
right, ready to sign off** with caveats. The "6 High" headline is intrinsic;
effective is 0 High / 15 Medium. Full assessment + per-finding table in
`outcome.md`; draft sign-off comment in `review-comment.md` (NOT posted).

## Blocked on

1. User decision: post the sign-off comment (draft ready) vs. hold. Nothing
   technical is blocking.

## Next action

Post the sign-off comment on ICON-Projects-Planning#741 — text ready in
`review-comment.md`. Only the user posts to GitHub (repo rule: no autonomous
commits/posts).

## Settled — do not re-litigate

- Audit is accurate; the disagreements are about severity *presentation* and
  *remediation difficulty*, not about whether the code says what the audit says.
- No attacker-reachable fund-loss; 0 Critical stands. Do not re-hunt for a
  Critical.
- shell-quote, react-router, and 2/3 ICON-relay copies are ALREADY fixed on main
  — do not re-triage them as open.
- The dossier lives under `projects/sodax-sdks/` even though the GitHub issue is
  in `ICON-Projects-Planning` — the subject is the sdks codebase. Source URL in
  issue.md points to the real ICON-Projects-Planning issue.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What did we conclude? full per-finding verdicts + effort | `outcome.md` | ~2.6k |
| The issue itself, AC, report links | `issue.md` | ~0.5k |
| Draft sign-off comment (to post) | `review-comment.md` | ~0.6k |
| How the verification was run (workflow, agents) | `process.md` | ~0.4k |
| Intent / scope | `plan.md` | ~0.3k |

## Landmines

- **Report's "0 fixed" ledger is stale** — shell-quote/react-router/ICON-relay
  already remediated after 22 Aug. Don't quote it as-is.
- **Line numbers in the audit have drifted** from post-audit refactors (e.g.
  `useSwapsApiApproveAndBroadcast` moved logic into `approvalPlan.ts`;
  `MigrationService`/`BridgeService`/`SwapService` line refs shifted). Behavior
  unchanged — verify by symbol, not line.
- **Verification ran on a read-only export of origin/main**, not the working tree
  (which is on branch `fix/demo-staging-solver-submit`). Re-verify any git-state
  claim against actual `origin/main` before acting.
