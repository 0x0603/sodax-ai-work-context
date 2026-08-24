---
type: plan
repo: sodax-sdks
github: 378
updated: 2026-08-24
---

# Plan

## Goal

Make `pnpm checkTs` (and thereby CI + husky pre-commit) typecheck all 76 `.test.ts` files in `packages/sdk` (incl. `src/e2e-tests/`), and fix every type error that surfaces — without adding new escape-hatch casts.

## Approach

Single-tsconfig pattern (precedent: `wallet-sdk-core`, `libs`): remove `"**/*.test.ts"` from `packages/sdk/tsconfig.json#exclude`. Nothing else consumes that include/exclude (tsup has its own entry; stryker/knip don't reference it), so the change only affects `tsc --noEmit`. No vitest-globals types needed (all tests import from `vitest`).

Full approved plan with cluster table: `~/.claude/plans/https-github-com-icon-project-sodax-sdks-soft-moth.md` (local, this machine). Authoritative error log after fresh build: 138 errors / 29 files (the 2 `hook` errors from the stale-dist dry run were phantoms).

## Steps

1. Branch `test/sdk-typecheck-tests` off main; `pnpm i && pnpm build:packages`. [done]
2. Remove test exclude from `packages/sdk/tsconfig.json`. [done]
3. Fix 138 errors by cluster:
   - `ReturnType<typeof vi.spyOn>` helper params → real `MockInstance<fn>` generics (SponsoringService 26, BridgeService 2).
   - Non-inferrable `Raw` generic (`WalletProviderSlot` conditional) → explicit `deposit<true>(...)` etc. at call sites (~19).
   - Non-EVM address literals vs `0x${string}` → chain-correct fixture types; documented `as unknown as` only for deliberate invalid input (~15).
   - Plain `Error` vs `SodaxError` subtypes, missing `feature`, stale `CREATE_INTENT_FAILED` code → proper SodaxError fixtures (~15).
   - noUncheckedIndexedAccess possibly-undefined → runtime narrowing (reuse `src/shared/utils/tiny-invariant.ts`), never `!` (~18).
   - TS2352 non-overlap casts → proper union narrowing; documented `as unknown as` for negative tests (8).
   - ~30 singles (missing import, unused locals, `.js` extension, union narrowing, fixture shapes).
4. Cast policy: no new `as never`/`as any` to silence; fix casts found masking real drift in touched files.
5. Verify: sdk `checkTs` 0 errors; sdk `pnpm test` green; root `checkTs` + `build:packages` green; biome on changed files only; NO `test:e2e` (live mainnet). Grep diff for new escape hatches.

## Constraints

- AGENTS.md "No escape hatches" (sdk biome.json disabling those rules is tracked tech debt, not a license).
- Diff scoped to tsconfig + failing test files; no production `src` changes without stopping to report.
- Biome drift on main → never format repo-wide.
- No commit/push unless user asks. Commit style: `test(sdk): ...`, no issue refs in message, no AI attribution.
