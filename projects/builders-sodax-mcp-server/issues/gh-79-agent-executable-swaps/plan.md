---
type: plan
repo: builders-sodax-mcp-server
github: 79
tags: [mcp, swaps-api, agents, non-custodial]
updated: 2026-10-22
---

# GH-79 Builders MCP agent-executable swaps — verdict

Status: plan only, no code yet. Work starts after the §7 prerequisites and the user's go-ahead.

## Goal

`builders.sodax.com/mcp` becomes a non-custodial swap server. An agent gets a quote with unsigned txs, the user's
wallet signs them, and the server submits and tracks the swap to `solved`.

The epic is done when:
- an EVM→EVM swap on canary reaches `solved` through `/mcp?profile=swap`, and the server never signs;
- the `builder` profile is unchanged;
- all ten sub-issues are closed.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Client layer: `@sodax/swaps-api@2.2.0` + `@sodax/types@2.2.0` + `viem`, exact pins; `engines >=22.12.0`. Not the full `@sodax/sdk`. | Full SDK 2.2.0: 777 MB, ~260 MB RSS, 35 npm advisories (11 high). Light set: 82 MB, 0 advisories. The SDK's `sodax.api.swaps` wraps this same client. Amends epic D3; the ADR records it. |
| 2 | Chain reads (balance, receipt, allowance): one small read-once reader per family behind a `ChainReader` interface, on the repo's `fetchJson`. Swap each family to an SDK v3 chain plugin when those ship. | 2.2.0 has no light reusable reader. The interface keeps the later switch mechanical. |
| 3 | Build the intent tx with `createIntent`, passing an explicit `minOutputAmount` (from slippage) and `deadline` (`getDeadline`). | `getQuote(…, {includeTxData})` sets `deadline: 0` (never expires) and minOut = quote (zero slippage). |
| 4 | `track`: read status → if not submitted, one receipt check → EVM: the mined input must contain the quote's calldata → `submitTx` once → status. | `submit-tx` verifies nothing on-chain. Smart wallets and EIP-5792/7702 batches wrap the calldata, so match by containment, not equality. |
| 5 | `cancel`: first call builds the unsigned cancel tx; second call, with `cancelTxHash`, checks its receipt and relays it (`submitIntent`). Not offered for Solana or Bitcoin sources. | The backend only returns the unsigned tx. No endpoint provides Solana/Bitcoin cancel relay data. |
| 6 | Swaps API calls use a guarded `fetch`: submit budget ≤ 8/min, a circuit that honours `Retry-After`, and fail-fast `RATE_LIMITED {retryAfterSec}`. Builder tools are untouched. | Every user shares the server's IP: `submit-tx` allows 10/60 s per IP, and the edge jails an IP after a flood. `SwapsApi` retries 429 with no delay. |
| 7 | Forward the caller's `x-api-key` on Swaps API calls only (stdio: `SODAX_API_KEY`); one client per request. No partner fee. | Attribution follows the key at submit-tx. The partner fee is not key-driven today. |
| 8 | No per-call `rpcUrl`. Operators override RPCs via `SODAX_RPC_URL_<CHAIN>`. Amends #86's AC; the ADR records it. | A hosted server must not fetch caller URLs (SSRF), and paid RPC URLs embed their keys. |
| 9 | Profiles `builder` / `swap` / `all` (default `all`), selected by `?profile=`, `x-sodax-profile` or `--profile`/`MCP_PROFILE`. Filtering happens when the server is created; the registry still lists every tool. Unknown profile → HTTP 400 JSON-RPC `-32602`. | Epic D4; keeps `builder` byte-identical. |
| 10 | Quote cache is in-process: TTL = deadline + 30 min, max 10k entries, never stores the Bound token. Losing a cache entry for a swap already mined raises an operator alert. | Epic scope is in-process for phase 1. The grace period keeps a tx signed near expiry submittable. |
| 11 | Before building txs, check the user's balance and the destination: NEAR storage registration, Stellar trustline. | The backend checks neither; funds sent to an unready NEAR/Stellar account strand. |
| 12 | Safety rules — see the breakdown below this table. | Epic safety rules. |

Decision 12 breakdown:
- Secret screening on every string input. Exempt fields: `txHash`, `cancelTxHash`, `bound.accessToken`.
- A bare 32-byte hex value counts as a private key, except in Sui and NEAR address fields, where it is a valid
  address.
- Bounds: slippage 1–500 bps (default 100); deadline 5–60 min (default 15).
- Logging and alerts: pino redacts keys; PostHog swap events carry no addresses; Discord alerts are deduped.

## Constraints the implementation must respect

