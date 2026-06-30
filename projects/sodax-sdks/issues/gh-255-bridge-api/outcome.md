---
type: outcome
repo: sodax-sdks
github: 255
status: In progress
updated: 2026-06-30
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/261 (base `feat/swaps-api-v2`)
- Commits (on `origin/feat/bridge-api-v2`): `e3d8343e` (Phases 1–4 SDK+dapp-kit) · `516466cb` (Phase 5 demo) · `d09e2ff1` (Phase 6 docs + Phase 7 e2e note)
- Tests: sdk 1690 ✅ · dapp-kit 359 ✅ · demo checkTs+lint ✅ · `pnpm check:ai` ✅
- Phase 7 full-repo gates ✅: build:packages + checkTs (10/10) + lint (10/10) + test (14/14) + circular-deps (no cycle).

**Status: ALL PHASES 1–7 implemented + pushed.** Only the PR remains (gated on explicit request).

## Summary

**SDK + dapp-kit (Phases 1–4) IMPLEMENTED, all gates green.** The priority-#1 SDK
surface is done: `@sodax/types` bridge DTOs, `@sodax/sdk` `BridgeApiService`
(`sodax.api.bridge.*`) + `BridgeService` backend-submit/fallback refactor + Bitcoin-Bound
plumbing, and `@sodax/dapp-kit` 6 `bridgeApi/` hooks. `useBackendSubmitTx` ships
**default-OFF**. Built to the decided contract (`reference/backend-contract/04-decisions.md`);
the `/bridge/*` backend doesn't exist yet and implements to the same contract later.

Remaining: Phase 5 (demo bridge-api page), Phase 6 (skills/docs), Phase 7 (full-repo
build/typecheck/lint/test/circular-deps + bridge e2e re-relay assertion + PR).

## What Changed

Working tree on `feat/bridge-api-v2` (uncommitted). Per-phase file list + gate results
in `process.md` (2026-06-30 — Implementation Phases 1–4). Highlights:

- `@sodax/types`: `backend/backendBridgeApiV2.ts` (filled), `backend/index.ts`, `sodax-config.ts`.
- `@sodax/sdk`: `backendApi/{bridgeApiSchemas,BridgeApiService}.ts` (filled) + `apiConfig.ts`,
  `BackendApiService.ts`, `backendApi/index.ts`; `bridge/BridgeService.ts` refactor; `Sodax.ts`;
  tests `BridgeApiService.test.ts`, `apiConfig.test.ts`, `bridge/BridgeService.test.ts`.
- `@sodax/dapp-kit`: 6 `hooks/bridgeApi/*` (filled + new `useBridgeApiTokens`), barrel,
  `hooks/index.ts`, `_mutationContract.test.ts`.

## Follow-ups

- After SDK work + PR: backend implementation, pointing its `package.json` at local
  `dist/` (`pnpm build:packages`).
- Independently verify bridge re-relay idempotency before enabling `useBackendSubmitTx`
  anywhere (it ships default-OFF).
