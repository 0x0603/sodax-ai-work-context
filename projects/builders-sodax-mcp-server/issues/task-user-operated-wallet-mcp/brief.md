---
type: brief
repo: builders-sodax-mcp-server
status: Design complete, implementation not started
next: Reconcile upstream, then implement EVM accounts to sign-only to broadcast vertical slice.
updated: 2026-11-26
tags: [mcp, wallet, privy, signing, agents]
related_issues: [gh-79, gh-118]
---

# User-operated Wallet MCP · brief

## State

- User selected SODAX prepare → user-operated wallet signing → SODAX broadcast/track.
- Two independently started servers may share the MCP repo; only the user environment holds Privy signing authority.
- Design complete; no production code or deployment changes and no live signing or transactions.
- Existing submit-and-track consumes an already-broadcast source tx hash. A source broadcaster is new work.
- Local refs are snapshots; git sync failed due to DNS. Provider schemas require integration testing.

## Next action

Reconcile upstream, implement EVM vertical slice from `plan-contract.md`, and validate on a local chain. Real-funds tests need explicit authorization.

## Settled

- Wallet MCP defaults to user-owned stdio process; user-owned cloud is optional later.
- Hosted SODAX never receives Privy app secrets, signer keys or wallet signing delegation.
- Wallet signs only; SODAX validates signed artifacts before broadcasting.
- Human approval is default. Autonomy is owner-configured and bounded.

## File map

| Question | File |
| --- | --- |
| Request and acceptance criteria | `issue.md` |
| Architecture, deployment, adapter rollout | `plan.md` |
| Tools, schema, validation, recovery | `plan-contract.md` |
| Source evidence and limitations | `process.md` |
| Result and remaining work | `outcome.md` |
