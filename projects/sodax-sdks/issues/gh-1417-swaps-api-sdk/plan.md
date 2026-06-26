---
type: plan
repo: sodax-sdks
github: 1417
status: Active
tags: [swaps-api, sdk, valibot, backend-api-v2]
updated: 2026-06-26
related_decisions: [0001-swaps-api-throwing-minimal]
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

## Design Principles

The package must stay **simple, OOP, and easy to maintain — not clever**. When a
review suggestion and simplicity conflict, simplicity wins.

- **One class.** `SwapsApi implements ISwapsApiV2`, constructed from
  `SwapsApiConfig`. Private state (`baseUrl`, `fetch`, `headers`,
  `validateRequests`) + one private `request<T>()` helper. No DI framework, no
  factories, no dual clients.
- **Explicit thin methods, not metaprogramming.** Each of the 21 methods is a
  1–3 line call to `request(...)`, reading 1:1 against `ISwapsApiV2` so it greps
  and diffs cleanly. **Do NOT build a generic endpoint-descriptor dispatch
  engine** — that is the kind of over-abstraction to avoid. The only shared data
  is a small `PATHS` constant (plain strings) to prevent path drift; schema and
  serializer are referenced inline in each method.
- **Plain helpers over abstractions.** `SwapsApiError` (one class),
  `serializeIntentRequest` (one function), valibot schemas (plain consts). No
  base classes, no mixins, no decorators.
- **Small public surface.** Export only what a consumer needs (see `index.ts`).
- **Table-driven *tests* are fine** (a fixture loop is simpler than 21 copies) —
  the simplicity rule is about runtime code, not test ergonomics.

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

## Architecture Decisions (resolved)

