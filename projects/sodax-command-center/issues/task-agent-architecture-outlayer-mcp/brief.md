---
repo: sodax-command-center
updated: 2026-11-15
tags: [agents, mcp, outlayer, custody, architecture]
related_issues: [gh-79-agent-executable-swaps, gh-80-sodax-mcp-execution-model, gh-118-swap-from-non-evm]
type: brief
status: Complete — research and architecture recommendation; implementation not approved
next: Choose the first autonomous-agent use case and draft a scoped cross-repo ADR
---

# Agent architecture: OutLayer and MCP

Research requested by the user; changing SODAX architecture is an option, not an instruction to implement it now.

Recommendation: retain MCP as an adapter; introduce durable execution and independently enforced delegated authority; make signing providers replaceable. Evaluate OutLayer with an isolated agent wallet, not a migration of all user wallets or settlement infrastructure.

| Question | File |
|---|---|
| Request and boundaries | issue.md |
| Research approach | plan.md |
| Evidence and limits | process.md |
| Proposed architecture and evaluation gates | outcome.md |
