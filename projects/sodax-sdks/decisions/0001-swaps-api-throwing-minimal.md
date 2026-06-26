---
type: decision
scope: sodax-sdks
status: Accepted
tags: [swaps-api, sdk, valibot, backend-api-v2, minimalism]
date: 2026-06-26
related_issues: [1417]
---

# 0001 — swaps-api: throwing, single-client, minimal-dependency

> Status and scope live in the frontmatter above (single source of truth).

## Context

GH-1417 asks for a "super minimalistic `swaps-api` package (only depends on
sodax backend swaps api type) including solely swaps api request/response logic
with valibot type-safe validation", plus an example app proving all flows.

Two facts drive the design:

1. The contract `ISwapsApiV2` (`packages/types/src/backend/backendApiV2.ts:676`)
   is a **throwing** interface — every method returns `Promise<ResponseV2>`,
   never `Promise<Result<T>>`.
2. The v2 backend moves intent building, hashing, gas estimation, allowance
   checks, and relay submit **server-side**. Unlike the v1 `SolverApiService`
   (`packages/sdk/src/swap/SolverApiService.ts`), which is coupled to
   `ConfigService` for client-side token validation and spoke→hub asset
   resolution, the v2 client only needs to build JSON, call `fetch`, and
   validate JSON responses.

An earlier draft proposed a dual API (a `Result<T>`-returning `SwapsApiClient`
plus a throwing `SwapsApi` facade) and injecting a `SodaxLogger`, to keep the
door open for `@sodax/sdk` to adopt the package later. The literal goal
("only depends on the type", "solely request/response logic", "super
minimalistic") contradicts that extra surface.

## Decision

1. **Scope: swaps-only.** Implement every `ISwapsApiV2` method (21 endpoints).
   `IConfigApiV2` is out of scope.
2. **Dependencies: `@sodax/types` + `valibot` only.** Zero dependency on
   `@sodax/sdk`, viem, or wallet providers.
3. **Error model: throwing-only.** Ship a single class
   `SwapsApi implements ISwapsApiV2`. No parallel `Result<T>` client. The
   internal HTTP helper throws `SwapsApiError`; methods are thin pass-throughs.
4. **Validation: responses always; requests off by default.** Responses are the
   untrusted boundary, so valibot-validate them on every call. Request bodies
   are already TS-typed at compile time, so runtime request validation stays an
   opt-in config flag, off by default. Bigint serialization for
   `IntentRequestV2` is a separate, always-on serialization boundary
   (`serialize.ts`), not validation.
5. **Standalone now; no `@sodax/sdk` migration in this issue.** The package is a
   standalone low-level client. Because it implements the shared `ISwapsApiV2`
   type, it is already shaped to back the SDK later — but rewiring `SwapService`
   / `PartnerFeeClaimService` from v1 to v2 is a separate follow-up, gated on
   backend v2 parity.
6. **Base URL injected, never hardcoded.** `SwapsApiConfig.baseUrl` is required;
   staging/production URLs live in the consumer / example `.env`, not in the
   package. Confirming the real URLs is deferred to the e2e smoke test.

## Consequences

- Package shrinks vs the original plan: `client.ts` + `throwing-client.ts`
  collapse into one `client.ts`; `http.ts` throws instead of returning `Result`.
  One fewer module, one fewer public API surface.
- Faithful to the declared contract: consumers code against `ISwapsApiV2`
  exactly, with no SDK-specific convention leaking in.
- If `@sodax/sdk` later wants `Result<T>` semantics, it wraps `SwapsApi` itself;
  the package does not pre-pay for that.
- Risk: a future SDK adoption may want logging/retry hooks the package doesn't
  expose. Accepted — add them when that migration is actually scoped, not now.

## Alternatives considered

- **Dual `Result<T>` client + throwing facade** — rejected: extra surface that
  contradicts "super minimalistic"; `Result<T>` is an SDK convention, not part
  of "the backend swaps api type".
- **Inject `SodaxLogger` to be SDK-ready** — rejected: not request/response
  logic; speculative coupling to a migration that is out of scope.
- **Build it as the SDK's internal v2 layer now** — rejected: would re-introduce
  `ConfigService` / hub-asset coupling the v2 design removes, and would gate
  delivery on backend v2 readiness.

## Related

- Issues: 1417 (`projects/sodax-sdks/issues/gh-1417-swaps-api-sdk/`)
- Knowledge:
