---
type: process
repo: sodax-sdks
github: 378
updated: 2026-08-24
---

# Process

## Session 1 — 2026-08-24 (plan + full implementation)

### Research (plan mode)

- Dry-ran `tsc` with the exclude removed via a scratchpad tsconfig (`extends` + `exclude: []`): 140 errors / 29 of 76 test files. After fresh `pnpm i && pnpm build:packages`, re-run gave the authoritative **138 errors** — only the 2 `hook`-on-QuoteRequestV2 errors were stale-dist phantoms (`packages/types` dist predated `SwapExtrasV2.hook`).
- Repo precedent: `wallet-sdk-core` and `libs` already typecheck tests with the single-tsconfig pattern. All 76 test files import `vitest` explicitly. Nothing but `tsc --noEmit` consumes the sdk tsconfig include/exclude.
- `as never` census: 395 in tests, dominated by `.mockResolvedValueOnce(x as never)` partial-fixture stubs — user confirmed scope = fix surfaced errors only, no cast audit.

### Root causes found (worth remembering)

- **`Raw` generic is non-inferrable**: `DepositParams`/`SendMessageParams` intersect `WalletProviderSlot<C, Raw>` (a conditional type in `@sodax/types` common.ts), so `raw: true` in an object literal never infers `Raw` — the `= false` default pins it and `raw: true` then errors "true not assignable to false". Test-side fix: explicit generic (`deposit<true>({...})`) or an annotated params variable. Same for `requestTrustline<Raw>` (no default → falls to `boolean` → union return).
- **`GetAddressType` wart** (source-level, NOT fixed here): STELLAR → `Hex`, SOLANA → `Hex`, NEAR → `Address`, but real addresses are G-strkeys / base58 / `user.near`. Runtime consumes the real strings fine. Tests now carry documented `as unknown as` casts at the fixture constants. Flagged for a follow-up type correction in `@sodax/types` (`packages/types/src/common/common.ts:84`).
- **`ReturnType<typeof vi.spyOn>`** as a helper-param/let type erases the generic to `MockInstance<(this: unknown, ...args: unknown[]) => unknown>`, which rejects every real spy (contravariance) — 28 of the 138 errors. Fix: `MockInstance<Horizon.Server['loadAccount']>` / `MockInstance<typeof sodax.spoke.deposit>`.
- **`tiny-invariant.test.ts`**: one missing `.js` extension (NodeNext) made the module unresolvable, so `invariant` lost its `asserts` signature and 5 downstream errors cascaded from that single import line.
- **Error-fixture drift**: tests stubbed `Result.error` with plain `new Error('CREATE_INTENT_FAILED')` (a code that does not exist in any union — real codes are `INTENT_CREATION_FAILED` etc. per `src/errors/codes.ts` `CreateIntentErrorCode`). Replaced with real `SodaxError`s; assertions read `message` off the fixture so nothing weakened.
- **`verifyTxHash` stubs** returned `{ ok: true, value: undefined }` where `Result<boolean>`; every service (bridge/migration/staking) only checks `.ok`, so `value: true` is behavior-identical (verified in BridgeService.ts:568, MigrationService.ts:555).
- Narrowing idiom for `noUncheckedIndexedAccess` in tests: reuse `invariant` from `src/shared/utils/tiny-invariant.js` (no `!`, per AGENTS "no escape hatches"); `?.` where the assertion tolerates undefined.
- `ApiConfig` union narrowing needs all three `in` checks (`baseApiConfig`/`swapsApiConfig`/`sponsoringApiConfig`) — each `CustomApiConfig` variant REQUIRES a different slice, and `in`-false only excludes members where the prop is required.

### Dead-ends / incidents

- **Accidental `git stash`** during a verification one-liner (`git stash -q` in a compound command) stashed the whole working tree mid `pnpm test` run; popped immediately, all 29 files intact, the two pre-existing parked stashes untouched. Lesson: never put `git stash` in a "probe" command; the first `pnpm test` pass was discarded and re-run.

### Follow-up sizing (measured 2026-08-24, after PR #395 opened)

- Sibling packages, dry-run tsc with tests included (same scratchpad-extends method):
  dapp-kit **24** errors / 22 test files · swaps-api **28** / 6 · wallet-sdk-react **20** / 15 · types **2** / 8.
  ≈74 errors total — about half the sdk effort. Do as a separate PR after #395 review validates the fix patterns.
