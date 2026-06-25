---
type: plan
repo: sodax-sdks
github: 1417
status: Active
tags: [swaps-api, sdk, valibot, backend-api-v2]
updated: 2026-06-25
---

# Plan

## Goal

Create a standalone `@sodax/swaps-api` package plus `apps/swap-api-example`.
Keep it minimal: HTTP request/response logic, valibot validation, and backend
Swaps API v2 types only.

## Non-Goals

- No intent building, signing, or broadcasting in the package.
- No wallet integration.
- No reimplementation of v1 `SolverApiService` token validation or hub-asset
  resolution.
- No initial replacement of `@sodax/sdk` internal solver calls.

## Endpoint Contract

Implement the `ISwapsApiV2` methods from
`packages/types/src/backend/backendApiV2.ts`.

| # | Method | HTTP | Path | Request | Response |
| - | ------ | ---- | ---- | ------- | -------- |
| 1 | `getTokens` | GET | `/swaps/tokens` | none | `GetSwapTokensResponseV2` |
| 2 | `getTokensByChain` | GET | `/swaps/tokens/:chainKey` | path | `GetSwapTokensByChainResponseV2` |
| 3 | `getQuote` | POST | `/swaps/quote` | `QuoteRequestV2` + `QuoteQueryV2` | `QuoteResponseV2` |
| 4 | `getDeadline` | GET | `/swaps/deadline` | `DeadlineQueryV2` | `DeadlineResponseV2` |
| 5 | `checkAllowance` | POST | `/swaps/allowance/check` | `CreateIntentParamsV2` | `AllowanceCheckResponseV2` |
| 6 | `approve` | POST | `/swaps/approve` | `CreateIntentParamsV2` | `ApproveResponseV2` |
| 7 | `createIntent` | POST | `/swaps/intents` | `CreateIntentParamsV2` | `CreateIntentResponseV2` |
| 8 | `submitIntent` | POST | `/swaps/intents/submit` | `SubmitIntentRequestV2` | `SubmitIntentResponseV2` |
| 9 | `getStatus` | POST | `/swaps/intents/status` | `StatusRequestV2` | `StatusResponseV2` |
| 10 | `cancelIntent` | POST | `/swaps/intents/cancel` | `CancelIntentRequestV2` | `CancelIntentResponseV2` |
| 11 | `getIntentHash` | POST | `/swaps/intents/hash` | `IntentHashRequestV2` | `IntentHashResponseV2` |
| 12 | `getSolvedIntentPacket` | POST | `/swaps/intents/packet` | `IntentPacketRequestV2` | `IntentPacketResponseV2` |
| 13 | `getIntentSubmitTxExtraData` | POST | `/swaps/intents/extra-data` | `IntentExtraDataRequestV2` | `IntentExtraDataResponseV2` |
| 14 | `getFilledIntent` | GET | `/swaps/intents/:txHash/fill` | path | `IntentStateV2` |
| 15 | `getIntent` | GET | `/swaps/intents/:txHash` | path | `GetIntentResponseV2` |
| 16 | `createLimitOrderIntent` | POST | `/swaps/limit-orders` | `CreateLimitOrderParamsV2` | `CreateLimitOrderResponseV2` |
| 17 | `estimateGas` | POST | `/swaps/gas/estimate` | `GasEstimateRequestV2` | `GasEstimateResponseV2` |
| 18 | `getPartnerFee` | GET | `/swaps/fees/partner` | `FeeQueryV2` | `FeeResponseV2` |
| 19 | `getSolverFee` | GET | `/swaps/fees/solver` | `FeeQueryV2` | `FeeResponseV2` |
| 20 | `submitTx` | POST | `/swaps/submit-tx` | `SubmitTxRequestV2` | `SubmitTxResponseV2` |
| 21 | `getSubmitTxStatus` | GET | `/swaps/submit-tx/status` | `SubmitTxStatusQueryV2` | `SubmitTxStatusResponseV2` |

Config endpoints from `IConfigApiV2` are out of scope unless Robi confirms they
should be included.

