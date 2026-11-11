---
type: findings
repo: builders-sodax-mcp-server
github: 110
related_issues: [79, 110]
status: Open, not filed; outside PR #111 (tool UX, not logging)
updated: 2026-11-11
---

# An agent using the MCP: findings (2026-11-11)

A fresh agent, given only the MCP endpoint, ran a user's swap and builder requests against the built #111 tip
`99f83c1` on canary (about 25 calls, nothing signed). The server log of the session: 112 records, every call
followable by `request.id`; a builder tool's failure has no `error.type` (it returns text), though its
`Upstream call` in the same request shows the 400.

Ranked improvements, each seen in the session:

1. Chain support contradicts the swap tools: `sodax_check_chain_support` says Sonic is supported and
   `sodax_get_swap_tokens` lists 85 Sonic tokens, but `sodax_swap_quote` from Sonic is `UNSUPPORTED_SOURCE`
   (`src/services/swap/errors.ts:44`). An agent promises swaps the server can't quote.
2. A keyless call to a swap tool gets "MCP error -32602: Tool sodax_swap_quote not found", nothing about the key; the
   hint is only in the `initialize` instructions, which some clients don't show. `sodax_resolve_token` and
   `sodax_get_balance` are hidden too without a key.
3. Quote output: steps carry raw calldata only (no `approve {token, spender, amount}` summary), `batch.params` has
   no `calls`, the text content repeats `structuredContent` (11.8 KB). nextStep says track "all before it expires"
   (`src/tools/swap.ts:339`) while track also relays an expired deposit for refund.
4. `sodax_get_swap_tokens`: `chainId` takes a key ("sonic"), a name ("Sonic") gives "Failed to fetch swap tokens"
   (upstream 400), markdown stops at 20 of 85 with no paging, `format: json` isn't valid JSON (header first). The
   older tools have no `{code, field, nextStep}` errors.
5. Support: no contact in instructions or results; `X-Request-Id` is a header the model never sees, so no result
   carries a reference. Docs have four different Discord links.
6. Track gives no attempt count or stop time: an agent must count to 30 itself (15 s per call).
7. 45 tools with a key (about 11k tokens of schemas); `sodax_refresh_cache` open to any agent;
   `sodax_get_solver_quote` and `sodax_relay_submit_tx` don't say they aren't for user swaps.
8. `UNKNOWN_TOKEN` could name what the address is ("USDC on Base") inline.
9. Burn or zero address as recipient isn't flagged.

Worked well: the instructions (confirm, never sign, never resend), swap errors with code, field, nextStep,
`didYouMean`, `suggestedAmount`; exact-amount approve; chain-switch and approve-mined warnings; track's
`seenOnChain` and "don't resend"; cancel's `not_sent`.
