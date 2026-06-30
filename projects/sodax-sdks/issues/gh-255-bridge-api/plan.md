---
type: plan
repo: sodax-sdks
github: 255
updated: 2026-06-30
---

# Plan — Bridge API across SDK, dapp-kit & demo

> Replicates the Swaps API v2 pattern (reference **PR #210 / `origin/feat/swaps-api-v2`**)
> for the Bridge feature. Every path and symbol below is grounded in the real Swaps
> reference and the current `BridgeService` baseline. Critic corrections folded in.

## Goal

Add a typed, valibot-validated **Bridge HTTP API client** (`BridgeApiService`,
reachable as `sodax.api.bridge.*`) plus a **backend submit-tx + client-side
fallback** flow in `BridgeService`, mirroring exactly what #210 did for swaps.

- **Backend**: builds raw/unsigned bridge txs via `createBridgeIntent({ raw: true })`
  → `{ tx, relayData }`, and talks to the bridge backend API.
- **Frontend**: calls the API for a raw tx, signs+broadcasts via a browser-extension
  wallet, hands the tx hash back via `submitTx`, polls `getSubmitTxStatus`.
- **Toggle**: opt-in `bridgeOptions.useBackendSubmitTx`. On → `bridge()` submits via
  backend; on ANY non-success → falls back to client-side `relayTxAndWaitPacket`.
  Both paths share one wall-clock deadline. The service never throws: every method
  returns `Result<T, SodaxError<'EXTERNAL_API_ERROR'>>`.

Work is purely **additive**: the existing on-chain `BridgeService` orchestration
and `sodax.bridge.*` / `bridge/` hooks stay intact.

## Approach — dependency & sequencing (READ FIRST)

**Prerequisite — DONE: Bridge is built on top of PR #210 (`feat/swaps-api-v2`).** The branch
`feat/bridge-api-v2` is already off `feat/swaps-api-v2` (scaffold commit `8fd58453`), so the
entire #210 runtime foundation is PRESENT in the working tree:

| Foundation #210 introduces | In working tree today? |
| --- | --- |
| `backendApi/api-utils.ts` (`makeRequest`, `toJsonBody`, `RequestConfig`/`RequestOverrideConfig`) | ✅ |
| `backendApi/apiConfig.ts` (`isCustomApiConfig`, `layerConfigs`, `resolveBaseApiConfig`, `resolveSwapsApiConfig`) | ✅ |
| `backendApi/{swapsApiSchemas,rawTxSchemas,backendApiSchemas}.ts` (valibot) | ✅ |
| `BackendApiService` sub-service shape (`public readonly swaps`, ctor resolves config) | ✅ |
| `ApiConfig` union (`BaseApiConfig \| CustomApiConfig`, `SwapsApiConfig`) in `common/constants.ts` | ✅ |
| `Sodax.api` alias + `swapsOptions.useBackendSubmitTx` toggle | ✅ |
| Per-chain `signAndSendTransaction` (Solana/Stacks/Stellar/Injective) + `BitcoinSpokeService.signAndSubmitRawTransaction` | ✅ |
| **Types** `ISwapsApiV2`/`RelayExtraDataResponseV2`/`PacketDataV2`/`SubmitTxRequestV2` in `backend/backendApiV2.ts` | ✅ |
| `RawTxReturnType` + per-chain raw-tx types in `common/common.ts` | ✅ |
| `ConfigService.bridge` / `bridgePartnerFee` | ✅ |

The Bridge work builds additively on this present foundation (no rebase pending).

**Reuse verbatim from #210 (zero new code):**
- `api-utils.ts` → `makeRequest`, `toJsonBody` (bigint-safe), `RequestConfig`, `RequestOverrideConfig`.
- `rawTxSchemas.ts` → `rawTxSchemaForChainKey(chainKey)` + every `<Chain>RawTxSchema`
  (EVM/Solana/Sui/Stellar/Injective/Icon/Stacks/Near + `AnyRawTxSchema` Bitcoin fallback).
  **Do not duplicate raw-tx schemas.**
- Per-chain wallet signing: `signAndSendTransaction` (Solana/Stacks/Stellar/Injective),
  `sendTransaction` (EVM/ICON), `signAndExecuteTxn` (Sui), `signAndSubmitTxn` (NEAR),
  `BitcoinSpokeService.signAndSubmitRawTransaction` (Bitcoin/Bound). Bridge raw txs are
  the same `RawTxReturnType` variants → **no new wallet-provider methods needed**.
- The demo `signAndBroadcast.ts` dispatcher (feature-agnostic over `RawTxReturnType`).
- `RawTxReturnType`, `RelayExtraDataResponseV2`, `PacketDataV2`, the JSON-safety guards
  (`_ContainsBigint`/`_AssertJsonSafe`).

**Extend (not duplicate):** `apiConfig.ts` (+`resolveBridgeApiConfig` = unconditional alias of
`resolveBaseApiConfig`; shared base host, Decision #1 — NO `constants.ts` / `BridgeApiConfig`
change), `BackendApiService` (+`public readonly bridge`), `Sodax.ts` (+`bridgeOptions` resolution).

**No new `SodaxErrorCode`.** `'backend'` `SodaxFeature` + `EXTERNAL_API_ERROR` already
exist (#210); `BridgeOrchestrationErrorCode` already includes `EXECUTION_FAILED` + `UNKNOWN`.

## Steps (per-package work breakdown)

### 1. `@sodax/types`

**CREATE** `packages/types/src/backend/backendBridgeApiV2.ts` (sibling to `backendApiV2.ts`,
which is already ~922 lines; mirror its header comment about the JSON-safety rule
bigint→decimal-string / Date→ISO-string, banner sections, then the aggregating interface).

```ts
import type { RawTxReturnType } from '../common/index.js';
import type { RelayExtraDataResponseV2, PacketDataV2, BitcoinBoundExtrasV2 } from './backendApiV2.js'; // import PacketDataV2 (status) + BitcoinBoundExtrasV2 (Bitcoin-source, Decision #13)

// WIRE DTO (Decision #4) — swaps naming; the SDK maps domain CreateBridgeIntentParams -> this before POST.
export interface CreateBridgeIntentParamsV2 { srcChainKey: string; dstChainKey: string; inputToken: string /*<- srcToken*/; outputToken: string /*<- dstToken*/; inputAmount: string /*<- amount, bigint->decimal*/; srcAddress: string; dstAddress: string /*<- recipient*/; srcPublicKey?: string /*Decision #13*/; bound?: BitcoinBoundExtrasV2 /*Decision #13*/ }
export interface BridgeAllowanceCheckResponseV2 { valid: boolean }
export interface BridgeApproveResponseV2 { tx: RawTxReturnType }
export interface CreateBridgeIntentResponseV2 { tx: RawTxReturnType; relayData: RelayExtraDataResponseV2 } // NO intent struct

export interface BridgeSubmitTxRequestV2 { txHash: string; srcChainKey: string; walletAddress: string; relayData: RelayExtraDataResponseV2 } // NO intent; FULL { address, payload } envelope (Decision #7) — bridge has no intent.creator for the backend to rebuild the address
export interface BridgeSubmitTxResponseV2 { success: boolean; data: { status: 'inserted' | 'duplicate'; message: string } }

export interface BridgeSubmitTxStatusQueryV2 { txHash: string; srcChainKey: string }
export type SubmitBridgeTxStatusV2 = 'pending' | 'relaying' | 'relayed' | 'executed' | 'failed';
export interface BridgeSubmitTxStatusResultV2 { dstIntentTxHash: string; packetData?: PacketDataV2 } // NO intent_hash
export interface BridgeSubmitTxStatusDataV2 { txHash: string; srcChainKey: string; status: SubmitBridgeTxStatusV2; failedAtStep?: string; failureReason?: string; processingAttempts: number; abandonedAt?: string; result?: BridgeSubmitTxStatusResultV2; userMessage?: string }
export interface BridgeSubmitTxStatusResponseV2 { success: boolean; data: BridgeSubmitTxStatusDataV2 }

// tokens are backend-served (Decision #3 — mirror swaps.controller getTokens/getTokensByChain):
export interface BridgeTokenV2 { symbol: string; name: string; decimals: number; address: string; chainKey: string; hubAsset: string; vault: string }
export type GetBridgeTokensResponseV2 = Record<string, readonly BridgeTokenV2[]>;
export type GetBridgeTokensByChainResponseV2 = readonly BridgeTokenV2[]; // FIX: type array, NOT empty interface {}

export interface IBridgeApiV2 {
  checkAllowance(body: CreateBridgeIntentParamsV2): Promise<BridgeAllowanceCheckResponseV2>;
  approve(body: CreateBridgeIntentParamsV2): Promise<BridgeApproveResponseV2>;
  createBridgeIntent(body: CreateBridgeIntentParamsV2): Promise<CreateBridgeIntentResponseV2>;
  submitTx(body: BridgeSubmitTxRequestV2): Promise<BridgeSubmitTxResponseV2>;
  getSubmitTxStatus(query: BridgeSubmitTxStatusQueryV2): Promise<BridgeSubmitTxStatusResponseV2>;
  getTokens(): Promise<GetBridgeTokensResponseV2>;
  getTokensByChain(chainKey: string): Promise<GetBridgeTokensByChainResponseV2>;
  // getBridgeableAmount stays CLIENT-SIDE (vault math; no backend endpoint — Decision #3).
}
```

- Apply the compile-time guard `& _AssertJsonSafe<...>` to at least one `type` alias.
  `_ContainsBigint`/`_AssertJsonSafe` are non-exported in `backendApiV2.ts` → either keep
  guarded bridge types in `backendApiV2.ts`, or re-declare the helpers privately in the
  sibling (avoids knip "unused export").
- **MODIFY** `backend/index.ts` — `export * from './backendBridgeApiV2.js';` (auto-propagates
  to `@sodax/sdk` via the `backend/index → types/index → sdk/index.ts:14 export * from '@sodax/types'`
  chain — verified, so dapp-kit/demo can import bridge types from `@sodax/sdk`).
- **MODIFY** `sodax-config/sodax-config.ts` — add `BridgeClientOptions = { useBackendSubmitTx?: boolean }`
  and a DISTINCT `bridgeOptions?: BridgeClientOptions` slot on `SodaxOptionalConfig`. Do NOT touch
  the existing data `bridge?: BridgeOptions` (partner-fee) slot.
- **Host — DECIDED (Decision #1): shared base host, routes `/bridge/*`. NO `constants.ts` change**
  and there is NO `BridgeApiConfig` type — `BridgeApiService` types its config as `BaseApiConfig`
  and `resolveBridgeApiConfig` is an unconditional alias of `resolveBaseApiConfig`.

### 2. `@sodax/sdk` — Bridge HTTP client

- **CREATE** `backendApi/bridgeApiSchemas.ts` — valibot, one schema per `IBridgeApiV2`
  response, mirroring `swapsApiSchemas.ts`. bigint-derived wire fields = `v.string()`,
  ints = `v.number()`. Submit-tx `status` = strict `v.picklist(['inserted','duplicate'])`, but the
  submit-tx-**status** lifecycle field stays TOLERANT (Decision #10 — `v.string()` / non-strict object so a
  stray `'posting_execution'` or unknown field never breaks parse; rely on the inline terminal check).
  Tx-bearing responses are FACTORIES
  reusing the imported `rawTxSchemaForChainKey`:

  ```ts
  import * as v from 'valibot';
  import { rawTxSchemaForChainKey } from './rawTxSchemas.js';
  // FIX: if RelayExtraDataResponseSchema is not exported from swapsApiSchemas.ts, declare locally:
  const RelayExtraDataResponseSchema = v.object({ address: v.string(), payload: v.string() });
  export const makeBridgeApproveResponseSchema = (txSchema) => v.object({ tx: txSchema });
  export const makeCreateBridgeIntentResponseSchema = (txSchema) => v.object({ tx: txSchema, relayData: RelayExtraDataResponseSchema });
  export const BridgeAllowanceCheckResponseSchema = v.object({ valid: v.boolean() });
  export const BridgeSubmitTxResponseSchema = v.object({ success: v.boolean(), data: v.object({ status: v.picklist(['inserted','duplicate']), message: v.string() }) });
  export const BridgeSubmitTxStatusResponseSchema = v.object({ success: v.boolean(), data: /* module-private status-data schema */ });
  export const BridgeTokenSchema = v.object({ symbol: v.string(), name: v.string(), decimals: v.number(), address: v.string(), chainKey: v.string(), hubAsset: v.string(), vault: v.string() });
  export const BridgeTokensResponseSchema = v.record(v.string(), v.array(BridgeTokenSchema));   // GET /bridge/tokens
  export const BridgeTokensByChainResponseSchema = v.array(BridgeTokenSchema);                  // GET /bridge/tokens/:chainKey
  ```
  Status-data / result / packet sub-schemas stay module-private. Schema module stays
  package-internal (NOT re-exported from `backendApi/index.ts`).

- **CREATE** `backendApi/BridgeApiService.ts` — copy `SwapsApiService.ts` structure verbatim:

  ```ts
  type ResultifiedBridgeApiV2 = {
    [K in keyof IBridgeApiV2]: IBridgeApiV2[K] extends (...args: infer A) => Promise<infer R>
      ? (...args: [...A, config?: RequestOverrideConfig]) => Promise<Result<R>> : never;
  };
  export class BridgeApiService implements ResultifiedBridgeApiV2 {
    private readonly config: BaseApiConfig;       // already-resolved flat config (Decision #1: shared base, no BridgeApiConfig type)
    private readonly headers: Record<string,string>;
    private readonly logger: SodaxLogger;
    constructor(config: BaseApiConfig, logger: SodaxLogger = consoleLogger) { /* identical to SwapsApiService */ }
    // private request<S>(): COPY VERBATIM from SwapsApiService.request<S>; only the
    //   message changes → `Invalid response shape from bridge API for ${endpoint}`.
    //   keep code='EXTERNAL_API_ERROR', feature='backend', context.api='backend'.
    // DOMAIN->WIRE (Decision #4): the SDK side owns the rename. `BridgeApiService`/`IBridgeApiV2`
    //   consume the WIRE DTO `CreateBridgeIntentParamsV2` (swaps names); a
    //   `toCreateBridgeIntentParamsV2(params: CreateBridgeIntentParams, extras?)` mapper converts the
    //   SDK-domain shape (srcToken/dstToken/amount:bigint/recipient) -> inputToken/outputToken/
    //   inputAmount(decimal string)/dstAddress (+ srcAddress, srcPublicKey?/bound?) before the call.
    //   Unlike SwapsApiService (domain already == wire), bridge needs this explicit converter.

    checkAllowance(body, cfg?)        → POST /bridge/allowance/check  → BridgeAllowanceCheckResponseSchema (toJsonBody)
    approve(body, cfg?)               → POST /bridge/approve          → makeBridgeApproveResponseSchema(rawTxSchemaForChainKey(body.srcChainKey))
    createBridgeIntent(body, cfg?)    → POST /bridge/intents          → makeCreateBridgeIntentResponseSchema(rawTxSchemaForChainKey(body.srcChainKey))
    submitTx(body, cfg?)              → POST /bridge/submit-tx        → BridgeSubmitTxResponseSchema (toJsonBody)
    getSubmitTxStatus(query, cfg?)    → GET  /bridge/submit-tx/status?txHash=&srcChainKey= → BridgeSubmitTxStatusResponseSchema
    getTokens(cfg?)                   → GET  /bridge/tokens             → BridgeTokensResponseSchema (Record<chainKey, readonly BridgeTokenV2[]>)
    getTokensByChain(chainKey, cfg?)  → GET  /bridge/tokens/:chainKey   → BridgeTokensByChainResponseSchema (readonly BridgeTokenV2[])
    setHeaders(headers): void         // copy verbatim
    getBaseURL(): string              // copy verbatim
  }
  ```

- **MODIFY** `backendApi/apiConfig.ts` — add `resolveBridgeApiConfig(config: ApiConfig): BaseApiConfig`
  that is an unconditional alias returning `resolveBaseApiConfig(config)` (Decision #1: shared base; no separate config type).
- **MODIFY** `backendApi/BackendApiService.ts` — add `public readonly bridge: BridgeApiService;`;
  in ctor `this.bridge = new BridgeApiService(resolveBridgeApiConfig(config), this.logger);`;
  in `setHeaders` add `this.bridge.setHeaders(headers);`.
- **MODIFY** `backendApi/index.ts` — `export * from './BridgeApiService.js';`.
- `sodax.api.bridge.*` resolves automatically (`sodax.api === sodax.backendApi`) — **no
  Sodax facade change for the HTTP client itself.**

### 3. `@sodax/sdk` — `BridgeService` refactor (submit-tx + fallback)

**MODIFY** `packages/sdk/src/bridge/BridgeService.ts`:

- Imports: `import type { BackendApiService } from '../backendApi/index.js';`,
  `DEFAULT_RELAY_TX_TIMEOUT` from `@sodax/types`, add `unknownFailed` to the existing
  `../errors/wrappers.js` import.
- `BridgeServiceConstructorParams` (line 79) gains `backendApi: BackendApiService;` +
  `useBackendSubmitTx?: boolean;`. Class (lines 101-105) gains `public readonly backendApi`
  + `readonly useBackendSubmitTx: boolean;`; ctor sets them (`?? false`).
- Refactor `bridge()` (line 336) — keep the `trackResult('bridge','bridge', …, {start,success,failure})`
  wrapper. Inside the closure:

  ```ts
  const created = await this.createBridgeIntent(_params);
  if (!created.ok) return { ok: false, error: created.error };
  const deadline = Date.now() + (_params.timeout ?? DEFAULT_RELAY_TX_TIMEOUT); // ONE shared budget
  if (this.useBackendSubmitTx) {
    const submitted = await this.submitTx(_params, created.value, deadline);
    if (submitted.ok) return submitted;
    this.config.logger.warn('[bridge] backend submit-tx did not complete; falling back to client-side relay', { error: submitted.error });
  }
  return this.fallbackBridgeSteps(_params, created.value, deadline);
  ```
  Keep the outer catch (`isBridgeOrchestrationError` → return; else `executionFailed('bridge', error, baseCtx)`).

- **Extract** `private async fallbackBridgeSteps<K>(_params, created, deadline)` — move the
  current `verifyTxHash` + `relayTxAndWaitPacket` + `return { srcChainTxHash, dstChainTxHash }`
  body verbatim, changing ONLY the relay timeout to `Math.max(deadline - Date.now(), 5_000)`.
  Bridge keeps NO hub-source short-circuit.
- **Add** `private async submitTx<K>(_params, created, deadline)` — mirror `SwapService.submitTx`
  (#210, lines 563-627) with bridge deltas:

  ```ts
  const { params } = _params; const srcChainKey = params.srcChainKey;
  const baseCtx = { srcChainKey, dstChainKey: params.dstChainKey };
  const { tx: spokeTxHash, relayData } = created; // NO intent
  const submitTxFailed = (cause) => ({ ok:false, error: executionFailed('bridge', cause, { ...baseCtx, action:'bridge' }) });
  try {
    const submitted = await this.backendApi.bridge.submitTx({ txHash: spokeTxHash, srcChainKey, walletAddress: params.srcAddress, relayData }); // FULL { address, payload } envelope (Decision #7), NOT relayData.payload
    if (!submitted.ok) return submitTxFailed(submitted.error);
    const reserveMs = Math.min(Math.ceil((deadline - Date.now()) / 3), 20_000);
    const pollDeadline = deadline - reserveMs; const pollIntervalMs = 1_000;
    while (Date.now() < pollDeadline) {
      const statusResult = await this.backendApi.bridge.getSubmitTxStatus({ txHash: spokeTxHash, srcChainKey });
      if (statusResult.ok) {
        const { status, result, failureReason, abandonedAt } = statusResult.value.data;
        if (status === 'executed' && result?.dstIntentTxHash)
          return { ok:true, value: { srcChainTxHash: spokeTxHash, dstChainTxHash: result.dstIntentTxHash } }; // NO intent_hash
        if (status === 'failed' || abandonedAt) { const reason = failureReason ? `: ${failureReason}` : ''; return submitTxFailed(new Error(`backend submit-tx ${status}${reason}`)); }
      }
      await new Promise<void>(r => setTimeout(r, pollIntervalMs));
    }
    return submitTxFailed(new Error('backend submit-tx polling timed out before reaching executed'));
  } catch (error) { return { ok:false, error: unknownFailed('bridge', error, { ...baseCtx, action:'bridge' }) }; }
  ```
- `bridge/errors.ts` — **no change** (`EXECUTION_FAILED` + `UNKNOWN` already in `BridgeOrchestrationErrorCode`).
- **Bitcoin-source-via-Bound plumbing (Decision #13)** — additive, mirrors `SwapService`:
  - Add `BridgeExtras<K>` mirroring `SwapExtras` chain-keyed slots (Bitcoin `bound?: BitcoinBoundExtras`,
    Stacks `srcPublicKey?: string`); reuse exported `BitcoinBoundExtras` (intent-types) + `GetChainType`
    (`@sodax/types`). Bridge fee is config-driven → do NOT add `partnerFee`.
  - Widen `BridgeParams` to the 4-arg form
    `SpokeExecActionParams<ChainKey, Raw, CreateBridgeIntentParams<ChainKey>, BridgeExtras<ChainKey>>`
    (today it is 3-arg → `extras?: never`).
  - In `createBridgeIntent`: destructure `extras`; move `getEffectiveWalletAddress(personalAddress)` OUT
    of the `raw === false` gate so the Bitcoin trading wallet is derived for `raw` too (public GET, no token);
    keep the wallet-provider invariant inside the `raw === false` branch (any Bitcoin mode), and `ensureRadfiAccessToken` inside the `raw === false` && `walletMode==='TRADING'` sub-branch only — exactly mirroring `SwapService.ts:865-876`.
  - Add `srcPublicKey: extras?.srcPublicKey` + `accessToken: extras?.bound?.accessToken` to `coreParams`
    passed to `this.spoke.deposit` (`DepositParams` already accepts both — no `spoke-types` change).
  - USER (self-custody) Bitcoin source still routes to on-chain `sodax.bridge` non-raw (`raw:true` throws
    in `BitcoinSpokeService.deposit` normal mode).

**MODIFY** `packages/sdk/src/shared/entities/Sodax.ts`:
- `const bridgeUseBackendSubmitTx = options?.bridgeOptions?.useBackendSubmitTx ?? false;`
  (distinct local name; do not collide with the swaps `useBackendSubmitTx` from #210).
- Line 90 → `this.bridge = new BridgeService({ hubProvider: this.hubProvider, config: this.config, spoke: this.spoke, backendApi: this.backendApi, useBackendSubmitTx: bridgeUseBackendSubmitTx });`

### 4. `@sodax/dapp-kit` — `bridgeApi/` hooks

**CREATE** `packages/dapp-kit/src/hooks/bridgeApi/` (sibling of `bridge/`; leave existing
hooks untouched). Convention: `const { sodax } = useSodaxContext()`; `unwrapResult` from
`../shared/unwrapResult.js`; call `sodax.api.bridge.*`; trailing `apiConfig?: RequestOverrideConfig`;
`retry: 3`; queryKey/mutationKey prefixed `'bridgeApi'`.

**DECIDED (Decision #3):** the token LIST is backend-served via `sodax.api.bridge.getTokens` →
add a `useBridgeApiTokens` hook. Only the bridgeable-**amount** stays CLIENT-SIDE (reuse the existing
`useGetBridgeableAmount` + `sodax.config` vault math — no swaps analog, no backend endpoint). →
`bridgeApi/` is 6 core hooks:

| File | Kind | Calls | Key |
| --- | --- | --- | --- |
| `useBridgeApiAllowance.ts` | query | `checkAllowance(body, cfg)` | `['bridgeApi','allowance', body?.srcChainKey, body?.inputToken, body?.inputAmount, body?.srcAddress]` (wire names, Decision #4) |
| `useBridgeApiApprove.ts` | mutation | `approve(body, cfg)` → `{tx}` | `['bridgeApi','approve']` |
| `useBridgeApiCreateBridgeIntent.ts` | mutation | `createBridgeIntent(body, cfg)` → `{tx, relayData}` | `['bridgeApi','createBridgeIntent']` |
| `useBridgeApiSubmitTx.ts` | mutation | `submitTx(request, cfg)` | `['bridgeApi','submitTx']` |
| `useBridgeApiSubmitTxStatus.ts` | query (poll) | `getSubmitTxStatus({txHash,srcChainKey}, cfg)` | `['bridgeApi','submitTx','status', txHash, srcChainKey]` |
| `useBridgeApiTokens.ts` | query | `getTokens(cfg)` (opt. `getTokensByChain(chainKey,cfg)`) | `['bridgeApi','tokens']` |

- `useBridgeApiSubmitTxStatus` params `{ txHash, srcChainKey?, apiConfig? }`; `enabled: !!txHash && !!srcChainKey`;
  inline `refetchInterval: q => { const s = q.state.data?.data?.status; return (s==='executed'||s==='failed') ? false : 1000; }`.
- Read hooks use `ReadHookParams<...>`; mutations use `MutationHookParams` + `useSafeMutation`
  (`mutationKey` BEFORE `...mutationOptions`, `mutationFn` AFTER). Reuse `shared/unwrapResult.js`
  (no local copy). No `isTerminalBridgeStatus` predicate module needed (string enum → inline check).
- Hook name `useBridgeApiCreateBridgeIntent` lines up with `sodax.api.bridge.createBridgeIntent`.
- **CREATE** `bridgeApi/index.ts` barrel; **MODIFY** `hooks/index.ts` (`export * from './bridgeApi/index.js';`
  after the `bridge/index.js` line); **MODIFY** `_mutationContract.test.ts` (register the 3 mutation hooks).
- Bridgeable-**amount** stays client-side (existing `useGetBridgeableAmount` + vault math; no backend endpoint — Decision #3).

### 5. `@sodax/demo` — bridge-api page

New parallel page (leave `components/bridge/` intact).

- **CREATE** `apps/demo/src/pages/bridge-api/page.tsx` — `orders` state, render
  `orders.map(...) → <OrderStatus>` above `<BridgeCard setOrders={setOrders}/>`.
- **CREATE** `apps/demo/src/components/bridge-api/`:
  - `lib/config.ts` — `BRIDGE_API_CONFIG` baseURL passed as `apiConfig` to every hook call.
  - `lib/signAndBroadcast.ts` — port the swaps dispatcher; rename symbols
    (`signAndBroadcastBridgeApiTx`, `isSignableBridgeApiChain`, `waitForTxFinality`); keep
    the per-chain switch identical (EVM `sendTransaction`, SUI `signAndExecuteTxn`, ICON
    `sendTransaction`, NEAR `signAndSubmitTxn`, SOLANA/STELLAR/STACKS/INJECTIVE `signAndSendTransaction`,
    BITCOIN → `sodax.spoke.getSpokeService(BITCOIN).signAndSubmitRawTransaction`).
  - `lib/mappers.ts` — `toXToken(...)`. NO `toIntentRequest` (bridge submit-tx has no intent struct).
  - `lib/useDebouncedValue.ts` — copy verbatim (only if an amount-debounce step is used).
  - `SelectChain.tsx` — copy verbatim.
  - `OrderStatus.tsx` — `BridgeApiOrder = { txHash, srcChainKey, apiBaseURL }`; poll
    `useBridgeApiSubmitTxStatus`; render `status` + `result.dstIntentTxHash` + failure fields.
  - `BridgeCard.tsx` — merge `BridgeManager` + `BridgeDialog` like `SwapCard`. Allowance via
    `useBridgeApiAllowance`; `handleApprove` → `useBridgeApiApprove` → sign+broadcast → refetch;
    `handleBridge` → `useBridgeApiCreateBridgeIntent` → `{tx, relayData}` → sign+broadcast (Bitcoin
    via spoke) → `useBridgeApiSubmitTx({ request:{ txHash, srcChainKey, walletAddress, relayData }, apiConfig })` (FULL relayData envelope, Decision #7)
    → `setOrders([...prev, { txHash, srcChainKey, apiBaseURL }])`. Preserve gating (Bitcoin trading
    address via `loadRadfiSession`; `parseUnits`; EVM `useEvmSwitchChain`; Stellar trustline;
    NEAR storage; Bitcoin ready flags + `BitcoinSetupPanel`). Use `mutateAsyncSafe` Result handling.
    For a **TRADING** Bitcoin source, supply the Bound `accessToken` (Radfi login) via
    `extras: { bound: { accessToken } }` on the bridge call to enable the raw-PSBT path (Decision #13);
    a **USER** self-custody Bitcoin source stays on on-chain `sodax.bridge` non-raw (raw throws in USER mode).
  - **FIX (no UX regression):** keep the **max-bridgeable** display + **route-availability gate**
    using the client-side `useGetBridgeableAmount` + `isBridgeable` (mirrors current `BridgeManager`).
- **MODIFY** `apps/demo/src/App.tsx` (route `/bridge-api`) + `components/shared/header.tsx` (nav link).
- Reuse existing `lib/utils.ts` + `constants.ts` (no new utils).

### 6. `@sodax/skills` + docs

- **CREATE** `packages/skills/skills/sodax-sdk/bridge-api/SKILL.md` (mirror `swaps-api/SKILL.md`).
  **FIX:** DROP / reframe the "Migration v1→v2" section — there is NO v1 Bridge API; reframe as
  "migrating from on-chain `sodax.bridge.bridge()` to the API client + `useBackendSubmitTx`".
- **CREATE** `packages/skills/skills/sodax-sdk/integration/knowledge/features/bridge-api.md`
  (mirror `swaps-api.md`; keep distinct from the existing on-chain `features/bridge.md`).
- **CREATE** `packages/sdk/docs/BRIDGE_API.md` (mirror `docs/SWAPS_API.md`; cross-link the existing
  on-chain `docs/BRIDGE.md`).
- **MODIFY** `sodax-sdk/SKILL.md` (routing row + features list), `packages/skills/AGENTS.md` (tables/tree),
  `docs/BRIDGE.md` / `BACKEND_API.md` / `CONFIGURE_SDK.md` (document `bridgeOptions.useBackendSubmitTx`),
  `sodax-dapp-kit` skill docs (new `bridgeApi` hooks). Run `pnpm check:ai`.

## Bridge-specific deltas vs Swaps

1. **No `intent` struct.** `createBridgeIntent` returns `{ tx, relayData }`. So
   `BridgeSubmitTxRequestV2` drops `intent`; no `IntentRequestV2`/`toIntentRequest` mapper. But
   because `intent` is dropped, `submit-tx` must carry the **FULL** `relayData` `{ address, payload }`
   envelope (swap rebuilds the address from `intent.creator`; bridge cannot — `relayData.address = hubWallet`).
2. **No solver / `postExecution` / `intent_hash`.** Terminal success = `status === 'executed' &&
   result?.dstIntentTxHash` (drop swap's `&& result.intent_hash`). Success value is `TxHashPair`.
3. **No hub-source short-circuit.** `bridge()` always relays; `fallbackBridgeSteps` keeps that.
4. **No limit orders, no `getDeadline`, no `getQuote`/slippage.** Replaced by `getFee`
   (client-side `bigint`), `getBridgeableAmount` (`BridgeLimit { amount, decimals, type }`),
   `getBridgeableTokens` (vault matching).
5. **Bridgeable tokens computed at runtime** (`srcToken.vault === dstToken.vault`) — this is the on-chain SDK math. The API token **list** is now backend-served via `/bridge/tokens` (Decision #3); bridgeable-**amount** stays client-side.
6. **Smaller surface** (~5-8 methods vs 21): no `submitIntent`, `getStatus`(intent), `cancelIntent`,
   `getIntentHash`, `getSolvedIntentPacket`, `getIntentSubmitTxExtraData`, `getFilledIntent`,
   `getIntent`, `createLimitOrderIntent`, `getSolverFee`.
7. **Fewer chains for approval** (EVM-spoke + Stellar). **Bitcoin source IS supported via Bound TRADING** (Decision #13): a raw PSBT from Radfi needs only `bound.accessToken`, signed via `BitcoinSpokeService.signAndSubmitRawTransaction`; USER self-custody Bitcoin stays on-chain (`raw` throws in USER mode).
8. **Status lifecycle — DECIDED (Decision #10/#11):** 5-state `'pending'|'relaying'|'relayed'|'executed'|'failed'` (drops swaps-only `'posting_execution'`); result drops `intent_hash`; data drops `relayedForRefundAt`/`intentCancelled` (kept: `failureReason`/`abandonedAt`/`userMessage`); schema stays tolerant. Stuck bridges are recovered via `RecoveryService.withdrawHubAsset`, not surfaced in status.
9. **Config key:** use a distinct `bridgeOptions.useBackendSubmitTx` (NOT `swapsOptions`).

## Verification

- `pnpm --filter @sodax/sdk tsc --noEmit && pnpm --filter @sodax/sdk test`
- `pnpm --filter @sodax/dapp-kit test`
- `pnpm check:ai` (skills/docs)
- `pnpm build:packages` (so the backend can point at local `dist/`), full repo test/typecheck/lint/circular-deps.
- Tests to add:
  - `backendApi/BridgeApiService.test.ts` (mirror `SwapsApiService.test.ts`: stub `fetch`, route table
    asserting exact `${BASE}/bridge/...` URL+verb, happy path, bigint body serialization, valibot
    validation-failure with `context.reason==='invalid_response_shape'`, transport error, `RequestOverrideConfig`).
  - `backendApi/apiConfig.test.ts` (assert `resolveBridgeApiConfig` === `resolveBaseApiConfig` behaviour — shared base, Decision #1).
  - `bridge/BridgeService.test.ts` (5-case backend submit-tx batch: backend executed → relay NOT called;
    submit POST rejected → fallback; terminal failed → fallback; flag OFF default → submitTx NOT called;
    shared-budget with fake timers → fallback relay timeout `>0` and `< overallTimeout`).
  - Sodax wiring assertion: `new Sodax({ bridgeOptions:{ useBackendSubmitTx:true } })` →
    `sodax.bridge.useBackendSubmitTx === true` and `sodax.api.bridge` defined.
  - `_mutationContract.test.ts` (register the 3 new mutation hooks).
  - `test:e2e` bridge re-relay assertion (Decision #12): re-relay an already-relayed bridge tx via
    `relayTxAndWaitPacket` → returns the existing `executed` packet (mirror `e2e-relay.test.ts` test 2).
  - `BridgeApiService.test.ts` also asserts the `GET /bridge/tokens` + `/bridge/tokens/:chainKey` routes.

## Ordered task checklist

**Phase 0 — Prerequisite**
- [x] Rebase the Bridge branch onto `origin/feat/swaps-api-v2` — **DONE** (branch is already off
      swaps-api-v2; scaffold commit `8fd58453`). `api-utils.ts`, `apiConfig.ts`, `SwapsApiService.ts`,
      `swapsApi/` hooks, `ApiConfig` are present.
- [x] Backend `/bridge/*` contract — **build to the locked contract** (`reference/backend-contract/04-decisions.md`); backend follows. No bridge controller exists yet, so this no longer blocks Phase 1.

**Phase 1 — `@sodax/types`**
- [ ] CREATE `backend/backendBridgeApiV2.ts` (DTOs + `IBridgeApiV2`; **swaps-named wire DTO** + `getTokens`/`getTokensByChain`; reuse `RawTxReturnType` + `RelayExtraDataResponseV2` + `PacketDataV2` + `BitcoinBoundExtrasV2`; `_AssertJsonSafe` guard).
- [ ] MODIFY `backend/index.ts`; `sodax-config/sodax-config.ts` (`bridgeOptions`).

**Phase 2 — `@sodax/sdk` HTTP client**
- [ ] CREATE `backendApi/bridgeApiSchemas.ts` (incl. token schemas); `BridgeApiService.ts` (+`getTokens`/`getTokensByChain`, domain→wire mapper).
- [ ] MODIFY `backendApi/apiConfig.ts`; `BackendApiService.ts`; `index.ts`.
- [ ] CREATE `BridgeApiService.test.ts`; MODIFY `apiConfig.test.ts`.

**Phase 3 — `@sodax/sdk` BridgeService + facade**
- [ ] MODIFY `bridge/BridgeService.ts` (ctor; `submitTx` with FULL relayData; `fallbackBridgeSteps`; `bridge()` branch; **+`BridgeExtras`/4-arg `BridgeParams` + `createBridgeIntent` Bitcoin-Bound plumbing, Decision #13**).
- [ ] MODIFY `shared/entities/Sodax.ts`.
- [ ] MODIFY `bridge/BridgeService.test.ts` (5 cases) + Sodax wiring assertion.

**Phase 4 — `@sodax/dapp-kit`**
- [ ] CREATE 6 `bridgeApi/` hooks (incl. `useBridgeApiTokens`) + `index.ts` barrel; MODIFY `hooks/index.ts`; `_mutationContract.test.ts` (3 mutation hooks).

**Phase 5 — `@sodax/demo`**
- [ ] CREATE `components/bridge-api/*` + `pages/bridge-api/page.tsx`; MODIFY `App.tsx` + `header.tsx`.

**Phase 6 — skills + docs**
- [ ] CREATE `bridge-api/SKILL.md` + `knowledge/features/bridge-api.md` + `docs/BRIDGE_API.md`.
- [ ] MODIFY `sodax-sdk/SKILL.md`, `skills/AGENTS.md`, `docs/BRIDGE.md`/`BACKEND_API.md`/`CONFIGURE_SDK.md`, dapp-kit skill.
- [ ] `pnpm check:ai`.

**Phase 7 — finalize**
- [ ] `pnpm build:packages`; full repo test/typecheck. Open PR (do NOT commit/push without explicit request).

## Decisions (locked — see `reference/backend-contract/04-decisions.md`) & remaining open

1. **Backend `/bridge/*` route list + DTO shapes — DECIDED:** build to the locked contract
   (`04-decisions.md`); the backend follows. No bridge controller exists yet (only `/swaps/*`), so the
   SDK is the source of truth for the wire shape. **Does NOT block Phase 1.**
2. **Host — DECIDED (Decision #1):** shared base, routes `/bridge/*`, no `constants.ts` change;
   `resolveBridgeApiConfig = resolveBaseApiConfig`; config typed as `BaseApiConfig`.
3. **Config toggle key — DECIDED:** distinct `bridgeOptions.useBackendSubmitTx` (not `swapsOptions`).
4. **Tokens vs bridgeable-amount — DECIDED (Decision #3):** token **list** is backend-served via
   `/bridge/tokens` (+`/tokens/:chainKey`) → adds `getTokens`/`getTokensByChain` + `useBridgeApiTokens`
   (`bridgeApi/` = 6 hooks). Bridgeable-**amount** stays client-side (vault math; no swaps analog, no
   backend endpoint).
5. **Status lifecycle — DECIDED (Decision #10/#11):** 5-state `'pending'|'relaying'|'relayed'|'executed'|'failed'`;
   drops `'posting_execution'`/`intent_hash`/`relayedForRefundAt`/`intentCancelled`; schema tolerant of
   unknown/extra fields; terminal-success field = `result.dstIntentTxHash` (no `intent_hash`).
6. **Re-relay idempotency — DECIDED safe by construction (Decision #12).** Only e2e test 1
   (`sodax.swaps.postExecution`) is swap-specific; test 2 — the re-relay case — exercises the GENERIC
   `relayTxAndWaitPacket` (`IntentRelayApiService.ts:393`), the exact fn `fallbackBridgeSteps` reuses, and
   the relay layer returns success for an already-relayed tx (`IntentRelayApiService.ts:195`). So the
   fallback cannot double-relay. Keep `useBackendSubmitTx` **default-OFF as defense-in-depth**; the only
   remaining task is to **add a bridge-flavored re-relay assertion** mirroring test 2 (already-relayed bridge
   tx → existing `executed` packet) — not an open blocker.
7. **(STILL OPEN — backend timeline) Does the bridge `/bridge/*` API exist yet?** No bridge controller in
   the backend checkout today; the issue says backend work follows SDK work. Until it ships, the
   `useBackendSubmitTx` path is dormant (default false) and the demo points at a stub/local host — this is
   the intended interim. Confirm the live route list against the bridge controller when it lands.
8. **Bitcoin coverage — DECIDED (Decision #13):** Bitcoin source IS supported via Bound TRADING (additive
   SDK plumbing — see §3). Raw Bitcoin txs use the permissive `AnyRawTxSchema` fallback and route via
   `BitcoinSpokeService.signAndSubmitRawTransaction`; USER self-custody Bitcoin stays on-chain (`raw` throws).

## Reference pointers (mirror these)

On `origin/feat/swaps-api-v2`:
- `packages/sdk/src/backendApi/SwapsApiService.ts` (HTTP client + `request<S>`)
- `packages/sdk/src/backendApi/{api-utils,apiConfig,swapsApiSchemas,rawTxSchemas}.ts`
- `packages/sdk/src/swap/SwapService.ts` (`submitTx` ~lines 563-627, `fallbackSwapSteps` ~lines 486-520)
- `packages/dapp-kit/src/hooks/swapsApi/` (hook family)
- `apps/demo/src/components/swaps-api/` + `apps/demo/src/pages/swaps-api/page.tsx`
Backend contract & shape references:
- `reference/backend-contract/04-decisions.md` (the 13 locked decisions — authoritative)
- `sodax-backend/apps/swaps-api/src/api/swaps/swaps.controller.ts` (`getTokens`/`getTokensByChain` shape, Decision #3)
- `packages/sdk/src/shared/services/intentRelay/IntentRelayApiService.ts` (`relayTxAndWaitPacket` @393; already-relayed dedupe @195, Decision #12)

Current Bridge baseline (working tree):
- `packages/sdk/src/bridge/BridgeService.ts` (`bridge()` @ line 336, `createBridgeIntent`, ctor params @ line 79)
- `packages/sdk/src/shared/entities/Sodax.ts` (line 90)
- `packages/dapp-kit/src/hooks/bridge/`
- `apps/demo/src/components/bridge/`
