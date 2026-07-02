---
type: outcome
repo: sodax-sdks
github: 255
status: In progress
updated: 2026-07-02
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

## Code review (PR #261)

Post-implementation adversarial review → [reference/pr-261-code-review.md](reference/pr-261-code-review.md) (verdict: request-changes;
no blockers, several should-fix). Top: bridge host routing under `CustomApiConfig` (`apiConfig.ts:96`),
`submitTx`/dispatcher reuse duplication, two dead demo files (`SelectChain.tsx`, `mappers.ts`).

## Bridge vs Swaps parity audit (2026-07-02, post-merge)

Multi-agent bridge-api ↔ swaps-api(main) audit → [reference/bridge-vs-swaps-api-audit.md](reference/bridge-vs-swaps-api-audit.md)
(20 findings, all verified, 0 refuted). All 12 PR #261 items STILL unfixed; only real
correctness bug remains S1 (`resolveBridgeApiConfig` base-vs-swaps host). New: N1 raw-Stacks
`srcPublicKey` guard missing (overturns #261 refutation), N2 allowance-fires-per-keystroke.

## Audit fixes applied (2026-07-02)

Fixed + pushed to `origin/feat/bridge-api-v2`, each finding its own commit (tests + checkTs +
biome green on the touched files; the branch-wide biome drift from the main-merge left untouched):

- **N1** (`c54354f5`) — raw-Stacks `srcPublicKey` pre-flight guard in `createBridgeIntent`
  (`BridgeService.ts`), mirroring `SwapService.createIntent`; +2 unit tests.
- **N3** (`23d16c7d`) — front-loaded provider (`isUndefinedOrValidWalletProviderForChainKey`) +
  `isValidSpokeChainKey(src/dst)` invariants in `createBridgeIntent`; +2 unit tests. Verified the
  Sonic-sourced tests (src=dst=SONIC) still pass, so the guards don't break the hub path.
- **N2** (`864c4575`) — demo `BridgeCard` gates the allowance body behind the review dialog
  (body `undefined` until `dialogOpen`), stopping per-keystroke `checkAllowance` — mirrors the
  swaps-api card (whose intent params are undefined until the dialog builds them).
- **S2b** (`fc1efe8b`) — extracted the duplicated backend submit-tx poll loop (reserve/deadline math,
  status polling, terminal handling, timeout) from `SwapService.submitTx` + `BridgeService.submitTx`
  into a generic package-internal `backendApi/pollBackendSubmitTx` helper (owns mechanics; takes
  `getStatus` + `onExecuted`). Pure extraction — behaviour/error messages/reserve math unchanged;
  180 bridge+swap tests pass (executed/failed/timeout paths ×2 features).

Still open: **S1** (host routing) is parked pending backend confirmation that `/bridge/*` is served
on the swaps host — the code matches the locked contract (`reference/backend-contract/01-routes.md:44`:
`resolveBridgeApiConfig = resolveBaseApiConfig`), which the audit disputes; do NOT "fix" it until
backend confirms the host topology. Remaining reuse extractions (S4c signAndBroadcast dispatcher,
S2d `_jsonSafe`, S2e slot reuse), surface/nit items, and demo cleanups (S4a/S4b/N4) not yet done. Note (corrected): `biome format --check` reports repo-wide drift
(139 unformatted files) but this is a pre-existing `main` baseline — `origin/main` has MORE (177), the
branch changed neither biome.json nor the biome version, and it is NOT from the merge. It is NOT a
failing gate: `pnpm lint` = `biome lint` (lint-only) passes at 0 errors / 65 warnings; format is not
CI-enforced. Running `biome format --write` repo-wide would touch 139 files and is a maintainer call,
not part of these findings.

## Follow-ups

- After SDK work + PR: backend implementation, pointing its `package.json` at local
  `dist/` (`pnpm build:packages`).
- Independently verify bridge re-relay idempotency before enabling `useBackendSubmitTx`
  anywhere (it ships default-OFF).
