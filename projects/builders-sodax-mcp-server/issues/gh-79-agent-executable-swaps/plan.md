---
type: plan
repo: builders-sodax-mcp-server
github: 79
tags: [mcp, swaps-api, agents, non-custodial]
updated: 2026-10-26
---

# GH-79 Builders MCP agent-executable swaps — verdict

Status: plan only, no code yet. Follows the ADR on PR #90 @ `f59edf0` (revised after the 2026-10-23 design
discussion in `process.md`). Where the two disagree, the ADR wins.

## Goal

`builders.sodax.com/mcp` becomes a non-custodial swap server. An agent gets a quote with unsigned txs, the user's
wallet signs and broadcasts them, and the server submits and tracks the swap to `solved`.

The epic is done when:
- an EVM→EVM swap on canary reaches `solved` through `/mcp?profile=swap`, and the server never signs;
- the `builder` profile is unchanged;
- all ten sub-issues are closed.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Client layer: `@sodax/sdk@2.2.0` + `@sodax/types@2.2.0`, exact pins. pnpm overrides for `axios`, `bigint-buffer`, `toml`; `ws` has no fix, so track it. `engines.node >=22.12.0`. One `Sodax` from env at boot; Swaps API calls carry the caller's key per call. ADR D3. | Later phases (money market, staking) have no BE tx builder and the SDK covers them. Chosen 2026-10-23 over the light set (`@sodax/swaps-api` + `viem`: 82 MB, 0 advisories) despite 777 MB and 11 high advisories. |
| 2 | Phase 1 sources: EVM and Sonic. Others open once BE checks source txs in `submit-tx`. Destinations: any. The server reads only EVM source chains, NEAR and Stellar. ADR D5. | No per-family reader to build or prove. |
| 3 | Build the intent with `createIntent`, explicit `minOutputAmount` (from slippage) and `deadline` (`getDeadline`). | `includeTxData` sets `deadline: 0` and minOut = quote; BE never auto-cancels a deadline-0 intent. |
| 4 | `track`: read status → if not submitted, check the EVM receipt succeeded and holds the `connection` log carrying the cached relay payload → `submitTx` once → status. | `submit-tx` checks only dedup and deadline. Input matching is not enough. The check belongs in BE; MCP does it until BE does. |
| 5 | `cancel`: first call checks status (solved → say so), else returns the unsigned cancel tx; second call, with `cancelTxHash`, checks the receipt and relays via `/swaps/intents/submit`. Intent from the hub or quote cache only. | The cancel endpoint only builds the tx. Solana/Bitcoin need relay data cancel never returns; they rely on deadline expiry and the BE canceller. |
| 6 | Keys and limits: behind HAProxy (R0bi7, Slack 2026-10-23). **Swap tools require an API key** (user's call, 2026-10-26): no `x-api-key` (stdio: `SODAX_API_KEY`) → `?profile=swap` refused with "API key required", `all` serves only the builder tools. MCP checks presence only; BE decides validity. Builder tools stay keyless; a key, when sent, goes on every BE call. Drop the MCP limiter once behind the edge. 429 → `RATE_LIMITED {retryAfterSec}`; 401/403 → "API key required". ADR D2 (edited 2026-10-26, uncommitted). | Every swap attributed to a key; swap traffic stops sharing the MCP's IP budget; keyless `all` connections stay byte-identical. A made-up key passes until BE enforces. |
| 7 | Partner fee from the connection only: `x-sodax-partner-address` / `x-sodax-partner-fee-bps`, query `partnerAddress` / `partnerFeeBps`, stdio `SODAX_PARTNER_FEE_ADDRESS` / `SODAX_PARTNER_FEE_BPS`. EVM address, 1–100 bps, else HTTP 400 at connect. Same fee on quote and intent, cached with the `quoteId`, shown in the quote. | A prompt can't redirect the fee. Org-level fee in BE later. |
| 8 | No per-call `rpcUrl`; RPC overrides from env. | SSRF; paid RPC URLs embed keys. |
| 9 | Profiles `builder` / `swap` / `all` (default `all`) via `?profile=`, `x-sodax-profile`, `--profile`/`MCP_PROFILE`. Unknown → HTTP 400 JSON-RPC `-32602`. Plus a boot-time rollout switch, default off. ADR D4. | Keeps `builder` byte-identical. |
| 10 | Quote cache in process: TTL = deadline + 30 min, max 10k, never stores the Bound token. A mined swap whose entry is lost → `not_submitted_unknown_quote` + operator alert. | Phase 1 scope. |
| 11 | Balances from a BE endpoint; NEAR storage and Stellar trustline checked with the SDK before building. ADR D6. | Needs the BE balance route (prerequisite 5). |
| 12 | Safety rules per the ADR: secret screening (exempt tx hashes, valid addresses/tokens on the chosen chain, the Bound token); bounds rejected, not clamped (slippage 1–500 bps default 100, deadline 5–60 min default 15); USD warn threshold; `SODAX_ENV` at boot only; no addresses in analytics. | ADR §Safety rules. |

## Constraints the implementation must respect

**Swaps API**
- Base URL: `https://{api|canary-api}.sodax.com/v1/swaps/*`. Canary uses mainnet chains: real funds.
- `submit-tx`: `{txHash, srcChainKey, walletAddress, intent (bigints), relayData}`; idempotent (`inserted` /
  `duplicate`); rejects a new intent past its deadline with 400; 10 per 60 s per IP.
- Statuses: `pending → relaying → relayed → posting_execution → posted_execution → solved | failed`, plus
  `failedAtStep`, `userMessage`, `intentCancelled`, `abandonedAt`, `relayedForRefundAt`,
  `result.{dstIntentTxHash, fillTxHash?}`. Unknown tx → 404.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
- Approve returns `{tx, resetTx?}` for the exact amount to the chain's `assetManager`.
- Amount too small → `422 code -23`.

**SDK 2.2.0 surface** (read from `sodax-sdks` tag `@sdks@2.2.0`, 2026-10-26; published 2026-10-12, past the cooldown)
- `SwapsApiService`: every method takes an optional `RequestOverrideConfig`; a per-call `apiKey` wins over the
  configured key. 401/403 map to an API-key error.
- `SolverApiService`: `getQuote`, `postExecution`, `getStatus`. No `/oracle`.
- `IntentRelayApiService`: `submitTransaction`, `getTransactionPackets`, `getPacket`.

**The SDK does not fit the builder tools** (proposal for #81, awaiting the user's OK):
- `sodax_get_solver_quote` takes hub (Sonic) asset addresses and calls the solver's `/quote` raw. SDK `getQuote`
  takes spoke original-asset addresses, throws an `invariant` for tokens outside its bundled config, and sends only
  the instance-level key.
- The relay answers "packet not found" as 404 with a JSON body that today's tools surface. The SDK turns non-2xx
  into `HttpRelayError`, retries, and sends no key.
- So `solver.ts` and `relay.ts` stay REST; the SDK enters with the swap tools (`SwapsApiService` in #84,
  `@sodax/types` in #83).

**Fixes in this repo**
- `src/constants.ts` points the relay at a private host. Move it to `api.sodax.com/v1/relay/` (same protocol;
  probed 2026-10-26).

**Hub coupling**
- The hub's `repos.yaml` lists this repo as `visibility: public`, `depends_on: [sodax-backend, sodax-solver-v2,
  intent-relay]`. Adding `sodax-sdks` to `sodax-deps.yaml` needs the same change in the hub, or the hub's
  `depends-on` check fails. Public repo: keep PR text free of internal detail.

## Architecture and reuse

**Reused as-is:** `resolveChainKey`, `CHAINS`/`CHAIN_ALIASES`, `fetchJson`/`fetchJsonOrNull`, `notifyError`,
`getSolverOracle`, `withAnalytics` (extended), the tool registry (`recordTool` split out of `registerAppTool`),
landing-page placeholders, `logger`, `sodaxApi.ts` and the drift check.

**From packages:** `@sodax/sdk` (`SwapsApiService`, NEAR storage and Stellar trustline helpers); `@sodax/types`
(`spokeChainConfig`, `baseChainInfo`, `getIntentRelayChainId`, `CHAIN_KEYS`, `IntentRequestV2`).

**New files** (each with a colocated `*.test.ts`)

```
src/services/{sodax,requestContext,profiles,partnerFee}.ts
src/services/swap/{errors,units,addresses,resolver,safety,quoteCache,intent,wireTx,quote,status,track,cancel,balance,evmReceipt,alerts}.ts
src/tools/{actionTool,swap}.ts
```

**Changed files:** `src/index.ts` (per-request key, profile, partner fee; `/health` swap count; `/api` profiles),
`src/constants.ts` (`SODAX_ENV` bases, relay host), `src/services/{sodaxApi,solver,relay}.ts` (forward the key),
`src/services/analytics.ts`, `src/services/toolRegistry.ts`, landing page, `README.md`, `server.json`,
`package.json`, `sodax-deps.yaml`, `.env.example`.

## Work per sub-issue

Order: #80 → #81 → #82 → #83 → #86 → #84 → #85 → #87 → #88 → #89. **One PR per sub-issue** (`Closes #N`; user's call,
2026-10-26), each on its own branch off `development`, squash-merged. Open the next PR once the previous one is
merged, or base it on the previous branch if review lags (never a GitHub native stack). #90 is the #80 ADR PR. Code
lives in the hub submodule `sodax-command-center/repos/client/builders-sodax-mcp-server`.

Rollout gate: `development` reaches production on the weekly release, and a quote without `track` lets a user sign a
deposit nobody submits. So #82 adds a boot-time env switch, default off, that keeps the swap tools out of every
profile. Staging turns it on. Production turns it on once #85, #87 and #88 are merged and the canary run is green;
#89 drops the switch.

| # | Work | Done when |
|---|---|---|
| 80 | ADR (PR #90). | Merged; README links it |
| 81 | `requestContext` (AsyncLocalStorage) carries the caller's key from `x-api-key` / `SODAX_API_KEY`; `sodaxApi`, `solver` and `relay` forward it. `SODAX_ENV` (production/canary) bases. Relay host fix. `engines >=22.12.0`. `solver.ts`/`relay.ts` stay REST (pending the user's OK; departs from #81's text, say why in the PR). | Existing tool tests unchanged; key isolation test (two concurrent requests, two keys); `pnpm checkTs lint test build` green |
| 82 | Profiles, `swap` module, landing card, `/api` profiles, `server.json` URL template `?profile={profile}` plus secret `x-api-key`. The swap-tool key requirement (decision 6). The rollout switch. | Selection via query, header and stdio; `builder` snapshot; keyless `all` = `builder` snapshot; keyless `swap` → "API key required"; switch off → no swap tools; unknown profile → 400 |
| 83 | Add `@sodax/types`. Resolver: address → symbol / `native` → fuzzy (always `ambiguous`) → `not_found` + suggestions. Strict `units.ts`. `sodax_resolve_token`. | Fixtures: Sonic WETH / sodaETH, Hyper USDC / USDT0, ICON legacy bnUSD, "WETH on Arbitrum" → ETH, "ETH" ≠ Tether |
| 86 | `sodax_get_balance` on the BE balance route; EVM allowance toward `assetManager`. | Blocked on prerequisite 5 |
| 84 | Add `@sodax/sdk` + overrides; one `Sodax` from env. Quote per decisions 3, 7, 11. Price-only without `fromAddress`. EVM/Sonic sources only. EVM steps batchable (EIP-5792). | Canary contract tests for EVM and Sonic; `AMOUNT_TOO_LOW`, `INSUFFICIENT_FUNDS`, `DESTINATION_NOT_READY`, bad partner fee; `docker build` size recorded |
| 85 | `track` / `cancel` per decisions 4, 5. MCP states: `awaiting_source_confirmation`, `source_failed`, `queued`, `expired_unsubmitted`, `not_submitted`, `not_submitted_unknown_quote`. | State-machine tests; 5 calls → 1 submit; wrong-contract, failed-inner-call, payload-mismatch; `swap` = 5 tools |
| 87 | Safety and analytics per decision 12. | One test per rule; a tx hash is not flagged; no addresses in analytics |
| 88 | `scripts/e2e/swapCanary.ts` (MCP client + viem signer, 5 USDC, alternating) and `e2e-canary.yml` (daily + dispatch, never on PRs, Discord on failure, balance floor). | One green scheduled run + one deliberate red run |
| 89 | README walkthrough, `server.json` tools, drop the rollout switch. sodax-sdks `docs/builders-mcp.mdx` + skill `packages/skills/skills/sodax-sdk/builders-mcp/SKILL.md` under their own issue. | sodax-sdks docs and skills gates green |

## Verification

1. Every commit: `pnpm checkTs && pnpm lint && pnpm build && pnpm test`, plus `docker build`.
2. Every swap-tool PR: an in-process MCP `Client` ↔ server test over `InMemoryTransport` with fetch-level fakes,
   covering the tools merged so far; from #85 on it walks quote → track (all states) → cancel.
3. Before production turns the swap tools on: live role-play on canary with real funds — approve + swap, repeat swap,
   native source, cancel; amount too low, insufficient funds, ambiguous token, pasted secret, wrong tx hash, non-EVM
   source; repeated `track`, restart mid-swap; profile selection, keyed run, partner fee via header and query.
4. After merge: the scheduled canary E2E (#88).

## Prerequisites

1. ~~The user takes the epic.~~ Done: #79–#89 assigned to `0x0603` (2026-10-26). "@0xmatterhorn" is the user's
   Discord handle. R0bi7's issue bodies are never edited.
2. R0bi7 reviews PR #90 (amending the epic is allowed, Discord 2026-10-23). No reviewer requested yet.
3. A test wallet with ~20 USDC and gas on Arbitrum and Base, plus a canary API key.
4. A gosodax admin adds the E2E secrets and sets `SODAX_ENV=canary` on staging.
5. A BE wallet-balance route (blocks #86 and the quote's balance check). No owner yet.
6. Go-ahead to create the sodax-sdks issue for #89.

## Follow-ups for other owners

Raise these in our PR thread; no new tracker issues.

**Paul (edge)**: one key counted on the MCP hop and again on each MCP→BE call (a quote is 3–6 calls); the per-IP
write cap (120/min) and jail (1500/10 s) hit the MCP's IP unless HAProxy trusts its `X-Forwarded-For` or exempts it.

**BE (swaps-api)**: wallet balance route; `submit-tx` checks the source tx on chain; destination check in
`/swaps/intents`; `includeTxData` with slippage and deadline; partner fee per org; `submit-tx` from
`(txHash, srcChainKey)` alone.

## Risks

- **Restart window:** a lost cache entry needs an operator relay; the alert fires only on a repeat `track`.
- **Keyless builder traffic:** still shares the MCP's IP budget until the edge tells clients apart.
- **Unvalidated keys:** the MCP checks presence only; a made-up key swaps until BE enforces keys.
- **Dependency weight:** the full SDK grows the image; `ws` stays on an unfixed advisory.
- **BE dependencies:** #86 and the quote's balance check wait on the balance route.