- `GetAddressType` wart blast radius: **62 non-test refs across 12 files** (all sdk feature services + types).
  Public-API change needing team buy-in; must land AFTER #395 (it removes the documented casts #395 adds).

### Session 1b — cast sweep (user expanded scope: "PR must complete ALL issue requirements")

User directed that the issue's cast clause be fully honored in PR #395. Method — compiler as
referee, AST-driven (`scratchpad/cast-sweep.mjs`, typescript API): strip every `as never` /
`as any` / `as unknown as T` in `*.test.ts` (span → same-length spaces so tsc line numbers stay
stable), run `tsc`, restore only sites implicated by errors (node range, enclosing-statement
range, declared-fixture-name appearing in the erroring statement), iterate to fixpoint; files
where attribution stalls get a conservative blanket-restore. Finalize rebuilds from git HEAD
with dead casts truly deleted.

Results: 532 sites → **153 deleted** (127 never, 26 unknown2), **377 kept** (256/116/5 —
compiler-proven load-bearing), 2 `(event as any).detail` → `as CustomEvent`; 2 imports that
became unused dropped; biome formatted the 17 touched files. All 36 `@ts-expect-error` are
active (self-proving). tsc 0 errors, 2297/2297 tests pass (identical count — casts are erased).

Attribution gotchas hit: (1) tsc reports errors at the START of a multi-line expression, so the
site's line range must be the whole AsExpression node, not the cast-suffix span; (2) fixture
consts consumed inside other multi-line statements need declared-name matching against the
ENCLOSING STATEMENT text of the error line, not just the error line; (3) ignore TS6133/TS6196
during attribution (unused imports are consequences of removal, fixed at the end).

### Session 1c — enforcement + multi-agent audit (ultracode)

- User chose to ship enforcement in the PR: commit 506bc05ed adds
  `packages/sdk/scripts/check-tests-typechecked.mjs` (tsc --showConfig must list every
  src/**/*.test.ts; wired as the second half of `checkTs`, so CI+husky inherit it with zero
  workflow changes — negative-tested: re-adding the exclude fails loudly with the 76-file list)
  plus a `packages/sdk/AGENTS.md` §Build And Tests paragraph stating both rules (tests are
  typechecked; a stub cast is allowed only while removing it breaks the typecheck).
  Rejected: a cast-count ratchet in CI (noisy, gameable; the strip-sweep stays a periodic tool).
- 7-agent audit workflow (6 dimensions + adversarial verify) over the PR: **0 blockers,
  0 should-fix**. Key proofs: verifyTxHash consumers branch only on .ok (BridgeService.ts:568,
  MigrationService.ts:555, StakingService.ts:418, MoneyMarketService.ts:548, SwapService.ts:788);
  SodaxError fixture swaps hit guard-free pass-throughs (guards only in catch blocks); every PR-body
  number re-derived exactly; sweep hunks all classify into the 4 expected classes. Two nits, both
  cosmetic, parked for review-feedback time: SwapService.test.ts:2534 baseQuoteRequest cast lacks
  its why-comment (13/14 commented); MigrationService.test.ts:310 `?.address` expected value could
  co-degrade — harden with invariant like BridgeService.test.ts does. The completeness-critic agent
  died on a session limit; its charter items were covered elsewhere (guard now pins vitest⊆tsc-program;
  0 .test.tsx/.spec; status fixtures verified in-program by the issue-compliance agent).
- Mid-audit scare resolved: working tree "reverts" were the user checking out their own new branch
  `fix/near-default-rpc-url` (NEAR RPC swap in types+wallet-sdk-react) — unrelated WIP, untouched.
  PR branch intact at 506bc05ed, CI green on it (guard ran in CI's checkTs).

### State at session end

- `packages/sdk` checkTs: **0 errors** with all 76 test files included.
- Biome on changed files: clean except 2 pre-existing warnings on main (noTemplateCurlyInString in BitcoinSpokeService.test.ts it-titles).
- Diff audit: 0 new `as never` / `as any` / `@ts-*`; 14 documented `as unknown as` deliberate casts.
- Unit suite re-run pending completion at write time; root checkTs/build after.