**Swaps API**
- Base URL: `https://{api|canary-api}.sodax.com/v1/swaps/*`; 21 routes.
- Canary uses mainnet chains, so canary swaps move real funds.
- `submit-tx`:
  - takes `{txHash, srcChainKey, walletAddress, intent (bigints), relayData: payload hex}`;
  - is idempotent: `inserted` / `duplicate`, and the first writer wins;
  - rejects a new intent whose deadline has passed with a 400.
- Statuses run `pending → relaying → relayed → posting_execution → posted_execution → solved | failed`, plus
  `failedAtStep`, `userMessage`, `intentCancelled`, `abandonedAt`, `relayedForRefundAt`, and
  `result.{dstIntentTxHash, fillTxHash?}`. An unknown tx returns 404.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
- Approve returns `{tx, resetTx?}`. It approves the exact amount to the chain's `assetManager`.
- An amount that is too small returns `422 code -23`.

**Chain readers**
| Family | Source |
|---|---|
| EVM | viem |
| Solana | JSON-RPC |
| Sui | GraphQL at `graphql.mainnet.sui.io` (public fullnode JSON-RPC is off) |
| Stellar | Horizon |
| NEAR | JSON-RPC; `tx` needs the signer |
| ICON | v3 JSON-RPC |
| Stacks | Hiro |
| Bitcoin | mempool.space |
| Injective | LCD `sentry.lcd.injective.network` |

ICON and NEAR send JSON-RPC errors with HTTP 400, so read the body before the status.

**`@sodax/types` sources**
- `spokeChainConfig`: chain families, RPCs, `assetManager`, `nativeToken`, `trustlineConfigs`.
- `baseChainInfo`: explorer URLs.
- `getIntentRelayChainId`: relay chain IDs.

**Fixes in this repo**
- `src/constants.ts` points the relay at a private host. Move it to `api.sodax.com/v1/relay/`.

## Architecture and reuse

**Reused as-is**

From this repo:
- `resolveChainKey` and `CHAINS`/`CHAIN_ALIASES`
- `fetchJson`/`fetchJsonOrNull`
- `notifyError`
- `getSolverOracle`
- `withAnalytics` (extended)
- the tool registry (`recordTool` split out of `registerAppTool`)
- landing-page placeholders
- `logger`

From packages:
- `@sodax/swaps-api`: all Swaps API calls, response validation, per-chain raw-tx schemas.
- `@sodax/types`: `spokeChainConfig`, `baseChainInfo`, `getIntentRelayChainId`, `CHAIN_KEYS`, `IntentRequestV2`.
- viem: `erc20Abi`, `isAddress`, BIP39 wordlist.

Mirrored from the SDK, not imported:
- `toIntentRequest`
- each family's RPC calls

**New files** (each with a colocated `*.test.ts`)

```
src/services/{sodaxClient,guardedFetch,requestContext,profiles}.ts
src/services/chains/{index,types,jsonRpc,evm,solana,sui,stellar,near,icon,stacks,bitcoin,injective}.ts
src/services/swap/{errors,units,addresses,resolver,safety,quoteCache,intent,wireTx,quote,status,track,cancel,balance,alerts}.ts
src/tools/{actionTool,swap}.ts
docs/adr/0001-sodax-mcp-execution-model.md
```

**Changed files**

- `src/index.ts`: per-request context, profiles, `/health` swap count, `/api` profiles.
- `src/constants.ts`: `SODAX_ENV` bases, relay host.
- `src/services/analytics.ts`: wrap `registerTool`; count `isError` as failure; scrub errors.
- `src/services/toolRegistry.ts`: `swap` module.
- Landing page: swap card.
- `README.md`, `server.json`, `package.json`, `sodax-deps.yaml`, `.env.example`.

## Work per sub-issue

Order: #80 → #81 → #82 → #83 → #86 → #84 → #85 → #87 → #88 → #89. All on one branch, in one PR; the ADR goes in first as
a draft for R0bi7.

