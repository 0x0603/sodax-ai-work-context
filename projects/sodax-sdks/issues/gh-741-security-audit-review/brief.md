---
type: brief
repo: sodax-sdks
github: 741
related_issues: [753]
status: Active
next: Pass 2/3 delta now has its own issue — ICON-Projects-Planning#753 (43 items, 49 checkboxes, Batches F/G/H/CI). Bot-review-2 R1 has LANDED (`7f287f56b`, encodeTokenIdentifier + BOT-R1 tests), so it no longer blocks. Front of queue: finish the remaining bot-review-2 replies, then work #753 Batch F starting at P2-1 — see plan-pass23.md and #753.
updated: 2026-09-03
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

On branch `fix/audit-741-quick-wins` (PR #405, 16 commits @ `a97059d49`;
hardening 7/7 complete; ICONEX bot-review parcel D-021 uncommitted in tree).
Bot review 2 (comment 5441564727, "Request changes") verified 2026-08-28 via
`wf_2cbcbf78`: R1 correct+blocking (our 6d321f36a broke Bitcoin/Injective/
native-NEAR deposit simulation — token identifiers hit the new recipient
validators; fix = encodeTokenIdentifier split), R2 already fixed in the
uncommitted D-021 parcel, R3 partially correct (pre-existing #1137 — reply,
follow-up), R4 correct (deliberate D-019 scope; approve is the single approval
funnel — S fix, user call), R5 correct (refutes D-020's raw-conditions claim;
S fix). Details + reply pack in **`plan-pass23.md`** §"Bot review 2". Then the
Pass 2/3 delta batches (same file, `wf_67271d66`, 32/33 confirmed): Batch F
(fund-loss: P2-1, P2-4, CORR-1, P2-3, N1) → Batch G (packages) → Batch H
(apps) → Batch CI (confirm scope first) → consolidated admin follow-up
comment. Same PR per D-014, one item per confirm cycle; PR body
table gains a "Pass 2/3" section. Separately: post the sign-off comment
(`review-comment.md`) — user posts. Decisions in `decisions.md` (next: D-031).

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
| Pass 2/3 delta triage: duplicate-vs-new + execution batches for PR #405 | `plan-pass23.md` | ~3k |
| Pass 2/3 as a trackable checklist (43 items, stale corrections, fund-loss order) | [#753](https://github.com/icon-project/ICON-Projects-Planning/issues/753) | — |
| What shipped (PR #405 tables) + full verdicts + fix recommendation | `outcome.md` | ~5k |
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
