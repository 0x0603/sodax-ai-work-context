---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, deps]
---

# Dependency trims — deep dive (feasibility, complexity, benefit)

- **sdk-4 is complete and proven within its scope.** A 250-line prototype, built from Uniswap's MIT code and the ABIs, matches all 16 PancakeSwap symbols we use over 209,111 cases with 0 failures. An npm install shrinks by 359 MB, but most of that is six nested copies of viem 2.37.13; counting each package version once, as pnpm stores them (all three consumer repos use pnpm), it shrinks by about 70 MB. The bundle shrinks by 99 KB gzip today (126 KB EVM-only). Its advisory win is weak alone (−1 unique advisory; −6 with sdk-1), and the GPL `LICENSE` in two tarballs matches pnpm's automatic copy of a GPL-3.0 monorepo root. C3 / B3.
- **sdk-5: the three chain libraries are about 256 KB gzip of each sdk browser entry measured today.** Removing icon-sdk-js saves 145 KB, Anchor 59 KB and Stellar `/minimal` 49 KB on `new Sodax()`; swap-only and money-market-only entries drop by the same 257 KB. The replacements weigh about 2 KB. Only about 110 KB of this can ship in 2.x: icon-sdk-js stays while the public `iconService` fields exist (removing them is 3.0), the Anchor helpers must move to their own module, and Stellar `/minimal` must land in wallet-sdk-core and wallet-sdk-react too, or apps that load both get two prebuilt Stellar bundles (+222 KB). The install win stays small (−49 MB, 0 unique advisories). C3 / B3.
- **sdk-7: Next.js (webpack) already maps `crypto` to crypto-browserify and injects `Buffer` and `process`, so consumers pay in bytes, not config.** With npm shims, today's `new Sodax()` grows by 146 KB gzip; 137 KB of that is crypto-browserify, which only the Stacks code in `@sodax/libs` (a bundled noble-secp256k1 v1 copy) pulls in. After sdk-1 + sdk-4 the EVM-only core constructs with no Node globals, but our own code still calls global `Buffer` (49 lines in 13 sdk files today; 3 of them on the EVM path).
- **sdk-7, Bitcoin:** bitcoinjs-lib 7 + ecpair 3 + bip322-js 4 match v6 over 2,000 PSBT cases (taproot signatures checked valid in verification) and run without `Buffer`, except bip322-js 4, which still uses the global. No sdk test builds or signs a real PSBT today. Verdict stays "Needs a decision (scope)", C3 / B3.
- **Cross-bullet:** PancakeSwap reaches every feature bundle through `SonicSpokeService`, and Stellar plus Solana reach every entry through `shared-utils.js`. After sdk-1 + sdk-4, the EVM-only `new Sodax()` graph imports no Node builtins.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| sdk-4 | Feasible with caveats / Proven (pure-function scope) | C3 | B3 (B4 for npm-layout installs) | 2.x (vendor, drop v3+infinity) + 3.0 (Price/Token) | Prototype is byte- and string-identical; −359 MB npm install, about −70 MB with pnpm; −99 KB gzip; Price/Token type change is the only break |
| sdk-5 | Feasible with caveats / Proven for sizes and for the first-pass ICON tx+sig and Solana ix scope; Code-traced for ICON RPC and receipts | C3 | B3 (about B4 for apps on ICON, Solana and Stellar once the 3.0 removals land) | 2.x (Stellar `/minimal` in all three packages, Solana encoders, Anchor helpers moved to their own module and deprecated, ICON client used internally) + 3.0 (remove the `iconService` fields, which is when icon-sdk-js leaves, and the Anchor helpers) | −254 KB gzip net on the sdk entries measured, of which about 110 KB can ship in 2.x; replacements ~2 KB; no consumer uses the public surfaces that go |
| sdk-7 | Needs a decision (scope) / Proven for EVM-only core construction; Code-traced for the rest | C3 (core + EVM scope); the Bitcoin track is a further C3 on a fund-moving path (C5 if bumped before golden PSBT tests exist) | B3 | 2.x (T15.1, libs browser build for `crypto`) + 3.0 (T15.3, T15.2, with sdk-1 and sdk-4; bitcoinjs 7 with the Bitcoin chain package) | npm shims standing in for Next's webpack fallbacks add +146 KB gzip; the core is import-clean after sdk-1 + sdk-4 but still calls global `Buffer` |

---

## sdk-4 · Vendor the PancakeSwap code we use

**Bullet:** "Replace the PancakeSwap SDKs with vendored math, codecs and encoders we actually use"  ·  **T-ids:** T5.1, T5.2, T5.3, T5.4

### Today

**Imports.** Two source files import 16 symbols. [verified]
- **`packages/sdk/src/dex/ConcentratedLiquidityService.ts`:**
  - `:35` imports `Price` and `Token` from `@pancakeswap/swap-sdk-core`.
  - `:37-45` imports 7 symbols from `@pancakeswap/infinity-sdk`.
  - `:46-54` imports 7 symbols from `@pancakeswap/v3-sdk`.
- **`packages/sdk/src/swap/EvmSolverService.ts`:**
  - `:40` imports `CLPositionManagerAbi`.
  - `:45` calls `getAbiItem({ abi: CLPositionManagerAbi, name: 'MintPosition' })` at module load.

**Every feature pays, not only DEX.** [verified]
- `SonicSpokeService.ts:33` imports `EvmSolverService`, so every entry that builds a `SpokeService` pulls in infinity-sdk, then v3-sdk, then swap-sdk-core, then `@solana/web3.js` and bn.js.
- Method: esbuild metafile importer trace (`scratch/deep-deps/scripts/who.mjs`) on a money-market-only entry (`entries/mm-only.js`). It shows `EvmSolverService.js -> @pancakeswap/infinity-sdk` and `SonicSpokeService.js -> EvmSolverService.js`.

**Pins.**
- `pnpm-workspace.yaml:78-83` pins all three exactly, with the note "Bump all three together". `packages/sdk/package.json:72-74` uses them. [verified]
- The `v3-sdk` and `infinity-sdk` pins each exact-pin `viem@2.37.13`. Our exact `viem@2.29.2` can't share it, so npm nests 6 private copies; pnpm's store keeps one. [verified: 8 viem copies in the npm install, 1 `viem@2.37.13` folder in the t2probe pnpm store; see Benefit]

**Public type surface.** [verified]
- One emitted declaration file references PancakeSwap: t2probe `dist/esm/dex/ConcentratedLiquidityService.d.ts:5` (`import { Price, Token } from '@pancakeswap/swap-sdk-core'`).
- That type reaches 13 positions in exported types:
  - `ClPositionInfo.tickLowerPrice/tickUpperPrice` (`ConcentratedLiquidityService.ts:184-185`);
  - `TokenWithConversion` (`:201-205`);
  - `EnrichedToken` (`:210-215`);
  - `PoolData.price`, `token0/1` and `*UnderlyingToken` (`:245`, `:255-264`);
  - `ClService.priceToTick(price, token0: Token, token1: Token, …)` (`:1829`).
- The sdk does not re-export `Price` or `Token` by name.

**Tests.** [verified]
- `ConcentratedLiquidityService.test.ts:15-16` uses v3-sdk as the oracle for the math.
- `:53-63` mocks all five infinity-sdk functions. The three calldata encoders therefore have **no golden test today**.

**`@sodax/types` already redistributes PancakeSwap declarations.** [verified]
- `packages/types/src/dex/pancakeswap-infinity.ts` is 610 lines. Only 4 of its types are re-exported (`packages/types/src/dex/dex.ts:7-12`).
- Lines 418–610 are infinity-sdk 1.0.8 `dist/types.d.ts`: 136/148 non-trivial lines are identical after normalizing whitespace and quotes, and the file still ends with `//# sourceMappingURL=types.d.ts.map`.
- Lines 1–417 mirror swap-sdk-core's `index.d.ts` (210/306 lines identical).
- Method: `scratch/deep-deps/scripts/overlap.py`.

**Downstream use.** [verified]
- **sodax-frontend@1b915ec7:**
  - 12 `toSignificant(n)` calls (`git grep -c "toSignificant("` = 12), with arguments 18 ×8, 6 ×2 and 4 ×2.
  - None passes a format or rounding argument.
  - 10 of the 12 go straight into `Number()` or `parseFloat`. Only `position-card.tsx:203-204` (`toSignificant(4)`) is displayed as a string.
  - There is no direct `@pancakeswap` import (`git grep` hits only the lockfile).
- **In-repo:**
  - demo: 6 calls, all `toSignificant(6)`;
  - dapp-kit: calls only `priceToTick` (`hooks/dex/useLiquidityAmounts.ts:39-40`, `utils/dex-utils.ts:143-144`).
- **intents-whitelabel@5e1fbba and sodax-backend@985959e9:** no CL use. They carry all of PancakeSwap through the lockfile only.

**Provenance.** [verified unless tagged]

| Code | npm `license` | `LICENSE` in tarball | Source |
| --- | --- | --- | --- |
| `@pancakeswap/swap-sdk-core@1.6.0` | MIT | MIT, "© 2020 Noah Zinsmeister" (the Uniswap v2 SDK author) | npm `repository`: pancake-frontend `packages/swap-sdk`. `gh api repos/pancakeswap/pancake-frontend` returns 404, and the repo is absent from the org's public list |
| `@pancakeswap/v3-sdk@3.10.0` | MIT | GPL-3.0 (674 lines) | no `repository` field |
| `@pancakeswap/infinity-sdk@1.0.8` | MIT | GPL-3.0 | no `repository` field; README links `pancakeswap/infinity-core` |
| PancakeSwap `infinity-core`, `infinity-periphery` (contracts) | — | GPL-2.0 (`gh api …/license`) | public |
| `@uniswap/v3-sdk@3.31.5`, `@uniswap/sdk-core@7.19.4` | MIT | MIT, © 2021 Uniswap Labs | `Uniswap/sdks`: `sdks/v3-sdk/LICENSE`, `sdks/sdk-core/LICENSE` are MIT (`gh api …/contents`) |
| `@uniswap/v4-sdk@2.4.1` | MIT | MIT, © 2024 Uniswap Labs | `Uniswap/sdks/sdks/v4-sdk/LICENSE` |

**Why the GPL file is there.**
- **Every tarball checked ships a LICENSE.** That is v3-sdk 3.5.3, 3.9.7, 3.10.0 and 3.10.3, and infinity-sdk 1.0.0, 1.0.8 and 1.1.0 (`npm pack --dry-run --json`). [verified]
- **A public mirror of the monorepo shows the layout.** In `OleksandrLiutko/kakaswap-frontend-main` (v3-sdk 3.5.3 era):
  - the root `LICENSE` is GPL-3.0;
  - `packages/v3-sdk/package.json` says `"license": "MIT"` and the folder has **no** LICENSE file;
  - `packages/swap-sdk-core` has its own MIT LICENSE.

  [verified via `gh api`]
- **pnpm copies the workspace-root LICENSE into a package that has none.** See pnpm 10.32.1 `dist/pnpm.cjs:189014-189018`. [verified]
- **So the GPL text is most likely the monorepo root licence, added at publish time.** [judgement] That explains the mismatch. It does not settle which licence PancakeSwap intends for that code, and that stays a legal question.

