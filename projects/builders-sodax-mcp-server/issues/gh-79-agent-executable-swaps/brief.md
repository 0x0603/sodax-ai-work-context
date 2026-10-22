---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active — plan only
next: user confirms ownership + go-ahead; then implement plan.md §6 in order
updated: 2026-10-22
---

# GH-79 Agent-executable swaps (Builders MCP) · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- Plan v2 is audited and written (`plan.md`). **No code exists.** The prototype clone was deleted on the user's request.
- Epic and sub-issues are R0bi7's (gosodax/builders-sodax-mcp-server #79, #80–#89). The handoff to "@0xmatterhorn" is
  unresolved; that name is not a GitHub login.
- Nothing has been posted, commented, committed or pushed anywhere upstream.

## Blocked on

1. The user's explicit go-ahead to implement, and confirmation that they own the epic (plan.md §8.1).
2. R0bi7's agreement to the ADR decisions (§8.2).
3. A funded test wallet and a canary API key, needed for role-play and #88 (§8.3).
4. A gosodax admin for E2E secrets and the staging `SODAX_ENV=canary` setting (§8.4).

## Next action

Wait for the user. Do not start coding on a plan approval alone (memory: plan-request-means-plan-only).

## Settled — do not re-litigate

1. Light client: `@sodax/swaps-api` + `@sodax/types` + `viem`. The full SDK adds 777 MB and 35 advisories (11 high).
   The reuse path is SDK v3 chain plugins, behind the `ChainReader` interface.
2. Build the intent with `createIntent` and explicit minOut/deadline. Never use `includeTxData`, which gives deadline 0
   and zero slippage.
3. Check the receipt before `submit-tx`, because the backend verifies nothing. EVM check: the mined input contains the
   quote's calldata.
4. No per-call `rpcUrl` (SSRF and key-leak risk); env overrides only. The rate-limit guard wraps the Swaps API client
   only.
5. One branch, one PR, ADR first as a draft. The sodax-sdks docs/skill change is a separate PR with its own issue.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Epic + sub-issues | `issue.md` | 0.6k |
| Audit v1→v2, verified facts, decisions, per-sub-issue table, verification, prerequisites, follow-ups | `plan.md` | 6k |
| What the prototype and probes proved (endpoints, chain quirks) | `process.md` | 1.5k |
| Result | `outcome.md` | — |

## Landmines

- Canary runs on mainnet chains, so canary swaps move real funds.
- `submit-tx` allows 10 per 60 s per IP for the whole MCP; the `SwapsApi` client retries 429s with no delay.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
- Sui public fullnode JSON-RPC is off; use GraphQL. ICON and NEAR send JSON-RPC errors with HTTP 400.
