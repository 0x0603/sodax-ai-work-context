---
repo: sodax-command-center
updated: 2026-11-15
tags: [agents, mcp, outlayer, custody, architecture]
related_issues: [gh-79-agent-executable-swaps, gh-80-sodax-mcp-execution-model, gh-118-swap-from-non-evm]
type: outcome
status: Proposed — no architecture decision accepted
---

# Proposed SODAX agent architecture

Keep SODAX settlement and SDK integration; separate agent interfaces from financial authority.

```text
Agent / partner app / scheduler
  -> MCP adapter or HTTPS API
  -> shared SODAX execution service
       -> authenticated principal and delegated grant
       -> deterministic transaction plan from SDK / Swaps API
       -> durable operation record and budget reservation
       -> independent semantic policy validation
       -> signing adapter: external wallet / delegated smart account / TEE provider
       -> broadcaster and chain reconciliation
  -> existing SODAX contracts, relay and solver
```

The validator must bind authorization to exact effects: chain, sender, contracts, function arguments, input amount, destination/refund addresses, minimum output, fees, deadline, approvals and policy revision. A statement of intended spend is insufficient. The final signing authority or account contract must reject mismatched payloads independently of the agent-facing service. Unknown call types fail closed.

## Product modes

- Assisted: user-controlled wallet signs, with confirmation behavior determined by that wallet/application.
- Delegated: separate agent account, finite budget and expiry, restricted methods, owner-controlled withdrawal/recovery and revocation. Protect cumulative limits with atomic reservations or an authoritative on-chain budget.

For a first proof of concept choose one EVM source and one swap route. Use a small isolated balance, fixed owner destination, exact approvals and no arbitrary signing tool. OutLayer may supply keys/attestation; SODAX must establish the policy enforcement boundary for its own calldata. A single SODAX-controlled recoverable vault over all customer accounts would concentrate recovery authority and must not be represented as individual user sovereignty.

## Durable execution requirements

Persist intent/plan, policy revision, grant, operation id, nonce, transaction hash and stage before external effects. Retry with idempotency and chain reconciliation; a timeout means unknown outcome until checked. Reserve budget atomically across concurrent workers and release according to confirmed failure/cancellation. Distinguish source inclusion, relay, hub settlement and destination delivery. Revocation blocks future authority; already signed/broadcast transactions require separate expiry/cancellation analysis.

## Options

1. MCP plus external wallet: smallest change; unattended behavior depends on wallet authority.
2. MCP plus OutLayer signing: fastest candidate for a custody experiment, contingent on semantic policy and governance/recovery review.
3. MCP plus smart-account/session-key delegation: candidate for on-chain authority boundaries on supported chains; needs chain-specific wallet/contracts, audits, recovery and upgrade analysis.
4. Hybrid: common execution API with multiple signing adapters; recommended target.
5. Replace SODAX settlement with NEAR Intents: separate strategic business/protocol decision, not necessary to support agents.

## Acceptance gates

- Malicious agent, API service or swapped calldata cannot exceed delegated authority.
- Concurrent requests cannot overspend the configured budget.
- Restarts and lost replies neither duplicate swaps nor strand known deposits.
- Recipient/refund substitution and token approvals cannot bypass spend rules.
- Revocation and owner-only recovery work when the provider API is unavailable.
- Supported signature formats, SODAX contract calls, gas, latency and costs are measured per chain.
- Actual deployment permissions, attestation build, upgrades and mainnet feature availability are verified.

No upstream code, funds or deployment was changed. The architecture remains a recommendation for review.
