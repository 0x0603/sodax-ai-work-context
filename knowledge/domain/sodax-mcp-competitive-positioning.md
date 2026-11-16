---
type: knowledge
area: domain
status: Draft
tags: [mcp, agents, competition, positioning, near, limit-order, roadmap, custody]
updated: 2026-11-16
related_issues: [gh-118-swap-from-non-evm, gh-116-agent-feedback, gh-120-rpc-config, task-agent-architecture-outlayer-mcp]
related_decisions: []
---

# SODAX MCP: competitive positioning and roadmap

## Summary

Don't race NEAR or Coinbase on custody and agent wallets, or LI.FI on chain count. Make the SODAX MCP the safest,
most complete non-custodial cross-chain execution layer, and plug it into whatever wallet an agent already has.
The first step is being live: the swap tools aren't in production yet.

Labels: **[code]** checked in source, **[vendor]** from the vendor's own docs or press, not verified,
**[judgement]** my opinion. Written 2026-11-16 from a session on gosodax/builders-sodax-mcp-server.

## Landscape

Two layers. **[vendor]** throughout; chain counts are their claims.

1. **Route and swap MCPs**, the layer SODAX is in:
   - LI.FI: hosted MCP over its REST API, 58 chains, 27+ bridges, 31+ DEXes; a separate LI.FI Intents MCP that
     holds no private keys.
   - deBridge: official MCP since February 2026; quotes, transaction data and deBridge App links for the user to
     execute.
   - Symbiosis: MCP with 50+ chains and a local execution mode.
   - 1inch: community MCP only (Fusion+), not official.
2. **Agent wallets with spending limits:**
   - Coinbase Agentic Wallets: keys in a TEE, programmable spending limits, session caps.
   - Crossmint: smart-contract wallets whose contract enforces the limits.
   - NEAR Agent API / OutLayer: keys in a TEE, an encrypted on-chain policy, cross-chain through NEAR Intents.

## Where SODAX stands

- **[code]** 19 swap sources over 22 SDK chains (all but Bitcoin, Stacks, ICON), counting #118's non-EVM sources.
- **[code]** The MCP never signs. It builds the transaction, checks what the user signs (EVM byte for byte,
  non-EVM by the connection's own messages, #124), then submits, tracks, cancels and refunds.
- **[code]** Swap tools aren't in production (#123's commit, 2026-11-12). Quotes live in process memory.
- **[judgement]** On chain count SODAX loses. Its edge is what the other layer-1 MCPs, by their docs, stop short of
  after "quote + transaction data": verification before signing, the full lifecycle, and native non-EVM sources.

## What NEAR's Agent API teaches

- **Learn:** the agent never gets stuck at signing; delegated authority (budget, expiry, allowed actions,
  revocation) as a product; one account and one API; durable backend state; consumer chat on near.com.
- **Keep:** non-custodial verification (small blast radius, the answer to "how secure is letting an agent control
  money"), swaps from users' own wallets on many chains, the hub/solver/relay settlement.
- Detail and sources: `projects/sodax-command-center/issues/task-agent-architecture-outlayer-mcp/`.

## Roadmap, in order **[judgement]**

1. **Live and trustworthy.** Merge #117 (Sonic), #124 (non-EVM), #128 (builder tool inputs and JSON). Real signed
   swaps per non-EVM family, the largest test gap. #125 Redis quote store; #127 delivery to the destination chain.
2. **Make the edge usable by agents.** #129 machine-readable `nextAction` in every swap result (plan in its first
   comment); #126 price-only quote mode; a balance check at quote; per-family signing docs with code proven by real
   swaps; lead the docs and listings with "checks before you sign".
3. **Turn layer 2 into distribution.** Because SODAX holds no keys, any agent wallet can sign what it prepares:
   examples or adapters for Coinbase AgentKit (an action provider), Crossmint and OutLayer, inside their limits.
   Compatibility with each is not checked yet.
