---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active — ADR in draft PR #90
next: R0bi7 reviews draft PR #90 and reassigns #82–#89 to the user; on the user's go-ahead, plan.md "Work per sub-issue" in order
updated: 2026-10-23
---

# GH-79 Agent-executable swaps (Builders MCP) · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- The plan verdict is in `plan.md`. No code exists.
- ADR (#80) is in draft PR #90 (base `development`), branch `feat/agent-executable-swaps` @ `f59edf0`
  (ADR revised 2026-10-23 with the design review decisions; first commit `4ed6726` off `development` @ `02ba5df`).
  No reviews yet. Local clone at `sodax/builders-sodax-mcp-server/` (local signing key and noreply identity set).
- `improvement-ideas.md` lists 14 candidate changes. None is adopted, and `plan.md` stays the plan until the user picks.
- The user owns the epic as of 2026-10-23. On GitHub (`gosodax/builders-sodax-mcp-server`), #79–#81 are assigned to the
  user (`0x0603`); #82–#89 are still assigned to R0bi7.
- "@0xmatterhorn" in the handoff is the user's Discord handle.
- Discord 2026-10-23 (see `process.md`): R0bi7 says the epic is a core draft, not final, and the user may adjust
  decisions. Signing: the agent holds the key, signs and broadcasts, then passes the tx hash to MCP (D1 holds). API key: MCP forwards it when the client sends one; BE and HAProxy own the policy.
- Upstream, only draft PR #90 exists; its one comment is the user's `@claude do PR review`. No comments on #79–#89.

## Blocked on

1. The user's go-ahead to start coding, and R0bi7 reassigning #82–#89 to the user.
2. R0bi7's review of PR #90. Amending the epic is allowed (Discord 2026-10-23).
3. Resolved 2026-10-23 (Slack, R0bi7): the MCP will go through HAProxy; MCP forwards the API key when present.
   Open with Paul: double counting (inbound + outbound), per-IP write cap and jail on the MCP IP, the MCP limiter.
4. A funded test wallet and a canary API key.
5. A gosodax admin for the E2E secrets and the staging `SODAX_ENV=canary` setting.

## Next action

Get R0bi7's review on draft PR #90, and ask R0bi7 to reassign #82–#89. Do not start coding on a plan approval alone.

## Settled — do not re-litigate

1. Full SDK (`@sodax/sdk` + `@sodax/types`), chosen 2026-10-23 for later features. Mitigate the 11 high advisories with overrides (`axios`, `bigint-buffer`, `toml`; `ws` has no fix). Balance and source-tx checks still go to BE.
2. Build the intent with `createIntent` and an explicit minimum output and deadline. Never use `includeTxData`.
3. Check the source tx on chain before calling `submit-tx`. On EVM, the receipt must succeed and hold the `connection` contract's log carrying the cached relay payload; matching the tx input is not enough.
4. No per-call `rpcUrl`; RPC overrides come from env only. The rate-limit guard wraps only the Swaps API client.
5. One branch and one PR, with the ADR first as a draft. The sodax-sdks docs and skill go in a separate PR with its own issue.
6. Partner fee is set by the builder at connection level (header, URL query or stdio env), never as a tool input.
   Details in `process.md`; the ADR has it (f59edf0), plan.md does not yet.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The epic as written (goal, locked decisions, tools, safety rules, AC), what each sub-issue solves, where `plan.md` departs | `issue.md` | 3.5k |
| Decisions, constraints, per-sub-issue work, verification, prerequisites, follow-ups, risks | `plan.md` | 3.3k |
| Candidate changes, not adopted: service key, intent from chain, tx checks, scope cuts, small additions | `improvement-ideas.md` | 1.9k |
| Discussion log: balance in BE, custom RPC, full SDK vs light, R0bi7 on Discord | `process.md` | 0.6k |

## Landmines

- Canary runs on mainnet chains, so canary swaps move real funds.
- `submit-tx` allows 10 per 60 s per IP for the whole MCP.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
