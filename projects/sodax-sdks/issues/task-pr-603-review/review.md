# PR 603 review: infer action result type from execution mode

- PR: gosodax/sodax-sdks#603, head `f86cf06e` (checked unchanged at the end of the review), base merge-base `b3ee8532`.
- Reviewed in a local detached worktree at the PR head (this Mac only). Nothing committed, pushed or posted.
- Tags: **[ran]** = I compiled/ran it; **[read]** = I read the source; **[derived]** = follows from what I ran/read, not run on its own.

## Verdict: approve with suggestions

The type change works as described. Both modes infer with no type arguments on all 36 dual-mode facade actions I tested (34 EVM rows plus 2 ICON-only rows), plus 8 non-EVM chains. Nothing changes at runtime, and every gate passes. Nothing blocks the merge. The suggestions cover: the PR's own type tests miss most regressions, two methods still lack the default, the changeset file does nothing, skills docs contradict the feature, and one narrow compile-time regression is not disclosed.

## Gate results on the PR head [ran]

| Command | Result |
|---|---|
| `pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages` | pass |
| `TURBO_CONCURRENCY=2 pnpm checkTs` (root, 16 tasks incl. sodax-demo-v2, dapp-kit, wallet-sdk-react, docs-examples, playground) | pass |
| `pnpm lint` (root, 16 tasks) | pass, no files rewritten (`git status` clean after) |
| `pnpm --filter @sodax/sdk --filter @sodax/types --filter @sodax/dapp-kit test` | pass: sdk 3128, types 1655, dapp-kit 933 |
| `packages/sdk: pnpm checkTs` with the proposed test added | pass (93 test files in program, cast comments ok) |

## 1. Do the new `expectTypeOf` assertions gate anything?

- Yes. They fail only through tsc, and tsc covers them: `packages/sdk/tsconfig.json` has `"include": ["src"]` and no test exclude. `checkTs` = `tsc --noEmit && node ../../scripts/check-tests-typechecked.mjs` (packages/sdk/package.json), and the guard script requires every `src/**/*.test.ts` to be in the program (scripts/check-tests-typechecked.mjs:6-9). [read + ran]
- `@sodax/types` resolves through `packages/types/dist` (package.json `exports`), so a `common.ts` mutation only shows up after `pnpm --filter @sodax/types build`. Every types mutation below rebuilt dist first, then rebuilt it again after restoring. [ran]

### Mutation results [ran]

The 6 rows the PR covers are swaps/bridge/moneyMarket `approve` and `createIntent`/`createBridgeIntent`/`createSupplyIntent`.

