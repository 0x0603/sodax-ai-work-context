---
type: issue
repo: sodax-sdks
github: 1417
status: Active
tags: [swaps-api, sdk, valibot, backend-api-v2]
updated: 2026-06-26
related_decisions: [0001-swaps-api-throwing-minimal]
---

# GH-1417 Swaps API SDK

- Source: https://github.com/icon-project/sodax-frontend/issues/1417
- Source repo: `icon-project/sodax-frontend`
- Work repo: `sodax-sdks`
- Started: 2026-06-25
- Related PR:

## Problem

Build a super-minimalistic `@sodax/swaps-api` package that implements only the
Sodax backend Swaps API request/response logic, with valibot runtime validation.

The package must avoid pulling in the heavy `@sodax/sdk` runtime stack and should
be proven by a new example app.

## Raw Issue

```text
Repo:    icon-project/sodax-frontend
Issue:   #1417
Title:   feat(swaps-api)- swaps api SDK
State:   OPEN
Author:  R0bi7 (Robi)
Labels:  (none)

Body:
-----
Goal: super minimalistic swaps-api package (only depends on sodax backend swaps
api type) including solely swaps api api request response logic with valibot type
safe validation.

Deliverables:
- swaps-api package
- example app (new apps/swap-api-example) proving all flows & methods
```

## Context

The source planning note originally lived in the gitignored SDK repo path:

```text
sodax-sdks/.claude/docs/issue-1417/swaps-api-sdk-plan.md
```

This issue workspace replaces that local-only note so the context can sync
between machines through `sodax-ai-work-context`.

### Existing Contract

`packages/types/src/backend/backendApiV2.ts` already defines the backend Swaps
API v2 contract:

- `ISwapsApiV2` around `backendApiV2.ts:676`.
- `IConfigApiV2` around `backendApiV2.ts:865`.
- Exports flow through `packages/types/src/backend/index.ts` and
  `packages/types/src/index.ts`.

Important contract behavior:

- Server responses are JSON-safe: bigint-derived values and dates are strings.
- Most request numerics are strings, except `IntentRequestV2`, whose numeric
  fields are `bigint` in TypeScript and must serialize to decimal strings.
- Chain-specific payloads such as `tx`, `gas`, and relay `result` are opaque
  `unknown`.

### Current v1 Client

The frontend currently uses `packages/sdk/src/swap/SolverApiService.ts`, which
only covers the v1 API:

- `POST /quote`
- `POST /execute`
- `POST /status`

That service is coupled to the full `@sodax/sdk` facade and `ConfigService`.
This issue creates a new low-level v2 HTTP client instead of extending the v1
solver service.

### Why v2 Can Be Thin

The backend `swaps-api` v2 moves intent building, hashing, gas estimation,
allowance checks, and relay submit server-side. The client only needs to build
JSON requests, call `fetch`, and validate JSON responses.

### valibot

valibot is not used directly in source yet. It appears only as a security pin in
`pnpm-workspace.yaml` overrides. This issue intentionally introduces valibot as
a direct dependency because the issue requires runtime validation and valibot is
small and tree-shakeable.

## Acceptance Criteria

- `@sodax/swaps-api` exists as a publishable standalone package.
- The package implements every `ISwapsApiV2` method over HTTP.
- Responses are runtime-validated with valibot.
- Bigint serialization for `IntentRequestV2` is handled centrally.
- The package has zero dependency on `@sodax/sdk`, viem, or wallet providers.
- `apps/swap-api-example` exists and exercises every method/flow.
- Tests cover schemas, serialization, HTTP/client error handling, and type drift.
- Standard gates pass: lint, typecheck, package build, tests, circular-deps.
- A per-package publish workflow `.github/workflows/sodax-swaps-api-publish.yml`
  exists (tag-triggered, mirroring the other `sodax-*-publish.yml`). CI
  (`ci.yml`) is green for the new package/app via turbo auto-discovery.
- `packages/skills` and top-level `docs/` updates are out of scope here (a
  dedicated skill is a deferred, optional follow-up; `check:ai` stays green).
- No secrets are committed.

## Decisions

Resolved by the issue goal ("super minimalistic", "only depends on the type",
"solely request/response logic") and the throwing shape of `ISwapsApiV2`. See
ADR `0001-swaps-api-throwing-minimal`.

1. **Scope — swaps-only.** Implement all 21 `ISwapsApiV2` methods. `IConfigApiV2`
   is out of scope. ✅ resolved.
2. **Dependencies — `@sodax/types` + `valibot` only.** Zero `@sodax/sdk` / viem.
   ✅ resolved.
3. **Error model — throwing-only.** A single `SwapsApi implements ISwapsApiV2`;
   no parallel `Result<T>` client (the contract type itself throws). The earlier
   dual-API recommendation is dropped. ✅ resolved.
4. **Request validation — responses always, requests off by default.** Requests
   are TS-typed at compile time; runtime request validation is an opt-in config
   flag. Bigint serialization for `IntentRequestV2` is a separate always-on
   boundary. ✅ resolved.
5. **Standalone now — no `@sodax/sdk` migration in this issue.** Implementing the
   shared `ISwapsApiV2` already makes it a viable future SDK backing layer; the
   v1→v2 SDK migration is a separate follow-up gated on backend v2 parity.
   ✅ resolved.

### Deferred

- **Base URLs.** `baseUrl` is injected via `SwapsApiConfig`; never hardcoded in
  the package. The real staging/production URLs are only needed for the e2e
  smoke test of `apps/swap-api-example` — confirm with Robi at that point.

## Related

- Knowledge:
- Decisions: 0001-swaps-api-throwing-minimal