Locked by ADR `0001-swaps-api-throwing-minimal`. Driven by the issue goal
("super minimalistic", "only depends on the type", "solely request/response
logic") and the fact that `ISwapsApiV2` is a **throwing** interface
(`Promise<ResponseV2>`, not `Promise<Result<T>>`).

### Scope

Implement `ISwapsApiV2` only (all 21 methods). `IConfigApiV2` is out of scope.

### Dependency Surface

```json
{
  "dependencies": {
    "@sodax/types": "workspace:*",
    "valibot": "catalog:"
  }
}
```

`@sodax/types` is the canonical contract owner and has no heavy runtime surface.
Do not depend on `@sodax/sdk`, viem, or wallet providers.

### Error Model — throwing-only

Ship a single class `SwapsApi implements ISwapsApiV2`. Methods throw
`SwapsApiError` on failure (matching the throwing contract type). **No parallel
`Result<T>` client** — that was an earlier over-engineering and is dropped; if
`@sodax/sdk` later wants `Result<T>`, it wraps `SwapsApi` itself.

### Validation Depth

- Always validate **responses** (the untrusted boundary).
- **Do not** validate request bodies by default — they are TS-typed at compile
  time. Expose runtime request validation as an opt-in `validateRequests` flag,
  off by default.
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
- `validateRequests?: boolean` (default `false`)

Do not hardcode staging or production URLs inside the package. No `logger`
injection — out of scope for "solely request/response logic".

**No public `maxRetries`.** A global retry knob invites retrying non-idempotent
mutations (`createIntent`, `approve`, `submitIntent`, `submitTx`,
`cancelIntent`) → double-submit risk. Retry is an internal detail applied only
to an idempotency allowlist (see `http.ts`), not a config field.

### `errors.ts`

Define `SwapsApiError` and codes:

- `NETWORK_ERROR`
- `HTTP_ERROR`
- `VALIDATION_ERROR`
- `PARSE_ERROR`

Include endpoint, status, valibot issues, and original cause in context where
available.

### `serialize.ts`

Provide a **structured, narrow** serializer — not a blanket bigint replacer:

- `serializeIntentRequest(intent: IntentRequestV2)` — maps exactly the 6 bigint
  fields (`intentId`, `inputAmount`, `minOutputAmount`, `deadline`, `srcChain`,
  `dstChain`) to decimal strings; passes the rest through.
- A helper that embeds a serialized intent into the few bodies that carry one
  (e.g. `SubmitIntentRequestV2`, `CancelIntentRequestV2`, hash/packet/extra-data
  requests).

`bigint` is legitimate **only** inside `IntentRequestV2` — everything else on the
wire (incl. `PartnerFeeV2.amount`, all `SwapExtrasV2`) is a decimal `string`, and
the contract already compile-time-guards `SwapExtrasV2` against stray bigint
(`backendApiV2.ts:85`). So **do not expose a broad `bigintReplacer`**; if a
bigint ever appears outside the allowed fields, throw rather than silently
coercing it (that would mask a caller bug).

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
- Return the parsed, valibot-validated `T` on success; **throw** `SwapsApiError`
  on any failure.
- Map non-2xx to `HTTP_ERROR`.
- Map bad JSON to `PARSE_ERROR`.
- Map valibot failures to `VALIDATION_ERROR`.
- Map thrown fetch errors to `NETWORK_ERROR`.

Apply the tiny retry pattern **only** to an explicit idempotency allowlist —
read-only GETs and safe polls (`getTokens`, `getTokensByChain`, `getDeadline`,
`getIntent`, `getFilledIntent`, `getStatus`, `getSubmitTxStatus`, fee queries).
The discriminator is **idempotency, not HTTP verb** — `getStatus` is a `POST`
but a safe poll. Never retry mutating calls. Do not depend on `@sodax/sdk`.

### `client.ts`

Implement the single `SwapsApi implements ISwapsApiV2`, one explicit method per
endpoint, each returning `Promise<ResponseV2>` (throwing on failure, per the
contract). Keep methods thin and readable — no descriptor-map dispatch engine
(see Design Principles).

Each method:

1. Optionally validates the request (only when `validateRequests` is on).
2. Serializes `IntentRequestV2` where needed (via `serialize.ts`).
3. Calls the private `request(...)` with the path (from the `PATHS` const) and
   the matching response schema, and returns its result (errors surface as
   thrown `SwapsApiError`).

No separate `Result<T>` client and no separate throwing facade — the one class
is the whole public surface.

### `index.ts`

Keep the public surface minimal. Export:

- `SwapsApi`
- `SwapsApiError`
- `SwapsApiConfig`
- V2 contract types from `@sodax/types`, **type-only** (`export type { … }`, not
  `export *`), to avoid runtime coupling.

`schemas` stay **internal** by default — exporting them would freeze valibot
shapes into the public API / semver surface. Re-export later behind an explicit,
documented-as-unstable namespace only if a real consumer needs them.

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
4. Implement `http.ts` (throws `SwapsApiError`) with fake-fetch tests.
5. Implement response schemas (and opt-in request schemas) with drift guards.
6. Implement all 21 `SwapsApi` methods (`implements ISwapsApiV2`, throwing).
7. Export public API from `index.ts`.
8. Build `apps/swap-api-example`.
9. Add `packages/swaps-api/README.md` (a dedicated skill is deferred).
10. Add `.github/workflows/sodax-swaps-api-publish.yml` (per-package publish).
11. Run green gates.

## Repo Wiring Checklist

- [ ] `pnpm-workspace.yaml`: add `valibot` to `catalog:`.
- [ ] `packages/swaps-api/`: add package files and source modules.
- [ ] `apps/swap-api-example/`: add example app.
- [ ] Root `package.json`: confirm turbo scripts discover new package/app.
- [ ] `biome.json`: root config applies.
- [ ] No root `tsconfig` references expected.
- [ ] Run `pnpm i`.
- [ ] `.github/workflows/sodax-swaps-api-publish.yml`: add a per-package publish
      workflow (see Release & CI/CD below). **Required** — publishable packages
      use one tag-triggered workflow each; this is currently the main gap.
- [ ] Confirm `ci.yml` auto-discovers the package/app via turbo filters
      (`./apps/*`, `turbo run build/lint/test`); expect no `ci.yml` edit.
- [ ] Confirm CI install, lint, circular deps, builds, typecheck, and tests.

## Release & CI/CD

The repo publishes each package with its **own** workflow triggered by a git
tag, not changesets (`.changeset/` is unused; see
`packages/RELEASE_INSTRUCTIONS.md`).

- Add `.github/workflows/sodax-swaps-api-publish.yml`, cloned from
  `sodax-types-publish.yml`:
  - Trigger: `on.push.tags: ['@sodax/swaps-api@*.*.*']`.
  - Validate the tag version matches `packages/swaps-api/package.json`.
  - Build with `pnpm turbo run build --filter=@sodax/swaps-api...`.
  - `cd packages/swaps-api && pnpm publish --provenance --access public`.
  - Auth via `secrets.SODAX_SDKS_NPM_PUBLISH_TOKEN` (already used by siblings).
- `ci.yml` (lint / typecheck / build / test) auto-discovers new packages and
  apps through turbo, so it should need no change — confirm, don't assume.
- Release flow: bump `packages/swaps-api/package.json` version, push the matching
  `@sodax/swaps-api@x.y.z` tag; the workflow publishes to npm.

## Docs & Skills (scope)

- **Package README** (`packages/swaps-api/README.md`): required.
- **`packages/skills`**: a dedicated `sodax-swaps-api` skill is **optional and
  deferred** — `check:ai` / `check-skills.sh` validate existing skills only and
  do not require one per package, so omitting it does not break CI. The example
  app is the proof-of-flows deliverable. If a skill is added later, also add a
  `skills/sodax-swaps-api/` tree and bump the "four skills" count in
  `docs/ai-integration-guide.md`.
- **Top-level `docs/`**: untouched unless a skill is added.

## Testing Strategy

- Schema tests for every response schema with valid and malformed fixtures.
- Serialization tests: `IntentRequestV2` bigint → decimal strings, **and** that a
  stray bigint outside the allowed fields throws (no silent coercion).
- Client tests with injected fake `fetch`, **table-driven** over the 21 endpoints
  (method → expected path/verb/response schema) so paths/schemas can't drift.
- Retry-safety test: only the idempotency allowlist retries; mutating calls
  (`createIntent`, `approve`, `submitIntent`, `submitTx`, `cancelIntent`) never do.
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
- `packages/swaps-api/README.md` exists.
- `.github/workflows/sodax-swaps-api-publish.yml` exists and follows the
  tag-triggered per-package pattern; `ci.yml` confirmed green for the new
  package/app (no edit expected).
- `packages/skills` / top-level `docs/`: a dedicated skill is deferred (optional
  follow-up); not required for done. `pnpm check:ai` stays green without it.
- No unrelated refactor.
- No secrets committed.

## Source References

- Contract: `packages/types/src/backend/backendApiV2.ts`
- V2 interfaces: `ISwapsApiV2` around `:676`, `IConfigApiV2` around `:865`
- Barrel export: `packages/types/src/backend/index.ts`,
  `packages/types/src/index.ts`
- V1 client: `packages/sdk/src/swap/SolverApiService.ts`
- V1 solver config: `packages/types/src/common/constants.ts`
- `retry()`: `packages/sdk/src/shared/utils/shared-utils.ts`
- Publish workflow template: `.github/workflows/sodax-types-publish.yml`
- Release process: `packages/RELEASE_INSTRUCTIONS.md`
- Skills layout / checks: `packages/skills/skills/`,
  `packages/skills/scripts/check-skills.sh`, `docs/ai-integration-guide.md`
- Build template: `packages/sdk/tsup.config.ts`, `packages/sdk/package.json`
- Minimal package template: `packages/types/package.json`,
  `packages/types/tsconfig.json`
- App templates: `apps/node`, `apps/wallet-modal-example`
- valibot security pin: `pnpm-workspace.yaml`
