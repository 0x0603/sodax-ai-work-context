---
type: issue
repo: builders-sodax-mcp-server
github: 79
status: Active
tags: [mcp, swaps-api, agents, non-custodial, epic]
updated: 2026-10-23
related_decisions: []
---

# GH-79 Sodax MCP: agent-executable swaps (phase 1)

- **Source:** https://github.com/gosodax/builders-sodax-mcp-server/issues/79
- **Epic:** filed by R0bi7 on 2026-10-20. Unassigned.
- **Sub-issues #80–#89:** native sub-issues, filed by R0bi7 and assigned to R0bi7.
- **Text below:** condensed from the GitHub bodies as of their last edit (2026-10-20).
- **Related PR:** not opened yet. Branch `feat/agent-executable-swaps`.

## Goal

Upgrade the MCP server from a read-only proxy over SODAX APIs and docs into a server an AI agent can use to perform
SODAX core features, starting with cross-chain swaps.

- The server stays hosted at `https://builders.sodax.com/mcp`.
- It stays non-custodial: it never signs and never broadcasts.
- It returns unsigned txs, which the agent signs with its own wallet tool.
- It then tracks the swap to completion on the agent's behalf.

The design follows the hosted MCPs of established cross-chain swap solutions: discover, quote with tx data, sign
externally, track.

## Why

- Today the server only answers questions.
- Agents want to *do* swaps: Claude Desktop, ChatGPT, coding assistants, operator-style agents.
- A hosted, non-custodial MCP is the market-standard way to offer that without holding keys.

## Locked decisions

| # | Decision | Rationale (short) |
|---|---|---|
| D1 | Hosted only. No local signing mode in phase 1. | Matches other swap MCPs. Operators with keys already have the SDK. Avoids key handling in a public repo. |
| D2 | Stays at `builders.sodax.com`. The API gateway in front enforces keys and limits. The MCP forwards the caller's key on outbound Swaps API calls. | Partner limits and volume attribution stay per key. |
| D3 | `@sodax/sdk` + `@sodax/types` are the client layer (`sodax.api.swaps`). Direct REST only where no SDK client exists. Exact pins. | The SDK encodes intents and relay data. Drift becomes the SDK's problem. |
| D4 | Tool profiles instead of pruning tools. | 38 tools already exist; one flat list degrades clients. Existing builders see no change. |
| D5 | Source chains: every chain the Swaps API returns raw txs for (EVM, Sonic, Solana, Sui, Stellar, Injective, NEAR, ICON, Stacks, Bitcoin). Destination: any chain. | Stacks needs `srcPublicKey`; Bitcoin needs a Bound access token. These are optional inputs, not exclusions. |
| D6 | Workflow tools, not endpoint mirrors, built on a reusable "action" template. | Bridge, money market and limit orders reuse the template later. |

## Tool catalog (profile `swap`)

| Tool | Input | Output |
|---|---|---|
| `sodax_swap_quote` | `fromChain`, `toChain`, `fromToken`, `toToken`, `amount`. Optional: `fromAddress`, `toAddress`, `slippageBps`, `deadlineMinutes`, `srcPublicKey`, `bound` | Quoted and minimum output, partner and solver fees, speed tier, expiry. With `fromAddress`: allowance state, unsigned approve tx(s), unsigned intent tx, `quoteId` |
| `sodax_swap_track` | `txHash`, plus `quoteId` (or `srcChainKey` for a swap not quoted here) | Humanized status from `awaiting_source_confirmation` to `solved`, or `failed` with `failedAtStep` and `userMessage`. Fill tx hash when known. Next-step hint |
| `sodax_swap_cancel` | `quoteId` or `txHash` | Unsigned cancel tx for the source chain |
| `sodax_get_balance` | `chain`, `address`. Optional: `token`, `rpcUrl` | Native and token balance. With `token`: the allowance toward the SODAX spender |
| `sodax_resolve_token` | `chain`, `query` | Matching tokens with address, decimals and hub asset |

- **Units and names:**
  - Amounts go in as human units (`"0.5"`), and base units come back alongside.
  - Tokens are given by symbol or address; chains by name, alias or key.
- **Profiles:**
  - `builder` is the existing read tools, names unchanged, plus `docs_*`.
  - `all` is the union, and the default for existing connections.
  - Selection: `/mcp?profile=swap`, an equivalent header, or `--profile` on stdio.