| # | Work | Done when |
|---|---|---|
| 80 | ADR: D1–D6 restated with the decisions above. Records the shared-IP limits, the restart window, the `enforce` key mode, cancel coverage and the `rpcUrl` change. Includes a comparison with LI.FI and deBridge MCPs. | Merged; README links it |
| 81 | Pins, `sodaxClient` / `guardedFetch` / `requestContext`, `SODAX_ENV`, relay fix. `solver.ts` / `relay.ts` stay direct REST. | Existing tests unchanged; key isolation and guard tests; `docker build` size noted |
| 82 | Profiles, `swap` module, landing card, `/api` profiles. `server.json` URL template `?profile={profile}` plus an optional secret `x-api-key` header. | Selection via query, header and stdio; `builder` snapshot; `swap` = 5 tools; unknown profile → 400 |
| 83 | Resolver: address → symbol / `native` → fuzzy match (always `ambiguous`) → `not_found` + suggestions (the native token first for wrapped names). Strict `units.ts`. `sodax_resolve_token`. | Fixture tests: Sonic WETH / sodaETH, Hyper USDC / USDT0, ICON legacy bnUSD, "WETH on Arbitrum" → ETH (native), "ETH" ≠ Tether |
| 86 | `ChainReader` per family; EVM allowance toward `assetManager`; env RPC overrides; `sodax_get_balance`. | Recorded-fixture tests per family; one live read per family (no funds) |
| 84 | Quote per decision 3 and decision 11. Price-only mode when no address is given. `MISSING_INPUT` when a Stacks source lacks `srcPublicKey` or a Bitcoin source lacks `bound.accessToken`. Solana blockhash warning. EVM steps marked batchable (EIP-5792). | Canary contract tests for EVM, Sonic, Solana and Sui sources; `AMOUNT_TOO_LOW`, `INSUFFICIENT_FUNDS` and `DESTINATION_NOT_READY` covered |
| 85 | `track` / `cancel` per decisions 4 and 5. MCP-only states: `awaiting_source_confirmation`, `source_failed`, `queued`, `expired_unsubmitted`, `not_submitted`, `not_submitted_unknown_quote`. | State-machine tests; 5 calls → 1 submit; calldata-mismatch and smart-wallet batch cases |
| 87 | Safety and analytics per decision 12. | One test per rule; a tx hash is not flagged; no addresses in analytics |
| 88 | `scripts/e2e/swapCanary.ts` (MCP client + viem signer, 5 USDC, alternating direction) and `e2e-canary.yml` (daily + dispatch, never on PRs, Discord on failure, balance floor). | One green scheduled run + one deliberate red run |
| 89 | README swap walkthrough and `server.json` tools. In `gosodax/sodax-sdks`, under its own issue linked as a sub-issue of #89: update `docs/builders-mcp.mdx` and add the skill `packages/skills/skills/sodax-sdk/builders-mcp/SKILL.md`. | sodax-sdks docs and skills gates green |

## Verification

1. Every commit: `pnpm checkTs && pnpm lint && pnpm build && pnpm test`, plus `docker build`.
2. Every PR: an in-process MCP `Client` ↔ server test over `InMemoryTransport`, with fetch-level fakes, walking
   quote → track (all states) → cancel.
3. Before the PR leaves draft: live role-play on canary with real funds (S1–S14).
   - Setup: I play the agent; a scratch viem script plays the user's wallet.
   - Swap flows:
     - approve + swap;
     - a repeat swap with no approve;
     - a native-token source;
     - cancel.
   - Rejections:
     - amount too low;
     - insufficient funds;
     - ambiguous token;
     - pasted secret;
     - wrong tx hash.
   - Robustness:
     - repeated `track` calls;
     - server restart mid-swap;
     - quotes from non-EVM sources.
   - Connection:
     - profile selection;
     - keyed run.
4. After merge: the scheduled canary E2E (#88).

## Prerequisites before code

1. The user confirms they are taking the epic and is assigned. The handoff named "@0xmatterhorn", which is not a
   GitHub login. R0bi7's issue bodies are never edited.
2. R0bi7 agrees to the ADR decisions.
3. A test wallet with ~20 USDC and gas on Arbitrum and Base, plus a canary API key.
4. A gosodax admin adds the E2E secrets and sets `SODAX_ENV=canary` on staging.
5. Go-ahead to create the sodax-sdks issue for #89.

## Follow-ups for other owners

Raise these in our PR thread; no new tracker issues.

**Backend (swaps-api)**
- (a) Make the `submit-tx` throttle per key or MCP-aware, not per IP.
- (b) Verify the source receipt inside `submit-tx`.
- (c) Accept `submit-tx` with only `(txHash, srcChainKey)` and derive the intent from chain. On EVM the calldata
  carries the relay payload and the intent. This removes the MCP's restart window.

**SDK v3 (gh-519)**
- Replace the readers with chain plugins (T1, T5, T8).
- Move to `@sodax/api/swaps` (T28).
- Align `track` with the shared lifecycle core (T18.2, #529/#531).

## Risks

- **Restart window:** losing the in-process cache needs an operator relay; an alert fires when it happens.
- **Submit throughput:** about 8 submits/min server-wide until follow-up (a).
- **Non-EVM readers:** proven on historical data only, not on live swaps.
- **Public RPC rate limits:** operators can override RPCs via env.
- **Bitcoin:** needs a Bound token minted in the user's browser and cannot be cancelled through the API.
