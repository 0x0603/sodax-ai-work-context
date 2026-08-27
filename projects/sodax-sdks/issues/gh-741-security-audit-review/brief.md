---
type: brief
repo: sodax-sdks
github: 741
status: Active
next: PR #405 open (fix/audit-741-quick-wins, 8 commits). Await review; @R0bi7 to confirm relayData + bnUSD product question.
updated: 2026-08-27
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

On branch `fix/audit-741-quick-wins` (5 deps commits pushed: axios, ws,
protobufjs, next, bigint-patch). Still to do: (1) switch bigint patch → alias
`@trufflesuite/bigint-buffer@1.1.10` (D-007), (2) #6 CI token scope, then #7-#10
code fixes. Separately: post the sign-off comment (`review-comment.md`) — user
posts. All decisions logged in `decisions.md`.

## Deferred — do not start without a fresh decision

- **Solana v2 migration (D-008):** the real way to remove bigint-buffer. Must
  replace BOTH `@solana/web3.js` 1.x → `@solana/kit` v8 AND `@solana/spl-token`
  0.4.x → `@solana-program/token` — bigint-buffer enters via both (web3.js
  directly + spl-token → buffer-layout-utils), so upgrading only one leaves it in
  the tree. Full Solana rewrite across 3 packages; both new deps are only days old
  (kit 8.0.0 + @solana-program/token 0.16.0, pre-1.0). Wait for both to mature,
  then upgrade to latest. Raise in the PR thread, not a new GitHub issue.

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
| What did we conclude? verdicts + fix-or-not recommendation + effort | `outcome.md` | ~4k |
| Decisions made while implementing fixes | `decisions.md` | ~0.6k |
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
