---
type: issue
repo: builders-sodax-mcp-server
status: Design complete
updated: 2026-11-26
tags: [mcp, wallet, signing]
---

# Request

Design the model selected by the user: SODAX prepares unsigned transactions; user/agent-operated Wallet MCP holds Privy access and signs; SODAX receives signing results for broadcast and tracking. Sharing a code project is acceptable; SODAX hosting user signing authority is outside the selected model. This task is design, not implementation or real-funds execution.

## Acceptance

- Separate hosted and wallet entry points, with no hosted wallet credentials or signing tools.
- Permission checks happen before signing; caller-supplied wallet IDs are not authorization.
- Contract supports chain-specific artifacts and ordered approvals.
- Keep existing hash-based tracking compatible; distinguish source broadcast from backend/relay submission.
- Timeouts/restarts cannot silently cause a second deposit.
- Enable only chains with both signing and SODAX execution validation.
