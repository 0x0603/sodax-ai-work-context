---
type: outcome
repo: builders-sodax-mcp-server
status: Design delivered
updated: 2026-11-26
tags: [mcp, wallet, design]
---

# Outcome

Delivered architecture and protocol in `plan.md` and `plan-contract.md`. Same repo, separate processes: user-operated Wallet MCP holds signing authority; SODAX prepares, verifies signed artifacts, broadcasts and tracks. Source broadcaster is new work because existing submit-and-track expects an already-broadcast hash.

Validated design against recorded local prepare/track/source types and primary provider/MCP documentation. Covered account permissions, exact transaction binding, approval dependencies, durable retries and chain rollout gates. No production implementation, code tests or real-funds execution.

Next: reconcile upstream, verify actual provider schemas, implement local-chain EVM vertical slice. Git network sync unavailable; see process notes.
