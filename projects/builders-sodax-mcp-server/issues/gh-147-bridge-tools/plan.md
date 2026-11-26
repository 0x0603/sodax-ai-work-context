---
type: plan
repo: builders-sodax-mcp-server
github: 147
updated: 2026-11-25
related_issues: [119, 125, 127, 129, 142]
---

# Plan: bridge tools

Two tools, `sodax_bridge_prepare` and `sodax_bridge_submit_and_track`, on #138's template. Sources: every chain
the swap tools start from (user, 2026-11-26: "support all, the swap already has it"): EVM spokes, Sonic, NEAR,
Stellar, Sui, Solana, Injective; not Bitcoin, Stacks or ICON, which the swap tools don't start from either. Checked in code 2026-11-25 at: MCP `33e9e24` (#138, this branch), #145 `e0a5156`, #137
`feat/125-redis-quote-store`, sdks tags `@sdks@2.3.0-rc.3` (this branch) and `rc.4` (`development`), sodax-backend
`development` @ `41a813c0`. "Derived" marks the one claim not read in source.

## Facts the plan rests on

- Both sides build from the SDK's **packaged** config: `initialize()`'s dynamic fetch is disabled in rc.3 and
  rc.4 (`ConfigService.ts`, `TODO(config-v2)`). MCP `development`/`master` and the backend are on rc.4 (#142,
  merged 2026-11-20; backend `pnpm-workspace.yaml:201`). #138's branch (and so this one) is 7 commits behind
  `development` and still on rc.3; `development` merges into it cleanly. rc.3→rc.4 changes no bridge, spoke,
  hub, config or recovery code, only tokens (ANT).
- `createBridgeIntent` is public (`index.d.ts:15439`) and builds `{ tx, relayData: { address: hubWallet,
  payload } }` (`BridgeService.ts:1086-1127`). Fee: `extras.partnerFee ?? config.bridgePartnerFee`, and
  `bridgePartnerFee = bridge.partnerFee ?? fee` (`ConfigService.ts:490`). Neither side sets one: MCP
  `initSodax` passes `api`, `logger`, `chains`, `hub` only (`sodax.ts:54-65`); bridge-api overrides `chains`,
  `hub`, `radfi`, `relay` only (`sodax.provider.ts`) and says so (`bridge-quote.dto.ts:10`).
- Neither the SDK build nor the backend build checks the vault: `createBridgeIntent` resolves the tokens and
  builds (`BridgeService.ts:987-1068`); bridge-api's build only checks `access` direction
  (`bridge.service.ts:399-401`). Only `isBridgeable` / `getBridgeableAmount` compare vaults.
- `/v1/bridge/tokens` drops leverage-yield `lsoda*` share tokens (`bridge.service.ts` `leverageVaultAddresses`).
- EVM spoke tx: `assetManager.transfer(token, hubWallet, amount, payload)`, `value` = `scaleNativeMsgValue`
  (amount × 10^10 on Hedera) for the native token (`EvmSpokeService.ts:43-45,150-166`). Sonic tx:
  `walletRouter.route([transferFrom(user, hubWallet, amount) | wS.deposit{value}, ...payload calls])`
  (`SonicSpokeService.ts:209-271`). Approval spender: asset manager on a spoke, the hub wallet on Sonic
  (`BridgeService.ts:411-419`); the backend can return a `resetTx` first.

## Principle: SDK first (user, 2026-11-25)

Keep the code simple, and take types, chains, tokens, ABIs and builders from the SDK, so that an SDK bump
(a new chain, token or network) needs little or no code change. No chain list, token list, address or ABI is
copied into bridge code.

