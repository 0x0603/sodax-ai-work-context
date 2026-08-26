---
type: process
repo: sodax-sdks
github: 741
updated: 2026-08-26
---

# Process

## Log

**2026-08-26 — verification session**

- Read issue #741 (ICON-Projects-Planning): review + sign off the 2026-08-22
  sodax-sdks AI audit. Downloaded the ~250 KB markdown system-of-record.
- Confirmed the audit's own numbers: intrinsic 0C/6H/21M/37L/37I, but effective
  0C/0H/15M/46L/40I; 7/101 self-verified, 7 refuted, 87 single-auditor's-word.
- sodax-sdks working tree was on branch `fix/demo-staging-solver-submit`; exported
  `origin/main` (`75dec7011`) to a read-only tree so verification reflects main.
- Ran a 10-agent verification fan-out (Workflow `wf_e75878f8`), one cluster each:
  deps(axios/ws), deps(others), CI/supply-chain, blind-signing(M-1),
  Bound-session, migration, refutations, fund-flow, money-market/wallet,
  Low-understated. First pass: 6 done, 4 hit a session limit (reset 01:20). Resumed
  from cache after reset — all 10 completed (~1.75M subagent tokens total).

## Findings

- **Accuracy is high** — every load-bearing code claim across High + Medium
  re-derived from source; disagreements are severity/remediation-framing only.
- **Systematic overstatement of remediation difficulty**: "no upstream fix" for
  shell-quote (1.8.4 shipped 05-22) and protobufjs (7.6.5 shipped 07-04), both
  before the audit; axios pin misread as protective when it is the thing holding
  axios back (all upstream ranges are `^1.x`).
- **Ledger stale**: shell-quote (1.10.0), react-router (7.18.2 via #313), and ICON
  relay (2/3 copies) already fixed after the audit date.
- **Audit understates in a few places** that strengthen its own case: BTC pk-wallet
  PSBT signing with no confirmation UI; ws@7.5.10 runtime not dev-only; next 4 HIGH
  advisories vs 1 cited; `id-token: write` on publish + new drift-check workflows.
- **Refutations sound SDK-side, on-chain halves locally unverifiable** (no
  sodax-contracts sources in this repo; corroborated from shipped ABIs). One
  refutation cites a false mitigation (`verifyTxHash` "confirms source tx" — it
  fails open on most chains, = the audit's own L-9).
- **Low tier**: 6 suspect findings checked, none warrants upgrade; tier is
  internally consistent, if anything conservative.

## Changes During Work

- None to any icon-project repo. This dossier is the only artifact. Draft sign-off
  comment prepared in `review-comment.md`, not posted (repo rule: user posts).