4. **Differentiating feature:** non-custodial cross-chain limit orders (below), after #125 and #129, ideally with a
   partner that needs them.
5. **Later, after aligning on risk:** delegated mode (an agent account with limited, on-chain enforced authority).
   Not a race to enter early; if built, enforce limits in a contract, not only in an API.

Not worth doing: a `sodax_get_capabilities` tool (tools/list, init instructions and `UNSUPPORTED_SOURCE` already
answer; add the source chains to the quote description instead); per-step gas estimates.

## Limit orders

- **[code]** The SDK has `createLimitOrder`, `createLimitOrderIntent` and `cancelLimitOrder` (an alias of
  `cancelIntent`): a swap intent with `deadline = 0`, open until filled at `minOutputAmount` or cancelled.
- MCP additions **[judgement]**: a prepare tool taking a target price (converted to `minOutputAmount`, compared
  with the current market price), an `open` state in tracking, a list of a wallet's open orders (the builder
  tools `sodax_get_orderbook` and `sodax_get_user_transactions` exist; filtering by wallet not checked), cancel
  through the existing flow. "Edit" is cancel plus create: two signatures.
- Prompts it serves: "buy 0.5 ETH when it drops to 2,000 USDC", take-profit sells, laddered buys, cross-chain
  limits ("buy SOL on Solana with USDC on Base below 150"), "did my order fill?", "cancel my ETH order".
- Not a stop-loss: a limit order only guarantees "at least this price", so a low limit fills at market at once.
  Stop-losses need a runtime watching prices (#126) and then a swap.
- Trade-off against runtime price watching: no agent needs to stay awake, but funds are locked and cancelling
  costs a signature and gas.
- Depends on #125 (orders live for days) and #129 (an action type for "open, check when asked").

## Target customers **[judgement]**

1. **Builders of trading agents and partners already on the SDK** (wallets, aggregators, Telegram bots): first.
   The MCP is a builder product, they bring the wallet and the runtime that signs, and volume and partner fees
   are attributed by API key at submit.
2. **Retail users of AI assistants:** set and forget without staying online, keys stay in their wallet; reached
   through partner apps rather than the raw MCP while chat-only clients can't sign, non-EVM especially.
3. **Treasuries, DAOs, pro traders:** laddered accumulation and cross-chain rebalancing; need delegated mode,
   so later.

Not a fit: high-frequency traders (latency, a signature per cancel), stop-loss users.

## Related

- Issues (gosodax/builders-sodax-mcp-server): #117, #124, #125, #126, #127, #128, #129; epics #79, #119.
- Dossiers: `projects/builders-sodax-mcp-server/issues/gh-118-swap-from-non-evm/`,
  `projects/builders-sodax-mcp-server/issues/gh-116-agent-feedback/`,
  `projects/sodax-command-center/issues/task-agent-architecture-outlayer-mcp/`.

## Sources

- LI.FI MCP: https://docs.li.fi/mcp-server/overview
- LI.FI Intents MCP: https://docs.li.fi/lifi-intents/mcp-server/overview
- deBridge MCP: https://docs.debridge.com/dln-details/mcp/mcp-server.md
- The Block on deBridge MCP: https://www.theblock.co/post/390021/debridge-launches-mcp-enabling-ai-agents-to-execute-non-custodial-cross-chain-transactions
- Symbiosis comparison: https://symbiosis.finance/blog/best-mcp-servers-for-defi-comparison
- 1inch community MCP: https://glama.ai/mcp/servers/hrkocwzvzk
- Coinbase Agentic Wallets: https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets
- Crossmint agent wallets: https://www.crossmint.com/products/agentic-wallets
- OutLayer agent custody: https://outlayer.fastnear.com/docs/agent-custody
- SODAX SDK limit orders: `sodax-sdks` `docs/developers/packages/foundation/sdk/functional-modules/swaps.md`, "Limit Orders"
