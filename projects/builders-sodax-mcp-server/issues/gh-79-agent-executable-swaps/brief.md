---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active — ADR in draft PR #90
next: The user OKs the #81 approach (plan.md §SDK fit); then #81 on its own branch off `development` in the hub submodule. Ask R0bi7 to review PR #90
updated: 2026-10-26
---

# GH-79 Agent-executable swaps (Builders MCP) · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- `plan.md` follows the ADR on PR #90 @ `f59edf0` (synced 2026-10-26). No code exists.
- ADR (#80) is draft PR #90 (base `development`), branch `feat/agent-executable-swaps` @ `f59edf0` (revised
  2026-10-23 with the design review decisions). No reviewer requested; its one comment is the user's
  `@claude do PR review`, which produced no review.
- All of #79–#89 are assigned to the user (`0x0603`) as of 2026-10-26. "@0xmatterhorn" is the user's Discord handle.
- Discord 2026-10-23 (see `process.md`): R0bi7 says the epic is a core draft and the user may adjust decisions.
  Signing: the agent holds the key, signs and broadcasts, then passes the tx hash to MCP (D1 holds).
- Code lives in the hub submodule `sodax-command-center/repos/client/builders-sodax-mcp-server`. The standalone
  clone `sodax/builders-sodax-mcp-server/` (local signing key and noreply identity set) is legacy.
- `improvement-ideas.md` predates the ADR revision and has not been re-mapped.

## Blocked on

1. The user's OK on the #81 approach: `solver.ts` / `relay.ts` stay REST because the SDK changes the builder tools'
   inputs and outputs (`plan.md` §Constraints, "The SDK does not fit the builder tools").
2. R0bi7's review of PR #90.
3. A BE wallet-balance route. Blocks #86 and the quote's balance check. No owner yet.
4. Open with Paul: double counting (inbound + outbound), per-IP write cap and jail on the MCP IP. The HAProxy move
   itself is settled (R0bi7, Slack 2026-10-23).
5. A funded test wallet and a canary API key.
6. A gosodax admin for the E2E secrets and the staging `SODAX_ENV=canary` setting.

## Next action

Get the user's OK on #81, then branch off `development` in the hub submodule and implement `plan.md` row 81, with
its own PR. Ask R0bi7 to review PR #90 in parallel.

## Settled — do not re-litigate

1. Full SDK (`@sodax/sdk` + `@sodax/types`), chosen 2026-10-23 for later features, with overrides for `axios`,
   `bigint-buffer`, `toml` (`ws` has no fix). Balance and source-tx checks still go to BE.
2. Build the intent with `createIntent` and an explicit minimum output and deadline. Never use `includeTxData`.
3. Check the EVM source tx on chain before calling `submit-tx`: the receipt succeeded and holds the `connection`
   contract's log carrying the cached relay payload. Matching the tx input is not enough.
4. Phase 1 sources are EVM and Sonic. No per-call `rpcUrl`; RPC overrides come from env only.
5. Swap tools require an API key (user's call, 2026-10-26; presence check only, BE decides validity). Builder
   tools stay keyless; a key, when sent, is forwarded on every BE call. ADR D2 edited for this in the hub
   submodule's working tree on `feat/agent-executable-swaps`, not yet committed.
6. Partner fee is set by the builder at connection level (header, URL query or stdio env), never as a tool input.
7. One PR per sub-issue (user's call, 2026-10-26), each on its own branch off `development`, in `plan.md` order;
   #90 is the ADR. A boot-time switch keeps the swap tools off in production until #85, #87 and #88 are in. The
   sodax-sdks docs and skill go in a separate PR with its own issue.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The epic as written (goal, locked decisions, tools, safety rules, AC), what each sub-issue solves | `issue.md` | 3.5k |
| Decisions, constraints, SDK fit, per-sub-issue work, verification, prerequisites, follow-ups, risks | `plan.md` | 4.5k |
| Discussion log: balance in BE, custom RPC, full SDK vs light, rate limit, API key, cancel, partner fee | `process.md` | 2k |
| Candidate changes from before the ADR revision, not re-mapped | `improvement-ideas.md` | 1.9k |

## Landmines

- Canary runs on mainnet chains, so canary swaps move real funds.
- `submit-tx` allows 10 per 60 s per IP for the whole MCP.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
- Repo is public (hub `repos.yaml`): keep PR text free of internal detail.
