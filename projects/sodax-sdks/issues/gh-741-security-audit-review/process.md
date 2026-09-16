---
type: process
repo: sodax-sdks
github: 741
updated: 2026-08-27
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

**2026-08-28 — bot review 2 verification**

- Bot review 2 (PR comment 5441564727, R0bi7-sodax-worker @ `a97059d49`,
  "Request changes") verified via 5-agent fan-out (`wf_2cbcbf78`; first run
  died on session limit, resumed after reset). Verdicts: R1 correct+blocking
  (regression from our 6d321f36a — token identifiers `0:0`, `inj`/denoms,
  `NEAR` now throw in default deposit simulation; agents ran the real
  configured values through the validators), R2 correct-but-stale (D-021
  parcel fixes it), R3 partially correct (pre-existing #1137; "unrecoverable
  funds" overstated — simulation gate; reviewer missed the worse
  srcChainKey-switch half), R4 correct (approve = the single EVM approval
  funnel), R5 correct and refutes D-020's raw-conditions claim (corrected in
  decisions.md). Plan updated: plan-pass23.md §"Bot review 2" now fronts the
  queue with fixes R1 → parcel → R5 → R4-call → reply pack.

**2026-08-27 — Pass 2/3 delta triage session**

- Read issue comment 5437714067 (Pass 2: 15 + 1 correction; Pass 3: N1–N9 +
  13 unposted + 5 amendments, all delta vs the 2026-08-22 report) and PR #405
  state (16 commits, body status table, D-021 parcel uncommitted).
- Ran a 5-agent read-only verification fan-out (`wf_67271d66`, ~400k subagent
  tokens) over the 33 code-level findings against the branch tip: 32 confirmed,
  P2-12 partially fixed by our H-3 commit, 0 refuted. Registry/settings claims
  left as live-queried. Extra nuances: C-6 endpoints look deliberate (product
  question), M16 is 2 scripts/5 sites not 5 scripts, L19 is latent.
- Wrote `plan-pass23.md`: duplicate-vs-new classification (3 already in-flight,
  4 merge into PR-body follow-ups, 7 amendments refresh dispositions, rest new)
  + batched execution order for PR #405. No icon-project files touched.

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
