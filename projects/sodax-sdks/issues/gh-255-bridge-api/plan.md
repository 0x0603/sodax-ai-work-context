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

**Hard prerequisite: Bridge MUST build on top of PR #210 (`feat/swaps-api-v2`).**

| Foundation #210 introduces | In working tree today? |
| --- | --- |
| `backendApi/api-utils.ts` (`makeRequest`, `toJsonBody`, `RequestConfig`/`RequestOverrideConfig`) | ❌ |
| `backendApi/apiConfig.ts` (`isCustomApiConfig`, `layerConfigs`, `resolveBaseApiConfig`, `resolveSwapsApiConfig`) | ❌ |
| `backendApi/{swapsApiSchemas,rawTxSchemas,backendApiSchemas}.ts` (valibot) | ❌ |
| `BackendApiService` sub-service shape (`public readonly swaps`, ctor resolves config) | ❌ |
| `ApiConfig` union (`BaseApiConfig \| CustomApiConfig`, `SwapsApiConfig`) in `common/constants.ts` | ❌ |
| `Sodax.api` alias + `swapsOptions.useBackendSubmitTx` toggle | ❌ |
| Per-chain `signAndSendTransaction` (Solana/Stacks/Stellar/Injective) + `BitcoinSpokeService.signAndSubmitRawTransaction` | ❌ |
| **Types** `ISwapsApiV2`/`RelayExtraDataResponseV2`/`PacketDataV2`/`SubmitTxRequestV2` in `backend/backendApiV2.ts` | ✅ |
| `RawTxReturnType` + per-chain raw-tx types in `common/common.ts` | ✅ |
| `ConfigService.bridge` / `bridgePartnerFee` | ✅ |

