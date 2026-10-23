---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active — plan only
next: R0bi7 reassigns #79–#89 to the user; on the user's go-ahead, the ADR first as a draft PR, then plan.md "Work per sub-issue" in order
updated: 2026-10-23
---

# GH-79 Agent-executable swaps (Builders MCP) · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- The plan verdict is in `plan.md`. No code exists.
- ADR (#80) is pushed, no PR yet: `gosodax/builders-sodax-mcp-server` branch `feat/agent-executable-swaps` @ `4ed6726`
  (off `development` @ `02ba5df`), `docs/adr/0001-sodax-mcp-execution-model.md` plus a README link. Local clone at
  `sodax/builders-sodax-mcp-server/`.
- `improvement-ideas.md` lists 14 candidate changes. None is adopted, and `plan.md` stays the plan until the user picks.
- The user owns the epic as of 2026-10-23. On GitHub, #79 is still unassigned and #80–#89 are still assigned to R0bi7
  (`gosodax/builders-sodax-mcp-server`) until he reassigns them.
- The handoff named "@0xmatterhorn"; that is not a GitHub login.
- Upstream, only the ADR branch is pushed. Nothing has been posted on any issue or PR.

## Blocked on

1. The user's go-ahead to start coding, and R0bi7 reassigning #79–#89 to the user.
2. R0bi7's agreement to the ADR decisions.
3. Paul and R0bi7 on rate limiting (D2): whether the MCP moves behind HAProxy or keeps its own limit. Decision 6
   stands until then.
4. A funded test wallet and a canary API key.
5. A gosodax admin for the E2E secrets and the staging `SODAX_ENV=canary` setting.

## Next action

The user asks R0bi7 to reassign the issues. On the user's word, open the PR from `feat/agent-executable-swaps` as a
draft so R0bi7 reviews the ADR first. Do not start coding on a plan approval alone.

## Settled — do not re-litigate

1. Light client: `@sodax/swaps-api` + `@sodax/types` + `viem`, not the full SDK. The full SDK is 777 MB with 35 advisories, 11 of them high.
2. Build the intent with `createIntent` and an explicit minimum output and deadline. Never use `includeTxData`.
3. Check the receipt before calling `submit-tx`. On EVM, the mined tx input must contain the quote's calldata.
4. No per-call `rpcUrl`; RPC overrides come from env only. The rate-limit guard wraps only the Swaps API client.
5. One branch and one PR, with the ADR first as a draft. The sodax-sdks docs and skill go in a separate PR with its own issue.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The epic as written (goal, locked decisions, tools, safety rules, AC), what each sub-issue solves, where `plan.md` departs | `issue.md` | 3.5k |
| Decisions, constraints, per-sub-issue work, verification, prerequisites, follow-ups, risks | `plan.md` | 3.3k |
| Candidate changes, not adopted: service key, intent from chain, tx checks, scope cuts, small additions | `improvement-ideas.md` | 1.9k |

## Landmines

- Canary runs on mainnet chains, so canary swaps move real funds.
- `submit-tx` allows 10 per 60 s per IP for the whole MCP.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