## Architecture Decisions to Confirm

### Scope

Recommendation: implement `ISwapsApiV2` only. Defer `IConfigApiV2` to keep the
package focused on "swaps-api".

### Dependency Surface

Recommendation:

```json
{
  "dependencies": {
    "@sodax/types": "workspace:*",
    "valibot": "catalog:"
  }
}
```

`@sodax/types` is the canonical contract owner and has no heavy runtime surface.
Do not depend on `@sodax/sdk`.

### Error Model

Expose both:

- `SwapsApiClient`: primary Result-returning client.
- `SwapsApi`: throwing facade that implements `ISwapsApiV2`.

This keeps compatibility with the declared interface while preserving the SDK's
`Result<T>` convention.

### Validation Depth

- Always validate responses.
- Validate request bodies by default, with an opt-out config.
- Treat opaque `unknown` fields structurally only.

### Bigint Boundary

Centralize in `serialize.ts`.

Outbound `IntentRequestV2` bigint fields serialize to decimal strings:

- `intentId`
- `inputAmount`
- `minOutputAmount`
- `deadline`
- `srcChain`
- `dstChain`

Inbound responses should mirror the contract and stay strings unless a deliberate
future decision says otherwise.

## Package Layout

```text
packages/swaps-api/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── turbo.json
├── vitest.config.ts
├── knip.json
├── README.md
└── src/
    ├── index.ts
    ├── config.ts
    ├── http.ts
    ├── errors.ts
    ├── serialize.ts
    ├── schemas.ts
    ├── client.ts
    ├── throwing-client.ts
    └── __tests__/
```

## Package Configuration

Mirror the existing `@sodax/sdk` package style for dual ESM/CJS output.

Key package settings:

- Name: `@sodax/swaps-api`
- `private: false`
- `publishConfig.access: public`
- `type: module`
- ESM and CJS exports
- `sideEffects: false`
- Node engine: `>=20.12.0`
- Build with `tsup`
- Test with `vitest`
- Check exports with `attw`

Add `valibot` to the root `pnpm-workspace.yaml` catalog with a concrete version
that satisfies the existing security override (`>=1.2.0`).

## Module Design

### `config.ts`

Define `SwapsApiConfig`:

- `baseUrl: string`
- injectable `fetch`
- optional headers
- `validateRequests?: boolean`
- `maxRetries?: number`

Do not hardcode staging or production URLs inside the package.

### `errors.ts`

Define `SwapsApiError` and codes:

- `NETWORK_ERROR`
- `HTTP_ERROR`
- `VALIDATION_ERROR`
- `PARSE_ERROR`

Include endpoint, status, valibot issues, and original cause in context where
available.

### `serialize.ts`

Provide:

- `serializeIntentRequest(intent: IntentRequestV2)`
- `bigintReplacer`

Any request body containing `IntentRequestV2` must pass through this boundary
before JSON serialization.

### `schemas.ts`

Create one schema file grouped by endpoint, mirroring `backendApiV2.ts`.

Guidance:

- Decimal wire values: `v.string()`, optionally with decimal regex.
- Enums: `v.picklist([...])`.
- Opaque fields: `v.unknown()`.
- Chain-keyed maps: `v.record(v.string(), ...)`.
- Add compile-time drift guards with `v.InferOutput`.

### `http.ts`

Build a `request<T>` helper:

- Build URL with path and query.
- Call injected/global `fetch`.
- Return `Result<T, SwapsApiError>`.
- Map non-2xx to `HTTP_ERROR`.
- Map bad JSON to `PARSE_ERROR`.
- Map valibot failures to `VALIDATION_ERROR`.
- Map thrown fetch errors to `NETWORK_ERROR`.

Reuse or locally copy the tiny retry pattern for idempotent poll endpoints. Do
not depend on `@sodax/sdk`.

### `client.ts`

Implement `SwapsApiClient`, one method per endpoint, returning `Result`.

Each method:

1. Optionally validates request.
2. Serializes `IntentRequestV2` where needed.
3. Calls `request(...)` with the matching response schema.