**Decision: rebase the Bridge branch onto `origin/feat/swaps-api-v2`** (or wait for
#210 → `main`, then branch from `main`). Do NOT build stand-alone.

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

**Extend (not duplicate):** `apiConfig.ts` (+`resolveBridgeApiConfig`), `constants.ts`
(+`BridgeApiConfig` + `bridgeApiConfig?` slice — only if independent host), `BackendApiService`
(+`public readonly bridge`), `Sodax.ts` (+`bridgeOptions` resolution).

**No new `SodaxErrorCode`.** `'backend'` `SodaxFeature` + `EXTERNAL_API_ERROR` already
exist (#210); `BridgeOrchestrationErrorCode` already includes `EXECUTION_FAILED` + `UNKNOWN`.

## Steps (per-package work breakdown)

### 1. `@sodax/types`

**CREATE** `packages/types/src/backend/backendBridgeApiV2.ts` (sibling to `backendApiV2.ts`,
which is already ~922 lines; mirror its header comment about the JSON-safety rule
bigint→decimal-string / Date→ISO-string, banner sections, then the aggregating interface).

```ts
import type { RawTxReturnType } from '../common/index.js';
import type { RelayExtraDataResponseV2, PacketDataV2 } from './backendApiV2.js'; // FIX: import PacketDataV2 too

export interface CreateBridgeIntentParamsV2 { srcAddress: string; srcChainKey: string; srcToken: string; amount: string /*decimal*/; dstChainKey: string; dstToken: string; recipient: string }
export interface BridgeAllowanceCheckResponseV2 { valid: boolean }
export interface BridgeApproveResponseV2 { tx: RawTxReturnType }
export interface CreateBridgeIntentResponseV2 { tx: RawTxReturnType; relayData: RelayExtraDataResponseV2 } // NO intent struct

export interface BridgeSubmitTxRequestV2 { txHash: string; srcChainKey: string; walletAddress: string; relayData: string /*hex*/ } // NO intent
export interface BridgeSubmitTxResponseV2 { success: boolean; data: { status: 'inserted' | 'duplicate'; message: string } }

export interface BridgeSubmitTxStatusQueryV2 { txHash: string; srcChainKey: string }
export type SubmitBridgeTxStatusV2 = 'pending' | 'relaying' | 'relayed' | 'executed' | 'failed';
export interface BridgeSubmitTxStatusResultV2 { dstIntentTxHash: string; packetData?: PacketDataV2 } // NO intent_hash
export interface BridgeSubmitTxStatusDataV2 { txHash: string; srcChainKey: string; status: SubmitBridgeTxStatusV2; failedAtStep?: string; failureReason?: string; processingAttempts: number; abandonedAt?: string; result?: BridgeSubmitTxStatusResultV2; userMessage?: string }
export interface BridgeSubmitTxStatusResponseV2 { success: boolean; data: BridgeSubmitTxStatusDataV2 }

// optional (only if backend exposes them — see Open Q #4):
export interface BridgeTokenV2 { symbol: string; name: string; decimals: number; address: string; chainKey: string; hubAsset: string; vault: string }
export type GetBridgeTokensResponseV2 = Record<string, readonly BridgeTokenV2[]>;
export type GetBridgeTokensByChainResponseV2 = readonly BridgeTokenV2[]; // FIX: type array, NOT empty interface {}

export interface IBridgeApiV2 {
  checkAllowance(body: CreateBridgeIntentParamsV2): Promise<BridgeAllowanceCheckResponseV2>;
  approve(body: CreateBridgeIntentParamsV2): Promise<BridgeApproveResponseV2>;
  createBridgeIntent(body: CreateBridgeIntentParamsV2): Promise<CreateBridgeIntentResponseV2>;
  submitTx(body: BridgeSubmitTxRequestV2): Promise<BridgeSubmitTxResponseV2>;
  getSubmitTxStatus(query: BridgeSubmitTxStatusQueryV2): Promise<BridgeSubmitTxStatusResponseV2>;
  // optional: getTokens(): Promise<GetBridgeTokensResponseV2>; getBridgeableAmount(...): ...;
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
- **MODIFY (only if independent host — Open Q #2)** `common/constants.ts` — add
  `export type BridgeApiConfig = BaseApiConfig;` and widen `CustomApiConfig` with `bridgeApiConfig?`.
  Default recommendation: shared base host, route `/bridge/*` (no `constants.ts` change).

### 2. `@sodax/sdk` — Bridge HTTP client

- **CREATE** `backendApi/bridgeApiSchemas.ts` — valibot, one schema per `IBridgeApiV2`
  response, mirroring `swapsApiSchemas.ts`. bigint-derived wire fields = `v.string()`,
  ints = `v.number()`, status = `v.picklist([...])`. Tx-bearing responses are FACTORIES
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
    private readonly config: BridgeApiConfig;     // already-resolved flat config
    private readonly headers: Record<string,string>;
    private readonly logger: SodaxLogger;
    constructor(config: BridgeApiConfig, logger: SodaxLogger = consoleLogger) { /* identical to SwapsApiService */ }
    // private request<S>(): COPY VERBATIM from SwapsApiService.request<S>; only the
    //   message changes → `Invalid response shape from bridge API for ${endpoint}`.
    //   keep code='EXTERNAL_API_ERROR', feature='backend', context.api='backend'.

    checkAllowance(body, cfg?)        → POST /bridge/allowance/check  → BridgeAllowanceCheckResponseSchema (toJsonBody)
    approve(body, cfg?)               → POST /bridge/approve          → makeBridgeApproveResponseSchema(rawTxSchemaForChainKey(body.srcChainKey))
    createBridgeIntent(body, cfg?)    → POST /bridge/intents          → makeCreateBridgeIntentResponseSchema(rawTxSchemaForChainKey(body.srcChainKey))
    submitTx(body, cfg?)              → POST /bridge/submit-tx        → BridgeSubmitTxResponseSchema (toJsonBody)
    getSubmitTxStatus(query, cfg?)    → GET  /bridge/submit-tx/status?txHash=&srcChainKey= → BridgeSubmitTxStatusResponseSchema
    setHeaders(headers): void         // copy verbatim
    getBaseURL(): string              // copy verbatim
  }
  ```

- **MODIFY** `backendApi/apiConfig.ts` — add `resolveBridgeApiConfig(config: ApiConfig): BridgeApiConfig`
  mirroring `resolveSwapsApiConfig`. If shared base (Open Q #2), it can just return `resolveBaseApiConfig(config)`.
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
    const submitted = await this.backendApi.bridge.submitTx({ txHash: spokeTxHash, srcChainKey, walletAddress: params.srcAddress, relayData: relayData.payload });
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

**MODIFY** `packages/sdk/src/shared/entities/Sodax.ts`:
- `const bridgeUseBackendSubmitTx = options?.bridgeOptions?.useBackendSubmitTx ?? false;`
  (distinct local name; do not collide with the swaps `useBackendSubmitTx` from #210).
- Line 90 → `this.bridge = new BridgeService({ hubProvider: this.hubProvider, config: this.config, spoke: this.spoke, backendApi: this.backendApi, useBackendSubmitTx: bridgeUseBackendSubmitTx });`

### 4. `@sodax/dapp-kit` — `bridgeApi/` hooks

**CREATE** `packages/dapp-kit/src/hooks/bridgeApi/` (sibling of `bridge/`; leave existing
hooks untouched). Convention: `const { sodax } = useSodaxContext()`; `unwrapResult` from
`../shared/unwrapResult.js`; call `sodax.api.bridge.*`; trailing `apiConfig?: RequestOverrideConfig`;
`retry: 3`; queryKey/mutationKey prefixed `'bridgeApi'`.

**FIX (default decision — Open Q #4): keep token list & bridgeable-amount CLIENT-SIDE**
(reuse the existing `useGetBridgeableTokens`/`useGetBridgeableAmount` + `sodax.config`), since
the SDK already has the vault math and the backend may not expose these. → `bridgeApi/`
is just 5 core hooks:

| File | Kind | Calls | Key |
| --- | --- | --- | --- |
| `useBridgeApiAllowance.ts` | query | `checkAllowance(body, cfg)` | `['bridgeApi','allowance', body?.srcChainKey, body?.srcToken, body?.amount, body?.srcAddress]` |
| `useBridgeApiApprove.ts` | mutation | `approve(body, cfg)` → `{tx}` | `['bridgeApi','approve']` |
| `useBridgeApiCreateBridgeIntent.ts` | mutation | `createBridgeIntent(body, cfg)` → `{tx, relayData}` | `['bridgeApi','createBridgeIntent']` |
| `useBridgeApiSubmitTx.ts` | mutation | `submitTx(request, cfg)` | `['bridgeApi','submitTx']` |
| `useBridgeApiSubmitTxStatus.ts` | query (poll) | `getSubmitTxStatus({txHash,srcChainKey}, cfg)` | `['bridgeApi','submitTx','status', txHash, srcChainKey]` |

- `useBridgeApiSubmitTxStatus` params `{ txHash, srcChainKey?, apiConfig? }`; `enabled: !!txHash && !!srcChainKey`;
  inline `refetchInterval: q => { const s = q.state.data?.data?.status; return (s==='executed'||s==='failed') ? false : 1000; }`.
- Read hooks use `ReadHookParams<...>`; mutations use `MutationHookParams` + `useSafeMutation`
  (`mutationKey` BEFORE `...mutationOptions`, `mutationFn` AFTER). Reuse `shared/unwrapResult.js`
  (no local copy). No `isTerminalBridgeStatus` predicate module needed (string enum → inline check).
- Hook name `useBridgeApiCreateBridgeIntent` lines up with `sodax.api.bridge.createBridgeIntent`.
- **CREATE** `bridgeApi/index.ts` barrel; **MODIFY** `hooks/index.ts` (`export * from './bridgeApi/index.js';`
  after the `bridge/index.js` line); **MODIFY** `_mutationContract.test.ts` (register the 3 mutation hooks).
- (Optional, only if backend exposes endpoints: `useBridgeApiTokens`, `useBridgeApiBridgeableAmount`.)

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
    via spoke) → `useBridgeApiSubmitTx({ request:{ txHash, srcChainKey, walletAddress, relayData: relayData.payload }, apiConfig })`
    → `setOrders([...prev, { txHash, srcChainKey, apiBaseURL }])`. Preserve gating (Bitcoin trading
    address via `loadRadfiSession`; `parseUnits`; EVM `useEvmSwitchChain`; Stellar trustline;
    NEAR storage; Bitcoin ready flags + `BitcoinSetupPanel`). Use `mutateAsyncSafe` Result handling.
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
   `BridgeSubmitTxRequestV2` drops `intent`; `BridgeService.submitTx` passes none; no
   `IntentRequestV2`/`toIntentRequest` mapper.
2. **No solver / `postExecution` / `intent_hash`.** Terminal success = `status === 'executed' &&
   result?.dstIntentTxHash` (drop swap's `&& result.intent_hash`). Success value is `TxHashPair`.
3. **No hub-source short-circuit.** `bridge()` always relays; `fallbackBridgeSteps` keeps that.
4. **No limit orders, no `getDeadline`, no `getQuote`/slippage.** Replaced by `getFee`
   (client-side `bigint`), `getBridgeableAmount` (`BridgeLimit { amount, decimals, type }`),
   `getBridgeableTokens` (vault matching).
5. **Bridgeable tokens computed at runtime** (`srcToken.vault === dstToken.vault`), not a static list.
6. **Smaller surface** (~5-8 methods vs 21): no `submitIntent`, `getStatus`(intent), `cancelIntent`,
   `getIntentHash`, `getSolvedIntentPacket`, `getIntentSubmitTxExtraData`, `getFilledIntent`,
   `getIntent`, `createLimitOrderIntent`, `getSolverFee`.
7. **Fewer chains for approval** (EVM-spoke + Stellar); Bitcoin source via `BitcoinSpokeService.signAndSubmitRawTransaction`.
8. **Shorter status lifecycle** likely (no `'posting_execution'`); confirm with backend.
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
  - `backendApi/apiConfig.test.ts` (+`resolveBridgeApiConfig` cases, only if `bridgeApiConfig` slice added).
  - `bridge/BridgeService.test.ts` (5-case backend submit-tx batch: backend executed → relay NOT called;
    submit POST rejected → fallback; terminal failed → fallback; flag OFF default → submitTx NOT called;
    shared-budget with fake timers → fallback relay timeout `>0` and `< overallTimeout`).
  - Sodax wiring assertion: `new Sodax({ bridgeOptions:{ useBackendSubmitTx:true } })` →
    `sodax.bridge.useBackendSubmitTx === true` and `sodax.api.bridge` defined.
  - `_mutationContract.test.ts` (register the 3 new mutation hooks).

## Ordered task checklist

**Phase 0 — Prerequisite**
- [ ] Rebase the Bridge branch onto `origin/feat/swaps-api-v2` (or wait for #210 → `main`).
      Confirm `api-utils.ts`, `apiConfig.ts`, `SwapsApiService.ts`, `swapsApi/` hooks, `ApiConfig` present.
- [ ] Confirm the backend `/bridge/*` route list + DTO shapes against the bridge controller (Open Q #1).

**Phase 1 — `@sodax/types`**
- [ ] CREATE `backend/backendBridgeApiV2.ts` (DTOs + `IBridgeApiV2`; reuse `RawTxReturnType` + `RelayExtraDataResponseV2` + `PacketDataV2`; `_AssertJsonSafe` guard).
- [ ] MODIFY `backend/index.ts`; `sodax-config/sodax-config.ts` (`bridgeOptions`).
- [ ] *(if independent host)* MODIFY `common/constants.ts`.

**Phase 2 — `@sodax/sdk` HTTP client**
- [ ] CREATE `backendApi/bridgeApiSchemas.ts`; `BridgeApiService.ts`.
- [ ] MODIFY `backendApi/apiConfig.ts`; `BackendApiService.ts`; `index.ts`.
- [ ] CREATE `BridgeApiService.test.ts`; MODIFY `apiConfig.test.ts`.

**Phase 3 — `@sodax/sdk` BridgeService + facade**
- [ ] MODIFY `bridge/BridgeService.ts` (ctor; `submitTx`; `fallbackBridgeSteps`; `bridge()` branch).
- [ ] MODIFY `shared/entities/Sodax.ts`.
- [ ] MODIFY `bridge/BridgeService.test.ts` (5 cases) + Sodax wiring assertion.

**Phase 4 — `@sodax/dapp-kit`**
- [ ] CREATE 5 `bridgeApi/` hooks + `index.ts` barrel; MODIFY `hooks/index.ts`; `_mutationContract.test.ts`.

**Phase 5 — `@sodax/demo`**
- [ ] CREATE `components/bridge-api/*` + `pages/bridge-api/page.tsx`; MODIFY `App.tsx` + `header.tsx`.

**Phase 6 — skills + docs**
- [ ] CREATE `bridge-api/SKILL.md` + `knowledge/features/bridge-api.md` + `docs/BRIDGE_API.md`.
- [ ] MODIFY `sodax-sdk/SKILL.md`, `skills/AGENTS.md`, `docs/BRIDGE.md`/`BACKEND_API.md`/`CONFIGURE_SDK.md`, dapp-kit skill.
- [ ] `pnpm check:ai`.

**Phase 7 — finalize**
- [ ] `pnpm build:packages`; full repo test/typecheck. Open PR (do NOT commit/push without explicit request).

## Risks / Open questions (decisions needed)

1. **Exact backend `/bridge/*` route list + DTO shapes** — must come from the bridge controller
   (analog of `apps/swaps-api/src/api/swaps/swaps.controller.ts`). **Blocks Phase 1.**
2. **Independent host vs shared base** — recommend SHARED base (`/bridge/*`, no `constants.ts` change)
   unless backend dictates otherwise.
3. **Config toggle key** — recommend a distinct `bridgeOptions.useBackendSubmitTx` (not `swapsOptions`).
4. **`getBridgeableTokens`/`getBridgeableAmount` — backend or client-side?** Recommend CLIENT-SIDE
   (reuse `sodax.bridge.*` + existing `useGetBridgeable*` hooks); the SDK already does the vault math.
   This keeps `bridgeApi/` at 5 hooks.
5. **Status lifecycle** — does bridge reuse the swaps 6-state picklist or a shorter set (likely drop
   `'posting_execution'`)? Keep the status hook's inline terminal check (`'executed'|'failed'`)
   robust regardless. Confirm terminal-success field is `result.dstIntentTxHash`.
6. **Idempotency of bridge re-relay (functional blocker for turning the flag on).** The fallback after
   a partial backend attempt is only safe if re-relaying/re-depositing an already-processed bridge is
   idempotent. The swap idempotency proof (`e2e-relay.test.ts`) is swap-specific. **`useBackendSubmitTx`
   MUST ship default-OFF and not be enabled in any demo/e2e path until bridge re-relay idempotency is
   independently verified.**
7. **Does the bridge backend `submit-tx` endpoint exist yet?** Issue says backend work follows SDK work.
   If not live, the `useBackendSubmitTx` path is dormant (default false) — confirm that's the intended interim.
8. **Bitcoin coverage** — Bitcoin is excluded from `RawTxReturnType`; if the API returns Bitcoin source
   txs, confirm they hit the permissive `AnyRawTxSchema` fallback + route via `BitcoinSpokeService.signAndSubmitRawTransaction`.

## Reference pointers (mirror these)

On `origin/feat/swaps-api-v2`:
- `packages/sdk/src/backendApi/SwapsApiService.ts` (HTTP client + `request<S>`)
- `packages/sdk/src/backendApi/{api-utils,apiConfig,swapsApiSchemas,rawTxSchemas}.ts`
- `packages/sdk/src/swap/SwapService.ts` (`submitTx` ~lines 563-627, `fallbackSwapSteps` ~lines 486-520)
- `packages/dapp-kit/src/hooks/swapsApi/` (hook family)
- `apps/demo/src/components/swaps-api/` + `apps/demo/src/pages/swaps-api/page.tsx`

Current Bridge baseline (working tree):
- `packages/sdk/src/bridge/BridgeService.ts` (`bridge()` @ line 336, `createBridgeIntent`, ctor params @ line 79)
- `packages/sdk/src/shared/entities/Sodax.ts` (line 90)
- `packages/dapp-kit/src/hooks/bridge/`
- `apps/demo/src/components/bridge/`
