---
type: outcome
repo: sodax-sdks
github: 1417
pr: 254
status: In Review
tags: [swaps-api, sdk, context-migration, pr-254, code-review]
updated: 2026-07-02
related_decisions: [0001-swaps-api-throwing-minimal]
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/254 (OPEN, branch
  `feat/swaps-api-sdk`, +3387/-0, 39 files) — "feat(swaps-api): add
  @sodax/swaps-api and apps/swap-api-example".
- Commits: `e6f383dd` (scaffold+primitives) → `03e53a3f` (http) → `d58b5ebe`
  (schemas) → `07658a8f` (client) → `a65bd924` (example) → UI/connect/signing
  iterations → `cea59e8c` (rawTxSchemas) → `9914a643` (slippage+approval wait) →
  `a37789b5` (dispatcher groundwork) → `1e4bf52c` (knip). Pushed (PR is live).
- Tests: 69/69 unit tests green. Trial-merge of current `main` (post-#210) into
  the PR: `@sodax/swaps-api` `checkTs` PASS + 69/69 tests PASS — the package
  survives #210's `tx: unknown` → `tx: RawTxReturnType` contract change.
- Review: see `reference/pr-254-review.md` (5-dimension multi-agent review with
  adversarial verification, 2026-07-02).

## Summary

The issue context has been moved out of the SDK repo's gitignored
`.claude/docs/` folder and into the synced context repo.

The architecture is now locked (ADR `0001-swaps-api-throwing-minimal`): a single
throwing `SwapsApi implements ISwapsApiV2`, depending only on `@sodax/types` +
`valibot`, responses validated, standalone (no SDK migration in this issue).

Implementation is done and in review as PR #254. The library meets the literal
#1417 ask well (standalone throwing `SwapsApi`, `@sodax/types` + valibot only,
all 21 methods, response-validated). It is a WIP that should not merge yet:
completeness gaps (missing publish workflow, stale README, dead code, 8/21
example coverage), a mechanical rebase (CONFLICTING on the `valibot` catalog),
a few low/medium edge-case bugs, and no human review. Direction is sound and —
per author (2026-07-02) — the overlap with #210's in-SDK `SwapsApiService` is
**intentional**: two products (integrated `Result<T>` vs standalone throwing).
Residual: maintainer sign-off + an anti-drift plan for the two clients. Full
verdict + findings + action list in `reference/pr-254-review.md`.

## What Changed

- Created `projects/sodax-sdks/issues/gh-1417-swaps-api-sdk/`.
- Split the prior monolithic planning note into:
  - `issue.md`
  - `plan.md`
  - `process.md`
  - `outcome.md`
- Preserved source references, open questions, implementation steps, testing
  strategy, and definition of done.

## Follow-ups (to land PR #254)

Blocking before merge (see `reference/pr-254-review.md` "Action list"):

1. Rebase on `main`; regenerate `pnpm-lock.yaml`; hand-merge the `valibot`
   catalog pick (PR 1.2.0 vs main 1.4.1).
2. Add `.github/workflows/sodax-swaps-api-publish.yml` (mirror
   `sodax-types-publish.yml`), or set `private:true` until a release path exists.
3. Rewrite `README.md` to document the real shipped `SwapsApi` runtime (it
   currently says "not shipped yet" while `index.ts` exports the full client).
4. Maintainer (Robi) sign-off on standalone-vs-#210 + the anti-drift plan for
   the two `rawTxSchemas` / two clients.

Should-fix: delete dead `lib/signAndBroadcast.ts` + `EVM_CHAIN_KEYS` and add a
knip config for `apps/*`; add a Bitcoin raw-tx case; reconcile the example's
"all flows" claim with its 8/21 reality; fix the `Content-Type` header merge;
test retry-safety at the client-method layer.

Separate follow-up (out of scope): migrate `@sodax/sdk` `SwapService` /
`PartnerFeeClaimService` from v1 `SolverApiService` to v2, gated on backend v2
parity.
