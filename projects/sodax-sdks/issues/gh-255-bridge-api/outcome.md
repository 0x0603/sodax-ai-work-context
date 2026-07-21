---
type: outcome
repo: sodax-sdks
github: 255
related_issues: [268]
status: In Review (PR #261 opened)
updated: 2026-07-21
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/261 (base `main` — auto-retargeted after swaps-api-v2 merged; Ready for review 2026-07-03)
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

## Claude PR-review "USER_REJECTED regression" — FALSE POSITIVE (2026-07-03)

@0xmilktea ran `@claude pr review` on #261; the bot flagged one 🔴 Must-fix: this PR
"silently reverts USER_REJECTED (#145)" — codes.ts/wrappers.ts/isUserRejectedError.ts
gone on the branch. Verified against git: **not a real regression, and the bot's root
cause is wrong.**

- Timeline: #145 (`c5953c82`, USER_REJECTED) landed on `origin/main` 2026-07-02 17:56
  and is main's HEAD. The branch's last main-merge (`62d6a10`, main-parent `09f7b116`
  = #260) predates it — so the merge could not have "dropped #145 in conflict
  resolution"; #145 didn't exist yet. Branch was simply behind main.
- Impact: `git merge-tree origin/main origin/feat/bridge-api-v2` → **no conflicts**,
  USER_REJECTED fully preserved (codes.ts 7, wrappers.ts 11, isUserRejectedError.ts
  present) AND branch's `api:'bridge'` kept. Merge base `09f7b116` has 0 USER_REJECTED,
  so three-way merge keeps main's addition — merging #261 does NOT un-ship the feature.
- Bot's mistake: used two-dot `git diff origin/main..HEAD`, which shows the feature as
  "removed on branch" purely because the branch is behind; that is not what a merge applies.

Resolution: merged `origin/main` into the branch anyway (clean) to silence the misread and
exercise CI against USER_REJECTED. Merge `de7c684c`, pushed to `origin/feat/bridge-api-v2`.
Gates after rebuild: `build:packages` ✅ · checkTs 10/10 ✅ · lint 10/10 ✅ · sdk 1719 tests ✅ ·
dapp-kit ✅. (Note: dapp-kit checkTs first failed on stale `@sodax/sdk` dist — must run
`pnpm build:packages` before checkTs so the built types include `.bridge` + USER_REJECTED.)

## 2026-07-21 — backend-parity discovery methods + dapp-kit hooks (commit `df0690d1`, NOT pushed)

Once the backend ([[gh-268 outcome|../../sodax-backend/issues/gh-268-bridge-api/outcome]], PR #975) added the
3 discovery endpoints (`/bridge/fee`, `/bridge/bridgeable-amount`, `/bridge/bridgeable/check`), the SDK stack
was extended to mirror them. **This REVERSES the original "keep bridgeable-amount client-side, no backend
endpoint" decision** (planning critic #1 / the 6-hook `bridgeApi/` surface): the endpoints now exist, so the
client mirrors them for HTTP parity — client-side via `sodax.bridge.*` stays the preferred (no-round-trip) path.
(User confirmed they authored the SDK and the endpoint was simply missing at the time — I added the backend
endpoints in `4ea80020`, after the SDK types were first written.)

- **`@sodax/types`** `backendBridgeApiV2.ts`: `BridgeFeeRequest/Response V2`, `BridgeQuoteRequest V2`,
  `BridgeLimit V2`, `BridgeableAmount/CheckResponse V2`; +3 methods on `IBridgeApiV2`
  (`getFee`/`getBridgeableAmount`/`isBridgeable`).
- **`@sodax/sdk`** `BridgeApiService`: `getFee` (POST /bridge/fee) · `getBridgeableAmount`
  (POST /bridge/bridgeable-amount) · `isBridgeable` (POST /bridge/bridgeable/check) — each `Promise<Result<T>>`,
  valibot-validated (`bridgeApiSchemas.ts`); +3 routing tests (30 pass).
- **`@sodax/dapp-kit`**: 3 query hooks (query-over-POST, mirror `useBridgeApiAllowance`) —
  `useBridgeApiFee` · `useBridgeApiBridgeableAmount` · `useBridgeApiIsBridgeable` + barrel → now **9**
  `bridgeApi/` hooks. (Queries, so NOT registered in `_mutationContract.test.ts`.)
- **Docs synced everywhere** — skills tree (querykey-conventions, hooks-index, auxiliary-services, sodax-sdk
  `bridge-api.md` + `bridge-api/SKILL.md` + `SKILL.md`) + **`packages/sdk/docs/`** (`BRIDGE_API.md`,
  `BACKEND_API.md`) + demo `BridgeCard.tsx` comments + `useBridgeApiTokens.ts` JSDoc — dropping every stale
  "no backend endpoint / bridgeable-amount stays client-side" claim and the hardcoded surface counts
  ("6 hooks", "7 endpoints").

**Verification.** checkTs (types/sdk/dapp-kit) = 0 · lint = 0 · dapp-kit contract test 336 pass ·
BridgeApiService 30 pass · **`pnpm check:ai` = 0** (its `keys` check cross-validated the 3 new query keys
against source). Ran an **adversarial-review Workflow** (9 agents, 3 dims: hook-fidelity / doc-accuracy /
completeness) — it caught **6 completeness misses** I had skipped (my stale-claim sweep covered
`packages/sdk/src` but NOT `packages/sdk/docs`, nor the demo / JSDoc); all 6 verified real + fixed, then a
repo-wide re-sweep came back clean. See [[workflow-verify-stale-checkout]].

**Commit `df0690d1`** on `feat/bridge-api-v2` (amended to fold the 6 review fixes) — **NOT pushed** (awaiting
the user). ⚠️ `apps/demo/src/components/bridge-api/lib/config.ts` is left UNCOMMITTED — a local-test artifact
(`baseURL: 'http://localhost:3009'`; its own comment says "revert before committing"); revert to the canary
URL before any push.

## Follow-ups

- After SDK work + PR: backend implementation, pointing its `package.json` at local
  `dist/` (`pnpm build:packages`). — DONE: backend is [[gh-268 outcome|../../sodax-backend/issues/gh-268-bridge-api/outcome]], PR #975.
- Independently verify bridge re-relay idempotency before enabling `useBackendSubmitTx`
  anywhere (it ships default-OFF).