### `throwing-client.ts`

Implement `SwapsApi implements ISwapsApiV2`.

Internally use `SwapsApiClient`; unwrap `Result` and throw `SwapsApiError` on
failure.

### `index.ts`

Export:

- `SwapsApiClient`
- `SwapsApi`
- `SwapsApiError`
- `SwapsApiConfig`
- `schemas`
- V2 contract types from `@sodax/types`

## Example App

Create `apps/swap-api-example`.

```text
apps/swap-api-example/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
└── src/
    ├── config.ts
    ├── 01-read-flows.ts
    ├── 02-quote.ts
    ├── 03-intent-flow.ts
    ├── 04-limit-order.ts
    ├── 05-misc.ts
    └── all.ts
```

Requirements:

- Base URL from `SWAPS_API_BASE_URL`.
- No secrets committed.
- One script that runs all flows and prints pass/fail per endpoint.
- Methods needing live chain state should degrade gracefully and document what
  needs live data.

## Implementation Steps

1. Scaffold `packages/swaps-api` with build/test config and empty public barrel.
2. Add `valibot` to the root catalog and run `pnpm i`.
3. Implement primitives: `errors.ts`, `config.ts`, `serialize.ts`, plus tests.
4. Implement `http.ts` with fake-fetch tests.
5. Implement response and optional request schemas with drift guards.
6. Implement all 21 `SwapsApiClient` methods.
7. Implement the throwing `SwapsApi` facade.
8. Export public API from `index.ts`.
9. Build `apps/swap-api-example`.
10. Add package README and consumer-facing AI docs only if needed.
11. Run green gates.

## Repo Wiring Checklist

- [ ] `pnpm-workspace.yaml`: add `valibot` to `catalog:`.
- [ ] `packages/swaps-api/`: add package files and source modules.
- [ ] `apps/swap-api-example/`: add example app.
- [ ] Root `package.json`: confirm turbo scripts discover new package/app.
- [ ] `biome.json`: root config applies.
- [ ] No root `tsconfig` references expected.
- [ ] Run `pnpm i`.
- [ ] Confirm CI install, lint, circular deps, builds, typecheck, and tests.

## Testing Strategy

- Schema tests for every response schema with valid and malformed fixtures.
- Serialization tests for `IntentRequestV2` bigint to decimal strings.
- Client tests with injected fake `fetch`.
- Type-level drift guards between valibot schemas and contract types.
- Example app as manual/scripted integration proof against staging.

## Definition of Done

- `@sodax/swaps-api` builds dual ESM/CJS.
- `check-exports` is clean.
- Zero dependency on `@sodax/sdk` or viem.
- Every `ISwapsApiV2` method is implemented.
- Responses are valibot-validated.
- Bigint boundary is handled centrally.
- Unit tests are green.
- `apps/swap-api-example` runs against staging and reports every method/flow.
- `pnpm lint`, `pnpm checkTs`, `pnpm build:packages`, `pnpm test`, and
  `pnpm check:circular-deps` are green.
- `packages/skills` is updated only if the package is published as
  consumer-facing and `pnpm check:ai` requires it.
- No unrelated refactor.
- No secrets committed.

## Source References

- Contract: `packages/types/src/backend/backendApiV2.ts`
- V2 interfaces: `ISwapsApiV2` around `:676`, `IConfigApiV2` around `:865`
- Barrel export: `packages/types/src/backend/index.ts`,
  `packages/types/src/index.ts`
- V1 client: `packages/sdk/src/swap/SolverApiService.ts`
- V1 solver config: `packages/types/src/common/constants.ts`
- `Result<T>`: `packages/types/src/common/common.ts`
- `retry()`: `packages/sdk/src/shared/utils/shared-utils.ts`
- Build template: `packages/sdk/tsup.config.ts`, `packages/sdk/package.json`
- Minimal package template: `packages/types/package.json`,
  `packages/types/tsconfig.json`
- App templates: `apps/node`, `apps/wallet-modal-example`
- valibot security pin: `pnpm-workspace.yaml`
