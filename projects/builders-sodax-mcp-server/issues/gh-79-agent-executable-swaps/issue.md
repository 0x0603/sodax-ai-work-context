---
type: issue
repo: builders-sodax-mcp-server
github: 79
status: Active
tags: [mcp, swaps-api, agents, non-custodial, epic]
updated: 2026-10-22
related_decisions: []
---

# GH-79 Sodax MCP: agent-executable swaps (phase 1)

- Source: https://github.com/gosodax/builders-sodax-mcp-server/issues/79 (epic, R0bi7, 2026-10-20)
- Started: 2026-10-22
- Related PR: (not opened yet) — branch `feat/agent-executable-swaps`

## Problem

Upgrade the hosted MCP (`builders.sodax.com/mcp`) from a read-only proxy into a server an AI agent can use
to perform cross-chain swaps. Non-custodial: never signs or broadcasts; returns unsigned txs, tracks the swap.

## Sub-issues (native, all filed by R0bi7)

| # | Title |
|---|---|
| 80 | ADR: Sodax MCP execution model |
| 81 | Adopt @sodax/sdk and @sodax/types as the client layer |
| 82 | Tool profiles (builder, swap, all) |
| 83 | Token and chain resolver + sodax_resolve_token |
| 84 | sodax_swap_quote |
| 85 | sodax_swap_track and sodax_swap_cancel |
| 86 | sodax_get_balance |
| 87 | Safety rules and analytics for the swap profile |
| 88 | E2E swap on canary in CI |
| 89 | Docs, registry metadata and skills for the swap profile |

## Acceptance Criteria (epic)

- All sub-issues closed.
- An agent connected to `/mcp?profile=swap` can quote, receive unsigned txs, and track an EVM to EVM swap to
  `solved` on canary without the server ever signing.
- Existing `builder` profile serves today's tool set unchanged.

## Related

- Handoff note seen 2026-10-21: "to be taken over by @0xmatterhorn" — not a GitHub login.
- sodax-sdks v3 plan T33 (`gh-519`) anticipated "build-unsigned-tx tools in the Builders MCP".
- Same lane as sodax-sdks#529 (`useSwapsApiSwapLifecycle`, not built yet).