- **`quoteId`:**
  - A server-side cache entry with TTL equal to the intent deadline.
  - It holds the serialized intent, relay data, chain keys, addresses and amounts.
  - It is the confirmation token, so the model never re-types bigint intent fields.
  - The cache is in-process in phase 1.
- **Track semantics:** `submit-tx` expects a mined source tx. So `track` checks the receipt first, then submits once and
  polls. Each call is cheap and idempotent.

## Safety rules

- Never sign or broadcast.
- Never accept private keys, mnemonics or API keys as inputs. If an input looks like one, reject it and explain.
- `track` and `cancel` work from a `quoteId` or an on-chain lookup. They never trust intent fields pasted by the model.
- Slippage and deadline are bounded.
- An oracle USD check with a configurable per-quote ceiling warns but does not block. The signer is the real gate.
- Canary vs production is an env switch, never a per-request flag.
- Outputs state plainly what the agent must do next.
- No secrets in logs. Analytics carry `quoteId` and chains, never full addresses.

## Out of scope (phase 1)

- Local signing.
- Linked or embedded wallets.
- Limit orders.
- Bridge, money market, staking and leverage yield. Phase 2 reuses the action template for these.
- A multi-instance quote cache.
- Renaming the package.

## Acceptance criteria

- All sub-issues closed.
- An agent connected to `/mcp?profile=swap` can quote, receive unsigned txs, and track an EVM to EVM swap to `solved` on
  canary without the server ever signing.
- The `builder` profile serves today's tool set unchanged.

## Open items in the epic, with the plan's answer

| Open item | Answer in `plan.md` |
|---|---|
| Do receipt checks work with packaged default RPCs, or do they need paid overrides? | Public defaults per family; operators override via `SODAX_RPC_URL_<CHAIN>` (decisions 2 and 8) |
| Do anonymous callers get tx data, or only keyed ones? | Keyless callers get tx data. The API key guard runs in `monitor` mode on prod and canary (decision 7) |
| How should MCP-originated intents be tagged for partner fees? | No partner fee in phase 1 (decision 7) |

## Sub-issues: what each one solves

### #80 ADR: Sodax MCP execution model

- **Solves:** the reasoning behind the phase 1 decisions lives in chat. Contributors and later phases need it in the
  repo.
- **Work:** an ADR under `docs/adr/` covering D1–D6, plus a comparison with existing cross-chain swap MCPs.
- **Done when:**
  - the ADR is merged and linked from the README;
  - each decision has context, decision and consequences.

### #81 Adopt @sodax/sdk and @sodax/types as the client layer

- **Solves:** hand-rolled REST clients drift from the backend and can mis-encode intents and relay data.
- **Work:**
  - Exact-pin the SDK and types.
  - Build one `Sodax` instance from env: a canary/production switch, RPC overrides, and per-request API key forwarding.
  - Replace `solver.ts` and `relay.ts` with SDK calls where a client exists.
  - Keep `sodaxApi.ts` and the drift check for the rest.
  - Update `sodax-deps.yaml`.
- **Done when:**
  - existing tools pass their tests unchanged;
  - the gates are green;
  - the caller's key is forwarded on Swaps API calls.

### #82 Tool profiles (builder, swap, all)

- **Solves:** 38 tools in one flat list already strain MCP clients, and adding swap tools makes it worse.
- **Work:**
  - Add a profile tag per tool in `toolRegistry.ts`.
  - Filter at session start by `?profile=`, a header, or `--profile`. `all` is the default.
  - List the profiles in `server.json`.
- **Done when:**
  - `?profile=builder` serves exactly today's tools;
  - an unknown profile returns a clear error;
  - tests cover query, header and stdio selection.

### #83 Token and chain resolver + sodax_resolve_token

- **Solves:** agents say "USDC on Arbitrum", not hub-asset addresses. Every swap tool depends on resolution.
- **Work:**
  - Resolve chains by name, alias or key.
  - Resolve tokens by symbol, alias or address.
  - Convert human units to base units and back.
  - Back it with `@sodax/types` and the live `/config/spoke/chains`.
- **Done when:**
  - ambiguous cases have unit tests: USDC variants, native vs wrapped, case and alias spellings;
  - unresolvable input returns candidates, not an error dump.

### #84 sodax_swap_quote

- **Solves:** the swap flow needs one entry point, shaped like other swap MCPs.
- **Work:**
  - Human-unit inputs, bounded slippage and deadline, and the Stacks and Bitcoin extras.
  - Without an address: price, minimum output, fees, speed tier and expiry.
  - With an address, it also returns:
    - the allowance state;
    - unsigned approve tx(s);
    - the unsigned intent tx;
    - a cached `quoteId`.