| # | Mutation | PR assertions | Proposed test | Other errors |
|---|---|---|---|---|
| 1a | Revert only `WalletProviderSlot` (common.ts:433-435) to `raw: true` / `raw?: false`; keep the `= false` defaults | fail | fail (49) | **191 errors in 22 files, 34 in `src/` itself**: the build breaks without any test (the PR notes say both halves are needed) |
| 1b | Revert the slot **and** every `= false` (= main's src), keep the tests | the 12 new assertion lines fail (SwapService.test.ts:316/318/320/323, BridgeService.test.ts:162/164/166/169, MoneyMarketService.test.ts:285/287/289/292), plus 6 errors from the 3 relocated `@ts-expect-error` (SwapService.test.ts:367/370, 609/612, 692/695) | fail (4: EVM table, ICON table, chain table, explicit raw:false) | none: so "exactly those lines fail" holds, apart from the moved directives |
| 2a | Drop `= false` on `SwapService.approve` | caught (SwapService.test.ts:316) | caught, row `"swaps.approve"` | — |
| 2b | Drop `= false` on `StakingService.createStakeIntent` | **missed** | caught, row `"staking.createStakeIntent"` | — |
| 2c | Drop `= false` on `ClService.executeClaimRewards` | **missed** | caught | — |
| 2d | Drop `= false` on `MoneyMarketService.createBorrowIntent` | **missed** | caught | — |
| 2e | Drop `= false` on `MigrationService.createMigrateBalnIntent` | **missed** | caught (ICON table) | — |
| 3a | `SwapService.approve` returns `Result<TxReturnType<K, boolean>>` (old union) | caught (316, 318) | caught | SwapService.ts:1059 |
| 3b | Same on `StakingService.approve` | **missed** | caught | — |
| 3c | Same on `RecoveryService.withdrawHubAsset` | **missed** | caught | — |
| 3d | `IntentTxResult.tx` → `TxReturnType<K, boolean>` (shared type) | caught | caught | 69 src errors |
| 4a | `SwapService.approve` returns `Result<any>` | caught (316, 318, 333) | caught (4 its) | — |
| 4b | `BridgeService.createBridgeIntent` returns `Result<any, …>` | caught (166, 169) | caught | — |
| 5 | `SolanaReturnType<false>` → `string \| SolanaRawTransaction` | not covered | caught (`solana` row) | 93 src errors |

Without type arguments, the PR's tests miss 6 of the 11 single-method regressions (2b–2e, 3b, 3c).

## 2. Assertion strength [ran]

- The PR uses `toEqualTypeOf` everywhere, never `toMatchTypeOf`/`toExtend`. It rejects `any` (4a/4b fail) and a wider union (3a fails).
- Weakness: the expected side is `TxReturnType<typeof ChainKeys.BSC_MAINNET, false|true>`, which goes through the same per-chain map as the code under test. A map regression would move both sides together. Mutation 5 shows the source build breaks in that case anyway, so the extra value of concrete `Hex` / `EvmRawTransaction` is small. The proposed test spells the types out anyway.
- The "runtime mode" test (SwapService.test.ts:328-335) passes explicit `<BSC, boolean>` type arguments and builds its input with a `{} as SwapActionParams<…, boolean>` cast. So it does not test inference. The proposed test calls `approve(args)` with `args: SwapActionParams<BSC, boolean>` and no type arguments, and also passes a ternary with an explicit `raw: false` on the signed side. Both resolve to `Hex | EvmRawTransaction`.
- Bitcoin: `BitcoinReturnType<true>` = `BitcoinRawTransaction | string` (packages/types/src/bitcoin/bitcoin.ts:138-142), which equals the union. So a Bitcoin raw-mode assertion can never catch a regression to the union; only the signed side can. [read]

## 3. Coverage

I enumerated every public class method in `packages/sdk/src` with a parameter that carries `raw` + `walletProvider`, using the TypeScript API (script: `tools/enumerate.cjs`, output `methods.json`). That gives 120 methods; the 76 that are generic over a boolean mode are below. The others are single-mode (`<K, false>` executors such as `swap`, `supply`, `bridge`) or take `<K, true>` / `<K, boolean>` with a boolean result. [ran]

Gaps:
- **`SpokeService.deposit`** (SpokeService.ts:707) has no `R = false` default. `sodax.spoke.deposit({ ...p, walletProvider })` still resolves to `` `0x${string}` | EvmRawTransaction `` (the edge probe and the `gap-deposit-row-pr` mutation both show it). Its sibling `sendMessage` (SpokeService.ts:1040) got the default in this PR. [ran]
- **`SonicSpokeService.createSwapIntent`** (static, SonicSpokeService.ts:283) has no default. The signed call returns `[Hex | EvmRawTransaction, …]` (probe `probe603/sonic.ts`). The only callers are internal (SwapService.ts:1603, LeverageYieldService.ts:1162), so the impact is low. [ran]
- `SpokeService.verifyDepositSimulation` (SpokeService.ts:812) has no default, but it returns `Result<void>`, so nothing changes in practice.
- Adding `= false` to all three: sdk tsc passes with 0 errors, and the spoke + swap tests pass (956). The patch with a `spoke.deposit` table row is `spoke-deposit-default.patch`. [ran]
- Pre-existing, not from this PR: `PartnerFeeClaimService.setSwapPreference` cannot infer `K`, because `SetSwapPreferenceParams.srcChainKey` is `HubChainKey`, not `K` (PartnerFeeClaimService.ts:53-59). The mode narrows correctly (`string` vs `RawTxReturnType`), but the chain does not. [ran]
- Bonus fix the PR doesn't mention: `BalnSwapService.claim/stake/…` take the slot as their 3rd argument. On main, `claim(user, lock, { raw: true })` fails with TS2322 (`true` not assignable to `false`) and needs `<true>`. On the PR it infers the raw type. [ran]

| Method | file:line | `Raw = false` default | Mode-typed result (verified) | PR type test | Proposed test |
|---|---|---|---|---|---|
| Erc20Service.approve (static) | shared/services/erc-20/Erc20Service.ts:223 | yes | OK (probe) | - | - |
| SonicSpokeService.deposit | shared/services/spoke/SonicSpokeService.ts:209 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| SonicSpokeService.createSwapIntent (static) | shared/services/spoke/SonicSpokeService.ts:283 | **no** | union when signed (verified probe); internal callers pass explicit args | - | - |
| SonicSpokeService.sendMessage | shared/services/spoke/SonicSpokeService.ts:454 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| EvmSpokeService.deposit | shared/services/spoke/EvmSpokeService.ts:157 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| EvmSpokeService.sendMessage | shared/services/spoke/EvmSpokeService.ts:288 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| StacksSpokeService.deposit | shared/services/spoke/StacksSpokeService.ts:145 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| StacksSpokeService.sendMessage | shared/services/spoke/StacksSpokeService.ts:271 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| BitcoinSpokeService.sendMessage | shared/services/spoke/BitcoinSpokeService.ts:255 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| BitcoinSpokeService.deposit | shared/services/spoke/BitcoinSpokeService.ts:424 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| BitcoinSpokeService.encodeWithdrawalData | shared/services/spoke/BitcoinSpokeService.ts:662 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| NearSpokeService.deposit | shared/services/spoke/NearSpokeService.ts:144 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| NearSpokeService.registerStorage | shared/services/spoke/NearSpokeService.ts:289 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| NearSpokeService.sendMessage | shared/services/spoke/NearSpokeService.ts:328 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| SuiSpokeService.deposit | shared/services/spoke/SuiSpokeService.ts:180 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| SuiSpokeService.sendMessage | shared/services/spoke/SuiSpokeService.ts:234 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| StellarSpokeService.buildDepositCall | shared/services/spoke/StellarSpokeService.ts:335 | yes | n/a (xdr.Operation) | - | - |
| StellarSpokeService.buildSendMessageCall | shared/services/spoke/StellarSpokeService.ts:351 | yes | n/a (xdr.Operation) | - | - |
| StellarSpokeService.sendMessage | shared/services/spoke/StellarSpokeService.ts:365 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| StellarSpokeService.deposit | shared/services/spoke/StellarSpokeService.ts:539 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| StellarSpokeService.requestTrustline | shared/services/spoke/StellarSpokeService.ts:651 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| SolanaSpokeService.deposit | shared/services/spoke/SolanaSpokeService.ts:98 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| SolanaSpokeService.sendMessage | shared/services/spoke/SolanaSpokeService.ts:283 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| IconSpokeService.deposit | shared/services/spoke/IconSpokeService.ts:61 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| IconSpokeService.sendMessage | shared/services/spoke/IconSpokeService.ts:226 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| InjectiveSpokeService.deposit | shared/services/spoke/InjectiveSpokeService.ts:176 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| InjectiveSpokeService.sendMessage | shared/services/spoke/InjectiveSpokeService.ts:362 | yes | derived: same slot + default as sendMessage (not probed per chain) | - | - |
| SpokeService.approve | shared/services/spoke/SpokeService.ts:254 | yes | yes (table row) | - | yes |
| SpokeService.deposit | shared/services/spoke/SpokeService.ts:707 | **no** | union (gap) | - | - |
| SpokeService.verifyDepositSimulation | shared/services/spoke/SpokeService.ts:812 | **no** | n/a (Result<void>) | - | - |
| SpokeService.sendMessage | shared/services/spoke/SpokeService.ts:1040 | yes | yes (table row) | - | yes |
| SpokeService.verifySimulation | shared/services/spoke/SpokeService.ts:1161 | yes | n/a (Result<void>) | - | - |
| SwapService.approve | swap/SwapService.ts:1333 | yes | yes (table row) | yes | yes |
| SwapService.createIntent | swap/SwapService.ts:1507 | yes | yes (table row) | yes | yes |
| SwapService.createLimitOrderIntent | swap/SwapService.ts:1735 | yes | yes (table row) | - | yes |
| SwapService.createCancelIntent | swap/SwapService.ts:1784 | yes | yes (table row) | - | yes |
| BalnSwapService.claim | migration/BalnSwapService.ts:209 | yes | OK (probe); main rejected raw: true | - | - |
| BalnSwapService.claimUnstaked | migration/BalnSwapService.ts:228 | yes | derived: same as claim | - | - |
| BalnSwapService.stake | migration/BalnSwapService.ts:247 | yes | derived: same as claim | - | - |
| BalnSwapService.unstake | migration/BalnSwapService.ts:266 | yes | derived: same as claim | - | - |
| BalnSwapService.cancelUnstake | migration/BalnSwapService.ts:286 | yes | derived: same as claim | - | - |
| BalnSwapService.call | migration/BalnSwapService.ts:441 | yes | derived: same as claim | - | - |
| MigrationService.approve | migration/MigrationService.ts:283 | yes | yes (table row) | - | yes |
| MigrationService.createMigrateBalnIntent | migration/MigrationService.ts:867 | yes | yes (table row) | - | yes |
| MigrationService.createMigratebnUSDIntent | migration/MigrationService.ts:946 | yes | yes (table row) | - | yes |
| MigrationService.createMigrateIcxToSodaIntent | migration/MigrationService.ts:1119 | yes | yes (table row) | - | yes |
| MigrationService.createRevertSodaToIcxMigrationIntent | migration/MigrationService.ts:1233 | yes | yes (table row) | - | yes |
| BridgeService.isAllowanceValid | bridge/BridgeService.ts:246 | yes | n/a (Result<boolean>) | - | - |
| BridgeService.approve | bridge/BridgeService.ts:318 | yes | yes (table row) | yes | yes |
| BridgeService.createBridgeIntent | bridge/BridgeService.ts:987 | yes | yes (table row) | yes | yes |
| StakingService.isAllowanceValid | staking/StakingService.ts:210 | yes | n/a (Result<boolean>) | - | - |
| StakingService.approve | staking/StakingService.ts:283 | yes | yes (table row) | - | yes |
| StakingService.createStakeIntent | staking/StakingService.ts:487 | yes | yes (table row) | - | yes |
| StakingService.createUnstakeIntent | staking/StakingService.ts:662 | yes | yes (table row) | - | yes |
| StakingService.createInstantUnstakeIntent | staking/StakingService.ts:834 | yes | yes (table row) | - | yes |
| StakingService.createClaimIntent | staking/StakingService.ts:1021 | yes | yes (table row) | - | yes |
| StakingService.createCancelUnstakeIntent | staking/StakingService.ts:1215 | yes | yes (table row) | - | yes |
| AssetService.isAllowanceValid | dex/AssetService.ts:134 | yes | n/a (Result<boolean>) | - | - |
| AssetService.approve | dex/AssetService.ts:199 | yes | yes (table row) | - | yes |
| AssetService.executeDeposit | dex/AssetService.ts:299 | yes | yes (table row) | - | yes |
| AssetService.executeWithdraw | dex/AssetService.ts:383 | yes | yes (table row) | - | yes |
| ClService.executeSupplyLiquidity | dex/ConcentratedLiquidityService.ts:367 | yes | yes (table row) | - | yes |
| ClService.executeIncreaseLiquidity | dex/ConcentratedLiquidityService.ts:519 | yes | yes (table row) | - | yes |
| ClService.executeDecreaseLiquidity | dex/ConcentratedLiquidityService.ts:611 | yes | yes (table row) | - | yes |
| ClService.executeClaimRewards | dex/ConcentratedLiquidityService.ts:1008 | yes | yes (table row) | - | yes |
| MoneyMarketService.approve | moneyMarket/MoneyMarketService.ts:414 | yes | yes (table row) | yes | yes |
| MoneyMarketService.createSupplyIntent | moneyMarket/MoneyMarketService.ts:617 | yes | yes (table row) | yes | yes |
| MoneyMarketService.createBorrowIntent | moneyMarket/MoneyMarketService.ts:854 | yes | yes (table row) | - | yes |
| MoneyMarketService.createWithdrawIntent | moneyMarket/MoneyMarketService.ts:1064 | yes | yes (table row) | - | yes |
| MoneyMarketService.createRepayIntent | moneyMarket/MoneyMarketService.ts:1254 | yes | yes (table row) | - | yes |
| PartnerFeeClaimService.setSwapPreference | partner/PartnerFeeClaimService.ts:346 | yes | mode OK; K not inferred (string / RawTxReturnType) — pre-existing | - | - |
| PartnerFeeClaimService.approveToken | partner/PartnerFeeClaimService.ts:486 | yes | yes (table row) | - | yes |
| PartnerFeeClaimService.createIntentAutoSwap | partner/PartnerFeeClaimService.ts:565 | yes | yes (table row) | - | yes |
| PartnerFeeClaimService.cancelIntent | partner/PartnerFeeClaimService.ts:759 | yes | yes (table row) | - | yes |
| RecoveryService.withdrawHubAsset | recovery/RecoveryService.ts:187 | yes | yes (table row) | - | yes |
| LeverageYieldService.createVaultIntent | leverageYield/LeverageYieldService.ts:1051 | yes | yes (table row) | - | yes |
| LeverageYieldService.approve | leverageYield/LeverageYieldService.ts:2270 | yes | not checked | - | - |

"derived" rows: the per-chain spoke `deposit`/`sendMessage` methods use the same `SendMessageParams`/`DepositParams` slot and have the default. `sodax.spoke.sendMessage` and `sodax.spoke.evm.deposit` were checked directly; the others were not probed one by one.

## 4. Edge cases (compile probes in `packages/sdk/src/__probe603__/`, typechecked with the sdk tsconfig, then moved to `probe603/`) [ran]

Each probe ran on the PR head and again with the PR's non-test `src` changes reverted (`src-change.patch` applied with `-R`, types rebuilt), which stands in for main.

| Case | PR head | main |
|---|---|---|
| `{ params, walletProvider }` (no raw) | `Result<Hex>` | union |
| `{ params, raw: false, walletProvider }` | `Result<Hex>` | union |
| `{ params, raw: true }` | `Result<EvmRawTransaction>` | union |
| `{ params, raw: undefined, walletProvider }` | union (Raw falls back to `boolean`) | union |
| `args: SwapActionParams<BSC, boolean>`, `approve(args)` with no type args | union (correct) | union |
| `{ params, raw: flag }` with or without walletProvider (`flag: boolean`) | TS2345 (no branch fits) | TS2345: same |
| `const loose = { params, raw: true }` (widened `boolean`) | TS2345 | TS2345: same |
| inline ternary `approve(c ? { params, raw: true } : { params, raw: false, walletProvider })` | union (correct) | union |
| **inline ternary `approve(c ? { params, raw: true } : { params, walletProvider })`** (signed side omits `raw`) | **TS2345**: `Raw` is inferred as `true` from one branch only | compiles, union |
| same ternary pre-built into a `const` first, then passed | union | union |
| `raw: true` + walletProvider / neither / `raw: false` with no wallet / wrong-chain wallet | error (the `@ts-expect-error` directives hold) | error |
| Solana, Stellar, Sui, ICON, Injective, Stacks, Near, Bitcoin `swaps.createIntent`, both modes | `CreateIntentResult<chain, false/true>`; `tx` = chain hash / chain raw type | `CreateIntentResult<chain, boolean>` |
| generic `<K, Raw>` pass-through `approve(args: SwapActionParams<K, Raw>)` | `TxReturnType<K, Raw>` | same |
| generic `<K>` signed `{ params, walletProvider }` | `TxReturnType<K, false>` | `TxReturnType<K, boolean>` |
| generic `<K>` raw `{ params, raw: true }` | `TxReturnType<K, true>` | `TxReturnType<K, boolean>` |
| generic `{ params, ...slot }` with `slot: WalletProviderSlot<K, Raw>` | `TxReturnType<K, boolean>` (Raw is lost) | same |
| partner-style `(raw ? {raw:true} : {raw:false, walletProvider}) as WalletProviderSlot<K, Raw>` | compiles | compiles |

- No silent wrong narrowing: every case that narrows to the wrong mode also raises a compile error.
- `K` inference still works for every chain family, and through generic wrappers it gets better (no more `boolean`).
- dapp-kit hooks spread `{ ...vars, raw: false }` into `Omit<…ActionParams<K, false>, 'raw'>` (e.g. packages/dapp-kit/src/hooks/swap/useSwap.ts:15). They are unaffected, and root checkTs passes for dapp-kit, wallet-sdk-react, demo, playground and docs-examples. `rg "extends boolean"` over dapp-kit, wallet-sdk-react and apps finds no generic `Raw` wrappers. [ran]

## 5. Downstream break and release classification

The PR says "Results only narrow, so code that handled the union still compiles". Two patterns that compiled on main now fail to compile [ran]:
1. An inline ternary argument whose signed branch omits `raw` (table above, `probe603/regress.ts`): TS2345 on the PR, compiles on main. The workaround is `raw: false` on that branch, or building the argument into a variable first. This pattern is newly likely, because omitting `raw` is now the advertised idiom.
2. Casting an object literal that contains `raw: false` to a generic-`Raw` slot type (`… as DepositParams<K, Raw>`): TS2352 "neither type sufficiently overlaps". I reproduced it by turning EvmSpokeService.test.ts:584 back into a single `as`. The PR discloses this one.

There is no runtime impact, and both fixes are one-line. My judgement: this is not a partner-facing break worth blocking on. Packages are `2.0.0-rc.17` (packages/sdk/package.json:7), so semver "minor" is moot. But pattern 1 should go in the PR body next to pattern 2. Whether the subject needs `!` is the maintainer's call.

Changesets are dead on main [read + ran]:
- `origin/main` has no `.changeset/config.json` (`git show` fails).
- No `@changesets` dependency in the root package.json.
- `scripts/release.mjs` never reads `.changeset/`. It builds notes from commit subjects/bodies (release.mjs:19-28) and flags breaking changes only via `type!:` or a `BREAKING CHANGE` body (release.mjs:23-24, 163).
- CONTRIBUTING.md:106-107: "the PR title becomes the commit subject on main — and the input to the next release's notes".
- So `.changeset/infer-execution-mode-result.md` does nothing; it joins 8 other leftover files in `.changeset/`. The squash subject `feat(sdk): …` decides the note (it lands under Features). Suggest dropping the file.

## 6. The 18 `as unknown as` casts in spoke test fixtures [ran + read]

- They are needed **for the current helper design**. The helpers are generic over `Raw` (`<Raw extends boolean>(overrides: Partial<DepositParams<K, Raw>>) => ({…, raw: false, walletProvider, ...overrides}) as …`), and a single `as` now fails with TS2352 (reproduced). That means packages/sdk/AGENTS.md's "allowed only while removing it breaks the typecheck" is technically met.
- They are avoidable: replace each generic helper with a per-mode helper, e.g. `rawDepositParams(overrides: Partial<DepositParams<ARB, true>>): DepositParams<ARB, true> => ({ …, ...overrides, raw: true })`. I prototyped this in EvmSpokeService.test.ts: it compiles with no cast, and all 167 tests pass (`cast-free-fixture-example.patch`).
- The casts also hide a fixture defect. The generic helpers always default `walletProvider: mock…Provider`, so a `depositParams<true>({ raw: true })` fixture carries both `raw: true` and a wallet. The public type forbids that shape (e.g. EvmSpokeService.test.ts:571-584 with callers at :588/:598; Stacks fixture StacksSpokeService.test.ts:361-376 with 7 raw callers). A typed per-mode helper cannot build it.
- Severity: low, test hygiene. Doing this is follow-up scope; the PR only made existing single casts stricter.

## 7. Other findings

- **Docs/skills drift (low-medium):** `packages/skills` still says omitting `raw` is a compile error or that `raw` is mandatory, which now directly contradicts the headline feature. Locations: packages/skills/skills/sodax-sdk/swap/SKILL.md:45; …/integration/knowledge/architecture.md:270-273 (old slot), :280, :294 (`createIntent({ params, walletProvider }); // missing 'raw'` listed under "Compile errors"); …/migration-v1-to-v2/knowledge/features/swap.md:10; …/breaking-changes/type-system.md:132-135, :142. This drift predates the PR (main's slot already had `raw?: false`), but the PR makes omission the recommended form and ticks "packages/skills updated", while it only touches leverage-yield.md. [read; omission compiling on main verified by probe]
- **Scope nit:** unrelated Biome reformat hunks in IconSpokeService.test.ts (getDeposit and getWalletBalances blocks) and SpokeService.test.ts (`it.each` block and `requestTrustline` spy). [read from diff]
- **`@ts-expect-error` moves (SwapService.test.ts:367, 609, 692):** correct. On the PR the error moves to the `walletProvider:` line. A directive on that property line is satisfied by any error on it, which is slightly weaker than one on the call. [ran]

## Proposed type test: `improved-type-tests.patch`

File: `packages/sdk/src/shared/entities/Sodax.execution-mode.test.ts`. It follows the `Sodax.<topic>.test.ts` naming beside `Sodax.initialize.test.ts`. checkTs picks it up through `include: ["src"]`, and check-tests-typechecked reports "all 93 test files". It contains no casts. Fakes are `declare const`, the rows are never called, and vitest runs it as 6 no-op tests.
- **Table-driven:** 34 EVM rows (BSC, plus hub-only rows on Sonic), 2 ICON-only migration rows, and `swaps.createIntent` on 8 non-EVM chains. Each row is `[call with walletProvider and no raw, call with raw: true]`.
- **Diagnostics:** a `Mismatches<Rows, Expected>` type keeps only the failing rows, checked with a strict `Same<A, B>` identity, and `expectTypeOf<…>().toEqualTypeOf<Record<never, never>>()`. A failure names the method, e.g. `constraint '{ "staking.createStakeIntent": …`. A plain deep `toEqualTypeOf` over the table hid the row name behind tsc truncation.
- **Also covers:** explicit `raw: false`; a runtime-mode argument inferred with no type arguments (both a `SwapActionParams<BSC, boolean>` variable and a ternary); and `@ts-expect-error` for raw+wallet, neither, raw:false without a wallet, wrong-chain wallet, and a non-literal boolean.
- **Bites:** it fails under mutations 1a, 1b, 2a-2e, 3a-3d, 4a, 4b and 5, and passes on the PR head (sdk tsc 0 errors, `pnpm checkTs` green, `biome check` clean, vitest 6/6). [ran]
- `spoke-deposit-default.patch` (optional, apply on top) adds `= false` to SpokeService.deposit / verifyDepositSimulation and SonicSpokeService.createSwapIntent, plus a `spoke.deposit` row. Without the source fix that row fails on the PR head; with it, tsc has 0 errors. [ran]

