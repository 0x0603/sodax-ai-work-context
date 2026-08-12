---
type: issue
repo: sodax-frontend
github: 1632
status: Blocked
tags: [security, signing, drainers, wallet-sdk-core, dapp-kit, xl, needs-decision]
updated: 2026-08-12
related_issues: []
related_decisions: []
---

# GH-1632 Pre Signature Preview Modal

- Source: https://github.com/icon-project/sodax-frontend/issues/1632
- Started: 2026-08-12 (decision brief only)
- Related PR: none
- Parent epic: #1631 Frontend Security Hardening
- Owner named in the ticket: Gosia. Effort: **XL (3–4 weeks)**.

## Problem

The 2026 drainer wave works because wallets show users opaque EIP-712 hex. A Permit signed for
an attacker's address looks identical in MetaMask to a Permit signed for SODAX's own
protocol-intents contract. Today every flow at SODAX has that gap.

The ticket proposes one shared `<SignatureReviewModal>` driven by a normalised `SigningRequest`
interface, with a `describeSigningPayload()` decoder per chain adapter, EVM first and non-EVM
behind a feature flag.

## Context

**The scope note in the ticket itself** (Fidel, 2026-05-13): a compromised frontend can render
a benign preview while sending a different payload to the wallet, so this is signing-clarity /
UX and defence-in-depth — **not** a cryptographic guarantee against drainers. The real fix is
wallet-side decoding. The title is flagged as pending a retitle.

**The open question** (gosiast → @FezBox, 2026-06-30): is an XL frontend modal the right next
investment versus pushing Phase 0 and wallet-level decoding first? **Never answered.** Nothing
has moved on the issue since.

## Acceptance Criteria

As written in the ticket — `SigningRequest` type exported, EVM `describeSigningPayload` with
fixture tests, spender allowlist, the modal with a 3-second sign delay and `block`-severity
disabling sign, Storybook stories, then wiring into swap / save / bridge.

**Three of those cannot be satisfied in this repo as it stands** — see `process.md`.

## Related

- Knowledge:
- Decisions:
