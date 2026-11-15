---
repo: sodax-command-center
updated: 2026-11-15
tags: [agents, mcp, outlayer, custody, architecture]
related_issues: [gh-79-agent-executable-swaps, gh-80-sodax-mcp-execution-model, gh-118-swap-from-non-evm]
type: process
---

# 2026-11-15 research

## Local evidence

- Hub `docs/architecture.md`: Sonic hub, spoke asset managers, intent/solver/relay settlement. A separate agent signing layer does not replace these components.
- Hub MCP repo card describes a read-only server; local source README already documents swap preparation, external wallet signing/broadcasting and subsequent submission/tracking. The card is therefore incomplete for the local checkout. No claim made about deployed production parity.
- MCP README lines 93–138: the server does not sign; an external wallet tool is needed. A human confirmation on every transaction is not a property guaranteed by this design.
- README operating section identifies in-memory quote loss across restarts. Durable execution is material for unattended agents.
- GH-79/80/118 routers show ongoing swap execution and multichain adapter work; these do not establish merged or deployed status. Existing GH-118 context edits were present before this task and are left untouched.
- Accepted personal ADR 0003 records Privy adoption for email wallets. Agent delegation is a separate decision; no current Privy agent capability was verified here.

## Primary sources checked

- https://modelcontextprotocol.io/docs/learn/architecture
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/latest/basic/security_best_practices
- https://app.outlayer.ai/docs/getting-started
- https://app.outlayer.ai/docs/agent-custody
- https://app.outlayer.ai/docs/trust-verification
- https://github.com/out-layer/outlayer/blob/main/docs/NON_CUSTODIAL.md
- https://app.outlayer.ai/docs/vaults
- https://docs.agentsonintents.com/integration/agent-api/overview
- https://docs.agentsonintents.com/integration/agent-api/concepts
- https://docs.agentsonintents.com/integration/agent-api/native-accounts

## Evidence limits

Documentation review, not an audit, on-chain governance verification, release verification, benchmark or integration test. OutLayer marketing and detailed custody disclosures require reconciliation; vault mainnet availability differs across pages. Native signing capabilities cannot be assumed to enforce the money rules of the NEAR Intents action API. Merely finding an OutLayer contract reference does not prove the complete Agent API custody deployment.

## Context sync

Initial restricted-network pull failed DNS; approved network pull succeeded, already up to date.