| Need | From the SDK (rc.3/rc.4, all public) |
|---|---|
| Chains, tokens, vaults, `access`, leverage vaults | `sodax.config` packaged config (`XToken.access` is in `@sodax/types` token data) |
| Pairs | `sodax.bridge.isBridgeable`, `getBridgeableTokens(from, to, token)` (config only, no RPC) |
| Limit | `sodax.bridge.getBridgeableAmount(from, to)` |
| Rebuild to check the backend's build | `sodax.bridge.createBridgeIntent({ raw: true, skipSimulation: true })`; approval spender as `resolveEvmApprovalSpender` |
| Amounts | `config.isSodaVaultHubAsset`, `EvmVaultTokenService.translate*Decimals`, `calculateFeeAmount` |
| Chain family, relay ids | `isHubChainKey`, `isEvmSpokeOnlyChainKeyType`, `getIntentRelayChainId` |
| Decoding txs and receipts | exported `spokeAssetManagerAbi`, `sonicWalletFactoryAbi`, `assetManagerAbi` (`HookFailed`), `wrappedSonicAbi` |
| Recovery params | `sodax.recovery.fetchHubAssetBalances`, `withdrawHubAsset` |
| Bridge API wire | `@sodax/types` `IBridgeApiV2` request/response types; zod schemas typed against them so a wire change breaks the build |

Not from the SDK, and why:
- HTTP to `/v1/bridge`: the SDK's `BridgeApiService` shares the HTTP/retry layer the swap tools dropped (it
  retries a 429 at once and drops `Retry-After`, `swapsApi.ts:1-4`). Own fetch, SDK types.
- Delivery past the first hop and `HookFailed`: `sodax.bridge.getDetailedStatus` only answers for the source tx
  (backend record, else the source tx's packet), so the hub-to-destination hop is MCP code, fed by SDK data.
- Source support: by family, not by chain list, through the swap tools' source adapters (`pinnedSourceOf`,
  `sources/*.ts`). A new chain of a family they read works with no code change; a new family is refused until it
  gets an adapter, for swaps and bridges alike.

## Decisions

### D1. The backend builds; the MCP rebuilds with the SDK and compares

As ADR 0001 sets for any feature with a backend build API (D3: one `Sodax` instance "to rebuild what the Swaps
API returns and check it"; D5: "whether an approve is needed comes from the backend's allowance check"), and
as the swap tools do (`findEvmTxMismatch`, `sources/evm.ts:174-196`):

1. Backend: `/bridge/allowance/check`, `/bridge/approve`, `/bridge/intents`.
2. MCP: `sodax.bridge.createBridgeIntent({ params, raw: true, skipSimulation: true, extras: { partnerFee } })`,
   then require the backend's `tx.to`, `tx.value`, `tx.data` and `relayData` to equal it byte for byte. That
   covers the payload, the hub wallet, the Sonic `route` prefix, Hedera's value scaling and token resolution
   from the MCP's own packaged config. `skipSimulation`, because without it the EVM path runs
   `simulateRecvMessage` on the hub (`SpokeService.ts:719-727,812-827`) and the backend already did.
3. Approvals: `approve(spender, amount)` with the exact input amount, any reset to 0 first, spender = asset
   manager on a spoke or the hub wallet on Sonic (SDK `buildApproveTxs` / `resolveEvmApprovalSpender`,
   `BridgeService.ts:411-470`), checked with the swap adapter's `approveCalldata` (`evm.ts:141-144,184-188`).

Why not build in the MCP (considered 2026-11-25 and dropped): it contradicts the ADR, and the backend's build
does one thing the MCP's wouldn't without an extra hub call: bridge-api never sets `skipSimulation`
(no reference in `apps/bridge-api/src`), so every build it returns has had its hub execution simulated
(`simulateRecvMessage`), and a bridge that would fail on the hub fails before anyone signs.

Before building, the MCP checks what neither the SDK build nor bridge-api's build checks: same vault
(`isBridgeable`), plus, as bridge-api does for listing, no leverage-yield share token; and `src != dst` chain,
amount within `/bridge/bridgeable-amount`. Direction (`access`) is checked by bridge-api's build; the MCP checks
it too, from the packaged `XToken.access`, to fail before any call.

Partner fee: the connection's (`partnerFee.ts`: address + 1–100 bps; ADR: "set by the connection, never by tool
input"), sent as the bridge DTO's `partnerFee { address, percentage }` (same bps, max 100,
`partner-fee.dto.ts`) and passed to the rebuild as `extras.partnerFee`. None on the connection, none on the bridge.