- **Done when:**
  - canary contract tests pass for EVM, Sonic and one non-EVM source;
  - the output states the next step;
  - the `quoteId` round-trips into track and cancel.

### #85 sodax_swap_track and sodax_swap_cancel

- **Solves:** the backend needs `submit-tx` after broadcast. Folding it into track means agents cannot forget it.
- **Work:**
  - `track` checks the receipt per chain family and returns `awaiting_source_confirmation` until the tx is mined.
  - It then calls `submitTx` once (idempotent) and returns a humanized status.
  - The status carries `failedAtStep`, `userMessage`, the fill tx hash and a next-step hint.
  - `cancel` returns an unsigned cancel tx.
- **Done when:**
  - a mocked state-machine test covers every status;
  - a canary E2E EVM to EVM swap is tracked to `solved`;
  - repeated track calls are idempotent.

### #86 sodax_get_balance

- **Solves:** agents must check funds and allowance before asking the user to sign.
- **Work:**
  - Return native and token balances.
  - With `token`, also return the allowance toward the SODAX spender.
  - Use the SDK's RPC config per family, with an optional caller RPC.
- **Done when:**
  - it works for all phase 1 source chains;
  - a caller RPC is respected, and the packaged default is used otherwise.

### #87 Safety rules and analytics for the swap profile

- **Solves:** the server is public and agent-facing. Each guardrail prevents a class of expensive mistakes.
- **Work:**
  - Implement the safety rules above.
  - Emit PostHog events with `quoteId` and chains, never full addresses.
  - Send a Discord alert on swap-path errors.
- **Done when:**
  - each rule has a test;
  - analytics and alerts stay off when their env vars are unset.

### #88 E2E swap on canary in CI

- **Solves:** only a real swap proves the flow end to end; unit tests cannot.
- **Work:** a scheduled workflow, not run per PR. It runs a real EVM to EVM swap through `sodax_swap_quote`, signs with
  viem from a funded test wallet held in a repo secret, and tracks the swap to `solved`.
- **Done when:**
  - the workflow is green on schedule;
  - failures alert Discord;
  - no secrets are printed in logs.

### #89 Docs, registry metadata and skills for the swap profile

- **Solves:** agents and builders must find the flow in the registries and docs they already use.
- **Work:**
  - A README walkthrough: quote, sign externally, track.
  - `server.json` and Glama metadata listing the profiles and new tools.
  - A docs.sodax.com page.
  - A `@sodax/skills` entry on when to use the MCP versus the SDK.
- **Done when:**
  - README, `server.json` and `glama.json` are updated;
  - the docs page is merged in `sodax-sdks`;
  - the skills entry is merged.

## Where `plan.md` departs from the issues

| Issue | Issue says | Plan does | Why | Plan ref |
|---|---|---|---|---|
| D2 | A gateway in front of `builders.sodax.com` enforces keys and limits | Keeps the app's own rate limiter; guards outbound Swaps API calls | No gateway sits in front of `builders.sodax.com`; only `api` and `canary-api` sit behind one | Decision 6 |
| D3, #81 | `@sodax/sdk` + `@sodax/types` | `@sodax/swaps-api` + `@sodax/types` + `viem` | The full SDK is 777 MB with 35 advisories; `sodax.api.swaps` wraps the same client | Decision 1 |
| #84 | Intent tx from `getQuote(…, {includeTxData})`; output partner fee and speed tier | `createIntent` with explicit minimum output and deadline; no partner fee or speed tier | `includeTxData` sets deadline 0 and zero slippage. The API has no speed-tier field, and the partner fee is always 0 | Decisions 3 and 7 |
| #85 | Cancel returns an unsigned tx | A second call relays the signed cancel; not offered for Solana or Bitcoin sources | The backend returns only the unsigned tx, and no endpoint provides Solana or Bitcoin relay data | Decision 5 |
| #86 | Optional caller `rpcUrl` | RPC overrides from env only | SSRF, and paid RPC URLs embed keys | Decision 8 |
| #89 | List profiles and tools in `glama.json` | No change to `glama.json` | Its schema supports only `maintainers` | — |

## Related

- Handoff note seen 2026-10-21: "to be taken over by @0xmatterhorn", the user's Discord handle.
- The sodax-sdks v3 plan T33 (`gh-519`) anticipated "build-unsigned-tx tools in the Builders MCP".
- Same lane as sodax-sdks#529 (`useSwapsApiSwapLifecycle`, not built yet).
