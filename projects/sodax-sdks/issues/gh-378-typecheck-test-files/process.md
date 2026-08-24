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

### State at session end

- `packages/sdk` checkTs: **0 errors** with all 76 test files included.
- Biome on changed files: clean except 2 pre-existing warnings on main (noTemplateCurlyInString in BitcoinSpokeService.test.ts it-titles).
- Diff audit: 0 new `as never` / `as any` / `@ts-*`; 14 documented `as unknown as` deliberate casts.
- Unit suite re-run pending completion at write time; root checkTs/build after.
