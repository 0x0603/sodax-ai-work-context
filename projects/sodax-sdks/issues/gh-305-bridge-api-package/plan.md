---
id: gh-305-bridge-api-package
type: plan
repo: sodax-sdks
github: 305
status: Active
created: 2026-07-23
updated: 2026-07-23
tags: [bridge, bridge-api, standalone-package]
---

# Plan

Canonical plan lives in the session plan file; summary of the 4-step structure:

1. **`packages/raw-tx-schemas`** — private (never published), ESM-only emitting-`tsc`
   build (mirrors `packages/types`; root turbo `checkTs` chains `^checkTs`, so the
   emitting tsc keeps consumer typechecks self-sufficient). Holds the HARDENED
   swaps-api `rawTxSchemas.ts` (moved verbatim, `^\d+$` bigint gate + Injective
   byte-range) + its test. swaps-api consumes it via devDependency + tsup
   `noExternal` (a private pkg must never appear in published dependency metadata).
2. **`packages/bridge-api`** — file-for-file mirror of swaps-api (`0.0.1-rc.0`):
   `BridgeApi implements IBridgeApiV2` (10 endpoints), throwing `BridgeApiError`
   (5 codes), schemas ported from sdk `bridgeApiSchemas.ts` + new `SchemaDriftGuards`,
   serialize.ts = `rejectBigint` only (bridge wire DTOs fully string-typed).
   Idempotency allowlist (mirrors swaps): retry `getTokens`/`getTokensByChain`/
   `checkAllowance`/`getSubmitTxStatus`/`getFee`/`getBridgeableAmount`/`isBridgeable`;
   never `approve`/`createBridgeIntent`/`submitTx`.
   Registration: `sodax-bridge-api-publish.yml` (in same PR — missing workflow was a
   HIGH on PR #254), `sdks-publish.yml` PACKAGES arrays, `bump-versions.sh`,
   `RELEASE_INSTRUCTIONS.md` (also fixed stale "all 5" text), root `AGENTS.md`.
3. **sdk refactor** — `BridgeApiService` → thin adapter (buildClient/toResult per
   `SwapsApiService` pattern); deleted sdk `bridgeApiSchemas.ts`, `rawTxSchemas.ts`
   (+test), `toJsonBody`; barrel re-exports `BridgeApiError` + types;
   `toCreateBridgeIntentParamsV2` stays in sdk. dapp-kit hooks untouched.
4. **docs/skills** — BRIDGE_API.md "Implementation note", features/bridge-api.md
   errors paragraph.

Commit boundaries (planned, user triggers commits):
1. `feat(raw-tx-schemas): extract shared per-chain raw-tx schemas into a private package`
2. `feat(bridge-api): add standalone @sodax/bridge-api wire client package`
3. `refactor(sdk): make BridgeApiService a thin adapter over @sodax/bridge-api`
4. `docs(sdk,skills): document the standalone @sodax/bridge-api client`