### D2. Amounts

- Receive: SDK's private `computeBridgeAmounts` redone with public pieces: skip translation when
  `config.isSodaVaultHubAsset(hubAsset)` (`index.d.ts:8916`), else `translateIncomingDecimals` /
  `translateOutgoingDecimals` (`:9981,9988`); fee 0. A test checks it against the rebuilt payload.
- Limit: `getBridgeableAmount` returns `{ amount, decimals, type }`, where `decimals` is the vault's token info
  for whichever side binds (`BridgeService.ts:1386-1490`), so scale the request to it with integer math before
  comparing.

### D3. Tracking

Backend status: `pending → relaying → relayed → executed | failed`, plus `abandonedAt`, `result.dstIntentTxHash`
and `result.packetData` (`submit-bridge-tx-status.dto.ts`). The source receipt for an EVM spoke reuses
`checkDeposit` (`sourceTx.ts:61`: a transfer from the user to the hub wallet carrying the payload). Sonic needs
its own reader: the swap hub path looks for `IntentCreated` (`sourceTx.ts:19`).

**HookFailed (derived from the ABI, contract source unreadable: `sodax-contracts` 404s for us).** The hub asset
manager's ABI has `HookFailed(address wallet, bytes reason)` (`asset-manager.abi.ts:397-415`), so it most likely
catches a failing wallet batch instead of reverting. The relay then reports `executed` (it only needs a
successful receipt) and the backend reports success (no reference to `HookFailed` anywhere in it), while the
tokens sit in the user's hub wallet. So after `executed`, read the hub tx receipt first: a `HookFailed` for the
derived wallet is the recovery case (D4). On chain (2026-11-25, `rpc.soniclabs.com`): 0 `HookFailed` logs at the
hub asset manager (`0x60c5…37C0`, `onchain find`) over 3M blocks (~56 days), and 0 from any emitter over the last
300k; the same query returns 124 intents-contract logs over 20k blocks, so the query works. The case is
unobserved, partly because every backend build is simulated first; keep the receipt check (one read), but its
semantics stay unconfirmed until there is a real example or contract access.

| Route | Hub tx | Terminal when |
|---|---|---|
| spoke → Sonic | `dstIntentTxHash` | no `HookFailed`, and the final effect is there: ERC-20 `Transfer` of `delivered` to the recipient, or for native S the wS `withdrawTo` (no `Transfer` to the recipient then) |
| spoke → spoke | `dstIntentTxHash` | no `HookFailed`, and the one matching outgoing packet is executed |
| Sonic → spoke | the source tx | the one matching outgoing packet is executed (backend `executed` already means this: `submit-bridge-txs.task.ts` `handleRelay`) |

Outgoing packet matcher `isBridgeDelivery`: from the hub, `src_tx_hash` = hub tx, `src_address` = hub asset
manager, destination chain, and the decoded transfer's sender = hub wallet, recipient, token and amount =
`delivered`. #145's `isDelivery` can't be reused (it requires `transfer.from == intentsContract`,
`delivery.ts:86-93`), and `decodeTransfer` (`sourceTx.ts:80`, exported in #145 only) returns sender, recipient
and data but not token or amount: extend it. Reuse `getRelayTransactionPackets` (`relay.ts:108`) and
`deliveryProof` (`delivery.ts:76`, `sent` on Bitcoin and Injective). Unverified: whether the packet's token field
is the spoke token; check one live packet when writing the matcher.

Destinations: as the swap tools, any chain. Before building to NEAR or Stellar, check the recipient can hold the
token (NEP-141 storage, Stellar trustline), as swaps do (ADR D5; `recipientReady`, `sodax.ts:413-428`).

### D3b. Non-EVM sources: the swap tools' adapters, as they are

Swaps already start from NEAR, Stellar, Sui, Solana and Injective (`NON_EVM_SOURCE_TYPES`, `sources/types.ts`). What
the bridge reuses, checked in code 2026-11-26:
- Build: the swap's `buildNonEvmDeposit({ srcChainKey, srcAddress, token, amount, to, payload })` (`sodax.ts:558-584`)
  is the bridge deposit: `to` = the hub wallet, `payload` = the bridge payload. The server builds it itself, as for
  swaps, since blockhash, sequence and fees make the backend's build differ from any rebuild; the backend's build is
  still called for its hub simulation and `relayData`, which is checked byte for byte (deterministic, hub-side).
  `stepOf` + the family's `callsPinned` refuse a build calling another program, `finish` readies it for the wallet.
- Read: the adapter's `read`, `seen`, `probe`, `checkSender`, `txHash`, `prunes` and `commitsHash` take no swap data.
  The deposit check is the same `checkDeposit` on the `connection` messages, with `committedPayload` for Solana.
- Approval: a non-EVM source that isn't approved is refused, as for swaps (`prepareSwap`'s `notApproved`); only EVM and
  Sonic get approve steps.