**Fork lineage of v3-sdk.** PancakeSwap's v3-sdk is a fork of Uniswap's MIT v3-sdk, with JSBI replaced by native bigint. The overlap is textual and verified; that it is a derivation is an inference.
- **Method:** compare PancakeSwap `dist/index.mjs` against Uniswap 3.31.5 `dist/esm`.
- **What is shared:**
  - 170 of PancakeSwap's 171 JSDoc lines (over 25 characters) appear verbatim in Uniswap's;
  - 67 of Uniswap's 71 function and method names reappear;
  - 22 of 24 long hex constants are shared.
- **The two functions the brief named:**
  - `TickMath.getSqrtRatioAtTick` is the same algorithm line for line, with the same 20 constants and the same "Cannot be constructed." comment.
  - `maxLiquidityForAmounts` is also the same algorithm line for line. Its internal helpers keep their names: `maxLiquidityForAmount0Imprecise`, `maxLiquidityForAmount0Precise` and `maxLiquidityForAmount1`.

**Per-symbol table.** "Proto" is the result from `proto/equiv.mjs` (see Feasibility).

| Symbol (package) | Used at (`ConcentratedLiquidityService.ts` unless noted) | Clean source | Proto |
| --- | --- | --- | --- |
| `Price` (swap-sdk-core) | `:1831` `priceToTick`; public types above | swap-sdk-core is itself MIT. Also Uniswap sdk-core `Price`/`Fraction` (MIT). Formatting must reproduce decimal.js-light (see Feasibility) | match |
| `Token` (swap-sdk-core) | `:1260`, `:1318-1319` (`new Token(146, …)`); public types | same | match |
| `CLPoolManagerAbi` (infinity) | `getSlot0` `:1305`; `getFeeGrowthGlobals` `:1479`; `getPoolTickInfo` `:1490,1496` | write from the ABI (3 fragments) | selector and decode equal |
| `CLPositionManagerAbi` (infinity) | `positions` `:1433`; event `MintPosition` `:471`; `EvmSolverService.ts:45` | write from the ABI. `shared/abis/pancakeSwapInfinity.abi.ts` already has `positions` and `modifyLiquidities` | equal |
| `decodePoolKey` | `:1450` | write from the PoolKey `parameters` layout: hooks bitmap in bits 0–13, `int24` tickSpacing above it | equal |
| `getPoolId` | `:953,1301,1474` | `keccak256(abi.encode(PoolKey))` | equal |
| `encodeCLPositionManager{Mint,IncreaseLiquidity,DecreaseLiquidity}Calldata` | `:393`, `:533`, `:619,1017` | Planner shape from Uniswap v4-sdk `V4Planner` (MIT); the action ids SODAX uses are 0, 1, 2, 13, 18, plus 20 only for a native `currency0`, and they match v4's `Actions`. The CL parameter layouts come from the CLPositionManager ABI | equal |
| `maxLiquidityForAmount0Precise`, `maxLiquidityForAmount1`, `maxLiquidityForAmounts` (v3-sdk) | `:1614`, `:1617`, `:1619,1650,1698` | Uniswap v3-sdk `utils/maxLiquidityForAmounts` (MIT; the first two are internal there) | equal |
| `PositionMath` (v3-sdk) | `:1457,1464,1660,1708,1748,1755,1778,1786` | Uniswap `Position.amount0/amount1` plus `SqrtPriceMath.getAmount{0,1}Delta` (MIT) | equal |
| `TickMath` (v3-sdk) | `:1610-1612,1646-1647,1694-1695,1775-1776` | Uniswap `utils/tickMath` (MIT) | equal |
| `tickToPrice`, `sqrtRatioX96ToPrice` (v3-sdk) | `:1572-1573`, `:1328` | Uniswap `priceTickConversions`, and the `Pool.token0Price` math (MIT) | equal |

**Actions SODAX never uses.** Actions 14 (TAKE) and 21 (WRAP) appear only in the decrease-with-`wrapAddress` branch, and SODAX never passes `wrapAddress` (`:619-628`, `:1017-1026`). [verified: `git grep wrapAddress` in `packages/sdk/src` and `packages/dapp-kit/src` finds 0 hits]

### Change

**From → to.** The three PancakeSwap packages go to `packages/sdk/src/dex/clmm/{math,infinity,price}.ts`, about 600–900 TS lines in total. [judgement, scaled from the 250-line JS prototype]

**What each step changes:**
- **Math and encoders:** internal; no API change.
- **ABI fragments:** they become local `as const` ABIs.
- **`EvmSolverService.ts:45`:** it reads `MintPosition` from the local fragment.
- **`ClPrice`/`ClToken` (3.0):**
  - they replace `Price`/`Token` in the 13 public type positions;
  - they keep the members that consumers use: `toSignificant`, `toFixed`, `invert`, `numerator/denominator`, `baseCurrency/quoteCurrency`, `chainId/address/decimals/symbol/name`, `sortsBefore`, `equals`;
  - they have no private members, so they are structural.
- **`priceToTick`:** it can widen to `{ decimals: number }`.
- **`pancakeswap-infinity.ts`:** shrinks to the 4 used types, written fresh.

Client code doesn't change for the known consumers:

```ts
// before and after (frontend, demo, dapp-kit)
poolData.price.toSignificant(18);
ClService.priceToTick(min, poolData.token0, poolData.token1, poolData.tickSpacing);
```

Only code that names PancakeSwap's classes in its own types would break. No known consumer does. [verified: frontend, whitelabel, backend]

### Feasibility — Feasible with caveats · Proven (pure-function scope)

**Prototype.** `scratch/deep-deps/proto/cl-vendored.mjs`:
- **Size:** 263 lines, of which 250 are not blank or comments.
- **What it covers:** all 16 symbols, ported from Uniswap MIT code or written from the ABI.
- **Harness:** `proto/equiv.mjs` runs it against the installed PancakeSwap packages (t2probe `packages/sdk`), with a seeded PRNG and N = 10,000 per random family.

**Result: 209,111 cases, 0 failures.** [verified; re-run in verification, identical]

| Area | Cases |
| --- | --- |
| `getSqrtRatioAtTick` | 18,295-tick sweep (step 97), plus 10 edge or invalid inputs, plus 10k random |
| `getTickAtSqrtRatio` | 10k at tick ratios ±1, plus 10k random |
| Four `maxLiquidity` variants | 10k each, amounts up to 2^128 |
| `PositionMath` ×2 | 10k each |
| `tickToPrice` / `sqrtRatioX96ToPrice` | numerator/denominator, `toSignificant(1..18)`, `toFixed(0..18)` and `invert`, decimals 0–24 |
| `Fraction.toSignificant` / `toFixed` | 3 rounding modes, with and without a group separator |
| `getPoolId`, `decodePoolKey` | random keys, hooks bitmaps, native `currency0` |
| 3 encoders | random arguments, including the wrap branch |
| 5 ABI fragments | selectors and decoding of random outputs; `MintPosition` topic |

**The quirk the probe caught.** [verified]
- decimal.js-light 2.5.1 `div` **truncates** to `precision` = sd+1 digits. It rounds with the mode only in `toSignificantDigits`. See `decimal.js:192-196`, `:1261`, and `round()` with `rm` undefined.
- A plain round-half-up port was wrong in 82 of 2,000 `toSignificant` cases (4.1%) and in 210 of 2,000 tick prices.
- Golden fixtures are mandatory.

