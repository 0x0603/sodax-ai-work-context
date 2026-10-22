---
type: plan
repo: builders-sodax-mcp-server
github: 79
tags: [mcp, swaps-api, agents, non-custodial]
updated: 2026-10-22
---

# Plan v2 — Builders MCP agent-executable swaps (epic #79, sub-issues #80–#89)

Status: **plan only** — no code exists. Implementation starts only on the user's explicit go-ahead, after the
prerequisites in §8. v1 (same day) was audited after a prototype was built and thrown away; every "verified" item
below was checked on 2026-10-22 by a live probe or a code read at a pinned commit.

## 1. Goal

Turn `builders.sodax.com/mcp` from a read-only proxy into a **non-custodial swap server**:

1. quote → unsigned txs;
2. the agent signs them with its own wallet;
3. the server submits and tracks the swap to `solved`.

Epic acceptance criteria:

- An EVM→EVM swap on canary reaches `solved` via `/mcp?profile=swap`, and the server never signs.
- The `builder` profile is unchanged.
- All sub-issues are closed.

The quality bar the user set is: optimised, easy to use, standard code, maximum reuse.

## 2. Audit — what changed from v1 and why

| Area | v1 | v2 | Why |
|---|---|---|---|
| Client layer | light client, presented as "needs R0bi7's OK" | **same choice, stronger evidence**. The ADR states it as the decision. | Full `@sodax/sdk@2.2.0`: 777 MB, 412 packages, 0.9–2 s import, ~263 MB RSS, and **35 npm advisories (11 high)** (`npm audit`, verified). Light set (`@sodax/swaps-api` + `@sodax/types` + `viem`): 82 MB, 8 ms, **0 advisories**. Judgement: the public server is mid security remediation (repo PR #71, open), and adding 11 high advisories works against that. |
| Chain reads | own readers, pending a probe | own read-once readers behind one `ChainReader` interface. **All 9 families verified live** (balance + receipt + unknown-hash cases). | No light reusable code exists. sodax-sdks v3 plans the reuse path: chain plugins (T1), no PancakeSwap (T5, −131 MB), lighter chain libs (T8), `@sodax/api` (T28). The interface lets each family swap to an SDK plugin later. |
| HTTP for readers | new `rpc.ts` with undici + SSRF guard | **reuse the repo's `fetchJson` / `fetchJsonOrNull`** (`src/services/http.ts:94,98`), plus a 20-line JSON-RPC helper. **Drop undici.** | The guard only existed for a caller-supplied `rpcUrl` (see next row). |
| `rpcUrl` input (#86) | per-call, with an SSRF guard | **no per-call `rpcUrl`.** Operator overrides come from env (`SODAX_RPC_URL_<CHAIN>`). Amends #86's AC; stated in the ADR. | A hosted server fetching caller URLs is an SSRF risk. Paid RPC URLs also carry their key in the URL, so callers would leak keys to our logs. Env overrides solve the real need (public-RPC rate limits). |
| Rate-limit guard | wrapped every gateway call, builder tools included | **Swaps API client only** (`SwapsApi({ fetch })`) | Builder behaviour stays byte-identical (AC 2). The swap path is the one that needs the submit budget and the 429 circuit. |
| EVM tx check in `track` | `from` / `to` / calldata equality | **the mined tx input must contain the quote's calldata** | Smart wallets, EIP-7702 and EIP-5792 batches wrap the call. An equality check would reject legitimate swaps. |
| Unknown-quote handling | alert on any untracked hash | alert **only** when the quoteId was ours, the cache lost it, and the tx is mined. Otherwise report `not_submitted` or `awaiting_source_confirmation`. | The prototype raised a false "SODAX was alerted, funds are safe" for a random hash. |
| Token fuzzy match | symbol or name substring | symbol substring, or a name word *starting* with the query | The prototype matched "ETH" → USDT, because "T*eth*er" contains it. |
| Quote cache loss on restart | accepted risk | **accepted for phase 1**, with a smaller window and operator alerts. Proven recoverable: the EVM swap calldata contains `relayData.payload` verbatim, and the payload contains the intent (verified by decoding with the SDK's `spokeAssetManagerAbi`). That makes this a backend follow-up (§9). | Recovering inside the MCP would copy SDK encoding internals. Recovering in the backend reuses the SDK it already runs. |

## 3. Verified facts the design relies on

**Hosting and limits**

- builders.sodax.com is not behind the API gateway: it serves its own `express-rate-limit` headers (`src/index.ts:197-213`).
- One egress IP for all users. Budgets that apply:
  - in-app `submit-tx` throttle: 10 per 60 s per IP (public spec, `swaps.controller.ts:583-584`);
  - edge: 300 requests per 10 s, 120 writes per 60 s, and more than 1,500 per 10 s blocks the IP for 10 minutes (`sodax-unified-api` `haproxy.cfg` @ fd779c7).
- The `SwapsApi` client retries 429 three times with no delay.

**Quote and intent building**

- `getQuote(…, {includeTxData})` builds `minOutputAmount = quotedAmount` and `deadline: 0` (live probe; `swaps.service.ts:133-151`).
- `POST /swaps/intents` accepts an explicit `minOutputAmount` and `deadline` (probe).
- The quote response is `{quotedAmount, txData?}`. The solver fee is 0.1%. The partner fee is always 0, and a key does not change it. No speed tier exists.
- Approve returns `{tx, resetTx?}`; the spender is the chain's `assetManager`; the amount is the exact input (decoded).

**Submit, status and cancel**

- `submit-tx` checks nothing on-chain (`swaps.service.ts:223-285`). The integration guide says: wait for the receipt first.
- `submit-tx` is idempotent (`inserted`/`duplicate`, first writer wins). A new expired intent gets a 400.
- `submit-tx` needs `{txHash, srcChainKey, walletAddress, intent (bigints), relayData: payload hex}` (`backendApiV2.d.ts:463-473`).
- Status values: `pending → relaying → relayed → posting_execution → posted_execution → solved | failed`. Extra fields: `failedAtStep`, `failureReason`, `userMessage`, `intentCancelled`, `abandonedAt`, `relayedForRefundAt`, `result.{dstIntentTxHash, fillTxHash?}`. Unknown tx → 404.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
- Cancel returns only an unsigned tx. Relaying it is `submitIntent({chainId: relay id, txHash})`. Solana and Bitcoin cancel relays need data no endpoint returns.
- Refunding an expired swap is an admin relay (`swaps-admin.service.ts:183`).

**Keys and environments**

- The key guard runs in `monitor` mode on prod and canary (`/v1/swaps/healthz/api-key-verification`). A valid key is attributed at `submit-tx`. Canary has its own key store.
- Canary uses mainnet chains (its quotes equal prod's), so canary swaps move real funds.
- 5 USDC quotes; 1 USDC returns `422 code -23`.

**Chain data**

- `@sodax/types@2.2.0` `spokeChainConfig` covers 22 chains: 14 EVM, plus Solana, Injective, Bitcoin, Stellar, Sui, ICON, NEAR and Stacks. It has RPC URLs, `assetManager`, `nativeToken` and Stellar `trustlineConfigs`.
- `baseChainInfo[k].explorer.txUrl` gives explorer links; `getIntentRelayChainId` gives relay chain ids.
- Live-verified readers:

  | Family | Endpoint and calls |
  |---|---|
  | EVM | viem |
  | Solana | `getBalance` / `getTokenAccountsByOwner` / `getSignatureStatuses` |
  | Sui | **GraphQL** `graphql.mainnet.sui.io` (public fullnode JSON-RPC is disabled) |
  | Stellar | Horizon |
  | NEAR | `query` / `tx` (needs the signer) |
  | ICON | v3 JSON-RPC (errors come back as HTTP 400 with a JSON-RPC body) |
  | Stacks | Hiro |
  | Bitcoin | mempool.space |
  | Injective | LCD `sentry.lcd.injective.network` |

- NEAR destinations need `storage_balance_of`; Stellar destinations need a trustline. The backend checks neither.

**MCP SDK and repo**

- MCP SDK `^1.26.0` has:
  - `registerTool` + `outputSchema` (`mcp.ts:1051`);
  - error results skip output validation (`mcp.js:193`);
  - `InMemoryTransport.createLinkedPair()` (`inMemory.ts:25`).
- The public relay route `api.sodax.com/v1/relay/` answers like the private host.
- `src/constants.ts` still points at the private `xcall-relay.nw.iconblockchain.xyz`.

## 4. Decisions

1. **Dependencies:** exact pins on `@sodax/swaps-api@2.2.0`, `@sodax/types@2.2.0`, and `viem` (a version at least 14 days old that audits clean); `engines` set to `>=22.12.0`. Nothing else is added.
2. **Swaps API:** one `SwapsApi` per request, carrying the caller's `x-api-key` (stdio: `SODAX_API_KEY`) and a guarded `fetch`. The guard holds a submit budget of ≤ 8/min and edge-safe buckets. On a 429 it honours `Retry-After` and fails fast with a synthetic 429 (`retryAfterSec`) instead of letting the client retry immediately.
3. **Quote:** quote → fee + deadline + oracle USD (warn only) → `minOut = quoted × (1 − slippage)` → `createIntent` + `checkAllowance` → `approve` if needed. Before building, it checks the user's balance and the destination (NEAR storage, Stellar trustline). The result is ordered `steps[]` plus a `quoteId`.
4. **Track:** read status (idempotent) → if not yet submitted: read-once receipt → EVM calldata-containment check → submit once → read status. MCP-only states:
   - `awaiting_source_confirmation`
   - `source_failed`
   - `queued` (rate limit)
   - `expired_unsubmitted` (+ alert)
   - `not_submitted`
   - `not_submitted_unknown_quote` (+ alert)
5. **Cancel:** in two calls (build, then relay with `cancelTxHash`). The intent comes from the hub (`getIntent(dstIntentTxHash)`) or the cache. Not offered for Solana or Bitcoin sources.
6. **Profiles:** `builder` / `swap` / `all` (default `all`, per the epic). Filtering is by module at server creation. The registry still lists everything (`/health` gets a `swap` count; `/api` gets a `profiles` block). An unknown profile returns 400 JSON-RPC `-32602`.
7. **Safety:**
   - Secret screening on every string input. Exempt paths: `txHash`, `cancelTxHash`, `bound.accessToken`.
   - A bare 64-hex value in a non-Sui/NEAR address or token field is treated as a private key.
   - Bounds: slippage 1–500 bps (default 100), deadline 5–60 min (default 15).
   - pino redacts keys.
   - PostHog swap events carry no addresses.
   - Discord alerts are deduped (5 min per code; per tx for rescue cases).
8. **Restart window:** the in-process cache's TTL is deadline + 30 min, capped at 10k entries. The `nextStep` text tells agents to call `track` right after broadcast. The ADR documents the operator relay for lost entries; §9 has the backend fix.

## 5. Architecture and reuse map

Follow the repo split: upstream calls and logic go in `src/services/`, MCP registration and zod in `src/tools/`. Every new
file has a colocated `*.test.ts` (vitest `src/**/*.test.ts`).

**Reused as-is.** From the repo:

| Function | Location |
|---|---|
| `resolveChainKey` | `src/services/sodaxApi.ts:180` |
| `CHAINS` / `CHAIN_ALIASES` / `chainDisplayName` | `src/constants.ts` |
| `fetchJson` / `fetchJsonOrNull` | `src/services/http.ts` |
| `notifyError` | `src/services/discord.ts:118` |
| `getSolverOracle` | `src/services/solver.ts:43` |
| `recordTool` (split out of `registerAppTool`) | `src/services/toolRegistry.ts:40` |
| `withAnalytics` (extended) | `src/services/analytics.ts:96` |
| landing-page placeholders | `src/services/landingPage.ts` |
| `logger` | `src/services/logger.ts` |

From packages:

- `@sodax/swaps-api`: all 21 Swaps API calls, response validation, per-chain raw-tx schemas.
- `@sodax/types`: `spokeChainConfig`, `baseChainInfo`, `getIntentRelayChainId`, `CHAIN_KEYS`, `IntentRequestV2`.
- `viem`: EVM client, `erc20Abi`, `isAddress`, the BIP39 `english` wordlist.

Patterns mirrored from the SDK, not imported:

- `toIntentRequest` (`apps/playground/src/lib/execution.ts:153-163`);
- each family's RPC calls (`*SpokeService.ts`).

**New code.** Each file is small and single-purpose:

```
src/services/sodaxClient.ts        swapsApi(ctx) — base from SODAX_ENV, key, guarded fetch
src/services/guardedFetch.ts       submit budget + Retry-After circuit (Swaps API only)
src/services/requestContext.ts     { profile, clientId?, apiKey? }; apiKeyFromHeaders (repeated/comma header = keyless)
src/services/profiles.ts           parse ?profile= / x-sodax-profile / --profile|MCP_PROFILE
src/services/chains/{index,types,jsonRpc,evm,solana,sui,stellar,near,icon,stacks,bitcoin,injective}.ts
src/services/swap/{errors,units,addresses,resolver,safety,quoteCache,intent,wireTx,quote,status,track,cancel,balance,alerts}.ts
src/tools/actionTool.ts            registerActionTool — screening → run → ActionError mapping → structuredContent + text
src/tools/swap.ts                  the five tools + SWAP_INSTRUCTIONS
docs/adr/0001-sodax-mcp-execution-model.md
```

**Changed files** (minimal):

- `src/index.ts`: `createServer(ctx)`, `httpContext`, stdio profile/key, `/health` + `/api`.
- `src/constants.ts`: `SODAX_ENV` bases, relay host fix.
- `src/services/analytics.ts`: wrap `registerTool`; `isError` counts as a failure; scrubbed errors; `trackSwapEvent`.
- `src/services/toolRegistry.ts`: `swap` module, `recordTool`, `getToolNamesByProfile`, swap count.
- `src/services/landingPage.ts` + `src/public/index.html`: `SWAP_TOOLS` card.
- `README.md`, `server.json`, `package.json`, `sodax-deps.yaml`, `.env.example`.

## 6. Per sub-issue (implementation order)

`#80 → #81 → #82 → #83 → #86 → #84 → #85 → #87 → #88 → #89`. Each step ends with green gates (§7.1).

| # | Work | Done when |
|---|---|---|
| **80 ADR** | `docs/adr/0001-…` (+ README link). D1–D6 rewritten with §2–§4. Consequences: shared-IP limits, the restart window, the `enforce` mode impact, cancel coverage, the `rpcUrl` amendment. Comparison table built from LI.FI and deBridge MCP tool docs (both take amounts in smallest units and return unsigned txs; LI.FI has status and allowance tools; deBridge's official server has neither). | merged in the PR; README links it |
| **81 client layer** | pins, `engines`, `sodaxClient` / `guardedFetch` / `requestContext`, `SODAX_ENV` bases, relay host fix. `solver.ts` / `relay.ts` stay direct REST (no light client covers them). Builder outputs unchanged. `sodax-deps.yaml` adds the Swaps API; `.env.example` adds `SODAX_ENV`, `SODAX_API_KEY`, `SODAX_RPC_URL_*`, `SWAP_USD_WARN_CEILING`. | existing 90 tests pass unchanged; per-request key isolation test; guard tests (budget, circuit, Retry-After forms); `docker build` size recorded |
| **82 profiles** | module-based filtering in `createServer`; `recordTool`; `swap` module, counts, landing card, `/api` profiles block, `server.json` URL template `?profile={profile}` with an optional secret `x-api-key` header | tests: query / header / stdio selection; `builder` = snapshot of today's names; `swap` = exactly 5; unknown → 400; default = union |
| **83 resolver** | chains via `resolveChainKey` over the live `getTokens()` keys; tokens via `getTokensByChain` (2-min cache); address → symbol / "native" → fuzzy (always `ambiguous`) → `not_found` + suggestions (wrapped→native first); strict `units.ts`; `sodax_resolve_token` on the action template | fixture tests from today's live lists: Sonic WETH/sodaETH/S/wS, Hyper USDC/USDT0, ICON legacy bnUSD, "WETH on Arbitrum" → ETH (native) suggestion, "ETH" ≠ Tether |
| **86 balance** | `ChainReader` per family (§3 endpoints); EVM allowance toward `assetManager`; operator RPC env overrides; `sodax_get_balance` | recorded-fixture tests per family; one live check per family against a historical tx / known address (no funds) |
| **84 quote** | §4.3; price-only mode without an address; `MISSING_INPUT` for Stacks `srcPublicKey` and Bitcoin `bound.accessToken`; Solana blockhash warning; EVM steps flagged as EIP-5792-batchable | contract tests on canary: EVM, Sonic hub, Solana and Sui sources build txs; `AMOUNT_TOO_LOW`, `INSUFFICIENT_FUNDS`, `DESTINATION_NOT_READY` covered |
| **85 track / cancel** | §4.4 and §4.5 | mocked state machine over every backend status and every MCP-only state; 5 calls → 1 `submitTx`; calldata-mismatch case; smart-wallet batch case (calldata contained) |
| **87 safety / analytics** | §4.7; `withAnalytics` fixes | one test per rule, including "a tx hash is not flagged" and "no `0x…40` in analytics" |
| **88 E2E** | `scripts/e2e/swapCanary.ts` (MCP SDK client + viem signer, 5 USDC, alternating direction) + `e2e-canary.yml` (daily + dispatch, never on PRs, masked secrets, Discord on failure, balance floor) | one green scheduled run + one deliberate red run that alerted |
| **89 docs** | README swap walkthrough; `server.json` tools; in `gosodax/sodax-sdks` (own issue → native sub-issue of #89): update `docs/builders-mcp.mdx` (now says "No API key required", "never signs", "40 tools" — lines 13 / 16 / 59) + skill `packages/skills/skills/sodax-sdk/builders-mcp/SKILL.md` | sodax-sdks gates `check:docs-nav`, `check:docs-pages`, `docs:validate`, `@sodax/skills check:ai` |

## 7. Verification

1. **Gates on every commit:** `pnpm checkTs && pnpm lint && pnpm build && pnpm test`, plus `docker build` (alpine, `--ignore-scripts`).
2. **In-process protocol test on every PR:** MCP `Client` ↔ server over `InMemoryTransport`, with `SwapsApi` and the readers faked at the `fetch` seam. It walks quote → track (all states) → cancel.
3. **Live role-play on canary (real funds):**
   - Run `SODAX_ENV=canary pnpm dev`.
   - Connect with `claude mcp add --transport http sodax-swap "http://localhost:3000/mcp?profile=swap"`, once without a key and once with one.
   - I play the agent. A scratch viem script outside the repo acts as the user's wallet.
   - Scenarios S1–S14 are unchanged from v1:
     - happy path with approve; second swap with no approve; native source;
     - amount too low; insufficient funds; ambiguous token; pasted secret;
     - repeated track; restart; wrong tx; cancel;
     - non-EVM quotes; profiles; keyed run.
   - On top of those, a smart-wallet batch, if a 5792 wallet is available.
4. **Scheduled canary E2E (#88)** after merge.

## 8. Prerequisites before any code

1. **Ownership:** the user confirms they take the epic (the handoff named "@0xmatterhorn", which is not a GitHub login) and gets assigned, or R0bi7 assigns them. R0bi7's issue bodies are never edited.
2. **R0bi7 agrees** to the decisions in the ADR. The ADR is the first commit on a draft PR.
3. **Test wallet:** about 20 USDC plus gas on Arbitrum and Base, and a canary API key. Both are needed for role-play S1–S14 and #88.
4. **gosodax admin:** E2E secrets; `SODAX_ENV=canary` on the staging Coolify app.
5. **Go-ahead** to create the sodax-sdks issue for #89.

## 9. Follow-ups for other owners

Raise these in our PR thread; no new tracker issues.

- **Backend (swaps-api).** Each of these makes every client (MCP, sodax.com, widget) simpler:
  - **(a)** key- or MCP-aware `submit-tx` throttle, replacing per-IP-only;
  - **(b)** verify the source receipt inside `submit-tx`, so clients can submit right after broadcast;
  - **(c)** accept `submit-tx` with only `(txHash, srcChainKey)` and derive the intent and payload from chain. Feasibility is verified for EVM: the payload sits in the calldata. This would remove the MCP's restart window entirely.
- **SDK v3 (gh-519).** When chain plugins (T1), the PancakeSwap removal (T5) and `@sodax/api` (T28) ship:
  - replace the MCP's readers with SDK plugins, one family at a time behind `ChainReader`;
  - move to `@sodax/api/swaps`;
  - align `track` with the shared lifecycle core (T18.2, inside #531). `track`'s states mirror the #529 swaps-API lane.

## 10. Remaining risks

- **Restart window:** in-process cache; operator relay with an alert.
- **Throughput:** about 8 submits per minute server-wide until §9a.
- **Non-EVM coverage:** non-EVM readers are proven on historical data, not live swaps.
- **Public RPC limits:** Solana and the Sui GraphQL endpoint rate-limit; env overrides are the operator's remedy.
- **Bitcoin:** needs a browser-minted Bound token, and its swaps can't be cancelled through the API.
- **Chain API drift:** the Sui JSON-RPC shutdown already happened. Every reader is pinned by live-recorded fixtures and the per-family live check.