- What needs splitting: `SourceAdapter.prepareSwap` takes a `SwapToBuild` (intent, `BuiltIntent`). Add a
  `prepareDeposit` both use, or have the bridge call `buildNonEvmDeposit` + `stepOf` (exported) directly; `SwapSource`
  carries an optional `quote` the bridge leaves unset.
- Solana commits only the payload's keccak (`commitsHash`), so the relay needs the payload with the tx, and a Solana
  bridge can't be resumed from the source tx alone (D5): without its record, track alerts the operator with the tx hash,
  as swaps do for an unknown quote.

### D4. Failure: classify by evidence, hand off, no recovery tool

Backend abandonment is at 30 min (`BRIDGE_TX_MAX_RELAY_AGE_MS`, `constants.ts:95`); a later packet still flips
the row to `executed` (`submit-bridge-tx-db.service.ts:209-212`); its hint only says funds *may* be recoverable
(`dto:72-74`).

| Evidence | `nextAction` |
|---|---|
| Source receipt pending or unreadable | `call_tool` |
| Source reverted (nothing moved, gas spent) | `none`, outcome `failed` |
| First packet not executed, backend working | `call_tool` |
| First packet not executed, backend `failed` / abandoned (tokens in the source asset manager) | `external`: operator relays (bridge-api has an admin manual relay); alert with src tx |
| `HookFailed` for the wallet, or hub tx ran with no outgoing transfer and the wallet holds the hub asset | `external`: user signs `RecoveryService.withdrawHubAsset` (`raw: true` available) with src chain/address, original spoke token, amount in hub-asset precision capped at this bridge's; alert |
| Outgoing packet emitted, not executed | `call_tool` while young, then `external`: operator, with packet ids. Never `withdrawHubAsset` |
| Out of polls | #138's bounded loop, `onExhausted` to a person (`nextAction.ts:37-52`) |

Alerts: new `bridge_*` kinds in `alerts.ts` (kinds + per-budget caps already there, `alerts.ts:13-60`).

### D5. The build record

- Lifetime: 10 min to sign + 30 min grace = 40 min from prepare, as swaps keep a quote `deadline + GRACE_MS`
  (`quoteCache.ts:48,157`) and sweep it at expiry whether claimed or not (`quoteCache.ts:118-124`).
