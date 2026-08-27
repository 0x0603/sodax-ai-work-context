---
type: issue
repo: sodax-sdks
github: 741
status: Active
tags: [security-audit, supply-chain, review, sign-off]
updated: 2026-08-26
related_decisions: []
---

# GH-741 Security Audit Review — SODAX SDKs (2026-08-22)

- Source: https://github.com/icon-project/ICON-Projects-Planning/issues/741
  (issue lives in the **ICON-Projects-Planning** planning repo, not sodax-sdks;
  the subject under review is the sodax-sdks codebase)
- Author: FezBox · Assignee: R0bi7
- Started: 2026-08-26
- Related PR: https://github.com/icon-project/sodax-sdks/pull/405

## Problem

An AI-generated security audit (`security-audit v3` generator) of the sodax-sdks
TypeScript monorepo was produced 2026-08-22. The issue asks us to review it,
cross-check its findings against the current codebase, and sign off.

Report artifacts (in ICON-Projects-Planning):
- HTML triage: `security/audit-reports/generated/2026-08-22-sodax-sdks-security-audit.html`
- Markdown system-of-record: `.../2026-08-22-sodax-sdks-security-audit.md`

Headline severities (intrinsic): 0 Critical · 6 High · 21 Medium · 37 Low · 37 Info.
Effective (audit's own exploitability-adjusted): 0 Critical · 0 High · 15 Medium ·
46 Low · 40 Info.

The real task is not to rubber-stamp: it is to judge whether the audit is
**accurate** (do the code claims hold at current main?), whether it **overstates**
severity anywhere, whether it **misses** anything, and to estimate **fix effort**
so the team can plan follow-up.

## Context

- The TS SDK layer has never had a human audit — `sodax-sdks/Audits/` holds only
  smart-contract audits (Sherlock, Solana, Sui, Soroban, NEAR). This report is the
  first coverage of the SDK/dapp-kit/wallet layer, so it has value even AI-authored.
- Audit ran against a 2026-08-22 tree; main moved since (verified against
  origin/main `75dec7011`, 2026-08-25). Some findings were already remediated —
  the audit's "0 fixed" ledger is stale.
- Only 7 of 101 entries were independently verified by the audit itself; 7 were
  refuted; 87 are a single auditor's word. This review cross-checked the entire
  High + Medium tier plus 6 suspect Lows against source.

## Acceptance Criteria

- [ ] HTML triage report reviewed
- [ ] Markdown system-of-record reviewed
- [ ] Findings cross-checked against current codebase (file:line evidence)
- [ ] Sign-off with caveats

## Related

- Knowledge: —
- Decisions: —
- Related issues: gh-330-bound-exchange-endpoint-inventory (RadFi/Bound context),
  gh-331-usdt-stale-allowance-approve (allowance/approve flows)
