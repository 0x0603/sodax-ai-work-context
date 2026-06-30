I have verified all load-bearing facts. Writing the plan now.

---

# Implementation Plan — Issue #255: Bridge API across SDK, dapp-kit & demo

> Replicates the Swaps API v2 pattern (reference **PR #210 / `origin/feat/swaps-api-v2`**) for the Bridge feature. Every file path and symbol below is grounded in the real Swaps reference and the current `BridgeService` baseline.

## 1. Executive summary

We are adding a **typed, valibot-validated Bridge HTTP API client** (`BridgeApiService`, reachable as `sodax.api.bridge.*`) plus a **backend submit-tx + client-side-fallback flow** in `BridgeService`, mirroring exactly what PR #210 did for swaps. The core architecture is two-sided: the **backend** uses the SDK to build raw/unsigned bridge transactions (`createBridgeIntent({ raw: true })` → `{ tx, relayData }`) and talk to the bridge backend API; the **frontend** calls the API to get a raw tx, signs and broadcasts it through a browser-extension wallet, then hands the resulting tx hash back to the API via `submitTx` and polls `getSubmitTxStatus` until a terminal state. The central mechanism is the opt-in `useBackendSubmitTx` toggle: when enabled, `bridge()` routes through the backend (`api.bridge.submitTx` + status poll) and, on **any** non-success, falls back to the existing client-side `relayTxAndWaitPacket` relay so the bridge still completes — both paths share **one** wall-clock deadline. The service never throws: every method returns `Result<T, SodaxError<'EXTERNAL_API_ERROR'>>`. The work spans five packages (`@sodax/types`, `@sodax/sdk`, `@sodax/dapp-kit`, `@sodax/demo`, `@sodax/skills`) and is purely **additive** — the existing on-chain `BridgeService` orchestration and `sodax.bridge.*` / `bridge/` hooks stay intact.

## 2. Dependency & sequencing — relationship to PR #210

**Hard prerequisite: Bridge MUST build on top of PR #210 (`feat/swaps-api-v2`). It cannot stand alone.** Verified state of the current working tree (`feat/demo-solver-status-panel` @ `1e37cd91`):

| Foundation piece #210 introduces | Present in working tree today? |
| --- | --- |
| `packages/sdk/src/backendApi/api-utils.ts` (`makeRequest`, `toJsonBody`, `RequestConfig`/`RequestOverrideConfig`/`ApiResponse`, `MakeRequestParams`) | ❌ No (HTTP plumbing is inline in monolithic `BackendApiService`) |
| `packages/sdk/src/backendApi/apiConfig.ts` (`isCustomApiConfig`, `layerConfigs`, `resolveBaseApiConfig`, `resolveSwapsApiConfig`) | ❌ No |
| `packages/sdk/src/backendApi/{swapsApiSchemas,rawTxSchemas,backendApiSchemas}.ts` (valibot) | ❌ No (uses hand-written guards) |
| `BackendApiService` sub-service shape (`public readonly swaps`, constructor resolves config) | ❌ No (single monolith `implements IConfigApi`) |
| `ApiConfig` union (`BaseApiConfig \| CustomApiConfig`, `SwapsApiConfig`) in `packages/types/src/common/constants.ts` | ❌ No (flat `ApiConfig` only) |
| `Sodax.api` alias + `swapsOptions.useBackendSubmitTx` client toggle | ❌ No |
| Per-chain `signAndSendTransaction` on Solana/Stacks/Stellar providers + `BitcoinSpokeService.signAndSubmitRawTransaction` | ❌ No |
| `ISwapsApiV2`/`IConfigApiV2` wire contract in `packages/types/src/backend/backendApiV2.ts` | ✅ **Yes** (already committed; 47.9 KB, no bridge types) |
| `RawTxReturnType` union + per-chain raw-tx types in `packages/types/src/common/common.ts` | ✅ **Yes** (reusable as-is; Bitcoin excluded) |
| `ConfigService.get bridge()` / `get bridgePartnerFee()` | ✅ **Yes** |

**Decision: rebase the Bridge branch onto `origin/feat/swaps-api-v2` (or wait until #210 merges to `main`, then branch from `main`).** Building stand-alone would require re-creating the entire #210 foundation (the `ApiConfig` union, `api-utils.ts`, `apiConfig.ts`, the `BackendApiService` sub-service refactor, the `Sodax.api` alias, the per-chain `signAndSendTransaction` wallet methods) and would guarantee hard merge conflicts with #210 on `constants.ts`, `backendApi/index.ts`, `backendApi/BackendApiService.ts`, and `Sodax.ts`. **Do not do this.**

**What Bridge reuses verbatim from #210 (zero new code):**
- `api-utils.ts` → `makeRequest`, `toJsonBody` (bigint-safe), `RequestConfig`, `RequestOverrideConfig`.
- `rawTxSchemas.ts` → `rawTxSchemaForChainKey(chainKey)` + every `<Chain>RawTxSchema` (EVM/Solana/Sui/Stellar/Injective/Icon/Stacks/Near + `AnyRawTxSchema` Bitcoin fallback). **Do not duplicate raw-tx schemas.**
- Per-chain wallet signing: `signAndSendTransaction` (Solana/Stacks/Stellar/Injective), `sendTransaction` (EVM/ICON), `signAndExecuteTxn` (Sui), `signAndSubmitTxn` (NEAR), `BitcoinSpokeService.signAndSubmitRawTransaction` (Bitcoin/Bound). Bridge raw txs are the same `RawTxReturnType` variants → **no new wallet-provider methods needed**.
- The demo `signAndBroadcast.ts` dispatcher (feature-agnostic over `RawTxReturnType` + `IWalletProvider`).
- `RawTxReturnType`, `RelayExtraDataRequestV2/ResponseV2`, `PacketDataV2`, the JSON-safety guards (`_ContainsBigint`/`_AssertJsonSafe`), and the `SubmitTxStatus` lifecycle picklist.

**What Bridge *extends* (not duplicates) in #210's foundation:** `apiConfig.ts` (+`resolveBridgeApiConfig`), `constants.ts` (+`BridgeApiConfig` + `bridgeApiConfig?` slice on `CustomApiConfig`), `BackendApiService` (+`public readonly bridge`), `Sodax.ts` (+`bridgeOptions` resolution).

**No new `SodaxErrorCode` is required.** The `'backend'` `SodaxFeature` was already added by #210; `SodaxErrorContext.api` already allows `'backend'`; `BridgeOrchestrationErrorCode` already includes `EXECUTION_FAILED` and `UNKNOWN`.

## 3. Per-package work breakdown

### 3.1 `@sodax/types`

**CREATE** `packages/types/src/backend/backendBridgeApiV2.ts` (mirror the structure of `backendApiV2.ts` — header comment restating the bigint→decimal-string / Date→ISO-string JSON-safety rule, banner-comment sections, then the aggregating interface). Rationale: `backendApiV2.ts` is already 922 lines; a sibling file matches the V1/V2 per-concern split.

```ts
import type { RawTxReturnType } from '../common/index.js';
import type { RelayExtraDataResponseV2 } from './backendApiV2.js'; // reuse {address, payload}

// ──── GET /bridge/tokens ────
export interface BridgeTokenV2 { symbol: string; name: string; decimals: number; address: string; chainKey: string; hubAsset: string; vault: string }
export type GetBridgeTokensResponseV2 = Record<string, readonly BridgeTokenV2[]>; // keyed by chain key
export interface GetBridgeTokensByChainResponseV2 { /* readonly BridgeTokenV2[] */ }

// ──── GET /bridge/bridgeable-amount ────  (projects SDK BridgeLimit; bigint → decimal string)
export interface BridgeableAmountQueryV2 { srcChainKey: string; srcToken: string; dstChainKey: string; dstToken: string }
export interface BridgeableAmountResponseV2 { amount: string; decimals: number; type: 'DEPOSIT_LIMIT' | 'WITHDRAWAL_LIMIT' }

// ──── POST /bridge/allowance/check ────
export interface CreateBridgeIntentParamsV2 { srcAddress: string; srcChainKey: string; srcToken: string; amount: string /*decimal*/; dstChainKey: string; dstToken: string; recipient: string }
export interface BridgeAllowanceCheckResponseV2 { valid: boolean }

// ──── POST /bridge/approve ────
export interface BridgeApproveResponseV2 { /** Unsigned approve transaction — the RawTxReturnType variant for the request's srcChainKey. */ tx: RawTxReturnType }

// ──── POST /bridge/intents (createBridgeIntent) ────
export interface CreateBridgeIntentResponseV2 { tx: RawTxReturnType; relayData: RelayExtraDataResponseV2 } // NOTE: no `intent` struct (bridge has none)

// ──── POST /bridge/submit-tx ────  (mirror SubmitTxRequestV2 MINUS the intent field)
export interface BridgeSubmitTxRequestV2 { txHash: string; srcChainKey: string; walletAddress: string; relayData: string /*hex*/ }
export interface BridgeSubmitTxResponseDataV2 { status: 'inserted' | 'duplicate'; message: string }
export interface BridgeSubmitTxResponseV2 { success: boolean; data: BridgeSubmitTxResponseDataV2 }

// ──── GET /bridge/submit-tx/status ────
export interface BridgeSubmitTxStatusQueryV2 { txHash: string; srcChainKey: string }
export type SubmitBridgeTxStatusV2 = 'pending' | 'relaying' | 'relayed' | 'executed' | 'failed'; // reuse swaps lifecycle; drop 'posting_execution' if bridge has no post-exec
export interface BridgeSubmitTxStatusResultV2 { dstIntentTxHash: string; packetData?: PacketDataV2 } // NOTE: no intent_hash (bridge has no solver step)
export interface BridgeSubmitTxStatusDataV2 { txHash: string; srcChainKey: string; status: SubmitBridgeTxStatusV2; failedAtStep?: string; failureReason?: string; processingAttempts: number; abandonedAt?: string; result?: BridgeSubmitTxStatusResultV2; userMessage?: string }
export interface BridgeSubmitTxStatusResponseV2 { success: boolean; data: BridgeSubmitTxStatusDataV2 }

// optional: POST /bridge/gas/estimate, GET /bridge/fees/partner — only if the backend exposes them

export interface IBridgeApiV2 {
  getTokens(): Promise<GetBridgeTokensResponseV2>;
  getTokensByChain(chainKey: string): Promise<GetBridgeTokensByChainResponseV2>;        // optional
  getBridgeableAmount(query: BridgeableAmountQueryV2): Promise<BridgeableAmountResponseV2>; // optional (or keep client-side)
  checkAllowance(body: CreateBridgeIntentParamsV2): Promise<BridgeAllowanceCheckResponseV2>;
  approve(body: CreateBridgeIntentParamsV2): Promise<BridgeApproveResponseV2>;
  createBridgeIntent(body: CreateBridgeIntentParamsV2): Promise<CreateBridgeIntentResponseV2>;
  submitTx(body: BridgeSubmitTxRequestV2): Promise<BridgeSubmitTxResponseV2>;
  getSubmitTxStatus(query: BridgeSubmitTxStatusQueryV2): Promise<BridgeSubmitTxStatusResponseV2>;
}
```
- Apply the compile-time JSON-safety guard `& _AssertJsonSafe<[_ContainsBigint<T>] extends [false] ? true : false>` to at least one `type` alias (e.g. `CreateBridgeIntentParamsV2` if declared as a `type`). The `_ContainsBigint`/`_AssertJsonSafe` helpers are non-exported and live in `backendApiV2.ts` → either keep guarded bridge types in `backendApiV2.ts` or re-declare the helpers privately in `backendBridgeApiV2.ts` (avoids knip "unused export").

**MODIFY** `packages/types/src/backend/index.ts` — add `export * from './backendBridgeApiV2.js';`.

**MODIFY** `packages/types/src/sodax-config/sodax-config.ts`:
```ts
export type BridgeClientOptions = { /** Opt-in backend submit-tx 2-step flow with client-side fallback. Default false. */ useBackendSubmitTx?: boolean };
// on SodaxOptionalConfig — DISTINCT key from the data `bridge?: BridgeOptions` slot (mirror swapsOptions/swaps split):
bridgeOptions?: BridgeClientOptions;
```
(Do **not** touch existing `BridgeOptions = { partnerFee?: PartnerFee }`, `BridgeDefaultConfig = {}`, or `bridge?: BridgeOptions`.)

**MODIFY** `packages/types/src/common/constants.ts` — **only if Bridge needs an independent host** (decision needed, §6): add `export type BridgeApiConfig = BaseApiConfig;` and widen `CustomApiConfig` to allow a `bridgeApiConfig?: BridgeApiConfig` slice. Otherwise leave `ApiConfig` untouched and route bridge under `/bridge/*` on the shared base URL (simplest, matches swaps flat-config behavior).

**Tests:** type-level only (compile guards). No new runtime test file in `@sodax/types`.

---

### 3.2 `@sodax/sdk`

#### A. Bridge HTTP client

**CREATE** `packages/sdk/src/backendApi/bridgeApiSchemas.ts` — valibot schemas, one per `IBridgeApiV2` response, mirroring `swapsApiSchemas.ts`. Header comment restating the "not pinned with `v.GenericSchema` / fidelity enforced at the consumer" rationale. All bigint-derived wire fields = `v.string()`; ints = `v.number()`; status = `v.picklist([...])`. Tx-bearing responses are **factories** reusing the imported `rawTxSchemaForChainKey`:
```ts
import * as v from 'valibot';
import { RelayExtraDataResponseSchema /* reuse if shape matches */ } from './swapsApiSchemas.js';
export const makeBridgeApproveResponseSchema = (txSchema) => v.object({ tx: txSchema });
export const makeCreateBridgeIntentResponseSchema = (txSchema) => v.object({ tx: txSchema, relayData: RelayExtraDataResponseSchema });
export const BridgeAllowanceCheckResponseSchema = v.object({ valid: v.boolean() });
export const BridgeSubmitTxResponseSchema = v.object({ success: v.boolean(), data: v.object({ status: v.picklist(['inserted','duplicate']), message: v.string() }) });
export const BridgeSubmitTxStatusResponseSchema = v.object({ success: v.boolean(), data: BridgeSubmitTxStatusDataSchema /* module-private */ });
export const GetBridgeTokensResponseSchema = v.record(v.string(), v.array(BridgeTokenSchema));
export const BridgeableAmountResponseSchema = v.object({ amount: v.string(), decimals: v.number(), type: v.picklist(['DEPOSIT_LIMIT','WITHDRAWAL_LIMIT']) });
```
Keep `BridgeSubmitTxStatusDataSchema`/result/packet sub-schemas module-private. Schema module stays package-internal (not re-exported from `backendApi/index.ts`).

**CREATE** `packages/sdk/src/backendApi/BridgeApiService.ts` — copy `SwapsApiService.ts` structure verbatim:
```ts
type ResultifiedBridgeApiV2 = {
  [K in keyof IBridgeApiV2]: IBridgeApiV2[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: [...A, config?: RequestOverrideConfig]) => Promise<Result<R>> : never;
};
export class BridgeApiService implements ResultifiedBridgeApiV2 {
  private readonly config: BridgeApiConfig;       // already-resolved flat config
  private readonly headers: Record<string,string>;
  private readonly logger: SodaxLogger;
  constructor(config: BridgeApiConfig, logger: SodaxLogger = consoleLogger) { /* identical to SwapsApiService */ }

  // request<S> wrapper: COPY VERBATIM from SwapsApiService.request<S>; only the message changes:
  //   `Invalid response shape from bridge API for ${endpoint}`, keep code='EXTERNAL_API_ERROR', feature='backend', context.api='backend'

  async getTokens(config?)            → GET  /bridge/tokens                 → GetBridgeTokensResponseSchema
  async getTokensByChain(chainKey,…)  → GET  /bridge/tokens/${chainKey}     → … (optional)
  async getBridgeableAmount(query,…)  → GET  /bridge/bridgeable-amount?…    → BridgeableAmountResponseSchema (optional)
  async checkAllowance(body,…)        → POST /bridge/allowance/check        → BridgeAllowanceCheckResponseSchema   (toJsonBody)
  async approve(body,…)               → POST /bridge/approve                → makeBridgeApproveResponseSchema(rawTxSchemaForChainKey(body.srcChainKey))
  async createBridgeIntent(body,…)    → POST /bridge/intents                → makeCreateBridgeIntentResponseSchema(rawTxSchemaForChainKey(body.srcChainKey))
  async submitTx(body,…)              → POST /bridge/submit-tx              → BridgeSubmitTxResponseSchema (toJsonBody)
  async getSubmitTxStatus(query,…)    → GET  /bridge/submit-tx/status?txHash=&srcChainKey= (URLSearchParams) → BridgeSubmitTxStatusResponseSchema
  setHeaders(headers): void           // copy verbatim
  getBaseURL(): string                // copy verbatim
}
```

**MODIFY** `packages/sdk/src/backendApi/apiConfig.ts` — add `export function resolveBridgeApiConfig(config: ApiConfig): BridgeApiConfig` mirroring `resolveSwapsApiConfig`: `isCustomApiConfig(config) ? layerConfigs(config.baseApiConfig, config.bridgeApiConfig) : layerConfigs(config)`. (If §6 decides bridge shares the base host, this can simply return `resolveBaseApiConfig(config)` and route under `/bridge/*`.)

**MODIFY** `packages/sdk/src/backendApi/BackendApiService.ts`:
- add `public readonly bridge: BridgeApiService;`
- in constructor: `this.bridge = new BridgeApiService(resolveBridgeApiConfig(config), this.logger);`
- in `setHeaders`: add `this.bridge.setHeaders(headers);` (header fan-out for auth/tracing).

**MODIFY** `packages/sdk/src/backendApi/index.ts` — add `export * from './BridgeApiService.js';`.

`sodax.api.bridge.*` then resolves automatically (`sodax.api === sodax.backendApi`); **no Sodax facade change needed for the HTTP client itself.**

#### B. `BridgeService` domain refactor (submit-tx + fallback)

**MODIFY** `packages/sdk/src/bridge/BridgeService.ts`:
- Imports: `import type { BackendApiService } from '../backendApi/index.js';`, `DEFAULT_RELAY_TX_TIMEOUT` from `@sodax/types`, add `unknownFailed` to the existing `../errors/wrappers.js` import.
- `BridgeServiceConstructorParams` (line 79) gains `backendApi: BackendApiService;` and `useBackendSubmitTx?: boolean;`.
- Class (lines 101-105) gains `public readonly backendApi: BackendApiService;` + `readonly useBackendSubmitTx: boolean;`; constructor sets `this.backendApi = backendApi; this.useBackendSubmitTx = useBackendSubmitTx ?? false;`.
- Refactor `bridge()` (line 336). Keep the `trackResult('bridge','bridge', …, {start,success,failure})` wrapper. Inside the closure:
  ```ts
  const created = await this.createBridgeIntent(_params);
  if (!created.ok) return { ok: false, error: created.error };
  const deadline = Date.now() + (_params.timeout ?? DEFAULT_RELAY_TX_TIMEOUT); // ONE shared budget
  if (this.useBackendSubmitTx) {
    const submitted = await this.submitTx(_params, created.value, deadline);
    if (submitted.ok) return submitted;
    this.config.logger.warn('[bridge] backend submit-tx did not complete; falling back to the client-side relay', { error: submitted.error });
  }
  return this.fallbackBridgeSteps(_params, created.value, deadline);
  ```
  Keep the outer catch (`if (isBridgeOrchestrationError(error)) return {ok:false,error}; return executionFailed('bridge', error, baseCtx)`).
- **Extract** `private async fallbackBridgeSteps<K>(_params: BridgeParams<K,false>, created: IntentTxResult<K,false>, deadline: number): Promise<Result<TxHashPair, BridgeOrchestrationError>>` — move the current `verifyTxHash` + `relayTxAndWaitPacket` + `return { srcChainTxHash, dstChainTxHash }` body verbatim, changing ONLY the relay timeout to `timeout: Math.max(deadline - Date.now(), 5_000)`. (Bridge keeps **no** hub-source short-circuit — unchanged.)
- **Add** `private async submitTx<K>(_params: BridgeParams<K,false>, created: IntentTxResult<K,false>, deadline: number): Promise<Result<TxHashPair, BridgeOrchestrationError>>`. Mirror reference `SwapService.submitTx` (verified body) with bridge deltas:
  ```ts
  const { params } = _params; const srcChainKey = params.srcChainKey;
  const baseCtx = { srcChainKey, dstChainKey: params.dstChainKey };
  const { tx: spokeTxHash, relayData } = created; // NOTE: no `intent`
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
          return { ok:true, value: { srcChainTxHash: spokeTxHash, dstChainTxHash: result.dstIntentTxHash } }; // NO intent_hash/solver
        if (status === 'failed' || abandonedAt) { const reason = failureReason ? `: ${failureReason}` : ''; return submitTxFailed(new Error(`backend submit-tx ${status}${reason}`)); }
      }
      await new Promise<void>(r => setTimeout(r, pollIntervalMs));
    }
    return submitTxFailed(new Error('backend submit-tx polling timed out before reaching executed'));
  } catch (error) { return { ok:false, error: unknownFailed('bridge', error, { ...baseCtx, action:'bridge' }) }; }
  ```

**MODIFY** `packages/sdk/src/bridge/errors.ts` — **no change required** (`EXECUTION_FAILED` + `UNKNOWN` are already in `BridgeOrchestrationErrorCode` / `ORCHESTRATION_CODES`, verified). Just ensure `unknownFailed` is imported in `BridgeService.ts`.

#### C. Sodax facade wiring

**MODIFY** `packages/sdk/src/shared/entities/Sodax.ts`:
- In the constructor, alongside other client-side toggles: `const bridgeUseBackendSubmitTx = options?.bridgeOptions?.useBackendSubmitTx ?? false;` (distinct local name to avoid colliding with the swaps `useBackendSubmitTx` #210 added).
- Change line 90 to: `this.bridge = new BridgeService({ hubProvider: this.hubProvider, config: this.config, spoke: this.spoke, backendApi: this.backendApi, useBackendSubmitTx: bridgeUseBackendSubmitTx });`
- (`public readonly api` alias and `sodax.api.bridge` resolution already come from #210 + §3.2.A.)

**Tests (SDK):**
- **CREATE** `packages/sdk/src/backendApi/BridgeApiService.test.ts` — mirror `SwapsApiService.test.ts`: module-scope `new Sodax()` + `vi.stubGlobal('fetch', mockFetch)`; endpoint-routing case table asserting exact `${BASE}/bridge/...` URL + verb per method; happy-path `{ok:true,value}`; bigint body serialization (if any tx body carries bigint); valibot validation-failure (`{ok:false}`, code `EXTERNAL_API_ERROR`, `context.reason==='invalid_response_shape'`); error propagation (HTTP/timeout/network); `RequestOverrideConfig` baseURL override.
- **MODIFY** `packages/sdk/src/backendApi/apiConfig.test.ts` — add `resolveBridgeApiConfig` cases (flat vs `CustomApiConfig` layering) if a `bridgeApiConfig` slice is added.
- **MODIFY** `packages/sdk/src/bridge/BridgeService.test.ts` — add a describe block mirroring SwapService "Batch 7": `const sodaxBE = new Sodax({ logger:'silent', bridgeOptions:{ useBackendSubmitTx: true } });`; helper stubbing `sodaxBE.bridge.createBridgeIntent` (ok `{tx, relayData:{address,payload}}`) + `sodaxBE.spoke.verifyTxHash` (ok); spies on `sodaxBE.api.bridge.submitTx` / `.getSubmitTxStatus`. Five cases: (a) backend `'executed'` → `TxHashPair` from backend, assert `relayTxAndWaitPacket` NOT called; (b) submit POST rejected → falls back, assert `getSubmitTxStatus` NOT called; (c) terminal `'failed'` → falls back; (d) flag OFF default instance → `submitTx` NOT called; (e) shared-budget with `vi.useFakeTimers` — stalled `'pending'` → fallback relay timeout `>0` and `< overallTimeout`.
- **MODIFY** `packages/sdk/src/shared/config/mergeSodaxConfig.test.ts` — add `resolveBridgeApiConfig` as oracle (only if `bridgeApiConfig` slice added).
- Add a Sodax wiring assertion: `new Sodax({ bridgeOptions:{ useBackendSubmitTx: true } })` → `sodax.bridge.useBackendSubmitTx === true` and `sodax.api.bridge` is defined.

---

### 3.3 `@sodax/dapp-kit`

**CREATE** directory `packages/dapp-kit/src/hooks/bridgeApi/` (new sibling family; leave existing `bridge/` hooks untouched). All hooks: `const { sodax } = useSodaxContext()` from `../shared/useSodaxContext.js`; `unwrapResult` from `../shared/unwrapResult.js`; call `sodax.api.bridge.*`; accept trailing `apiConfig?: RequestOverrideConfig` (in query `params` / mutation `vars`); `retry: 3` on every query and mutation; queryKey/mutationKey prefixed with the literal `'bridgeApi'`.

Hooks to create (one per `BridgeApiService` method; query vs mutation pattern copied from `swapsApi`):

| File | Kind | Calls | Key |
| --- | --- | --- | --- |
| `useBridgeApiTokens.ts` | query | `getTokens(apiConfig)` | `['bridgeApi','tokens']` |
| `useBridgeApiTokensByChain.ts` *(optional)* | query | `getTokensByChain(chainKey, apiConfig)` | `['bridgeApi','tokens', chainKey]` |
| `useBridgeApiBridgeableAmount.ts` *(optional)* | query | `getBridgeableAmount(query, apiConfig)` | `['bridgeApi','bridgeableAmount', …]` |
| `useBridgeApiAllowance.ts` | query | `checkAllowance(body, apiConfig)` | `['bridgeApi','allowance', body?.srcChainKey, body?.srcToken, body?.amount, body?.srcAddress]` |
| `useBridgeApiApprove.ts` | mutation | `approve(body, apiConfig)` → `{tx}` | `['bridgeApi','approve']` (no invalidation) |
| `useBridgeApiCreateIntent.ts` | mutation | `createBridgeIntent(body, apiConfig)` → `{tx, relayData}` | `['bridgeApi','createIntent']` (no invalidation) |
| `useBridgeApiSubmitTx.ts` | mutation | `submitTx(request, apiConfig)` | `['bridgeApi','submitTx']` |
| `useBridgeApiSubmitTxStatus.ts` | query (poll) | `getSubmitTxStatus({txHash,srcChainKey}, apiConfig)` | `['bridgeApi','submitTx','status', txHash, srcChainKey]` |

- `useBridgeApiSubmitTx` Vars: `export type UseBridgeApiSubmitTxVars = { request: BridgeSubmitTxRequestV2; apiConfig?: RequestOverrideConfig }`; `mutationFn: async ({ request, apiConfig }) => unwrapResult(await sodax.api.bridge.submitTx(request, apiConfig))`.
- `useBridgeApiSubmitTxStatus` params `{ txHash, srcChainKey?, apiConfig? }`; `enabled: !!txHash && txHash.length>0 && !!srcChainKey`; inline `refetchInterval: q => { const s = q.state.data?.data?.status; return (s==='executed'||s==='failed') ? false : 1000; }` (keep nested `data.data.status` shape).
- Read hooks use `ReadHookParams<TData|undefined, { …; apiConfig? }>` from `../shared/types.js`; mutations use `MutationHookParams` + `{ useSafeMutation, type SafeUseMutationResult }` from `../shared/useSafeMutation.js`, with `mutationKey` set BEFORE spreading `...mutationOptions` and `mutationFn` AFTER.
- **Do NOT** add a local `bridgeApi/unwrapResult.ts` — reuse `shared/unwrapResult.js` (the modern convention; the legacy local copy was `backend/` only).
- Bridge submit status is a string enum → use the **inline** `refetchInterval` check (no `isTerminal…` predicate module needed). Add `isTerminalBridgeStatus.ts` + `.test.ts` only if a numeric status-code lifecycle is introduced.

**CREATE** `packages/dapp-kit/src/hooks/bridgeApi/index.ts` — barrel using `export * from './useBridgeApiX.js';` per hook, grouped by comment headers (Tokens / Allowance·approve·create / Submit-tx state machine), with a top-of-file JSDoc clarifying these are HTTP-API hooks over `sodax.api.bridge.*`, distinct from the on-chain `bridge/` hooks.

**MODIFY** `packages/dapp-kit/src/hooks/index.ts` — add `export * from './bridgeApi/index.js';` right after the `export * from './bridge/index.js';` line.

**MODIFY** `packages/dapp-kit/src/hooks/_mutationContract.test.ts` — register the new mutation hooks: `bridgeApi/useBridgeApiApprove.ts`, `bridgeApi/useBridgeApiCreateIntent.ts`, `bridgeApi/useBridgeApiSubmitTx.ts` (mirrors how #210 added 6 `swapsApi` entries).

**Tests:** the `_mutationContract.test.ts` manifest (above) + optional `isTerminalBridgeStatus.test.ts` (only if a predicate module is added).

---

### 3.4 `@sodax/demo`

New parallel page (leave existing `components/bridge/` SDK-internal demo intact).

**CREATE** `apps/demo/src/pages/bridge-api/page.tsx` — `const [orders, setOrders] = useState<BridgeApiOrder[]>([])`; render `orders.map(...) → <OrderStatus order={order}/>` above `<BridgeCard setOrders={setOrders}/>`; `export default BridgeApiPage`.

**CREATE** `apps/demo/src/components/bridge-api/`:
- `lib/config.ts` — `export const BRIDGE_API_CONFIG = { baseURL: '<bridge canary base url>' } as const satisfies RequestOverrideConfig;` passed as `apiConfig` in every hook call.
- `lib/signAndBroadcast.ts` — port the swaps dispatcher; rename symbols (`signAndBroadcastBridgeApiTx`, `isSignableBridgeApiChain`, `waitForTxFinality`, `BridgeApiSignError`) but keep the per-chain switch identical (EVM `sendTransaction`, SUI `signAndExecuteTxn` via `{toJSON}`, ICON `sendTransaction`, NEAR `signAndSubmitTxn`, SOLANA/STELLAR/STACKS/INJECTIVE `signAndSendTransaction` guarded, BITCOIN throws → route via `sodax.spoke.getSpokeService(BITCOIN).signAndSubmitRawTransaction`).
- `lib/mappers.ts` — `toXToken(BridgeTokenV2): XToken` (re-brand chainKey/hubAsset/vault). A `toIntentRequest` converter is likely **unnecessary** (bridge submit-tx has no intent struct) — confirm against final DTOs.
- `lib/useDebouncedValue.ts` — copy verbatim (only needed if a quote/amount-debounce step exists).
- `SelectChain.tsx` — copy verbatim (chainList = `Object.keys(tokensByChain ?? {})`, display via `chainIdToChainName` try/catch).
- `OrderStatus.tsx` — `export type BridgeApiOrder = { txHash: string; srcChainKey: string; apiBaseURL: string }`; `apiConfig = useMemo(() => ({ baseURL: order.apiBaseURL }))`; poll `useBridgeApiSubmitTxStatus({ params: { txHash, srcChainKey, apiConfig } })`; render `status` + `result.dstIntentTxHash` + `failedAtStep`/`failureReason`/`userMessage`.
- `BridgeCard.tsx` — merge `BridgeManager` + `BridgeDialog` like `SwapCard`: tokens via `useBridgeApiTokens`; src/dst chain+token state (default `ChainKeys.BASE_MAINNET` / `ChainKeys.POLYGON_MAINNET`); wallet-layer hooks (`useXAccount`/`useWalletProvider`/`useXService`/`useXBalances` with `toXToken`); allowance via `useBridgeApiAllowance`; `handleApprove` → `useBridgeApiApprove().mutateAsyncSafe` → `signAndBroadcastBridgeApiTx` → `waitForTxFinality` → manual `refetchAllowance()`; `handleBridge` → `useBridgeApiCreateIntent().mutateAsyncSafe` → `{tx, relayData}` → sign+broadcast (Bitcoin via spoke) → `useBridgeApiSubmitTx().mutateAsyncSafe({ request: { txHash, srcChainKey, walletAddress, relayData: relayData.payload }, apiConfig })` → on ok `setOrders([...prev, { txHash, srcChainKey, apiBaseURL: BRIDGE_API_CONFIG.baseURL }])` + close dialog. Preserve gating (recipient = Bitcoin trading address via `loadRadfiSession`; `parseUnits(amount, decimals)`; EVM approve+switch-chain via `useEvmSwitchChain`; Stellar trustline via `useStellarTrustlineCheck`/`useRequestTrustline`; NEAR storage via `useNearStorageGate`; Bitcoin ready flags + `BitcoinSetupPanel`). Use `mutateAsyncSafe` Result handling throughout (`!result.ok` → `formatMutationFailureMessage(result.error, '…')`).

**MODIFY** `apps/demo/src/App.tsx` — `import BridgeApiPage from './pages/bridge-api/page';` + child route `{ path: '/bridge-api', element: <BridgeApiPage /> }` (next to `/bridge` and `/swaps-api`).

**MODIFY** `apps/demo/src/components/shared/header.tsx` — add `{ to: '/bridge-api', label: 'Bridge API' }` to `navLinks`.

Reuse existing `apps/demo/src/lib/utils.ts` (`formatTokenAmount`, `calculateExchangeRate`, `formatMutationFailureMessage`) and `apps/demo/src/constants.ts` (`chainIdToChainName`). No new utils.

---

### 3.5 `@sodax/skills` + docs

**CREATE** `packages/skills/skills/sodax-sdk/bridge-api/SKILL.md` — single granular skill (no own knowledge subtree), mirroring `swaps-api/SKILL.md`: YAML frontmatter `{ name: sodax-sdk-bridge-api, description: '<class + sodax.api.bridge access path + endpoint count>, Use when …, Skill links into the parent sodax-sdk knowledge tree.' }`; body: H1 → intro (access/Result-never-throws/error-tags) → blockquote to orchestrator skill → `## Step 1 — Clarify with user before coding` → `## Integration workflow` (ai-rules.md FIRST, then `bridge-api.md`, then siblings, then result-and-errors/error-codes) → anti-patterns → `## Migration workflow (v1 → v2)` → `## Verification` (incl. `pnpm tsc --noEmit`) → `## Related granular skills`.

**CREATE** `packages/skills/skills/sodax-sdk/integration/knowledge/features/bridge-api.md` — mirror `swaps-api.md`: H1 `# Bridge API — \`BridgeApiService\`` → intro contract → `## Methods` (single ts block) → `## Wire shapes (bigint vs decimal)` → `## Common call shapes` → `## Status fields` table → `## Per-call overrides` → `## Custom endpoint` → `## Error handling` → `## Cross-references`. (Keep distinct from the existing `integration/knowledge/features/bridge.md`, which documents the on-chain `BridgeService`.)

**CREATE** `packages/sdk/docs/BRIDGE_API.md` — mirror `docs/SWAPS_API.md` (title, Methods ts block, Wire shapes, Examples, Status fields, Configuration with `ApiConfig`/`CustomApiConfig`, `Result<T>`/Error Handling, See also). `docs/BRIDGE.md` already exists for the on-chain service — keep distinct and cross-link.

**MODIFY (registration, 3 spots):**
- `packages/skills/skills/sodax-sdk/SKILL.md` — add routing-table row + append `bridge-api.md` to the step-3 features reading list.
- `packages/skills/AGENTS.md` — append `sodax-sdk/bridge-api` to the package table, consumer-situation table, and directory-tree comment.
- `packages/sdk/docs/BRIDGE.md` + `packages/sdk/docs/BACKEND_API.md` + `CONFIGURE_SDK.md` — cross-link + document `bridgeOptions.useBackendSubmitTx`.
- `packages/skills/skills/sodax-dapp-kit/...` — document the new `bridgeApi` hooks (keys/polling/signatures).

**Verify:** run `pnpm check:ai` (and `pnpm --filter @sodax/skills check:ai`).

## 4. Bridge-specific deltas vs Swaps

Grounded in the current `BridgeService` baseline:

1. **No `intent` struct anywhere.** `createBridgeIntent` returns `{ tx, relayData }` (no hub `Intent`). So `BridgeSubmitTxRequestV2` drops the `intent` field (`{ txHash, srcChainKey, walletAddress, relayData }`), and `BridgeService.submitTx` does **not** pass `intent`. No `IntentRequestV2`/`IntentResponseV2` split, no `toIntentRequest` mapper in the demo.
2. **No solver / `postExecution` / `intent_hash`.** Terminal success is `status === 'executed' && result?.dstIntentTxHash` (drop the `&& result.intent_hash` check that swap has). The success value is `TxHashPair { srcChainTxHash, dstChainTxHash }`, not a `SwapResponse` with `solverExecutionResponse`. `BridgeSubmitTxStatusResultV2` has no `intent_hash`.
3. **No hub-source short-circuit.** `bridge()` always relays (unlike swap which short-circuits when `isHubChainKeyType(srcChainKey)`). `fallbackBridgeSteps` keeps the always-relay behavior verbatim.
4. **No limit orders, no `createLimitOrderIntent`, no `getDeadline`/`deadline` anchoring, no `getQuote`/`minOutputAmount`/`slippage`.** Bridge is a same-vault 1:1 transfer. The swaps "quote" surface is replaced by: `getFee` (pure client-side `bigint` calc, partner-fee only — likely **no backend endpoint**), `getBridgeableAmount` (`BridgeLimit { amount, decimals, type: 'DEPOSIT_LIMIT'|'WITHDRAWAL_LIMIT' }`), and `getBridgeableTokens` (vault-matching).
5. **Bridgeable tokens are computed at runtime, not a static list.** Two tokens bridge iff `srcToken.vault.toLowerCase() === dstToken.vault.toLowerCase()`. A `/bridge/tokens` endpoint must derive bridgeable pairs via vault matching (or these reads stay client-side — see §6).
6. **Smaller endpoint surface** (~8 methods vs swaps' 21): no `submitIntent`, `getStatus` (intent), `cancelIntent`, `getIntentHash`, `getSolvedIntentPacket`, `getIntentSubmitTxExtraData`, `getFilledIntent`, `getIntent`, `createLimitOrderIntent`, `getSolverFee`.
7. **Fewer chains in practice.** `approve` is supported only for EVM-spoke and Stellar; bridge orchestrates EVM/Stellar/Bitcoin spoke flows. The reused `rawTxSchemaForChainKey` + `AnyRawTxSchema` Bitcoin fallback already cover this; Bitcoin source still routes via `BitcoinSpokeService.signAndSubmitRawTransaction` (Bound), excluded from the wallet-only dispatcher.
8. **Status lifecycle may be shorter.** Bridge has no post-execution solver phase, so `SubmitBridgeTxStatusV2` may drop `'posting_execution'` (confirm against backend). The demo `OrderStatus` is **new** relative to today's bridge demo (which just closes the dialog on success with no polling).
9. **Config toggle naming.** Mirror swaps' distinct-key pattern: add `bridgeOptions.useBackendSubmitTx` (a NEW key separate from the existing data `bridge?: BridgeOptions` partner-fee slot). The issue text loosely says `swapsOptions.useBackendSubmitTx`, but reusing `swapsOptions` for bridge behavior is wrong — use `bridgeOptions` (see §6).

## 5. Ordered task checklist

**Phase 0 — Prerequisite**
- [ ] Rebase the Bridge branch onto `origin/feat/swaps-api-v2` (or wait for #210 → `main`, then branch from `main`). Confirm `apiConfig.ts`, `api-utils.ts`, `SwapsApiService.ts`, `swapsApi/` hooks, and the `ApiConfig` union are present.
- [ ] Confirm the backend `/bridge/*` route list + request/response shapes against the bridge controller / issue #255 (the concrete `IBridgeApiV2` surface) — see §6.

**Phase 1 — `@sodax/types`**
- [ ] CREATE `packages/types/src/backend/backendBridgeApiV2.ts` (DTOs + `IBridgeApiV2`, reuse `RawTxReturnType` + `RelayExtraDataResponseV2`, apply `_AssertJsonSafe` guard).
- [ ] MODIFY `packages/types/src/backend/index.ts` (`export * from './backendBridgeApiV2.js'`).
- [ ] MODIFY `packages/types/src/sodax-config/sodax-config.ts` (`BridgeClientOptions` + `bridgeOptions?` slot).
- [ ] *(if independent host)* MODIFY `packages/types/src/common/constants.ts` (`BridgeApiConfig` + `bridgeApiConfig?` on `CustomApiConfig`).

**Phase 2 — `@sodax/sdk` HTTP client**
- [ ] CREATE `packages/sdk/src/backendApi/bridgeApiSchemas.ts` (valibot; reuse `rawTxSchemaForChainKey`).
- [ ] CREATE `packages/sdk/src/backendApi/BridgeApiService.ts` (`implements ResultifiedBridgeApiV2`; copy `request<S>` verbatim).
- [ ] MODIFY `packages/sdk/src/backendApi/apiConfig.ts` (`resolveBridgeApiConfig`).
- [ ] MODIFY `packages/sdk/src/backendApi/BackendApiService.ts` (`public readonly bridge` + ctor + `setHeaders` fan-out).
- [ ] MODIFY `packages/sdk/src/backendApi/index.ts` (`export * from './BridgeApiService.js'`).
- [ ] CREATE `packages/sdk/src/backendApi/BridgeApiService.test.ts`; MODIFY `apiConfig.test.ts`.

**Phase 3 — `@sodax/sdk` BridgeService + facade**
- [ ] MODIFY `packages/sdk/src/bridge/BridgeService.ts` (ctor params; `submitTx`; `fallbackBridgeSteps`; `bridge()` branch; imports `BackendApiService`, `DEFAULT_RELAY_TX_TIMEOUT`, `unknownFailed`).
- [ ] MODIFY `packages/sdk/src/shared/entities/Sodax.ts` (resolve `bridgeUseBackendSubmitTx`; pass `backendApi` + toggle into `new BridgeService(...)`).
- [ ] MODIFY `packages/sdk/src/bridge/BridgeService.test.ts` (5-case backend submit-tx batch); add Sodax wiring assertion; *(if slice added)* MODIFY `mergeSodaxConfig.test.ts`.
- [ ] `pnpm --filter @sodax/sdk tsc --noEmit && pnpm --filter @sodax/sdk test`.

**Phase 4 — `@sodax/dapp-kit`**
- [ ] CREATE `packages/dapp-kit/src/hooks/bridgeApi/` hooks: `useBridgeApiTokens`, `useBridgeApiAllowance`, `useBridgeApiApprove`, `useBridgeApiCreateIntent`, `useBridgeApiSubmitTx`, `useBridgeApiSubmitTxStatus` (+ optional `useBridgeApiTokensByChain`, `useBridgeApiBridgeableAmount`).
- [ ] CREATE `packages/dapp-kit/src/hooks/bridgeApi/index.ts` barrel.
- [ ] MODIFY `packages/dapp-kit/src/hooks/index.ts` (`export * from './bridgeApi/index.js'`).
- [ ] MODIFY `packages/dapp-kit/src/hooks/_mutationContract.test.ts` (register 3 new mutation hooks).
- [ ] `pnpm --filter @sodax/dapp-kit test`.

**Phase 5 — `@sodax/demo`**
- [ ] CREATE `apps/demo/src/components/bridge-api/lib/{config,signAndBroadcast,mappers,useDebouncedValue}.ts`, `SelectChain.tsx`, `OrderStatus.tsx`, `BridgeCard.tsx`.
- [ ] CREATE `apps/demo/src/pages/bridge-api/page.tsx`.
- [ ] MODIFY `apps/demo/src/App.tsx` (route) + `apps/demo/src/components/shared/header.tsx` (nav link).

**Phase 6 — skills + docs**
- [ ] CREATE `packages/skills/skills/sodax-sdk/bridge-api/SKILL.md` + `integration/knowledge/features/bridge-api.md` + `packages/sdk/docs/BRIDGE_API.md`.
- [ ] MODIFY `sodax-sdk/SKILL.md`, `packages/skills/AGENTS.md`, `docs/BRIDGE.md`/`BACKEND_API.md`/`CONFIGURE_SDK.md`, `sodax-dapp-kit` skill docs.
- [ ] `pnpm check:ai`.

**Phase 7 — finalize**
- [ ] `pnpm build:packages` (so backend can point at local `dist/`), full repo test/typecheck.
- [ ] Open PR; do **not** commit/push without explicit user request.

## 6. Open questions / decisions needed

1. **Exact backend `/bridge/*` route list + DTO shapes.** The digests document the *pattern*; the concrete `IBridgeApiV2` method set, paths, and request/response fields must come from the bridge backend controller (analog of `apps/swaps-api/src/api/swaps/swaps.controller.ts`). **Blocks Phase 1.** Issue #255 says "use Swaps API as reference" but does not enumerate routes.
2. **Independent host vs shared base.** Does Bridge get its own backend host (→ add `BridgeApiConfig` + `bridgeApiConfig?` slice + `resolveBridgeApiConfig` layering), or share the base host under `/bridge/*` sub-paths (simplest, mirrors swaps flat-config)? **Recommendation: shared base (no `constants.ts` change) unless backend dictates otherwise.**
3. **Config toggle key.** Issue text loosely references `swapsOptions.useBackendSubmitTx`. **Recommendation: introduce a distinct `bridgeOptions.useBackendSubmitTx`** (separate from the existing data `bridge?: BridgeOptions` partner-fee slot), exactly mirroring the swaps `swapsOptions`/`swaps` split. Confirm.
4. **Are `getBridgeableTokens` / `getBridgeableAmount` backend endpoints or client-side?** They require on-chain reads (`EvmVaultTokenService.getTokenInfos` + `getVaultReserves` against the hub `publicClient`). Swaps moved equivalent reads server-side. Decide whether to add `/bridge/tokens` + `/bridge/bridgeable-amount` endpoints (+ matching hooks `useBridgeApiTokens`/`useBridgeApiBridgeableAmount`) or keep these client-side via existing `sodax.bridge.*` + `useGetBridgeable*` hooks. This drives how many `bridgeApi` hooks exist.
5. **Status lifecycle.** Does the bridge submit-tx status reuse the swaps 6-state picklist verbatim, or a shorter set (likely drop `'posting_execution'` since bridge has no solver post-exec)? Confirm the terminal-success field is `result.dstIntentTxHash` usable directly as `TxHashPair.dstChainTxHash`.
6. **Idempotency of bridge re-relay.** The fallback after a partial backend attempt is only safe if re-relaying/re-depositing an already-processed bridge is idempotent. The swap idempotency proof (`e2e-relay.test.ts`) is swap-specific. **Independently verify bridge re-relay idempotency before relying on the fallback.**
7. **Does the bridge backend `submit-tx` endpoint actually exist server-side yet?** The issue notes backend work follows SDK work. If the endpoint is not yet live, the `useBackendSubmitTx` path is dormant (default `false`) and the client-side relay remains the only active path — acceptable, but confirm the default-off behavior is the intended interim state.
8. **Bitcoin coverage.** Bitcoin is excluded from `RawTxReturnType`. If the Bridge API must return Bitcoin source txs, confirm they hit the permissive `AnyRawTxSchema` fallback and route through `BitcoinSpokeService.signAndSubmitRawTransaction` (no `RawTxReturnType`/`common.ts` change), matching the swaps demo.

---

**Plan file references (all absolute):** the reference implementation to mirror lives on `origin/feat/swaps-api-v2` at `packages/sdk/src/backendApi/SwapsApiService.ts`, `packages/sdk/src/swap/SwapService.ts` (lines 563-627 `submitTx`, 486-520 `fallbackSwapSteps`), `packages/dapp-kit/src/hooks/swapsApi/`, and `apps/demo/src/components/swaps-api/`. The current Bridge baseline to refactor is `/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks/packages/sdk/src/bridge/BridgeService.ts` (`bridge()` @ line 336, `createBridgeIntent`, `BridgeServiceConstructorParams` @ line 79) and `/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks/packages/sdk/src/shared/entities/Sodax.ts` (line 90).