- Its own small in-memory store, not the swap cache: `CachedQuote` and #137's `QuoteStore` are typed to the swap
  (`intent`, `deadlineMs`, `handOver`; #137 `quoteStore.ts:8,64-95`). No Redis needed, because of the next point.
- **Resume without the record is a main path, not a fallback** (all sources but Solana, D3b): a slow or stuck bridge outlives 40 min. Track by
  `(srcChainKey, txHash)`: decode the source tx (EVM `transfer` args; Sonic `route` calls minus the funding call; other spokes the
  `connection` message's payload)
  to get `relayData`, recipient, destination token and amount, then run the same checks and matcher. Submit if
  the backend has no row. Test it like the main flow.
- For EVM and other single-tx sources the backend relays by `tx_hash` alone; `relayData` is replayed only for
  Solana and Bitcoin (`relay-bridge-tx.ts`, `buildRelaySubmitPayload`), though `submit-tx` still requires it.
- Submit is idempotent: the same payload returns `duplicate`, a different one 409 (`bridge.service.ts:282-305`).
  One build, one deposit, as swaps claim.

### D6. Gating, keys, limits

- Profile: ADR D4 says "Phase 2 adds its own profile for its tools", so a `bridge` profile (and `all`), with its
  own kill switch `SODAX_BRIDGE_TOOLS_ENABLED`, off until the canary run. `registerActionTool` hard-codes
  `"swap"` (`actionTool.ts:109`): take the profile as a parameter. No rename of `swap` needed.
- SDK load: `initSodax` runs only when swap tools are on (`index.ts:136,174`); run it when either is on.
- Keys: `submit-tx` needs `bridge:write`, its status `bridge:read`. Keys minted before bridge carry
  swaps-only scopes and will get `insufficient_scope` once `API_KEY_ENFORCEMENT=enforce`
  (`shared-enums/src/enums/api-scopes.ts:41-57`); enforcement is off today. Map that 403 to "this key lacks
  bridge scope", not the swap's retry-as-`UPSTREAM_UNAVAILABLE`.
- `submit-tx`: `OrgLimitAwareThrottlerGuard`, 10/60 s. It steps aside for a key whose org has
  `rateLimitPerMinute` (edge enforces it); otherwise per IP, which all MCP users share.

## Build order (one branch)

0. Merge `origin/development` into #138 (user's PR, push on their word), then into this branch: rc.4.
1. Bridge API client (own fetch, `IBridgeApiV2` types, zod typed against them), key forwarding to `/v1/bridge`
   (`KEYED_BASE_URLS`, `http.ts`), `BRIDGE_REJECTED`. Done 2026-11-26, uncommitted. The store, `bridge` profile,
   kill switch and `initSodax` gating move to step 4, with the tools they serve. Pairs and limits come from the
   SDK (`sodax.bridge.isBridgeable` / `getBridgeableAmount`), as `@sodax/types` advises, so the client has no
   bridgeable routes.
2. Token checks and amounts. Done 2026-11-26, uncommitted:
   - `bridge/catalog.ts`: the bridge catalog from the SDK's packaged config, filtered as bridge-api's
     `projectBridgeTokens`, through the swap's `parseCatalog`. Matches live `/v1/bridge/tokens` token for token
     (536, production and canary; `catalog.contract.test.ts` keeps checking).
   - `bridge/pair.ts`: `checkBridgePair` (direction `access`, same chain, same vault via the SDK's `isBridgeable`,
     offering what `getBridgeableTokens` says the source does bridge to) and `checkBridgeLimit` (the SDK's
     `getBridgeableAmount` on the hub, compared across both precisions in integers, the most in source units).
   - `sodax.ts`: `isBridgeable`, `bridgeableTokensTo`, `bridgeLimit`, `bridgeAmounts` (the SDK's private
     `computeBridgeAmounts` from its public parts; a test checks both amounts against the SDK's own payload).
   - `readBalances` takes a catalog (the swap's by default). The `for: "bridge"` argument on `sodax_resolve_token`
     and `sodax_get_balance`, and the resolve wording ("sodax_swap_price if there was none"), go with the tools in
     step 4. Approve as swaps do: native needs none, else `/bridge/allowance/check`, then `/bridge/approve`; balance
     not checked in prepare (ADR D6).
3. Rebuild check (D1), EVM spokes and Sonic. Done 2026-11-26, pushed `a5140f0`: `bridge/build.ts` `buildEvmBridge` calls
   `/intents` (+ `/allowance/check`, `/approve`) and rebuilds with `sdkBridge` (`sodax.ts`: the SDK's
   `createBridgeIntent` raw, `skipSimulation`), then requires `tx.from/to/value/data` and `relayData` equal, and each
   approve `approve(spender, amount)` on the token (reset to 0 first when given). Spender: the deposit's `to` (asset
   manager) from a spoke, the hub wallet from Sonic. `BRIDGE_MISMATCH` (alerted). Tests stub the hub-wallet read on
   `EvmHubProvider.prototype`; 23 tests (Hedera value, Sonic ERC-20 / native S, an added route call, approvals,
   partner fee), 5 mutations caught.
3b. Non-EVM sources. Done 2026-11-26, pushed `c9e9c32`: `buildNonEvmBridge` (`bridge/build.ts`) calls `/intents` and
   `/allowance/check`, builds the deposit with `sdkBridge` (the SDK's tx is the one signed, as for swaps), requires
   both relay data equal, and turns the SDK's tx into the step through a new adapter hook `depositStep` (`stepOf`:
   the family's `callsPinned` against the Bridge API build's target, then `finish`). `NonEvmStep.kind` gains
   `"bridge"`; `stepOf` raises `BRIDGE_MISMATCH` for it. Short allowance: Stellar asks for trustline room, the others
   are refused. Unit tests on the recorded Solana and Sui builds, 5 mutations caught.
   Live 2026-11-26 (`build.contract.test.ts`, 10 cases, production): the Bridge API's build equals the SDK's from
   Arbitrum (USDC, USDC with a 25 bps fee, ETH), Hedera (HBAR, value scaled), Sonic (USDC through the wallet router),
   and the relay data agrees from Solana, Sui, NEAR, Stellar and Injective.
4. `sodax_bridge_prepare`. Done 2026-11-26, uncommitted:
   - `bridge/prepare.ts`: resolve both sides on the bridge catalog, `sourceChainFor` (swap sources), pair check,
     addresses (recipient defaults to the sender EVM to EVM; burn address refused), amount, `bridgeAmounts`, limit
     and NEAR/Stellar recipient checks, then `buildEvmBridge` / `buildNonEvmBridge`, steps (approves + `bridge` step),
     `bridge/store.ts` (10' + 30', per-key cap). Shared checks' swap wording is reworded for a bridge.
   - `tools/bridge.ts` + `tools/bridgeDecisions.ts`: `confirm` (summary `kind: "bridge"`) then `execute`, `afterSend`
     `sodax_bridge_submit_and_track` `{ bridgeId, chain }`. `errorDecision` handles `BRIDGE_REJECTED` by reason.
   - Plumbing: `bridge` profile and `SODAX_BRIDGE_TOOLS_ENABLED` (default off) through `profiles.ts`, `connection.ts`,
     `index.ts` (`initSodax` for swap or bridge, boot config, `/health` `tools.bridge`), `toolRegistry` module `bridge`,
     `registerActionTool(..., module)`, `bridge_error` alerts. `sodax_resolve_token` / `sodax_get_balance` moved to
     `registerTokenTools` (once for swap or bridge) with `for: "swap" | "bridge"`. `server.json`, README, landing card,
     `.env.example`.
   - Tests: `tools/bridge.test.ts` end to end through an MCP client, profiles; 2273 green; 6 mutations caught (one at a
     time; a first stacked run broke on zsh word splitting and was reverted by hand). Live 2026-11-26 through the
     tool on production: Arbitrum USDC → Base ready (approve + bridge), SOL → Sonic ready, a non-bridgeable pair
     offers options.
   - Open: `afterSend` names `sodax_bridge_submit_and_track`, which is step 5: the switch must stay off until it
     lands. `/health` doesn't count open bridge builds yet (`openBridges()` exists).
4b. Beyond the plan (user, 2026-11-26): `sodax_bridge_tokens` (pairs between two chains, config only, no read) and
   `sodax_bridge_preview` (receive, fee, the route's max; builds and holds nothing; leads to prepare via `provide`).
   Shared checks moved to `checkedPair` (prepare.ts); `checkBridgeLimit` returns the max; rewording in `wording.ts`.
5. `sodax_bridge_submit_and_track`. Done 2026-11-26, uncommitted (`bridge/track.ts`, `trackDecision`):
   - With the build: the source tx checked on chain (spokes: `checkDeposit` on the `connection` message with the build's
     sender, hub wallet and payload, `committedPayload` for Solana; Sonic: the tx's sender, target and calldata against
     the build's deposit, kept in the store), claimed (one build, one deposit), submitted once, then the backend row.
   - A backend row is never proof: with a build, an unclaimed tx is checked first (tested, and mutation-checked).
   - Without the build: a row the backend has is followed; none is `unknown_bridge`, alerted when a bridgeId was named
     (as swaps do for an unknown quote). Rebuilding `relayData` from the tx is left for later.
   - Row `executed` from a spoke: the hub tx's receipt is read for `HookFailed` (`hubHookFailed`): `held_on_hub` with
     the `withdrawHubAsset` parameters (amount left to `fetchHubAssetBalances`, capped at the bridge's), alerted. Else
     to Sonic `delivered`, to a spoke `in_transit` (step 6 confirms delivery). From Sonic the row's packet is the
     destination's: `delivered` (`sent` on Bitcoin/Injective). Abandoned `failed`: `relay_failed`, held by the source
     asset manager, operator. Polls bounded at 30 per stage, then `still_in_progress` to a person.
   - New alert kinds `unknown_bridge`, `bridge_relay_failed`, `bridge_hook_failed`; after-send failure wording says
     bridge for the bridge tools.
   - Not done: waiting inside the call (swaps' `trackSwapWaiting`), `/health` count of open bridges.
6. Delivery past the hub. Done 2026-11-26, uncommitted, without #145 (user: do it now if safe; SDK first):
   - `relayPackets` (`sodax.ts`): the SDK's own relay client `getTransactionPackets` (no SODAX key to the relay), a
     404 read as no packet yet. Live: 1 executed packet for a recent hub tx, `[]` for an unknown one.
   - Verified live 2026-11-26 on recent hub `Message` txs: the hub asset manager's outgoing packet is RLP (token,
     sender, recipient, amount, data), token the destination's own spoke address, amount in its decimals.
   - `deliveryPacket` / `carries` (`track.ts`): from the hub asset manager, in the hub tx that ran the deposit, to the
     destination chain, sender the user's hub wallet, recipient encoded, amount = delivered (token not compared: its
     spelling differs by family, and these pin it). Exactly one, else nothing is concluded; without the build, the hub
     tx's one asset manager packet. Executed: `delivered` (`sent` on Bitcoin/Injective). A failed relay read stays
     `in_transit`, never delivered. 7 tests, 6 mutations caught.
7. Finish. Partly done 2026-11-26, uncommitted:
   - Canary needs no funds (user: "like swap"): `scripts/e2e/bridgeCanary.ts` (`pnpm e2e:bridge`) is a dry run through
     the tools over HTTP: tokens, preview, prepare from Arbitrum and from Solana, nothing signed. `e2e-canary.yml`
     starts its server with `SODAX_BRIDGE_TOOLS_ENABLED=true` and runs it after the swap, `if: always()`; its log is
     secret-checked and printed, and a failure posts `bridge dry run`. Run locally against canary: 9 pairs, max
     7206.89 USDC, EVM approve + bridge, Solana bridge. actionlint isn't installed here: CI lints it.
   - Unified logging: tool calls of the `bridge` group now carry `bridge.status`, `bridge.id`, tx, hub and destination
     hashes and both chains in the "Tool call" record, and `bridge_id`, `status` and chains in PostHog
     (`analytics.ts`, tested, mutation-checked). Upstream calls ("Upstream call") and SDK reads ("Chain read") were
     already logged.
   - Left: the docs page in sodax-sdks (with the next batch of MCP docs), a drift/contract check of the Bridge API
     routes the client calls (`build.contract.test.ts` covers builds).

## AC changes to make on #147

- Delivery: "terminal once delivered (`sent` on Bitcoin and Injective, as #145)".
- Failure: "ends with what the evidence shows and an `external` handoff: `withdrawHubAsset` params when the hub
  wallet holds it, packet ids for an operator otherwise".
- Build check: "refuses a backend build that differs from the MCP's own SDK rebuild (tx and `relayData`)"
  instead of recomputing only the payload.
- Add: "bridge tools in their own `bridge` profile behind their own kill switch"; "the connection's partner fee
  applies"; "no chain or token list in bridge code: a new EVM chain or token in the SDK works after an SDK
  bump alone".

## Not in this issue

Bitcoin, Stacks and ICON sources (no swap adapter either), a recovery tool.