**Not covered:**
- TypeScript (viem's `as const` inference for `readContract` results, and nominal compatibility);
- the `ClService` wiring;
- on-chain execution. The probe proves equality with today's calldata, which production already sends; it does not test the contracts;
- Bin pools, which SODAX doesn't use.

**Decisions:**
- **Source.** Port from Uniswap MIT and write from the ABI. That sidesteps the PancakeSwap licence question; the remaining legal call is only on the existing type copy in `@sodax/types`.
- **Timing of the `Price`/`Token` change.** 3.0. It changes 13 public type positions, so it is a breaking change even if only nominal.

### Complexity — C3

**PRs:**
1. Vendor the math, codecs, encoders and ABI fragments. Keep swap-sdk-core's `Price`/`Token`. Golden fixtures are generated from the PancakeSwap packages, kept as a devDependency. Drop v3-sdk and infinity-sdk. About 600–900 LOC of production code and about 500 of tests; `sdk` and the catalog. Not breaking.
2. Add `ClPrice`/`ClToken` and drop swap-sdk-core. Rewrite `pancakeswap-infinity.ts` down to its 4 types, update the demo, and update `docs/DEX.md` and skills `dex.md`. About 250 LOC; `sdk` and `types`. Breaking only nominally.
3. Freeze the fixtures, so the PancakeSwap devDependencies leave and OSV stops seeing them. About 50 LOC.

**Optional quick win (C1).** Move only the `MintPosition` fragment. That alone drops PancakeSwap from swap and money-market entries once sdk-6 entries exist.

**Coordination.**
- #534 and #498 edit `EvmSolverService.ts`, but at the import block (~`:16`) and around `:131` (#534's diff), not at `:40`/`:45`. [verified]
- No open PR touches `ConcentratedLiquidityService.ts`. [verified: `gh pr list --state open --json files`, 2026-10-19; only #534 and #498 touch `EvmSolverService.ts`]

**Top risks:**
1. Formatting drift (the truncation quirk) or an ABI-typing regression.
2. External integrators who annotate with PancakeSwap's classes.

**Fund-moving path.** [judgement] The three encoders build the calldata for CL mint, increase and decrease, which move user funds. C3 assumes PR 1's golden fixtures; without them the rubric's C5 clause (risk on paths that move funds) would apply. With tests, the total is about 1.4–1.7k LOC, at C4's size bar, but there is no consumer migration and little coordination, so C3 stays.

**Earlier estimate.** T5.1–T5.4 = 3 + 3 + 3 + 1 points, about 1.0–1.2K LOC. The prototype suggests less production code; most of the effort is fixtures and tests.

### Benefit — B3 (B4 for npm-layout installs)

**Why B3:** all three consumer repos install with pnpm (`packageManager`: pnpm 9.8.0, 10.32.1 and 10.30.3; the backend `Dockerfile` runs `pnpm install --frozen-lockfile`) [verified]. pnpm stores each package version once, so for them the install gain is about 70 MB, not 359 MB; the bundle gain is 96–99 KB gzip. Both clear B3's 50 MB / 50 KB bar, not B4's 200. B4 holds only for npm-layout installs (−359 MB). It is a prerequisite for one other bullet (sdk-7's builtin-free EVM core), not several. [derived]

**Installs.** `npm i --ignore-scripts --before=2026-10-05`, measured with `du`, `npm audit --omit=dev`, and a count of unique GHSA ids. The variants install the sdk's third-party dependencies at the pinned versions, plus our packages at 2.2.0-rc.8 (2.2.0 is newer than `--before`; its dependency list is identical). [verified; re-run in verification with `inst-summary.py`, identical] "MB, each version once" sums every name@version once, nested `node_modules` excluded (`wf-verify-deps/scripts/dedup-size.py`). It approximates pnpm's store; no pnpm install was run. [derived]

| Install | MB | MB, each version once | pkgs | viem copies | flagged pkgs (H/M/L) | unique advisories |
| --- | --: | --: | --: | --: | --- | --: |
| `@sodax/sdk@2.2.0-rc.8` | 776 | 482 | 412 | 8 | 35 (11/13/11) | 47 |
| sdk deps, all | 771 | 477 | 411 | 8 | 34 (10/13/11) | 47 |
| without v3-sdk and infinity-sdk | 427 | 421 | 349 | 2 | 27 | 47 |
| without all PancakeSwap | 412 | 407 | 336 | 2 | 25 | 46 |
| EVM-only core: types, swaps-api and bridge-api at rc.8, viem 2.29.2, valibot, rlp, bignumber.js | 60 | 60 | 18 | 1 | 2 (1/1/0) | 2 |
| EVM-only core + 3 PancakeSwap | 467 | 187 | 182 | 7 | 20 (5/15/0) | 8 |
| EVM-only core + swap-sdk-core only | 124 | 119 | 103 | 1 | 8 (1/7/0) | 7 |

**What the install table shows:**
- **Today, standalone:**
  - −359 MB with npm (771 → 412; this re-derives measurements.md's 358 MB) and −75 packages [derived].
  - Counting each version once: −70 MB (477 → 407). PancakeSwap adds 23 name@versions; the largest are `viem@2.37.13` (42.3 MB), a second `@solana/web3.js` (1.98.4, 10.8 MB) and `ox@0.9.6` (7.5 MB). [derived: `wf-verify-deps/scripts/dedup-diff.py`] So most of the npm figure is six nested copies of the same viem and ox (6 × 42.3 MB and 6 × 7.5 MB).
  - 6 nested viem copies go.
  - −9 flagged packages, but only **−1 unique advisory**: GHSA-378v-28hj-76wf on bn.js, moderate. The bn.js entry goes because swap-sdk-core pins `bn.js 5.2.1` exactly.
  - Dropping v3-sdk and infinity-sdk alone gives −344 MB, 96% of the win (−56 MB, 80%, counting each version once) [derived].
- **With sdk-1 (EVM-only):**
  - −407 MB with npm (467 → 60, −87%) and −164 packages [derived]. Counting each version once: −127 MB (187 → 60); 30 MB of that is a TypeScript 7 peer that npm installed for PancakeSwap, which most projects already have.
  - −6 unique advisories, including the high GHSA-3gc7-fjrx-p6mg (bigint-buffer, through `@solana/web3.js`).
  - Keeping swap-sdk-core costs +64 MB (+59 MB counting each version once) and +5 advisories.

**Bundles.** esbuild 0.25.12 over the t2probe tsc-ESM dist; minified, ESM, browser, gzip. "EVM-only" means the non-EVM chain libraries are stubbed **only where the sdk imports them**, so PancakeSwap keeps its own Solana dependencies. "vendored" aliases the three packages to the prototype. Results are in `out/pcs-bundles.md`. [verified]

| Entry | as-is | −v3 −infinity | −all PCS | **vendored** | EVM-only | EVM-only, keep core | **EVM-only vendored** |
| --- | --: | --: | --: | --: | --: | --: | --: |
| `new Sodax()` | 1,261.4 | 1,224.1 | 1,159.0 | **1,162.7** | 432.5 | 394.5 | **306.1** |
| swap only | 1,211.2 | 1,113.8 | 1,113.8 | **1,114.9** | 380.9 | 248.4 | **249.5** |
| DEX only | 1,215.5 | 1,178.1 | 1,113.5 | **1,116.7** | 386.6 | 340.4 | **251.6** |

**What the bundle table shows:**
- **Net, today:** −96 to −99 KB gzip (−8%) on each entry measured. [derived]
- **Net, EVM-only:** −126 to −135 KB (−29% to −35%). [derived]
- **Keeping swap-sdk-core in the EVM-only `new Sodax()`:** +92 KB, from `@solana/web3.js` and bn.js, and the `buffer` builtin requirement stays. [derived: 394.5 − 302.7, where 302.7 is the EVM-only build with no PancakeSwap code at all (`out/pcs-bundles.md`); against the vendored 306.1 it is +88 KB]
- **Re-run in verification:** EVM-only 432.5, EVM-only keep core 394.5 and EVM-only vendored 306.1, all identical.
- **Standalone:** `Price` + `Token` alone weigh 93.0 KB gzip; all 16 symbols weigh 140.4 KB; the prototype is 4.3 KB gzip / 10.3 KB min with viem external.

**Node (P3).**
- `require` of the sdk CJS plus `new Sodax()`, with PancakeSwap aliased to the prototype: RSS 171 → 163 MB (median of 15).
- Time difference is below noise: medians drifted between 0.7 and 1.5 s across batches. [verified]

**By persona:**
- **P1:** −99 KB gzip today; −126 KB with sdk-1. The `buffer` polyfill leaves the EVM-only graph (sdk-7).
- **P2:** the same bundle win; about −70 MB install with pnpm (−359 MB with npm).
- **P3:** about −70 MB per pnpm install or image (the backend builds with pnpm), −359 MB with npm, and −8 MB RSS.
- **P4:** nothing.
- **P5:** three exact pins and the "bump together" rule go away; licence ambiguity leaves the dependency tree; the encoders gain golden tests.
- **P6:** nothing.
- **Unblocks:** sdk-7's builtin-free EVM core (swap-sdk-core is its only `buffer` importer). It also supplies a large share of sdk-1's EVM-only install and bundle numbers.
- **Cost of not doing it:** PancakeSwap becomes about 87% of an EVM-only sdk npm install (68% counting each version once: 127 of 187 MB).

### Recommendation

**Timing.**
- **2.x:** PR 1. It removes 6 viem copies with no API change: −344 MB with npm, −56 MB counting each version once.
- **3.0:** PR 2. On `new Sodax()` and DEX entries it brings most of the bundle win (PR 1 alone gives −37 KB there and −97 KB on swap only), and with sdk-1 the Solana-free graph. [derived from the bundle table]

**Wording:** "Replace the PancakeSwap SDKs with our own CL math, codecs and encoders, ported from Uniswap's MIT SDK or written from the ABIs, with golden equivalence tests"

### Corrections to earlier research

- **e-519 "Middle path for 2.x: keep `swap-sdk-core` (MIT, no viem)".** That is true for install in today's full tree. But swap-sdk-core statically imports `@solana/web3.js` and bn.js. With sdk-1 it costs +92 KB gzip, +64 MB (+59 MB counting each version once) and +5 advisories, and it keeps the `buffer` polyfill. So treat it only as a 2.x step, not an end state.
- **measurements.md "358 MB" and this report's first pass "−359 MB for every sdk consumer".** Both are npm-layout numbers: npm nests one viem 2.37.13 (and ox 0.9.6) under each of six PancakeSwap packages. pnpm, which all three consumer repos use, stores each once; counting each version once, the saving is about 70 MB.
- **measurements.md "PancakeSwap … 20 advisories" (installed alone).** In the real sdk install, removing it drops 9 flagged packages and **1** unique advisory. The #519 body's "reducing … transitive advisories" is true only together with sdk-1.
- **b-sdk-core-chains T5 "infinity-sdk into every entry that imports EvmSolverService: swap and leverage-yield".** It is in **every** entry, through `SonicSpokeService.ts:33`.
- **e-519 license note.** There is a mechanical explanation (the pnpm root-LICENSE copy). And the exposure already exists: `@sodax/types` ships infinity-sdk declarations verbatim (`pancakeswap-infinity.ts:418-610`).
- **b T5 test strategy.** The encoders have no golden tests today (they are mocked at `ConcentratedLiquidityService.test.ts:53-63`). A naive `toSignificant` port is wrong in about 4% of cases.

---

## sdk-5 · Lighter chain libraries

**Bullet:** "Lighter chain libraries: ICON reads and transaction building over JSON-RPC, Stellar /minimal, and Solana instruction encoding without runtime Anchor IDL fetching"  ·  **T-ids:** T8.1, T8.2, T8.3, T8.4, T8.5 (Later: T31.5)

### Today

**ICON in the sdk** (`packages/sdk/src/shared/services/spoke/IconSpokeService.ts`, 309 lines). [verified]
- **Construction:**
  - CJS-interop hack `:2`;
  - public field `iconService` `:34`, built at `:43`.
- **Transactions and reads:**
  - `Buffer.from(rlp…).toString('hex')` `:69`;
  - `Converter.toRawTransaction` with `CallTransactionBuilder` `:80`, `:251`;
  - `CallBuilder` `:116`, `:150`, `:196`;
  - `icx_call` `:129`, `:201`, with `tryAggregate` on `cxa4aa9185…` `:190`;
  - `icx_getBalance` `:146`, `:171`, read as `BigInt(balance.toFixed())`.
  - `estimateGas` already uses plain `fetch` (`utils/icon-utils.ts`, `debug_estimateStep`).
- **Polling loop** (`:281-308`):
  - `getTransactionResult` `:287`;
  - `status === 1` → success `:288`, any other status → failure;
  - **any throw → retry** `:295` until the deadline → `timeout` `:304`. A network error, an HTTP error, malformed JSON and an icon-sdk-js `FormatError` all look like "pending".

**icon-sdk-js 1.5.3 runtime.** [verified: `build/icon-sdk-js.node.min.js`, `package.json`]
- **Receipt formatting:**
  - `status`, `txIndex` and `blockHeight` become numbers;
  - the step fields become **BigNumber**;
  - prefixes are normalized: `hx` for `to`, `0x` for hashes, `cx` for `scoreAddress`;
  - it throws `FormatError` when fields are missing, or when status is 1 without `eventLogs` or 0 without `failure`.
- **Packaging:** the `browser` field points at a prebuilt `build/icon-sdk-js.web.min.js` of 2.7 MB. Its dependencies include `buffer`, `crypto-browserify`, `core-js`, `@babel/runtime-corejs3`, `ws` and `secp256k1@5.0.1`.

**Receipt type mismatch.** [verified]
- The sdk returns that BigNumber object cast to `IconTransactionResult`, whose step fields are typed `bigint` (`packages/types/src/icon/icon.ts:43-60`; the cast is at `IconSpokeService.ts:289`).
- wallet-sdk-core does convert correctly (`IconWalletProvider.ts:96-102`).
- No consumer reads the step fields: outside its type definition (`icon.ts:51`), `stepUsed` appears only in wallet-sdk-core across all four repos (`git grep stepUsed`).

**ICON in the wallet packages.** [verified]
- **wallet-sdk-core** (`IconWalletProvider.ts`, 278 lines): both paths construct an `IconService`, private key at `:53-54` (`Wallet.loadPrivateKey`) and browser extension at `:60`. The private-key path signs with `SignedTransaction` (`:90`) and sends at `:91`. Receipts use `waitTransactionResult` (`:96`).
- **wallet-sdk-react** (`xchains/icon/IconXService.ts`, 121 lines): reads only. It has a public `iconService` field (`:42`), `getBalance` (`:95`) and a `tryAggregate` call on the same multicall contract (`:61-66`). That is the same call set as the sdk's balance reads.
- `icon-sdk-js` is a dependency of sdk, wallet-sdk-core and wallet-sdk-react (`packages/*/package.json`: `:86`, `:82`, `:95`).

**Who uses ICON.** [verified]
- sodax-frontend lists `icon-sdk-js` directly (`apps/web/package.json:77`, catalog `pnpm-workspace.yaml:9` = 1.5.3, dependabot groups), but `git grep` finds **no import** in `apps/web`.
- Whitelabel and backend have it only through the sdk (lockfiles). The backend depends on `@sodax/sdk` only, not on the wallet packages (`git grep "@sodax/" -- '*package.json'` on origin/development).
- **Public surfaces that would go:** `git grep` for `iconService`, `getAssetManagerProgram`, `getConnectionProgram`, `getAssetManagerIdl`, `getConnectionIdl` and `getProvider(` finds 0 hits in sodax-frontend@1b915ec7, intents-whitelabel@5e1fbba and sodax-backend@985959e9. In this repo, outside the defining module and its tests, the Anchor helpers are used only by `SolanaSpokeService.ts:113-114` (deposit) and `:293` (`sendMessage`).

**Stellar and Solana.** [verified unless tagged]
- **Stellar:** 6 sdk source files import `@stellar/stellar-sdk` (`git grep -ln "@stellar/stellar-sdk'" packages/sdk/src | grep -v test | wc -l`). The 12 imports and 20 names all resolve from `/minimal` (carried over from `b-sdk-core-chains.md` probe B-1, not re-run).
- **Stellar is on every path today:** `shared/utils/shared-utils.js:7-8` (t2probe dist; source `shared-utils.ts:26-27`) imports `@solana/web3.js` and `@stellar/stellar-sdk` for address encoding. So every sdk entry carries both libraries, whatever chain it uses.
- **The wallet packages import the Stellar root too:** wallet-sdk-core (`StellarWalletProvider.ts:2`, `types/library-exports.ts:39`) and wallet-sdk-react (`StellarXService.ts:3` as `import * as`, `CustomSorobanServer.ts:8`, `xchains/stellar/utils.ts:12`). [verified] Under the `browser` condition, the root and `/minimal` of 15.1.0 resolve to two separate prebuilt files, `dist/stellar-sdk.min.js` (1,004,123 bytes) and `dist/stellar-sdk-minimal.min.js` (852,267 bytes). A bundle that imports both is 495.9 KB gzip, against 273.6 KB for the root alone and 222.9 KB for `/minimal` alone. [verified: esbuild 0.25.12, standalone entries, `wf-verify-deps/out/stellar-*.json`; that webpack resolves the same files is judgement] So `/minimal` in the sdk alone adds about 222 KB to any app that also loads the wallet packages' Stellar code. The two entries declare the same exports (the export lists of `lib/index.d.ts` and `lib/minimal/index.d.ts` are identical), so the wallet imports can move too. [verified for declarations only]
- **Solana:** `utils.ts` (97 lines) builds an `AnchorProvider` and calls `Program.fetchIdl` (`:17-66`); `SolanaSpokeService.ts:113-114` calls both program getters, so a deposit fetches 2 IDLs, and `sendMessage` fetches 1 (`:293`) (carried over from b T8-c, consistent with the code read here).
- **bn.js:** stubbing it where the sdk imports it saves 0 bytes; `@solana/web3.js`, PancakeSwap and others still import it (bundle table below).

**Install, measured as above.** [verified]

| Change | MB | pkgs | flagged pkgs | unique advisories |
| --- | --- | --- | --- | --- |
| Remove `icon-sdk-js` | 771 → 728 (−43) | 411 → 366 | −5 (`browserify-sign`, `create-ecdh`, `crypto-browserify`, `icon-sdk-js`, `secp256k1`, all via `elliptic`) | **0** |
| Remove `@coral-xyz/anchor` | 771 → 764 (−6) | 411 → 398 | −1 (anchor via `toml`) | **0** |
| Also remove `bn.js` | 764 → 764 | — | — | — |

- `bn.js` stays either way, because `@solana/web3.js` depends on it.
- Alone: icon-sdk-js is 47 MB / 105 packages; Anchor + bn.js 35 MB / 70; stellar-sdk 30 MB / 57, with 3 high-severity packages.
- `/minimal` doesn't change the install (B-1).
- PancakeSwap, ICON and Anchor removed together: 363 MB, 19 flagged packages, 46 unique advisories.
- Counting each version once gives the same ICON and Anchor deltas (477 → 435 and 477 → 471 MB). [derived: `dedup-size.py`]

**Bundle.** [verified] Method: `deep-deps/scripts/bundle2.mjs` (esbuild 0.25.12, t2probe tsc-ESM dist, minified ESM, browser, gzip, Node builtins external). "−X" stubs the module everywhere (`STUB2`); "−bn.js(sdk)" stubs it only where `packages/sdk/dist` imports it; `/minimal` aliases the root specifier. Per-chain entries import one `*SpokeService.js` from `dist/esm`. Results: `wf-finish-deps/out/sdk5-bundles.md`. Units: KB gzip.

| Entry | as-is | −icon-sdk-js | Stellar `/minimal` | −Anchor | −Anchor −bn.js(sdk) | all three |
| --- | --: | --: | --: | --: | --: | --: |
| `new Sodax()` | 1,261.4 | 1,116.3 | 1,212.6 | 1,202.3 | 1,202.3 | **1,005.4** |
| swap only | 1,211.2 | — | — | — | — | **953.8** |
| money market only | 1,216.0 | — | — | — | — | **958.6** |
| `IconSpokeService` alone | 618.0 | 471.6 | 567.4 | 618.0 | 618.0 | 421.6 |
| `StellarSpokeService` alone | 382.4 | 382.4 | 332.3 | 382.4 | 382.4 | 332.3 |
| `SolanaSpokeService` alone | 467.1 | 467.1 | 416.3 | 407.3 | 407.3 | 356.8 |

**Replacement sizes.** [verified for size only] Method: `wf-finish-deps/scripts/size.mjs`, same esbuild settings.
- **ICON:** `wf-finish-deps/proto/icon-rpc.mjs`, 52 non-blank, non-comment lines (`grep -cv '^\s*\(//.*\)\?$'`). It holds an `IconRpcClient` (`icx_call`, `icx_getBalance` as `bigint`, `icx_getTransactionResult` mapped to numbers and `bigint` steps, `icx_sendTransaction`, JSON-RPC and HTTP errors as a typed error), `buildIcxCallTransaction`, the v3 serializer and an `rlp` hex helper without `Buffer`. **1.0 KB gzip** with viem and rlp external (both are already in the sdk graph); 2.4 KB with rlp bundled. It is a size probe: the builder and serializer are copied from the first-pass probe (`feas-deps/icon-probe/probe.cjs`, 2,000 cases equal to icon-sdk-js), but this file was not run against icon-sdk-js or a node.
- **Solana:** `wf-finish-deps/proto/solana-ix.mjs`, 21 lines: the two hand Borsh encoders from the first-pass probe (600 instructions equal to Anchor), rewritten without `Buffer`. **0.7 KB gzip** with `@solana/web3.js` external.
- **Stellar `/minimal`:** no new code.

**What the bundle numbers show:** [derived]
- **ICON:** −145.1 KB on `new Sodax()`; net about **−144 KB** after the 1.0 KB client.
- **Anchor:** −59.1 KB; net about **−58 KB** after the 0.7 KB encoders. Removing Anchor also drops 29 KB min of `@solana/web3.js` that only Anchor used (190K → 161K min).
- **Stellar `/minimal`:** −48.8 KB on `new Sodax()` and −50.1 KB on the Stellar entry.
- **All three:** −256.0 KB; net about **−254 KB** (−20%) on `new Sodax()`, and −257.4 KB on the swap-only and money-market-only entries.
- **What 2.x can ship:** Stellar `/minimal` plus −Anchor on `new Sodax()` is 1,151.5 KB, −109.9 KB, if the Anchor helpers move to their own module. [verified: `bundle2.mjs`, this pass] The ICON part needs the public `iconService` fields removed (see Change).
- **Per-chain entries are not isolated yet.** The ICON, Solana and Stellar entries each still carry about 1,011 KB min of Stellar and at least 54 KB min of `@solana/web3.js`, through `shared-utils.js`. Per-chain isolation needs sdk-1.
- **Re-run in verification:** as-is, −icon-sdk-js, `/minimal`, −Anchor and all three on `new Sodax()`, all identical.

**Node.** Stubbing icon-sdk-js lowers RSS by about 7 MB. Anchor and `/minimal` show no measurable RSS change. [verified, noisy]

### Change

- **ICON:**
  - an `IconRpcClient` (call, balance as `bigint`, receipt mapped to the declared type, typed JSON-RPC errors);
  - a pure `buildIcxCallTransaction`;
  - `rlp` hex without `Buffer`;
  - `iconService` is a public field on all three classes (sdk `IconSpokeService.ts:34`, wallet-sdk-core `IconWalletProvider.ts:46`, wallet-sdk-react `IconXService.ts:42`), built eagerly from a static import (`IconSpokeService.ts:1`, `:43`). While the field stays, icon-sdk-js stays in the bundle, so the ICON bytes leave only when the fields go in 3.0. [derived from the code]
  - The wallet side follows: `IconXService` reads through the same client; `IconWalletProvider` sends through it. Private-key signing moves to `@noble` sha3-256 + secp256k1 (proven equal in the first pass) or stays on icon-sdk-js until wsc-1 or wsc-3.
- **Stellar:** the imports in 6 sdk files move to `/minimal`, together with the wallet-sdk-core and wallet-sdk-react Stellar imports, in the same release (see Today).
- **Solana:**
  - hand Borsh encoders, using the IDL fixtures as reference;
  - the 5 Anchor helpers move to their own module and are deprecated in 2.x, and removed in 3.0. Left in `utils.ts`, they keep Anchor in the bundle even when unused, because `@coral-xyz/anchor`'s `package.json` declares no `sideEffects`. An entry that uses only the other `utils.js` helpers is 166.5 KB gzip, against 102.3 KB with Anchor stubbed. In a synthetic package with the helpers in their own module, Anchor drops out (94.8 vs 127.7 KB). [verified: esbuild 0.25.12, this pass, `out/anchor-*.md`; webpack is judgement]

### Feasibility — Feasible with caveats · Proven for sizes and the first-pass encoding scope; Code-traced for ICON RPC and receipts

**Probe scope, restated.**
- **Run in this pass:** bundle sizes for every variant above, and the size of each replacement.
- **First-pass probes, not re-run:** ICON raw tx, serialization hash and signature over 2,000 cases, plus 500 address cases; Solana instruction data and account metas over 600 cases, against the live IDLs.
- **Not covered:**
  - ICON JSON-RPC calls, receipt mapping, pending, retry and error semantics;
  - full Solana v0 transaction assembly, serialization and execution, and invalid input.

**Tests needed before shipping** (traced from the code above):
- **ICON:**
  - mocked-fetch tests for a bare-hex `icx_call`, the object form of `tryAggregate`, and hex→bigint balances;
  - receipt mapping: numbers, bigint steps, prefixes;
  - every class of thrown error. Today they all retry; decide whether to keep that;
  - the timeout path;
  - golden raw tx with injected time;
  - a read-only mainnet smoke test.
- **Solana:**
  - full v0 tx equality for `raw: true` across native, SPL and Token-2022 deposits and `sendMessage`;
  - `simulateTransaction` on mainnet;
  - oversized and invalid amounts.
- **Stellar:**
  - type-check under node10 resolution (the backend);
  - sponsoring and Soroban smoke tests;
  - the declaration source of `Horizon.Server`.

### Complexity — C3

**PRs:** [judgement for LOC; file sizes verified with `wc -l`]
1. **ICON in the sdk.** Client, builder and receipt mapping (~150 LOC, prototype 52 lines). `IconSpokeService.ts` (309 lines) changes internally. `IconSpokeService.test.ts` (626 lines) spies on `iconService.call` and `getTransactionResult`, so its mocks move to the fetch boundary.
2. **ICON in the wallets.** `IconXService` (121 lines, reads only) and `IconWalletProvider` (278 lines; send, sign, wait), with `IconWalletProvider.test.ts` (301 lines). About 150 LOC plus tests.
3. **Stellar `/minimal`.** Mechanical: 6 sdk files plus the wallet-sdk-core and wallet-sdk-react Stellar imports, in one release, plus the node10 type check.
4. **Solana encoders.** About 25 LOC of encoders, full v0 tx goldens, and the 5 Anchor helpers moved to their own module and deprecated.
5. **3.0 removals.** The public `iconService` fields in 3 packages and the Anchor helpers. No known consumer uses them (see Today).

**Total:** 4–5 PRs across sdk, wallet-sdk-core and wallet-sdk-react, about 600–900 LOC including tests.

**Why not C4:** the 3.0 break needs no consumer migration that we know of, and each chain is independent.

**Top risks:**
1. ICON deposit and Solana deposit build fund-moving transactions. The first-pass probes show byte equality, but the shipped code needs its own goldens.
2. ICON error semantics: today any throw during polling means "pending". The new client must decide what to retry.
3. Stellar types under node10 resolution for the backend.
4. Shipping Stellar `/minimal` in the sdk without the wallet packages: about +222 KB for apps that load both.

**Fund-moving path.** [judgement] C3 assumes the ICON and Solana goldens land before the swaps; without them the rubric's C5 clause (risk on paths that move funds) would apply.

### Benefit — B3 (about B4 for apps on ICON, Solana and Stellar once the 3.0 removals land)

**Why B3:** every sdk browser entry measured (`new Sodax()`, swap only, money market only) would shrink by about 254–257 KB gzip net of the replacements, but only about 110 KB of that can ship in 2.x (Stellar `/minimal` and Anchor). The ICON 145 KB needs the public `iconService` fields removed. That is 3.0, the same release as sdk-1, after which EVM-only apps no longer load ICON at all. [derived from the bundle table and the Change section]

**Where it reaches B4:** after sdk-1 the win reaches only multi-chain users, per chain: ICON −144 KB, Solana −58 KB, Stellar −49 KB. An app on all three, such as sodax-frontend or intents-whitelabel, gets about −250 KB once the wallet packages drop the same libraries. [derived from the `new Sodax()` deltas; that they carry over to those apps is judgement]

**By persona:**
- **P1:** about −110 KB gzip in 2.x through the sdk alone. The ICON 145 KB comes in 3.0, when sdk-1 already removes ICON from EVM-only apps. Nothing after sdk-1.
- **P2:** the same sdk win. For ICON, the browser bundle only loses icon-sdk-js once `IconXService` drops it too (PR 2, and the 3.0 field removal). Stellar `/minimal` helps only if the wallet packages move in the same release. Whether wallet-sdk-react's root tree-shakes icon-sdk-js away for apps that don't use ICON was not measured.
- **P3:** −43 MB (ICON) and −6 MB (Anchor) per install, because the backend depends on the sdk only; −7 MB RSS. 0 unique advisories go.
- **P4, P6:** nothing.
- **P5:** typed ICON receipts (the BigNumber-as-`bigint` cast goes); 2 fewer RPC round trips per Solana deposit and 1 per `sendMessage`, and no failure mode from IDL fetches.

### Recommendation

**Timing.**
- **2.x:** the ICON client used internally in sdk and wallets, Stellar `/minimal` in all three packages, the Solana encoders, the Anchor helpers moved to their own module, and deprecation of `iconService` and the Anchor helpers. None of these changes a public type.
- **3.0:** remove the `iconService` fields and the Anchor helpers.
- Do the 2.x part before sdk-1 if possible. Then 2.x users get about 110 KB; the ICON 145 KB arrives with the 3.0 removal.

**Wording:** "Lighter chain libraries: ICON reads and tx building over JSON-RPC with typed receipts, Stellar /minimal, and Solana instructions without Anchor or runtime IDL fetching"

### Corrections to earlier research

- **e-519.** icon-sdk-js also stays in sodax-frontend's own `package.json` (unused) and in wallet-sdk-react. Dropping it from the sdk alone helps P3's install. For bundles it helps every browser entry, because every entry loads `IconSpokeService` today, but the bytes leave only when the public `iconService` field goes, which is 3.0.
- **measurements.md "ICON … 7 advisories" (installed alone).** In the full sdk install, removing it drops 5 flagged packages and 0 unique advisories. Anchor drops 1 and 0.
- **Per-chain framing.** "Stellar /minimal helps Stellar users" understates it today: `shared-utils.js` imports Stellar and Solana into every entry, so `/minimal` saves about 49 KB gzip for everyone until sdk-1. That holds only if wallet-sdk-core and wallet-sdk-react move to `/minimal` in the same release; otherwise apps that load both get two prebuilt Stellar bundles (+222 KB).
- **This report's earlier "2.x users get the 254 KB".** About 110 KB can ship in 2.x; see Benefit.
- **bn.js.** Removing it from the sdk saves no bytes and no install; other dependencies keep it.

---

## sdk-7 · Browser entries without Node polyfills

**Bullet:** "Make browser entry points work without app-configured Node Buffer or crypto polyfills"  ·  **T-ids:** T15.1, T15.2, T15.3

### Today

**Probe.** `scratch/deep-deps/scripts/globals-probe.mjs`, run on the t2probe build.
- **Step 1:** bundle each entry with Node builtins left external, and record which builtins it imports.
- **Step 2:** bundle with builtins emptied, evaluate in a `vm` that has no `Buffer`, `process`, `global` or `setImmediate`, and add globals one at a time as errors appear.
- **Scope:** import plus one construction call, not full flows.
- **Worst case for `buffer`:** both steps treat `buffer` as a Node builtin, even where the importer depends on the npm `buffer` package and a bundler would resolve it without fallbacks: `@solana/web3.js` (6.0.3), `@solana/buffer-layout` (~6.0.3), `rpc-websockets` (^6.0.3). `safe-buffer` and bn.js have no such dependency. [verified: their `package.json` in the npm install; how each bundler resolves them is judgement]

Results are in `deep-deps/out/globals-probe.md`; the last three rows come from `wf-finish-deps/scripts/globals-probe2.mjs` (`out/globals-probe2.md`), which uses stubs that expose every name the sdk and types dists import. [verified]

| Entry | Builtins imported | Runtime without Node globals |
| --- | --- | --- |
| sdk `new Sodax()` | buffer, crypto, util | throws (`Buffer.alloc`) |
| sdk `new Sodax()`, non-EVM stubbed (sdk-1 sim) | **buffer only** (from PancakeSwap's swap-sdk-core) | throws (`vch.fill`) |
| sdk `import { SodaxError }` (T2 ESM) | buffer, crypto, util still in the graph | **runs** |
| wallet-sdk-core `import *`, and `EvmWalletProvider` alone | buffer, crypto, events, stream, string_decoder, util | throws (flat bundle) |
| wallet-sdk-react `import *` | buffer, crypto, events, fs, stream, string_decoder, util | needs DOM `HTMLElement`; inconclusive |
| `wallet-sdk-react/xchains/evm` | none | **runs** |
| dapp-kit `import *` | buffer, crypto, util | throws (`Buffer.alloc`) |
| sdk `new Sodax()`, non-EVM stubbed, PancakeSwap aliased to the sdk-4 prototype | **none** | **runs** |
| same, then `SpokeService.encodeTransfer(…)` (an EVM core helper) | none | runs only after adding **`Buffer`** |
| swaps-api `SwapsApi` (resolved from `packages/sdk`) | none | **runs** |

- The importer trace shows that in the EVM-only graph `buffer` comes from bn.js, safe-buffer, `@solana/buffer-layout`, rpc-websockets and `@solana/web3.js`, all reached through swap-sdk-core.

**Global `Buffer` in our own source.** These are not imports, so the import graph does not show them. [verified: `git grep -c "\bBuffer\b" -- 'packages/<pkg>/src/**/*.ts' ':!*.test.ts'`, counts lines]
- **sdk:** 49 lines in 13 files.
  - On the EVM core path: `SpokeService.ts:600` (static `encodeTransfer`, called by `simulateDeposit` at `:612`, which every simulated spoke deposit runs, EVM included: `:721-722`) and `swap/selectSolvedIntentPacket.ts:13,16` (swap status).
  - The 8 lines in `shared-utils.ts:161-252` (address encode and decode) are all in non-EVM branches; `:161` is a comment. The other 38 lines are in 10 chain-specific files. So 3 of the 49 lines are on the EVM path.
  - The plan already splits this: T15.1 is `selectSolvedIntentPacket`; T15.3 is `SpokeService` and the codec paths, after the chain move (`plan-v3-subissues.md:51,105`).
- **wallet-sdk-core:** 7 lines in 3 files (Bitcoin, Injective, Solana providers). **wallet-sdk-react:** 7 lines in 5 files.

**Where `crypto` comes from.** [verified: `wf-finish-deps/scripts/builtins.mjs`, importer attribution]
- **sdk `new Sodax()`:** the only importer is `@sodax/libs`' `dist/chunk-LGBAM5XX.mjs:4` (`import * as nodeCrypto from 'crypto'`). It is a bundled copy of noble-secp256k1 v1. It stores the module at `:2757` and uses `crypto2.node` for `randomBytes`, `createHash` and `createHmac` at `:2789-2823`, when `self.crypto` is missing.
- **The chunk is Stacks code.** It bundles c32check, `@stacks/common` and `@stacks/network`, and the sdk reaches it through `@sodax/libs/stacks/core`, which `shared-utils.ts:28` imports into every entry. So sdk-1 also takes it out of the EVM-only graph; the libs browser build matters for 2.x and for Stacks users. [verified: the chunk's module headers, `shared-utils.ts:28`]
- **In Node, `self` is undefined** (`node -e "typeof self"` on Node 22.15.0), so P3 takes the Node branch. A plain stub of `crypto` would break Node callers. The fix is a browser build or export condition for libs.
- **`packages/libs/tsup.config.ts:98-110`** externalizes every Node builtin, including `crypto`.
- **wallet-sdk-core `import *`:** `crypto` also comes through `brorand` ← `elliptic` ← `secp256k1@5` (imported directly at `BTCWalletProvider.ts:7`, used at `:157`) and `bip322-js@3` (`helpers/Key.js`, `helpers/BIP137.js`).

**Next.js and Turbopack.** [verified in Next 16.3.8 `dist/build/webpack-config.js`, t2probe]
- **Webpack client builds get automatic fallbacks:** `buffer`, `crypto` (compiled crypto-browserify), `stream`, `util`, `events`, `process` and others (`:1510-1560`). Setting `experimental.fallbackNodePolyfills: false` turns them off (`:1513`).
- **`ProvidePlugin` injects `Buffer` and `process`** into client bundles (`:1664-1675`).
- **sodax-frontend:** Next 15.5.24, `next build` without `--turbopack`, so it builds with webpack. That Next 15.5 has the same block is [judgement]: it has existed since webpack 5 support, but 15.5 was not read.
- **intents-whitelabel:** Next 16.2.1 with `next build`. Its `next.config.ts:19` reads "Prevent Turbopack from bundling @sodax/sdk", so it builds with Turbopack [verified: the comment]. That Turbopack provides the same shims is [judgement]. Turbopack's resolver is native code and was not read.
- **So the real consumers pay for the polyfills in bytes, not in config.** [verified for sodax-frontend's webpack build config; judgement for Turbopack]

**Shim bytes.** Method: `wf-finish-deps/scripts/shims.mjs`, esbuild 0.25.12, minified ESM, gzip, packages from the t2probe pnpm store. Results: `out/shim-bytes.md`. [verified]

| Shim | KB gzip | KB min |
| --- | --: | --: |
| `buffer@6.0.3` | 8.5 | 27.7 |
| `process@0.11.10` (browser.js) | 1.0 | 2.2 |
| `buffer` + `process` | 9.1 | 29.4 |
| `crypto-browserify@3.12.1`, with the stream, events, util, string_decoder and buffer shims it needs | 142.9 | 466.2 |
| stream + events + util + string_decoder, without crypto | 32.1 | 107.0 |

**What the shims cost inside today's sdk.** Method: `bundle2.mjs` on `new Sodax()` with `KEEP_BUILTINS=1` and every builtin aliased to its npm shim, as Next's webpack fallback does. Results: `out/polyfill-cost.md`. [verified for npm shims; that Next's compiled copies are the same size is judgement]

| Variant | KB gzip |
| --- | --: |
| builtins external (no shims) | 1,261.4 |
| builtins → npm shims | 1,407.3 |
| shims, but `crypto` stubbed | 1,270.0 |
| EVM-only sim + vendored PancakeSwap, builtins external (`cosmjs-types` not stubbed; 306.1 with it stubbed, as in the sdk-4 table) | 314.5 (none imported) |

- **Shims add 145.9 KB gzip to today's `new Sodax()`** [derived: 1,407.3 − 1,261.4]. crypto-browserify is about 137.3 KB of that (1,407.3 − 1,270.0); `buffer`, `util` and `process` about 8.6 KB. A re-run in verification with the shim set from `shims.mjs` gave 1,408.6 and 1,270.0 (+147.2, 138.6 of it crypto-browserify); shim bytes re-ran identical.
- **The 137 KB crypto-browserify share depends on one import in `@sodax/libs`** in the sdk graph. In wallet-sdk-core it also needs `secp256k1@5` and `bip322-js@3` to go.

**Consumer configs.** [verified]
- **sodax-frontend@1b915ec7:** `apps/web/next.config.js` has no polyfill config. Its `webpack` fallback covers only `crypto-js` internals.
- **intents-whitelabel@5e1fbba:** `next.config.ts` has no polyfill config. It sets `serverExternalPackages: ['@sodax/sdk']` because of "native bigint bindings". [judgement: matches bigint-buffer's fallback warning, which our probes printed]
- **`apps/example-next-js-16`:** no polyfill config.
- **All 5 in-repo Vite apps** (demo, wallet-modal-example, playground, stellar-sponsor-example, swap-api-example) use `@bangjelkoski/vite-plugin-node-polyfills ^0.0.2` with `protocolImports`. They also carry `define` for `global`, `process.env` and `process.version`, plus a `buffer` alias and `optimizeDeps` in 3 of them.
  - That is 5–11 polyfill-related lines each (`grep -ciE 'polyfill|buffer|process|global' apps/*/vite.config.ts`) and a direct `buffer ^6.0.3` dependency in 3 (demo, playground, wallet-modal-example).
  - All 5 depend on wallet-sdk-react.

**Bitcoin: usage sites.** [verified: `git grep -ln "from 'bitcoinjs-lib'\|from 'ecpair'\|from 'bip322-js'\|from '@bitcoinerlab/secp256k1'" -- packages apps`]
- **4 package files**, plus `apps/node/src/bitcoin-radfi.ts` (dead code):
  - `sdk/src/shared/entities/btc/btc-utils.ts`: `address.fromBech32` / `fromBase58Check` (`:2`, `:95-110`); `Buffer` for hex→base64 (`:132`, `:142`).
  - `sdk/src/shared/services/spoke/BitcoinSpokeService.ts` (793 lines): `initEccLib` (`:48`); `Psbt` construction in `buildBitcoinTransaction` (`:283-412`) and `buildDepositPsbt` (`:565-616`); finalize and extract in `signAndBroadcastTransaction` (`:720-745`).
  - `wallet-sdk-core/src/wallet-providers/bitcoin/BTCWalletProvider.ts` (222 lines): `ECPairFactory` (`:20`), `Psbt.fromBase64` and `signAllInputs` with a TapTweak-tweaked key for P2TR (`:121-127`), `bip322.Signer.sign` (`:170`), `payments.*` (`:177-207`).
  - `wallet-sdk-core/src/wallet-providers/bitcoin/types.ts`: the `ECPairInterface` type.
- **Radfi/Bound flows:** the trading-wallet deposit gets its PSBT from Bound (`radfi.createWithdrawTransaction`), the wallet signs it with `finalize=false`, and `normalizePsbtToBase64` converts it. The user-wallet deposit builds its own PSBT through `buildDepositPsbt`.

**Bitcoin: what v7 changes for those sites.** [verified: `.d.ts` diff of `deep-deps/npm/btc6-alone` (bitcoinjs-lib 6.1.8, ecpair 2.1.0, bip322-js 3.0.0) against `btc7-alone` (7.0.2, 3.0.2, 4.0.0)]
- **Output and `witnessUtxo` values go from `number` to `bigint`.** That hits 6 sites in `BitcoinSpokeService.ts`: `:319`, `:338`, `:348` (inputs) and `:376`, `:406`, `:610` (outputs). Count: `grep -cE "value: (utxo\.value|output\.value|change|0),?$"` = 6. UTXO amounts stay `number` from Esplora, so they convert at these points.
- **Public method types change:** `buildBitcoinTransaction(outputs: {value: number}[])` (`:285`) and the `Psbt` return types (`:291`, `:573`).
- **Bytes become `Uint8Array`,** so `.toString('hex')` breaks at `BitcoinSpokeService.ts:151`, `BTCWalletProvider.ts:99` and `:101`. TypeScript flags all three: TS2554 "Expected 0 arguments", checked with tsc 5.5.4 on a 3-line sample. Inputs we pass as `Buffer` still type-check, because `Buffer` extends `Uint8Array`.
- **ecpair 3** keeps `fromPrivateKey`, `tweak`, `toWIF` and `publicKey`, now as `Uint8Array`. **bip322-js 4** keeps `Signer.sign(privateKey: string, address, message)`.
- **All three v7 packages ship CJS:** bitcoinjs-lib 7 and ecpair 3 through `exports.require`, bip322-js 4 through `main` (no `exports` map). `require` of each works in Node 22, so P3 is unaffected.
- **Cooldown:** 7.0.3, 7.0.4 and 6.1.9 were published 2026-10-13, inside the repo's 14-day cooldown (`minimumReleaseAge: 20160`, `pnpm-workspace.yaml:7`); 7.0.2 (2026-09-07), ecpair 3.0.2 (2026-08-28) and bip322-js 4.0.0 (2026-08-21) are usable. [verified: `npm view <pkg> time`]

**Bitcoin: equivalence probe.** `wf-finish-deps/scripts/btc-equiv.cjs` mirrors `buildBitcoinTransaction`'s input branches (P2TR with `tapInternalKey`, P2SH-P2WPKH with `redeemScript`, P2WPKH, P2PKH with `nonWitnessUtxo`). It adds a recipient output, a change output and the `OP_RETURN OP_12 0x31…` output, then signs as `BTCWalletProvider.doSignTransaction` does, with `finalize` on in 6 of 8 cases. It also signs BIP322. It runs the same seeded inputs through v6 and v7. Scope: library behaviour on our call shapes, not SODAX's code itself; v6 here is 6.1.8, while the lockfile resolves 6.1.7. Result (`out/btc-equiv.txt`, re-run identical in verification): [verified]
- 2,000 cases, 500 per address type, 0 errors.
- Addresses: 0 differences. Unsigned PSBT base64: 0 differences.
- ECDSA-signed tx hex or signed PSBT (P2WPKH, P2SH-P2WPKH, P2PKH): 0 differences in 1,500.
- P2TR: Schnorr signatures use fresh randomness, so the 500 cases were cross-checked instead. The probe's `finalize` pattern (`i % 8 < 6`) finalizes every P2TR case, so the original check was only that v6 parses each v7 transaction with one 64-byte witness. Verification added a BIP341 check (`wf-verify-deps/scripts/btc-equiv-p2tr.cjs`): all 500 v7 and 500 v6 key-path signatures verify against the sighash computed by either version (2,000 checks, 0 invalid). P2TR with `finalize: false` is not covered.
- BIP322: the 1,000 non-taproot signatures are identical. The 500 taproot ones differ, because signing is randomized in both versions (`scripts/bip-det.cjs`: the same key and message, signed twice, differ in v6 and in v7). All 1,500 cross-verify in both directions.

**Bitcoin: tests today.** [verified: `git grep` in `*.test.ts`]
- **No test builds or signs a real PSBT.**
- `BitcoinSpokeService.test.ts` (984 lines, 54 cases) leaves bitcoinjs unmocked, but:
  - its deposit cases use a fake Bound PSBT (`'cHNidA=='`, `:672-674`);
  - it stubs `buildDepositPsbt` (`:841`, `:879`);
  - nothing calls `buildBitcoinTransaction` or `signAndBroadcastTransaction` for real.
- `BTCWalletProvider.test.ts` mocks bitcoinjs-lib, ecpair and bip322-js (`:15`, `:33`, `:44`).
- `RadfiProvider.test.ts` (25 cases) tests HTTP handling only.

**Bitcoin: bytes and globals.** Methods: `scripts/builtins.mjs` and `scripts/btc-noglobals.mjs` (a PSBT sign, finalize and extract, plus BIP322 signs, in a `vm` without `Buffer` or `process` and with builtins emptied). Results: `out/btc-bundles.md`. [verified]

| Set | KB gzip | Builtins imported | Runs without Node globals |
| --- | --: | --- | --- |
| v6: bitcoinjs-lib + ecpair + bip322-js + @bitcoinerlab/secp256k1 | 155.3 | buffer, stream, string_decoder, crypto, events, util | throws (`reading 'alloc'`) |
| v7: same four | 162.7 | none | throws `Buffer is not defined`, from bip322-js 4 (9 `Buffer.` lines in `dist/BIP322.js` and `dist/Verifier.js`) |
| v7: bitcoinjs-lib + ecpair only | — | none | **runs** |
| sdk side (bitcoinjs-lib + @bitcoinerlab/secp256k1): v6 → v7 | 65.6 → 64.5 | buffer → none | — |
| `secp256k1@5` (wallet-sdk-core `signEcdsaMessage`) | 50.4 | crypto, buffer | — |

**Bitcoin installs.** [verified]
- bitcoinjs-lib ^6 + ecpair ^2 + bip322-js ^3 + secp256k1: 23 MB, 88 packages, 4 low-severity flagged packages.
- bitcoinjs-lib 7.0.2 + ecpair 3.0.2 + bip322-js 4.0.0: 20 MB, 21 packages, 0.
- `npm audit` flags none of bitcoinjs-lib, ecpair or bip322-js in either set; the v6 set's one advisory is elliptic's GHSA-848j-6mx2-7j84 (low). [verified: the two `audit.json` files]

### Change

- **sdk core EVM path:**
  - It imports no builtins after sdk-1 + sdk-4.
  - It needs no runtime globals once T15.1 and T15.3 replace the 3 global-`Buffer` lines on the EVM path; the other 46 move with their chains or codec branches.
  - T15.2 then forbids `Buffer` in the core, and x-4 adds a no-`Buffer` smoke test.
- **`@sodax/libs`:** add a `browser` build or export condition that maps `crypto` to an empty module, and keep the Node build as it is.
- **wallet-sdk-core:** needs unbundled or per-chain entries before even its EVM provider stops needing `Buffer`. The Bitcoin provider would also need `secp256k1@5` replaced with `@noble/curves` (already in the tree through viem) and bip322-js 4.
- **Bitcoin (with its chain package):** bitcoinjs-lib 7 + ecpair 3 + bip322-js 4. That means `bigint` values at 6 sites, 3 hex conversions, 2 public signatures, and golden PSBT tests first. bip322-js 4 still needs global `Buffer`, so the private-key BIP322 path keeps that requirement.
- **Other non-EVM chains:** they keep third-party `Buffer` needs unless their libraries move (web3.js v1 → kit, …).

### Feasibility — Needs a decision · Proven for EVM-only core construction; Code-traced for the rest

**Decision: which entry points are covered.**
- **Core plus EVM:** reachable. The probe shows `new Sodax()` running with no Node globals after sdk-1 + sdk-4. Our own `Buffer` calls (T15.1, T15.3) are the remaining work, and `SpokeService.encodeTransfer` shows them failing today.
- **Every chain and wallet-sdk-react root:** not with the current libraries, as far as probed. bip322-js 4 throws without a global `Buffer` and `@solana/web3.js` v1 imports `buffer` [verified]; the other chain libraries were not probed one by one [judgement].
- **Also:** "app-configured" does not describe the real consumers. Next.js injects the polyfills itself (see Today). For them the gain is bytes; for Vite users it is config.

### Complexity — C3

**Recommended scope, core + EVM:** [judgement for LOC]
1. **T15.1:** `selectSolvedIntentPacket` (2 lines), 2.x.
2. **libs browser build:** a second tsup target or an export condition for `crypto`, plus a check that Node keeps the Node branch. About 50 LOC, 2.x.
3. **T15.3:** the remaining global `Buffer` in `SpokeService` and the codec paths. 49 sdk lines today; 46 are in chain files or non-EVM codec branches that move with sdk-1, so do it after T1.4.
4. **T15.2 + x-4:** a CI rule and a no-globals smoke test, built from `globals-probe2.mjs`.

**Dependencies:** sdk-1 and sdk-4 must land first.

**Bitcoin track, if included: a further C3 on a fund-moving path.**
- First add golden PSBT tests, built and signed, because none exist today.
- Then bump to v7: 6 `bigint` sites, 3 hex conversions, `secp256k1@5` → noble, and the 2 public signatures. Those signatures change in 3.0. No consumer repo and no in-repo caller outside `BitcoinSpokeService.ts` calls `buildBitcoinTransaction` or `buildDepositPsbt` (`git grep`), so no known migration.
- The probe shows the libraries agree on our call shapes. The risk is in our conversions, and tsc catches the type-level ones.
- [judgement] It stays C3 because step 1 adds golden PSBT tests first. Bumping without them would put an untested change on a fund-moving path, which the rubric rates C5.

### Benefit — B3

**Why B3:** a measured gain above 50 KB gzip for sdk and dapp-kit apps, and it removes a class of runtime failures for bundlers without polyfills. Both known browser consumers also load wallet-sdk-core, so for them the 137 KB also needs the Bitcoin provider change (below). [derived]
- **Next.js webpack consumers (P1, P2):** today's `new Sodax()` carries about 146 KB gzip of shims (npm shims in esbuild, standing in for Next's compiled copies). About 137 KB is crypto-browserify, which the sdk graph pulls in only through libs' `crypto` import. So for sdk + dapp-kit users the libs fix alone removes it (dapp-kit's only `@sodax` dependency is the sdk).
  - P2 apps that load wallet-sdk-core keep crypto-browserify until `secp256k1@5` and `bip322-js@3` go. That includes both known browser consumers: sodax-frontend depends on wallet-sdk-react, which depends on wallet-sdk-core, and intents-whitelabel depends on both. [verified: their `package.json`]
  - After sdk-1 + sdk-4, the EVM-only graph imports no builtins. The remaining byte gain is the `buffer` + `process` shims, 9 KB.
- **Vite users (the 5 in-repo apps, and any integrator):** drop one plugin, 5–11 config lines and a `buffer` dependency. And no runtime `Buffer is not defined` on EVM helpers such as `encodeTransfer`.
- **P3, P4:** nothing (Node has the builtins; swaps-api already runs without them).
- **P5:** a CI rule keeps the core clean.
- **Bitcoin track:** −3 MB and −67 packages of install, −4 low-severity flagged packages, and the sdk-side bitcoinjs graph stops importing `buffer`. The bundle size barely changes (65.6 → 64.5 KB).

### Recommendation

**Timing.**
- **2.x:** T15.1, and the libs browser build for `crypto`.
- **3.0, with sdk-1 and sdk-4:** T15.3, T15.2 and the smoke test.
- **3.0, with the Bitcoin chain package:** bitcoinjs 7, after golden PSBT tests.

**Wording:** "Make the core and EVM browser entries need no Node builtins or globals (Buffer, process, global, crypto, stream); chain packages document what they still need"

### Corrections to earlier research

- **e-519 "first build break is our libs' `crypto` external".**
  - Under Next.js webpack it is not a break: Next maps `crypto` to crypto-browserify, which silently costs about 137 KB gzip (measured with esbuild and npm shims standing in for Next's compiled copies, as above; not a Next build).
  - In plain webpack 5 without fallbacks it would be a build error. [judgement]
  - The importer is a noble-secp256k1 v1 copy bundled into libs' Stacks code, and Node callers need its Node branch.
- **a T15 "polyfills come from chain libraries".** After sdk-1, PancakeSwap is the source of the builtin import. And our own source holds 49 lines of global `Buffer`, 3 of them on the EVM path.
- **This report's first pass**, "builtin-free after sdk-1 + sdk-4 + T15.1". It is import-free after sdk-1 + sdk-4. Being free of runtime globals also needs T15.3: `encodeTransfer` throws without `Buffer`.
- **"bitcoinjs 7 removes the Buffer need".** True for bitcoinjs-lib and ecpair. bip322-js 4 still uses the global `Buffer`.

---

## Dependencies between these bullets

- **sdk-4 ↔ sdk-1:** the main combined benefit (EVM-only −407 MB with npm, −127 MB counting each version once; −126 KB gzip). The keep-swap-sdk-core path undercuts sdk-1.
- **sdk-4 → sdk-7:** swap-sdk-core is the only `buffer` importer in the EVM-only graph.
- **sdk-4 ↔ sdk-6 and sdk-2:** `SonicSpokeService` puts PancakeSwap into every feature entry. Moving the `MintPosition` fragment frees the swap and money-market entries.
- **sdk-4 → x-1:** trim the Infinity type copy in `@sodax/types`.
- **sdk-4 → x-2:** use the size budgets to track it.
- **sdk-5 ↔ sdk-1:** the clients live in the chain packages. If sdk-5's 2.x part lands first, 2.x users get about 110 KB; the ICON 145 KB lands in 3.0 with sdk-1, so it reaches only ICON users. `shared-utils.js` pulls Stellar and Solana into every entry until sdk-1.
- **sdk-5 ↔ wallet-sdk-core and wallet-sdk-react:** Stellar `/minimal` must land in all three packages in one release (+222 KB for apps that load both otherwise).
- **sdk-5 ↔ wsc-1, wsc-3:** ICON private-key signing.
- **sdk-5 ↔ wsc-2:** receipt waits.
- **sdk-5 ↔ wsr-1:** `IconXService` reads through the same client.
- **sdk-5 ↔ sdk-3:** Stellar `/minimal` types under node10 resolution.
- **sdk-7 ↔ sdk-1, sdk-4 and sdk-2:** sdk-2 brings T2's lazy ECC init. T15.3 waits for the chain move.
- **sdk-7 ↔ wsc-1 and wsc-3:** wallet-sdk-core's flat bundle needs `Buffer` even for the EVM provider; its Bitcoin provider pulls `crypto` through `secp256k1@5` and `bip322-js@3`.
- **sdk-7 ↔ wsr-1:** `xchains/evm` is already clean.
- **sdk-7 ↔ x-4:** add the no-globals smoke test (`globals-probe2.mjs`) to the runtime matrix.

## Not verified

- **sdk-4:**
  - TypeScript inference with local ABI fragments;
  - nominal-type breakage for unknown external integrators;
  - on-chain execution, which the probe only proves equal to today's calldata;
  - Node timing, which is below noise on this machine;
  - a real pnpm install: the "each version once" sizes approximate pnpm's store from the npm installs.
- **sdk-5:**
  - the first-pass ICON and Solana probes were not re-run;
  - the ICON client prototype was measured for size only, not run against icon-sdk-js or a node;
  - ICON receipt mapping and error semantics against mainnet;
  - whether wallet-sdk-react's root import tree-shakes icon-sdk-js for apps that don't use ICON;
  - sizes are esbuild's; webpack and Turbopack output was not measured, including for the Stellar root + `/minimal` duplication;
  - the Anchor module split was tested on a synthetic package, not on the sdk;
  - that the wallet packages' Stellar code runs on `/minimal` (only the declarations were compared).
- **sdk-7:**
  - Turbopack's polyfill behaviour (native code), and Next 15.5's webpack config (16.3.8 was read);
  - Next's compiled shims were not measured; the npm shim sizes stand in for them;
  - the libs browser build was not built or run (hard rule: no pnpm build);
  - the Bitcoin probe mirrors our call shapes in a standalone script; SODAX's own Bitcoin code was not run on v7, because that needs a build;
  - P2TR signing with `finalize: false` (the probe always finalizes P2TR);
  - runtime checks cover import, construction and one helper call, not full flows;
  - the wallet-sdk-react `import *` result is inconclusive (needs a DOM).

## Resume notes

**Scratch roots** (session-scoped, may be gone):
- first pass: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-deps/`;
- this pass: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-deps/`;
- verification: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-deps/`.

**What is there:**
- `deep-deps/`:
  - `out/pcs-bundles.md`, `out/install-summary.md`, `out/globals-probe.md`, `out/req-times.txt`;
  - `npm/*` (sdk dependency variants, each with `audit.json`; `btc6-alone` and `btc7-alone` hold the Bitcoin sets) and `npm2/*` (EVM-core variants);
  - `proto/{cl-vendored,equiv,pcs-shim}.mjs`;
  - `scripts/{bundle2.mjs,who.mjs,installs.sh,inst-summary.py,audit-diff.py,req-stub.cjs,req-time.cjs,globals-probe.mjs,overlap.py}`;
  - `entries/{full,swap-only,dex-only,mm-only}.js`;
  - `dl/uniswap/*`.
- `wf-finish-deps/`:
  - `out/{sdk5-bundles,replacement-sizes,shim-bytes,polyfill-cost,btc-bundles,globals-probe2}.md`, `out/btc-equiv.txt`;
  - `proto/{icon-rpc,solana-ix}.mjs`;
  - `scripts/{size.mjs,builtins.mjs,shims.mjs,btc-equiv.cjs,bip-det.cjs,btc-noglobals.mjs,btc-noglobals-nobip.mjs,globals-probe2.mjs}`;
  - `entries/{full,icon,stellar,solana,wsc}.js`.
- `wf-verify-deps/`:
  - `out/{install-rerun,dedup-install,sdk5-rerun,evm-only,polyfill-rerun,shims-rerun,equiv-rerun,anchor-treeshake,anchor-split}.md|txt`, `out/btc-equiv-p2tr.txt`, `out/stellar-*.json`;
  - `scripts/{dedup-size.py,dedup-diff.py,ghsa.py,btc-equiv-p2tr.cjs,split-test.mjs}`, `entries/`, `synthetic/`.

**Tools:** esbuild was `sodax-sdks-t2probe/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild`. The `sodax-sdks-t2probe` and `sodax-sdks-v3feas` worktrees were removed during verification (about 19:20). After that, code was read with `git -C sodax-sdks show 0181a053:<path>`, and the synthetic test used esbuild 0.25.12 from `sodax-sdks/node_modules`, read-only.

**Done:**
- sdk-4 (all);
- sdk-5 bundle sizes, replacement sizes, the `IconXService` read and the C/B scores;
- sdk-7 shim bytes, Next config, the libs `crypto` trace, the bitcoinjs 6→7 audit and probe, the swaps-api case, the EVM-only + vendored run and the C/B scores.

**Still open** (none changes a score, except that a real pnpm install could move sdk-4's B):
- **sdk-4:** copy `proto/` and `equiv.mjs` into `DOSSIER/artifacts/` if they are still wanted. That needs the user's OK. Measure a pnpm install with and without PancakeSwap to confirm the ~70 MB.
- **sdk-5:** run `icon-rpc.mjs` against icon-sdk-js (serializer and raw tx) and a read-only mainnet node.
- **sdk-7:** measure a real Next 15.5 webpack build of an sdk-only page, with and without `fallbackNodePolyfills: false`. That needs an install the hard rules don't allow here.

## Verification (2026-10-19)

An adversarial pass over this report, after the finisher's pass. Code is `0181a053`, read in `sodax-sdks-v3feas` and, after that worktree was removed at about 19:20, with `git -C sodax-sdks show 0181a053:<path>`. Consumers: sodax-frontend@1b915ec7, intents-whitelabel@5e1fbba, sodax-backend@985959e9. Outputs: `wf-verify-deps/`.

**What was checked.**
- **Citations: 89 path:line citations or citation groups opened**, all at the stated commit or file: 19 behind sdk-4 (`ConcentratedLiquidityService.ts`, `EvmSolverService.ts`, `SonicSpokeService.ts:33`, the pins, the tests, `dex.ts`, pnpm's LICENSE copy, the frontend sites, the #534/#498 hunks), 38 behind sdk-5 (every `IconSpokeService.ts` line, `icon.ts`, `IconWalletProvider.ts`, `IconXService.ts`, the three `package.json`, `shared-utils`, the Solana helpers, the wallet Stellar imports) and 32 behind sdk-7 (`SpokeService.ts`, `selectSolvedIntentPacket.ts`, the libs chunk and tsup config, Next's webpack config, every Bitcoin source and test line, the consumer Next configs). All held. Four needed more precision: the Anchor helpers are also called at `SolanaSpokeService.ts:293`; `encodeTransfer` is reached from every simulated spoke deposit, not only bridge and DEX; `stepUsed` also appears in its type definition; the `shared-utils.ts` `Buffer` lines are all in non-EVM branches, not "mostly".
- **Numbers: 57 re-run and 28 re-derived by arithmetic.** Re-run: the install table (15 npm and 3 EVM-core variants: MB, packages, viem copies, flagged packages, unique GHSA ids, all identical), the GHSA differences (bn.js; the 6 with sdk-1; elliptic), 5 sdk-5 bundle variants and 4 sdk-4 EVM-only variants (identical), the polyfill cost (1,408.6 against 1,407.3; 1,270.0 identical), 6 shim sizes, the replacement sizes and line counts, the sdk-4 equivalence harness (209,111 cases, 0 failures), the Bitcoin equivalence probe (identical), the `Buffer` line counts, the Stellar import files, the frontend `toSignificant` sites, the bigint value sites, the types-copy overlap, test case and file line counts, and bip322-js's 9 `Buffer.` lines. Arithmetic: every delta and percentage in the sdk-4 and sdk-5 Benefit sections and the sdk-7 shim shares. The "+92 KB" had no visible basis; it is 394.5 − 302.7 (a column of `out/pcs-bundles.md` not in the table), and +88 KB against the vendored build.
- **New measurements:** install size counting each name@version once (`dedup-size.py`, `dedup-diff.py`); the Stellar root + `/minimal` pair; the 2.x subset of sdk-5 (`/minimal` + −Anchor); Anchor retention with the helpers unused, on the sdk dist and on a synthetic package; a BIP341 validity check of the P2TR signatures; npm publish dates of the Bitcoin packages; the package managers of the consumer repos.

**What changed, and why.**
- **sdk-4 Benefit B4 → B3 (B4 for npm-layout installs).** The 359 MB is an npm-layout number: npm nests viem 2.37.13 and ox 0.9.6 under each of six PancakeSwap packages (6 × 42.3 MB and 6 × 7.5 MB). All three consumer repos use pnpm, which stores each version once; counted that way the saving is about 70 MB, and the bundle gain is 96–99 KB. Both are B3-sized. The summary, table, install table (new column), personas, Recommendation, Dependencies and Corrections now give both numbers.
- **sdk-4 and sdk-7 timing:** removed "or 2.x with `!`" for the `Price`/`Token` change and the Bitcoin public signatures. A breaking change is not timed 2.x.
- **sdk-5 Benefit B4 (B3 after sdk-1) → B3 (about B4 for apps on ICON, Solana and Stellar after the 3.0 removals).** The report said 2.x users get 254 KB and that the 2.x changes alter no public type. These conflict: `iconService` is an eagerly built public field on three classes, so icon-sdk-js stays while the field keeps its current value, and removing or replacing the field is 3.0, the same release as sdk-1. The measured 2.x subset (`/minimal` + −Anchor) is 109.9 KB.
- **sdk-5 Stellar:** wallet-sdk-core and wallet-sdk-react import the Stellar root, which resolves to a different prebuilt file than `/minimal`. Both together measure +222.3 KB over the root alone, so `/minimal` must move in all three packages at once. Added to Today, Change, Complexity, risks, Benefit and Dependencies.
- **sdk-5 Anchor:** deprecating the helpers in place keeps most of Anchor in the bundle (166.5 vs 102.3 KB on a utils-only entry), because `@coral-xyz/anchor` declares no `sideEffects`. Moving them to their own module drops Anchor in a synthetic test (94.8 vs 127.7 KB). Added to Change, PRs and timing.
- **sdk-7 P2TR equivalence:** every P2TR case in the probe is finalized (`i % 8 < 6` for `i % 4 == 1`), so "validates the signatures of every unfinalized PSBT" covered no P2TR case; the original P2TR check was parse and witness shape only. The added BIP341 check verifies all 1,000 P2TR signatures (2,000 checks, 0 invalid). P2TR with `finalize: false` stays uncovered.
- **sdk-7 Complexity:** the Bitcoin track keeps C3 but now says C5 if bumped before golden PSBT tests exist, matching the rubric's fund-path clause; sdk-4 and sdk-5 got the same conditional note.
- **sdk-7 smaller fixes:** the table's "+146 KB in Next webpack builds" is an esbuild run with npm shims, so it now says so; 3 of the 49 `Buffer` lines are on the EVM path; the libs `crypto` chunk is Stacks code reached through `shared-utils.ts:28`; whitelabel's Turbopack build is now cited from its `next.config.ts:19` comment; the Vite count is 5–11 lines with the command given (was 5–13, no command); bip322-js 4 is CJS through `main`, not `exports.require`; "No GitHub advisories exist" became the scoped `npm audit` result; the `buffer` rows are a worst case where the importer depends on the npm `buffer` package; both known browser consumers load wallet-sdk-core, so the libs fix alone does not remove crypto-browserify for them.

**What remains judgement.**
- That pnpm's real install delta matches the each-version-once sum (about 70 MB).
- That webpack and Turbopack resolve the Stellar `browser` condition, and tree-shake the Anchor module split, the way esbuild does.
- That the sdk-5 deltas measured on `new Sodax()` carry over to sodax-frontend and intents-whitelabel (the "about B4" case).
- The C3 ratings on fund-moving paths, which rest on goldens landing first.
- That Next 15.5 has the same webpack fallback block as 16.3.8, and that Turbopack provides the same shims.

**Residual doubts.**
- No pnpm install was run, so sdk-4's B rests on an approximation; a real one could land between 56 and 359 MB, and the TypeScript peer npm added skews the EVM-only figure by 30 MB.
- Bundle numbers are for the t2probe dist, which differs from `0181a053` by the T2 probe (lazy ECC init in `BitcoinSpokeService.ts`, `package.json`, `tsup.config.ts`). Both worktrees were removed during this pass, so nothing after 19:20 could be re-run against that dist.
- Whether sodax-frontend's bundle actually contains wallet-sdk-react's Stellar and ICON code was not measured; the duplication and ICON claims for it are derived.
- The Bitcoin probe compares bitcoinjs-lib 6.1.8, while the lockfile resolves 6.1.7.
- For ICON, only the plain route was checked: the field is built eagerly from a static import. A stand-in object typed as `IconService` could keep the type without the library, but it would change what the field does at runtime, so it was treated as a breaking change.
- **Consistency fix (2026-10-20).** The ~137 KB crypto-browserify cost under Next is now labeled as an esbuild measurement with npm shims, which matches the Next.js webpack consumers bullet above. No score changes.

## Follow-up (2026-10-20): the libs `crypto` import

The user asked that the sdk-7 change keep `@sodax/libs` working. `@sodax/libs` exists to isolate
dependencies: it bundles Stacks and Injective with Turbopack workarounds and stubs.

- **Source of the import [verified, published `@sodax/libs@2.2.0` dist]:**
  - The only static `crypto` import is `import * as nodeCrypto from 'crypto'` in the chunk that both
    `stacks/core` and `stacks/connect` load.
  - It comes from the copy of `@noble/secp256k1` v1 bundled inside `@stacks/transactions`, as
    `crypto2 = { node: nodeCrypto, web: self.crypto }`.
  - `randomBytes`, `sha256` and `hmacSha256` all try `web` first.
  - The Injective path has no static import. Its `require("crypto")` calls are `__require`
    fallbacks inside try/catch, which prefer `globalThis.crypto`.
- **Probe [verified]:** `artifacts/feasibility-probes/libs-crypto/run.sh`.
  - It compares the Node build, which uses real Node crypto, with a browser build in which `crypto`
    is a shim that throws if called. The browser build ran with `self.crypto` set to WebCrypto.
  - All 9 outputs are byte-identical: address, public key, Clarity value round trip, signed contract
    call and its txid, unsigned call, and signed STX transfer. The shim was never called.
  - The browser bundle has 0 static `crypto` imports.
  - Scope: `stacks/core` only, with Node 22 standing in for a browser. `stacks/connect` `request()`
    and Injective were not run.
- **Refined change:**
  - In libs' browser build, alias `crypto` and `node:crypto` to a shim that throws a clear error,
    rather than to a bare empty module, which would be a truthy empty object.
  - Expose it through a `browser` export condition on each subpath.
  - Leave the Node build, which SSR and the backend use, unchanged.
  - Gate it in CI: the probe above, a 0-static-`crypto` check on the browser build, and the existing
    `check:no-duplicate-bundling`. Add a Next and a Vite consumer build via x-2.
  - Behavior changes only where a bundler picks `browser` but no Web Crypto exists. No known consumer
    is like that [judgement].
