---
type: reference
repo: sodax-sdks
github: 255
updated: 2026-06-30
tags: [bridge-api, swaps-api-reference, signatures]
---

# Analysis notes — verified reference signatures

Quick-reference of the load-bearing Swaps API v2 signatures to mirror (all read
from `origin/feat/swaps-api-v2`, PR #210) + the current Bridge baseline. The full
per-dimension digests are in `reference/digests/00..12.json`; the raw synthesized
plan is `reference/raw-synthesis-plan.md`; the critic review is `reference/critique.md`.

## Digest index (`reference/digests/`)

| # | Dimension |
| --- | --- |
| 00 | SwapsApiService core HTTP-client (class, 21 methods, request<S>, api-utils, apiConfig) |
| 01 | valibot schema layer (swapsApiSchemas, rawTxSchemas, backendApiSchemas) |
| 02 | SwapService submit-tx + fallback refactor + error codes |
| 03 | Config + Sodax entity wiring (`sodax.api`, `swapsOptions.useBackendSubmitTx`) |
| 04 | @sodax/types backendApiV2 (ISwapsApiV2, raw-tx types) |
| 05 | dapp-kit swapsApi hook family (21 hooks) |
| 06 | demo swaps-api page (FE flow: API + sign/broadcast) |
| 07 | wallet-sdk-core per-chain signing + skills/docs structure |
| 08 | CURRENT BridgeService (the service to refactor) |
| 09 | CURRENT bridge types |
| 10 | CURRENT dapp-kit bridge hooks |
| 11 | CURRENT demo bridge UI |
| 12 | CURRENT baseline backendApi/config (pre-#210) |

## SDK HTTP client — exact shapes to mirror

```ts
// Class derives its surface from the canonical interface via a mapped type:
type ResultifiedBridgeApiV2 = {
  [K in keyof IBridgeApiV2]: IBridgeApiV2[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: [...A, config?: RequestOverrideConfig]) => Promise<Result<R>> : never;
};
export class BridgeApiService implements ResultifiedBridgeApiV2 { ... }

// The heart — copy verbatim, change only the message string:
private async request<S extends v.GenericSchema>(
  endpoint: string, config: RequestConfig, schema: S, overrideConfig?: RequestOverrideConfig,
): Promise<Result<v.InferOutput<S>, SodaxError<'EXTERNAL_API_ERROR'>>> {
  try {
    const raw = await makeRequest<unknown>({ endpoint,
      config: { baseURL: this.config.baseURL, timeout: this.config.timeout, headers: this.headers, ...config },
      overrideConfig, logger: this.logger });
    const parsed = v.safeParse(schema, raw);
    if (!parsed.success) return { ok:false, error: new SodaxError('EXTERNAL_API_ERROR',
      `Invalid response shape from bridge API for ${endpoint}`,
      { feature:'backend', context:{ api:'backend', endpoint, reason:'invalid_response_shape', issues: v.flatten(parsed.issues) } }) };
    return { ok:true, value: parsed.output };
  } catch (error) {
    return { ok:false, error: new SodaxError('EXTERNAL_API_ERROR',
      error instanceof Error ? error.message : `Request to ${endpoint} failed`,
      { feature:'backend', cause:error, context:{ api:'backend', endpoint } }) };
  }
}
```

- POST bodies use `toJsonBody(value)` = `JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v)` (bigint-safe).
- GET queries use `new URLSearchParams({ ... })`.
- Tx-bearing responses are FACTORIES: `makeXResponseSchema(rawTxSchemaForChainKey(body.srcChainKey))`.
  `rawTxSchemaForChainKey(chainKey): v.GenericSchema<unknown, RawTxReturnType>` selects per-chain
  schema via `getChainType(chainKey)` (EVM/SOLANA/SUI/STELLAR/INJECTIVE/ICON/STACKS/NEAR + `AnyRawTxSchema` fallback)
  and TRANSFORMS wire→domain (decimal-string → bigint via `v.pipe(v.string(), v.toBigint())`). Never throws.
- `makeRequest` URL fallback: `overrideConfig.baseURL || config.baseURL || ''` (truthy);
  timeout: `overrideConfig.timeout ?? config.timeout ?? DEFAULT_BACKEND_API_TIMEOUT` (nullish).
- `BackendApiService.setHeaders` fans out to each sub-service (`this.swaps.setHeaders(headers)`) → add `this.bridge.setHeaders(headers)`.
- `DEFAULT_BACKEND_API_ENDPOINT = 'https://api.sodax.com/v1/be'`, `DEFAULT_BACKEND_API_TIMEOUT = 30000`.

## Swaps submit-tx state machine (the central pattern bridge mirrors)

```ts
// backend client:
submitTx(body: SubmitTxRequestV2, config?): Promise<Result<SubmitTxResponseV2>>          // POST /swaps/submit-tx
getSubmitTxStatus(query: SubmitTxStatusQueryV2, config?): Promise<Result<SubmitTxStatusResponseV2>> // GET /swaps/submit-tx/status?txHash=&srcChainKey=

SubmitTxRequestV2     = { txHash; srcChainKey; walletAddress; intent: IntentRequestV2; relayData: string /*hex*/ } // idempotent on (txHash, srcChainKey)
SubmitTxResponseV2    = { success: boolean; data: { status: 'inserted'|'duplicate'; message: string } }
SubmitSwapTxStatusV2  = 'pending'|'relaying'|'relayed'|'posting_execution'|'executed'|'failed'
SubmitTxStatusResultV2= { dstIntentTxHash: string; packetData?: PacketDataV2; intent_hash?: string }
// terminal success = status==='executed' && result.dstIntentTxHash (+ intent_hash for swap)
```

`SwapService` refactor (mirror for Bridge): ctor gained `backendApi: BackendApiService` +
`useBackendSubmitTx?: boolean`. `swap()` flow: `createIntent` → `deadline = Date.now() + (timeout ?? DEFAULT_RELAY_TX_TIMEOUT)`
→ if `useBackendSubmitTx` try `submitTx(...)` (poll until `deadline - reserve`, reserve = `min(ceil(remaining/3), 20_000)`,
interval 1s) → on non-ok fall back to `fallbackSwapSteps(...)`. `submitTx` wraps backend error as
`executionFailed('swap', cause, {...baseCtx, action:'swap'})`; outer catch → `unknownFailed`. Facade:
`this.api = this.backendApi`; `useBackendSubmitTx = options?.swapsOptions?.useBackendSubmitTx ?? false`.

**Bridge deltas:** drop `intent` from request + status result (no `intent_hash`); success value is
`TxHashPair { srcChainTxHash, dstChainTxHash }`; no hub-source short-circuit (always relay).
`createBridgeIntent({raw:true})` already returns `{ tx, relayData:{address,payload} }` → the submit body
is `{ txHash: tx, srcChainKey, walletAddress: srcAddress, relayData: relayData.payload }`.

## dapp-kit hook conventions (mirror in `bridgeApi/`)

- `const { sodax } = useSodaxContext();` (from `../shared/useSodaxContext.js`); call `sodax.api.bridge.*`;
  unwrap via `unwrapResult` from `../shared/unwrapResult.js` (NOT a local copy); every method takes trailing
  `apiConfig?: RequestOverrideConfig`; `retry: 3` on queries + mutations.
- Query hook: `({ params, queryOptions }: ReadHookParams<TData|undefined, {...; apiConfig?}> = {})`; `enabled`
  derived from required-input presence (queryOptions cannot override it); queryFn re-checks + returns undefined.
- Mutation hook: `useSafeMutation<TData, Error, Vars>({ mutationKey: ['bridgeApi','x'], retry:3, ...mutationOptions, mutationFn })`
  with a dedicated `export type UseBridgeApiXVars = { ...; apiConfig? }`. Exposes `mutateAsync` + `mutateAsyncSafe`.
- queryKey/mutationKey tuple led by literal `'bridgeApi'`. Status poller: inline
  `refetchInterval: q => (s==='executed'||s==='failed') ? false : 1000` reading `q.state.data?.data?.status`
  (nested `data.data`); `enabled: !!txHash && txHash.length>0 && !!srcChainKey`.
- index.ts barrel: `export * from './useBridgeApiX.js';` grouped by comment headers; top JSDoc distinguishing
  these HTTP-API hooks from the on-chain `bridge/` hooks.

## Current Bridge baseline (`packages/sdk/src/bridge/BridgeService.ts`, 850 lines)

- ctor: `{ hubProvider, config, spoke }` (NO backendApi yet).
- `bridge(_params: BridgeParams<K,false>): Result<TxHashPair, BridgeOrchestrationError>` — wraps
  `trackResult('bridge','bridge',...)`; inline: `createBridgeIntent` → `spoke.verifyTxHash` →
  `relayTxAndWaitPacket({ srcTxHash, data: relayData, chainKey, relayerApiEndpoint: config.relay.relayerApiEndpoint, timeout })`
  → `{ srcChainTxHash: tx, dstChainTxHash: packet.dst_tx_hash }`.
- `createBridgeIntent(...): Result<IntentTxResult<K,Raw>>` where `IntentTxResult = { tx: TxReturnType<K,Raw>; relayData: { address, payload } }`.
  `raw:true` = unsigned tx (backend path), `raw:false` = sign+broadcast. Bitcoin only `raw:false`.
- Other: `getFee`, `isAllowanceValid`, `approve` (EVM-spoke + Stellar only), `getBridgeableAmount`
  (`BridgeLimit {amount, decimals, type:'DEPOSIT_LIMIT'|'WITHDRAWAL_LIMIT'}`), `isBridgeable`
  (`srcToken.vault === dstToken.vault`), `getBridgeableTokens`.
- `BridgeOrchestrationErrorCode` already has `EXECUTION_FAILED` + `UNKNOWN` (+ VALIDATION/INTENT_CREATION/
  TX_VERIFICATION/TX_SUBMIT/RELAY_TIMEOUT/RELAY_FAILED) → NO new error codes. Bridge imports `executionFailed`
  but NOT `unknownFailed` yet.
- KEY GAP: `BackendApiService` exposes only `public readonly swaps` — no `backendApi.bridge`, no bridge submit-tx
  schemas/types, and no server-side `/bridge/submit-tx` endpoint yet (must be built / confirmed).

## error model (no new codes)

`SodaxError('EXTERNAL_API_ERROR', msg, { feature:'backend', cause?, context:{ api:'backend', endpoint, ... } })`.
`'backend'` was added to `SODAX_FEATURES` / `SodaxFeature` by #210; `SodaxErrorContext.api` already allows `'backend'`.
In `BridgeService.submitTx`, the backend error becomes the `cause` of `executionFailed('bridge', cause)` so the
`bridge()`-level code is `EXECUTION_FAILED`/`UNKNOWN`, never `EXTERNAL_API_ERROR`.
