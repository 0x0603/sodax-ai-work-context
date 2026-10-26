---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, packaging]
---

# Build and packaging — deep dive (feasibility, complexity, benefit)

Code is sodax-sdks `0181a053`. Bundles: esbuild 0.25.12, minify, ESM, es2022, browser, Node builtins external, gzip at the default level (same method as `measurements.md`). Published = the npm-packed `@sodax/*@2.2.0` tarballs. T2 = the `sodax-sdks-t2probe` dists (tsc per-file ESM). Consumers: sodax-frontend `1b915ec7`, intents-whitelabel `5e1fbba`, sodax-backend `985959e9`.

**Summary.**
1. sdk-2 works (probes), but both real apps build `new Sodax()` in client code, so on its own it barely changes their client JS: 1,295 → 1,262 KB gzip. A helper-only import drops from 825 KB to 0.6 KB.
2. sdk-3: `require()` of an ESM-only `@sodax/sdk` works for the backend's import set on Node 22.18. Making viem a peer removes duplicate viem in browser bundles (+102 KB gzip today) and a real TS2322 type conflict. On its own it removes only 1 of 8 installed viem copies, because the other 6 duplicates come from PancakeSwap's exact pin. Most of the combined install drop is sdk-4's own (sdk-4 alone: 756 → 398 MB, 8 → 2 copies).
3. sdk-6: the dual module graph (CJS root plus ESM subpath) is proven, and so is the fix (import-only subpaths in 2.x, or ESM-only). Swap-only saves 50 KB gzip and 12–25 ms on its own. With sdk-1+sdk-4 simulated it adds −54 KB gzip and −3 to −5 ms over the facade (302.7 → 248.4 KB; bundled Node 34 → 29 ms); the 1,261 → 303 KB and 216–233 → 34 ms drops are sdk-1+sdk-4's. It stays B2 because no current consumer skips the facade, not because the gain is under 50 KB.
4. x-1: for P4, 40.7 → 7.7 KB gzip per API client, but only when the split and `sideEffects: false` ship together. Each half alone gives ~0. Apps that build the facade save 74 KB once the API packages stop inlining types.
5. Costs: per-file ESM loads slower in Node (CJS → per-file require(esm): 733 → 897 ms, +164 ms; a re-run gave 665 → 808 ms, +143 ms). All 4 open chain PRs conflict with the types split.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| sdk-2 | Feasible · Proven (sdk; the other 3 packages Code-traced) | C3 | B2 alone · B4 as enabler [judgement] | 2.x | Per-file ESM tree-shakes (0.6 KB helper); facade apps −33 KB now and ≤ −28 KB on top of sdk-1+sdk-4; the frontend's direct imports minus `ClService` 864 → 38.5 KB once dk-1 drops the facade; Node load +31–92 ms |
| sdk-3 | Feasible with caveats · Proven | C4 | B3 (alone and on top of sdk-4) | 3.0 | require(esm) works for the backend; peers fix +102 KB duplicate viem and TS2322; install: −1 copy / −54 MB alone and on top of sdk-4 |
| sdk-6 | Feasible with caveats · Proven | C3 | B2 (alone and on top of sdk-1+sdk-4) | 2.x (import-only subpaths) | Dual graph proven for CJS root + subpath; swap-only −50 KB alone, −54 KB / −3 to −5 ms on top of sdk-1+sdk-4 (303 → 248 KB), but every current consumer builds the facade |
| x-1 | Feasible with caveats · Proven (simulation) | C3 | B3 | 2.x, after #534 | P4 40.7 → 7.7 KB per client; facade apps −74 KB; split + flag needed together; 4 chain PRs conflict |

---

## sdk-2 · Unbundled ESM, no import-time side effects
**Bullet:** "Publish unbundled ESM with no import-time side effects, so bundlers can remove unused code"  ·  **T-ids:** T2.1, T2.2, T2.3, T2.4

### Today
- **One flat file per format** [verified].
  - `packages/sdk/tsup.config.ts:4-7`: one entry, `format: ['esm','cjs']`, `splitting: false`.
  - `:14`: `noExternal: ['near-api-js', '@sodax/types']`.
  - The same tsup shape is used by wallet-sdk-core (`tsup.config.ts:14`), swaps-api and bridge-api (`:18`).
  - `@sodax/types` is already tsc per-file ESM, but it has **no `sideEffects` field** (its `package.json` has none; checked by dumping the manifest).
- **The facade references everything** [verified].
  - `Sodax.ts:1-19` imports every service. The constructor at `:46-134` builds all of them.
  - `SpokeService.ts:30-39` imports all 10 spoke services, and its constructor builds them (`:143-155`).
- **Global mutation at import** [verified, `scan-effects.cjs` re-run at 0181a053].
  - Hard top-level statements: sdk has 1 (`BitcoinSpokeService.ts:48` `initEccLib(ecc)`); wallet-sdk-core has 1 (`BTCWalletProvider.ts:19`, plus `ECPairFactory(ecc)` at `:20`).
  - Soft initializers: 144 in 29 sdk files.
  - types has one hard hit, `sponsoringApi.ts:63`, a no-op `true satisfies …`.
- **What the two apps import** [verified]. Method: a TS-AST scan of every file, with the client closure = files reachable from `'use client'` files (`scripts/extract-imports.cjs`).
  - **sodax-frontend `apps/web`:**
    - 125 files import `@sodax/sdk` or `@sodax/types`; 122 of them are in the client closure.
    - Value names from `@sodax/sdk` (14): `ChainKeys` (33 sites), `spokeChainConfig` (19), `dexPools`, `isLegacybnUSDToken`, `isNewbnUSDToken`, `bnUSDLegacySpokeChainIds`, `newbnUSDSpokeChainIds`, `ClService`, `getSupportedSolverTokens`, `supportedSpokeChains`, `moneyMarketSupportedTokens`, `EVM_CHAIN_KEYS`, `SodaTokens`, `LsodaTokens`.
    - Value names from `@sodax/types` (5): `tokenLogo`, `ChainKeys`, `isRealWorldAsset`, `LsodaTokens`, `SodaTokens`.
    - Plus 51 type-only names.
    - It does not import `Sodax` directly (scan above). It mounts `SodaxProvider` (`apps/web/providers/wallet-providers.tsx:4,10`), which runs `new Sodax(config)` (`dapp-kit/src/providers/SodaxProvider.tsx:24`).
  - **intents-whitelabel `src`:**
    - 32 files import them; 28 are in the client closure.
    - Value names: `ChainKeys` and `Sodax` from `@sodax/sdk`; `RelayChainIdMap` (client) and `getIntentRelayChainId` (server route) from `@sodax/types`.
    - `new Sodax(config)` runs in `src/lib/sodax.ts:12` and is shared by client components.
- **Bundles** [verified] (`scripts/bundle.mjs`, gzip KB):

  | Entry | Published 2.2.0 | T2 |
  | --- | --: | --: |
  | `SodaxError` only | 825.3 | 0.6 |
  | `getChainType` only | 825.4 | 34.3 |
  | `new Sodax()` | 1,255.7 | 1,261.4 |
  | frontend direct set (14 + 5 names) | 884.6 | 547.7 |
  | frontend direct set + `new Sodax()` (what the app ships) | 1,294.7 | 1,261.8 |
  | whitelabel client set (`ChainKeys`, `Sodax`, `RelayChainIdMap`) | 1,294.4 | 1,261.4 |
  | the same without `Sodax` | 863.3 | 37.6 |

- **Per-symbol cost in T2** [verified]. These show where the frontend's 547.7 KB comes from:
  - `ClService` alone is **547.0 KB**, with 7 chain or PancakeSwap libraries present. The frontend uses it only for `ClService.priceToTick` (`apps/web/app/(apps)/pool/_utils/index.ts:1,37`).
  - Every other frontend name costs 0.4–36 KB through `@sodax/sdk` (37.6 KB through `@sodax/types`), and those KB are the same `@sodax/types` block.
  - The 18 non-`ClService` names together, as one entry: **38.5 KB** gzip in T2 vs 864.2 KB published [verified, `wf-finish-packaging/entries/fe-direct-no-cl.mjs`, browser]. 37.3 KB with `@sodax/types` marked pure (`--types-pure`): the token data itself is used.
  - `ChainKeys` costs 0.4 KB through `@sodax/sdk` but 37.6 KB through `@sodax/types`. The sdk barrel has `sideEffects: false`; types has no flag.
- **Why `new Sodax()` goes 1,255.7 → 1,261.4 KB** [verified, per-package `bytesInOutput` diff].
  - Nothing becomes unreachable, because the facade builds every service and every spoke.
  - The +11.0 KB min (4,747.8 − 4,736.8) comes from code tsup inlined, which is now attributed to separate packages:
    - `@sodax/types` +150.2 KB min. It is external now, and with no `sideEffects` flag esbuild keeps all of it.
    - near-api-js +47.5, `@noble/curves` +32.3, `@noble/hashes` +11.8, borsh +10.5, `@scure/base` +4.5. When tsup's rollup pass inlined these, it tree-shook them more tightly.
    - Against that, "`@sodax/sdk` own" drops 246.5 KB, because those inlined copies were counted as sdk bytes.
  - The libraries retained in both builds: stellar-sdk 1,013 KB min, icon-sdk-js 450, injective proto 283, sui 194, viem 191, solana 190, swaps-api 129, bridge-api 126, libs 117, bitcoinjs 95, PancakeSwap v3 83 / infinity 54.
- **Lazy ECC does not change bundle size** [verified]. A copy of the T2 dist with `initEccLib(ecc)` put back at module scope still bundles `SodaxError` at 0.6 KB and `new Sodax()` at 1,261.4 KB, because per-file output plus `sideEffects: false` lets esbuild drop the module anyway.
- **Next.js** (from `artifacts/t2-probe/README.md`, not re-run). Client JS for a component that imports `SodaxError`:
  - Turbopack: 1,550 → 166 KB.
  - webpack: 1,253 → 260 KB.
- **`'use client'`** [verified: `rg -l` over src and the published dists].
  - The sdk and dapp-kit have none.
  - wallet-sdk-react has 1 in src and 0 in its 2.2.0 dist. That belongs to wsr, not here.

### Change
- **From** tsup flat ESM + CJS **to** tsc per-file ESM (`dist/` or `dist/esm/`) plus tsup CJS only (2.x), in sdk, wallet-sdk-core, swaps-api and bridge-api.
  - `exports.import` points at the per-file ESM.
  - Initialize ECC lazily (the T2 probe diff is 8 lines).
  - Mark the pure-helper definitions with `@__NO_SIDE_EFFECTS__`.
- **Client code does not change.** Deep imports into `dist/` are not public: `exports` exposes only `.` and `./package.json` (`packages/sdk/package.json:28-40`).

### Feasibility — Feasible · Proven (sdk) / Code-traced (wallet-sdk-core, swaps-api, bridge-api)
- **Proven** (`artifacts/t2-probe/README.md`):
  - build, `checkTs`, 2,998 tests, attw, Node ESM/CJS, `apps/node-cjs`, Next 16 Turbopack and webpack, all on the sdk.
  - Here: the bundle numbers above and the eager-ECC probe.
- **Only traced:** wallet-sdk-core, swaps-api and bridge-api follow the same template (research A T2.2). They were not built.
- **No blocker.** The React packages need their `@/` aliases converted first: dapp-kit 7 and wallet-sdk-react 192 (`rg -c "from ['\"]@/"`, summed). That belongs to dk-1/wsr-1.

### Complexity — C3
- **PR 1, T2.3:** lazy ECC in sdk + wallet-sdk-core, ~20 LOC.
- **PR 2, T2.1:** sdk `tsconfig.build.json`, tsup CJS-only, exports, re-baseline the tarball gate (`ci.yml:209`), ~40 LOC of config (`sdk.diff` is 3.2 KB).
- **PR 3, T2.2:** the same ×3, ~60 LOC.
- **PR 4, T2.4:** pure annotations, ~30 LOC.
- **Tests:** existing smokes (attw, node-cjs, Next 16 verify, Vite), plus a bundle scenario (x-2).
- **Not breaking.** Earlier estimate: 7 pts. This agrees: small LOC but package-wide, so C3.
- **Risks:**
  1. Node loads per-file ESM more slowly: `import` 806 → 876 ms (re-run: 764 → 803 ms; see sdk-3).
  2. Call-site annotations collide with #509/#512/#523 (`LeverageYieldService`) and #534/#498 (`EvmSolverService`). Do the helper definitions first.

### Benefit — B2 alone · B4 as enabler
- **P1/P2 (React dapps), standalone ≈ 0** [verified]. Both real apps construct the facade in client code, so their client JS goes from 1,294.7 to 1,261.8 KB (−32.9 KB, −2.5%).
  - Those 33 KB are one duplicate `@sodax/types` copy that disappears because tsc stops inlining it [derived: 1,294.7 − 1,255.7 = 39 KB ≈ the 37.6 KB types-root cost].
  - Pages or apps that import only helpers drop from 825 KB to 0.6–37 KB.
  - The frontend would keep paying 547 KB for `ClService` until `priceToTick` lives in a leaf module; without it the direct set is 38.5 KB [verified]. This only shows once the app stops building the facade (dk-1).
- **P3 (server): slightly worse** [verified, Node 22.18, medians of 11]. ESM `import` + `new Sodax()` takes 806 ms with the flat bundle and 876 ms per-file. RSS is about the same (243 / 245 MB). A re-run in the verification pass gave 764 / 803 ms and 241 / 245 MB, so the cost is +39 to +70 ms.
- **P4 (API-only):** no change. The API packages are still tsup bundles until T2.2; their size problem is x-1.
- **P5 (maintainers):** a smaller tarball once T10 lands. One build template for new packages.
- **P6 (AI agents):** none.
- **Combined:** with sdk-1+sdk-4 simulated by stubs (non-EVM chain libraries and PancakeSwap; bignumber.js kept, because `plan-v3-scope.md:208` drops its removal from v3), `new Sodax()` goes 1,261.4 → 302.7 KB gzip and swap-only to 248.4 KB [verified, browser, `wf-verify-packaging/scripts/run-bundles.sh`].
  - That drop is sdk-1+sdk-4's, not sdk-2's. The published flat bundle with the same stubs is 330.5 KB [verified, same script]. So sdk-2's own share on the facade is at most −28 KB [derived: 330.5 − 302.7; the flat bundle still inlines near-api-js, which an import stub does not reach, so the real share is smaller].
  - B4 therefore rests on the prerequisite role, not on a measured gain [judgement]. Research B T12.2 makes sdk-2 a hard dependency of sdk-6, and chains.md (line 187) makes it a dependency of sdk-1's 2.x chain subpaths.
  - Not evaluated: tsup multi-entry ESM with `splitting: true`, which wallet-sdk-react already uses to share class identity across entries (comment at `packages/wallet-sdk-react/tsup.config.ts:21-23`). If that route works for the sdk, the prerequisite role is weaker.
- **Cost of not doing it:** sdk-6 and sdk-1's 2.x subpaths lose their planned base; sdk-1+sdk-4's facade gain mostly does not depend on it (above). Helper-only users keep the 825 KB floor.

### Recommendation
2.x now: it is additive and proven, and sdk-6 and sdk-1's 2.x chain subpaths are planned on top of it (sdk-1+sdk-4's facade gain mostly is not; Benefit above). Keep the wording, and add "and `sideEffects: false` on `@sodax/types`". Without that flag, ESM output keeps a 34–38 KB types floor.

### Corrections to earlier research
- **First pass, "new Sodax() gains little (1,258 → 1,261)":** now explained (above). For the two real apps the right description is "limited while the facade references every chain": −33 KB, not 0.
- **First pass / README, "SodaxError 825 → 0.6 KB":** true, but it is not the integrator's case. The apps' actual direct-import set goes 884.6 → 547.7 KB, dominated by one name, `ClService`.
- **measurements.md "Why tree-shaking fails" item 1 (`initEccLib`):** it is a cause only for the flat bundle. With per-file output plus `sideEffects: false` it has no size effect (probe). Lazy init is a correctness and contract item.

## sdk-3 · ESM-only packages, peers with tested ranges
**Bullet:** "Publish ESM-only packages, with viem, wagmi and @tanstack/react-query as peers where used, using tested compatibility ranges"  ·  **T-ids:** T4.1, T4.2, T4.3

### Today
- **Pins publish as exact versions** [verified].
  - The catalog pins `@tanstack/react-query` 5.87.4, TS 5.5.4, viem 2.29.2 and wagmi 2.16.9 (`pnpm-workspace.yaml:36-39`).
  - The published `@sodax/sdk@2.2.0` `package.json` lists `"viem":"2.29.2"`, `"@stellar/stellar-sdk":"15.1.0"`, … as exact deps.
  - react-query is already a `5.x` peer in dapp-kit and wallet-sdk-react.
  - dapp-kit and wallet-sdk-react exports are `import`-only (manifest dump).
- **The backend is a CJS consumer** [verified].
  - `module: commonjs` and `moduleResolution: node` (`sodax-backend@985959e9:tsconfig.json:4,6`).
  - Apps have no `"type"` field and run `node dist/src/main` (`apps/swaps-api/package.json:14,20`).
  - `packages/shared-dtos` is `"type":"commonjs"`.
  - Node 22.18 everywhere: `.nvmrc` `v22.18.0`, `Dockerfile:2` `FROM node:22.18-alpine3.22`, `package.json:6` `"node": "22.18.x"`.
  - It pins `@sodax/sdk` and `@sodax/types` `2.2.0-rc.8` (`pnpm-workspace.yaml:199-200`) and viem 2.45.1.
- **Backend import sites** [verified, rg over a `git archive` of origin/development, `node_modules` excluded].
  - 97 files import `@sodax/sdk` (72 non-test), with 99 import statements, 24 of them `import type` and 3 more whose specifiers are all inline `type` [verified in the verification pass with a TS-AST count over `git show` of each file; a line-based rg gives 100 and 21 because it counts a comment and misses multi-line `import type`].
  - Non-test files per app: swaps-api 31, bridge-api 23, sponsoring-api 9, api 3, task-executor 3, shared-dtos 2, stateful-api 1.
  - 36 names are imported without `type`; 23 of them exist at runtime and 13 are types.
  - One dynamic import, of `@sodax/types` (not the sdk): `packages/hub-assets/src/hub-asset-registry.ts:234`.
  - The backend builds the facade in 3 places: `apps/bridge-api/src/shared/providers/sodax.provider.ts:108`, `apps/swaps-api/src/shared/providers/sodax.provider.ts:120` and `apps/task-executor/src/config/task-executor-config.service.ts:36`. No non-test code constructs an SDK service directly [verified, `git grep -E "new (Sodax|SwapService|MoneyMarketService|BridgeService|SpokeService|EvmHubProvider)\("`; the 5 `new BridgeService(` hits are the backend's own service, in tests].
- **No Jest** [verified].
  - Every test script is `vitest`. There are 0 jest configs and 0 `jest.fn|mock|spyOn` sites.
  - Leftover devDeps only: `@types/jest` in 8 manifests, `ts-jest` in 5 (`git grep -l '"ts-jest"' origin/development -- '*package.json'`).
- **viem copies** [verified]. Method: npm 11.6, `npm i --ignore-scripts --before=2026-10-05 --install-links` in scratch. A fake package carries the third-party deps of `@sodax/sdk@2.2.0` at their published pins. Our own `@sodax/*` are excluded because 2.2.0 is newer than the cutoff. The app adds `viem@2.57.3`, the last release before the cutoff. Counts and sizes come from `npm ls viem --all`, `du -sk` (allocated blocks; apparent size is 27–37% smaller, e.g. 478 MB for "today") and `npm audit --json`. The last column is vulnerable packages (`metadata.vulnerabilities.total`), with unique advisories (`via[].source`) in brackets; the first pass labelled the package count "advisories".

  | Install | pkgs | node_modules | viem copies | viem on disk | vulnerable pkgs (advisories) |
  | --- | --: | --: | --- | --: | --- |
  | today: app viem 2.57.3 + sdk deps | 403 | 756 MB | 8 (2.29.2 ×1, 2.37.13 ×6 under PancakeSwap, 2.57.3) | 352 MB | 35, 11 high (47) |
  | sdk viem as peer `^2.29.2` | 393 | 702 MB | 7 (PancakeSwap's 6 remain) | 312 MB | 35 (47) |
  | no PancakeSwap, viem still exact (sdk-4 alone; verification pass) | 334 | 398 MB | 2 (2.29.2, 2.57.3) | 99 MB | 26, 10 high (46) |
  | peer + no PancakeSwap (sdk-3 + sdk-4) | 324 | 344 MB | 1 | 58 MB | 24, 9 high (44) |
  | sdk deps only, no app viem | 408 | 754 MB | 8 (2.57.3 under injective) | 354 MB | 35 (47) |

  - The vulnerable `ws` 8.18.x (2 advisories, one high) sits under viem 2.29.2 and under PancakeSwap's 6 viem 2.37.13 copies. It leaves only when both go [verified, `npm audit` of the peer, sdk-4-alone and combined rows].

- **Browser duplicate viem** [verified, `entries/app-viem.mjs`]. An EVM dapp using viem itself next to `new Sodax()`:
  - 1,265.2 KB gzip when it shares the SDK's viem;
  - 1,367.2 KB with its own viem 2.57.3: **+102 KB gzip** (+320 KB min in total; the app's viem package alone is 236 KB min).
  - The T2 `new Sodax()` bundle already holds 3 viem copies: 2.29.2 (158 KB min), 2.37.13 (28 KB, PancakeSwap), and 2.50.4 (5 KB, imported by `@injectivelabs/sdk-ts` [verified in the verification pass, esbuild metafile importers, `wf-verify-packaging/scripts/who-imports-viem.mjs`]).
- **Type conflict** [verified, TS 5.9.3, `skipLibCheck`].
  - Passing viem 2.57.3 `WalletClient`/`PublicClient` into a config typed with viem 2.29.2 fails with **TS2322** ("Types of property 'chain' are incompatible", `ChainFees`). The config has the shape of wallet-sdk-core's `BrowserExtensionEvmWalletConfig` (`evm/types.ts:51-55`).
  - The same code against one viem copy compiles clean (`tsfix/dup.ts` vs `tsfix/same.ts`).
- **The frontend holds viem at the SDK's exact pin** [verified]: `sodax-frontend@1b915ec7:pnpm-workspace.yaml:8` `viem: "2.29.2"`.

### Change
- **3.0:**
  - Drop the tsup CJS half in sdk, wallet-sdk-core, swaps-api, bridge-api and libs.
  - Exports become `{ types, default }`, plus `typesVersions` for subpaths. Add `default` to dapp-kit and wallet-sdk-react.
  - Peers, written as explicit ranges (never `catalog:`):
    - viem in sdk, wallet-sdk-core, dapp-kit and wallet-sdk-react;
    - wagmi in wallet-sdk-react (with wsr-2);
    - react-query with a tested floor.
  - CI legs at the floor and at the latest cooled-down release.
- **Client:** `npm i @sodax/sdk viem`. Backend code does not change (probe below).

### Feasibility — Feasible with caveats · Proven
- **Proven, Node 22.18.0** (official binary, SHA-256 checked):
  - A simulated ESM-only manifest (`exports['.'] = {types, default: dist/esm/index.js}` over the T2 dist) loads with `require('@sodax/sdk')` and exposes 510 exports.
  - All 23 runtime names the backend imports are defined.
  - `new Sodax()`, `getIntentRelayChainId`, `isSodaxError` and `isHubChainKeyType` work.
  - No require(esm) warning is printed.
  - Same result on Node 22.15 and 24.14.
  - An `import`-only manifest throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, so `default` is required.
  - The require succeeding also proves there is no top-level await in the graph.
- **Caveats:**
  1. **P3 startup cost** [verified, Node 22.18, 11 interleaved rounds, medians]:

     | Load + `new Sodax()` | Time | RSS | Re-run (verification pass, load 2.7–4.1) |
     | --- | --: | --: | --: |
     | published CJS twin | 733 ms | 208 MB | 665 ms / 208 MB |
     | flat ESM via require(esm) | 805 ms | 224 MB | 777 ms / 221 MB |
     | per-file ESM via require(esm) | 897 ms | 231 MB | 808 ms / 230 MB |

     So +143 to +164 ms and +22 to +23 MB per process.
  2. **TS consumers** on `module: node16` + CJS get TS1479. Subpaths need `typesVersions` under node10. This is from research A P7 and was not re-run.
  3. **Peers alone give little install relief:** 6 of 8 viem copies come from PancakeSwap's exact pin.
  4. **wagmi 3 needs TS ≥ 5.9.3 repo-wide** (first pass). Not re-verified.
- **Decision:** how wide the viem floor is. Options: `^2.29.2` (today's tested pin), the 2.28.0 API floor (research A P8, not re-run), or `>=2.43` (wagmi 3).

### Complexity — C4
- **PR 1, ESM-only:** 7 manifests + 5 tsup configs + attw rule + migration note, ~150 LOC of config.
- **PR 2, peers:** 4 manifests + docs, ~40 LOC.
- **PR 3, CI floor/ceiling legs:** consumer fixture, npm install with `--before`, typecheck under `bundler` and node10, Node smoke, ~200 LOC.
- **Cross-repo:** a backend bump. No code change is expected; verify the TS build and boot.
- **Breaking, 3.0.** Earlier estimate: 7 pts (T4.1–T4.3). It is larger because of wsr-2 (TS 5.9), dk-1 (sdk peer) and the backend owner → C4.
- **Risks:**
  1. Backend cold start +143 to +164 ms.
  2. Users on Node < 22.12 or Jest-CJS break. They already fail today on the `@mysten/sui` path (research A).

### Benefit — B3 (alone and on top of sdk-4)
- **P1/P2:**
  - −102 KB gzip for dapps whose viem is not 2.29.2 [verified].
  - Removes a real TS2322 when passing app viem clients [verified].
  - No more holding the app's viem at 2.29.2 (the frontend does today).
  - wagmi as a peer avoids two wagmi contexts (research A; not probed here).
- **P3:**
  - One graph instead of the dual-package hazard. Today, `import` and `require` of `@sodax/sdk` in one process give two `Sodax` classes [verified, `dual-probe.mjs` on the T2 manifest; re-checked on the published 2.2.0 `index.mjs` + `index.cjs` in the verification pass].
  - Cost: +143 to +164 ms startup.
- **Install, standalone** [verified]: −1 viem copy, −54 MB node_modules, −10 packages; vulnerable packages (35) and advisories (47) unchanged.
- **On top of sdk-4** [verified, verification pass]: sdk-4 alone already takes the install to 2 viem copies, 398 MB and 26 vulnerable packages (46 advisories). The peer change then removes 1 copy, 54 MB, 10 packages and 2 vulnerable packages (`ws` with its 2 advisories, and the viem that pulls it): 1 copy, 344 MB, 24 (44).
  - So most of the 756 → 344 MB and 35 → 24 drop is sdk-4's; the first pass's "B4 with sdk-4" credited it to sdk-3. B3 [judgement]. The `ws` advisories would also go with a bumped exact viem pin [derived: viem 2.57.3 ships ws 8.21.0, outside the vulnerable range 8.0.0–8.20.1].
- **P5:**
  - Drops the CJS twin and the duplicate `.d.cts`: 1.73 MB + 943 KB per measurements.md, sdk 5.2 → ~2.6 MB.
  - Adds a CI matrix.
- **P4 / P6:** none.

### Recommendation
3.0, after sdk-2 and x-1 (T10). Ship peers together with sdk-4's PancakeSwap removal, or the install gain stays at 1 copy. Suggested wording: "Publish ESM-only packages that Node 22.12+ can still require(), with viem, wagmi and @tanstack/react-query as peers where used, tested at the floor and latest in CI."

### Corrections to earlier research
- **"up to 8 viem copies":** confirmed (8 copies, 352 MB). But the peer change alone removes 1 copy; the other 6 are PancakeSwap's.
- **Research A T4 (implied):** per-file ESM is not free for CJS servers: +143 to +164 ms startup on Node 22.18 (measured, two runs).
- **This report's first pass, "B4 with sdk-4":** credited sdk-3 with sdk-4's install gain. Measured, sdk-4 alone reaches 2 copies / 398 MB / 26 vulnerable packages; sdk-3 adds −1 copy / −54 MB / −2 on top → B3.
- **Backend Jest:** none confirmed. Dead `@types/jest`/`ts-jest` devDeps remain (cosmetic).

## sdk-6 · Per-feature entry points
**Bullet:** "Add per-feature entry points like @sodax/sdk/swap alongside the Sodax facade"  ·  **T-ids:** T12.1, T12.2

### Today
- **Root export only** [verified]. `packages/sdk/package.json:28-40` exports `.` and `./package.json`.
- **Construction** [verified]. Services take `{config, hubProvider, spoke, backendApi?}`, and the facade builds them at `Sodax.ts:79-133`.
- **Standalone bundle gain is small** [verified, re-run with `wf-finish-packaging/scripts/bundle-node.mjs`, browser, T2]: swap-only 1,211.2 KB vs `new Sodax()` 1,261.4 KB gzip.
  - The facade entry resolves through package `exports`. The swap-only entry imports sdk dist files by absolute path, as `artifacts/t2-probe/t12/swap-only.mjs` does. That does not change sizes: the stubbed facade by absolute path is also 302.7 KB [verified, verification pass].
  - With the non-EVM chain libraries and PancakeSwap stubbed (sdk-1+sdk-4 simulated, bignumber.js kept): **248.4 vs 302.7 KB** (−54.3 KB) [verified, verification pass, `wf-verify-packaging/scripts/run-bundles.sh`]. sdk own code 461 → 196 KB min.
  - The finishing pass also stubbed bignumber.js and got 294.3 KB for the facade. Neither sdk-1 nor sdk-4 removes it: the sdk imports it in 14 source files (8 value imports, e.g. `bridge/BridgeService.ts:66`; 13 of the 14 under `moneyMarket/math-utils/`), and `plan-v3-scope.md:208` drops its removal from v3. It is the whole 8.4 KB gap to the t2-probe README's 303 KB. Swap-only does not reach it (248.4 KB either way, `--why bignumber.js`).
- **Node, standalone** [verified, Node 22.18, medians of 11]:
  - core + `SwapService` (`node-timing/swaponly-esm.mjs`): 851 ms, 240 MB (re-run: 791 ms, 237 MB);
  - full facade, per-file ESM: 876 ms, 245 MB (re-run: 803 ms, 245 MB).
  - Cause: `SpokeService.ts:30-39` still loads every chain.
- **Cross-copy `instanceof`** [verified, `rg -o "instanceof [A-Z]\w*"` over sdk src, non-test]:
  - `SodaxError` ×3, `HttpRelayError` ×2, `SwapsApiError` (`SwapsApiService.ts:162`), `BridgeApiError` (`BridgeApiService.ts:182`), `BackendHttpError` (`api-utils.ts:116`), `NotFoundError` (`horizon.ts:8`).
  - `isSodaxError` has a structural fallback (`errors/SodaxError.ts:80-88`).

### Change
- **New entries:** `@sodax/sdk/core` (`createSodaxCore`) plus `@sodax/sdk/swap`, `/money-market`, `/bridge`, … with `createXService(core)` factories.
- **`Sodax` is built on the core;** its fields do not change.
- **Client:** `const core = createSodaxCore(opts); const swaps = createSwapService(core);`

### Feasibility — Feasible with caveats · Proven
- **Dual graph, proven** (Node 22.18, `res/*/dual-probe.cjs`, manifests over the T2 dist):

  | Root exports | Subpath exports | CJS `require` of root + `/swap` | ESM `import` of both |
  | --- | --- | --- | --- |
  | `import` → per-file ESM, `require` → CJS bundle | `default` → ESM | **two graphs**: `SwapService` and `SodaxError` differ, cross-`instanceof` false, `isSodaxError` true | one graph |
  | same | `import` only | subpath `require` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` (gated) | one graph |
  | ESM-only `default` | `default` | one graph | one graph |

  - One sample: loading both graphs took 1,627 ms / 271 MB vs 840 ms / 211 MB for the root alone. Not benchmarked.
- **Hard prerequisite:** sdk-2, in the planned layout. The root ESM must be the per-file build, or root and subpath duplicate everything (research B T12) [judgement]. A tsup multi-entry ESM build with `splitting: true` is meant to share classes across entries too (wallet-sdk-react uses it for that reason, per the comment at `packages/wallet-sdk-react/tsup.config.ts:21-23`); it was not evaluated for the sdk.
- **Decision** (first-pass decision #5): in 2.x ship subpaths **`import`-only** (proven gate), or wait for ESM-only 3.0.
- **Only traced, not prototyped:** the factory API and `createSodaxCore`.

### Complexity — C3
- **PR 1:** `createSodaxCore` + facade on it + field-equality tests, ~250 LOC.
- **PR 2:** factories + exports (import-only) + `typesVersions` + knip + attw + size scenarios, ~200 LOC.
- **PR 3** (suggested): move pure math such as `ClService.priceToTick` to a leaf module, ~100 LOC. Without it a dex-math import costs 547 KB (sdk-2 per-symbol).
- **Additive in 2.x.** Earlier estimate: 6 pts. That is fair for PR 1–2; PR 3 is new.
- **Risks:**
  1. A wrong export condition re-creates the dual graph.
  2. Freezing factory names before 3.0.

### Benefit — B2 (alone and on top of sdk-1 + sdk-4)
- **Standalone:** −50.2 KB gzip bundle and −12 to −25 ms / −5 to −8 MB in Node (unbundled per-file ESM, two runs).
- **P1/P2:** no gain while dapp-kit constructs the full facade (`SodaxProvider.tsx:24`); needs dk-1.
- **Combined with sdk-1 + sdk-4** [verified; T2 dist bundled for `platform: node`, stubbed libraries replaced by a callable no-op proxy (`STUB_PROXY=1`), Node 22.18, 11 interleaved rounds after 2 warm-ups, medians. Finishing pass: load 3.4–4.4. Re-run in the verification pass: load 3.0, plus the bignumber.js-kept facade]:

  | Bundled entry | gzip (browser) | Node load + construct | RSS |
  | --- | --: | --: | --: |
  | `new Sodax()`, T2 | 1,261.4 KB | 233 ms (re-run 216) | 150 MB (149) |
  | swap-only, T2 | 1,211.2 KB | 219 ms (re-run 211) | 146 MB (143) |
  | `new Sodax()`, sdk-1+sdk-4 stubbed, bignumber.js kept | 302.7 KB | 34 ms (re-run only) | 65 MB |
  | `new Sodax()`, bignumber.js also stubbed (finishing pass) | 294.3 KB | 33 ms (re-run 33) | 65 MB (64) |
  | swap-only, sdk-1+sdk-4 stubbed (does not reach bignumber.js) | 248.4 KB | 30 ms (re-run 29) | 62 MB (61–62) |

  - Empty process: 37 MB RSS.
  - sdk-6's own share on top of sdk-1+sdk-4: −54.3 KB gzip, −5 ms, −3 to −4 MB [derived: 302.7 − 248.4; 34 − 29 and 65 − 61/62 from the same re-run]. With the sdk's own non-EVM chain modules also stubbed, chains.md's runs give 283 vs 231 KB (−52 KB).
  - The finishing pass's −45.9 KB / −3 ms came from also stubbing bignumber.js, which v3 keeps (Today, above).
  - The 216–233 → 34 ms and 1,261 → 303 KB drops belong to sdk-1+sdk-4, not to sdk-6 [derived from the rows above].
  - These match measurements.md's source-build figures in shape (214 → 29 ms facade EVM-only, 26 ms swap-only; that run also dropped bignumber.js, `measurements.md:76`).
- **Why B2 and not B3** [judgement]: the gain clears the 50 KB bar (−50.2 KB alone, −52 to −54 KB on top of sdk-1+sdk-4), but only for code that skips the facade. No current consumer does: dapp-kit (`SodaxProvider.tsx:24`), intents-whitelabel (`src/lib/sodax.ts:12`) and the backend (3 sites, sdk-3 Today) all build it. Single-feature dapps would see the gain once dk-1 offers per-feature hooks.
- **P3:** fast single-feature workers come from sdk-1+sdk-4; sdk-6 adds ~3–5 ms on top.
- **P5/P6:** clearer import paths and a smaller facade surface for skills and docs [judgement]. This, not size, is the main reason to do it.

### Recommendation
2.x with `import`-only subpaths, after sdk-2. Keep the wording. Note in the issue that the size and startup gains come from sdk-1/sdk-4 (and reach dapps only with dk-1); sdk-6 itself adds ~54 KB and ~3–5 ms on top. Lower priority than sdk-1/sdk-4 if the team must choose.

### Corrections to earlier research
- **Research B T12, "mixing root CJS with subpath ESM in one CJS process is a documented don't":** the hazard is proven. The import-only gate prevents it without waiting for 3.0.
- **Research B T12 omits** that the 2.x dual package already splits a mixed ESM+CJS process today (two `Sodax` classes, probe).
- **This report's first pass, "B4 with sdk-1 + sdk-4":** credited sdk-6 with sdk-1/sdk-4's gains. Measured on the T2 dist, sdk-6 adds −54 KB / −3 to −5 ms on top of them → B2, because no current consumer skips the facade.
- **Finishing pass, "−46 KB, under the B3 bar":** its stub list also removed bignumber.js, which neither sdk-1 nor sdk-4 removes. With it kept, the share is −54.3 KB.

## x-1 · Split @sodax/types, stop inlining it
**Bullet:** "Split @sodax/types into lightweight subpaths and stop inlining it into other packages"  ·  **T-ids:** T10.1, T14.1, T14.2, T14.3, T14.4

### Today
- **Inlining** [verified].
  - `noExternal` with `@sodax/types` in 4 tsup configs: sdk `:14`, wallet-sdk-core `:14`, swaps-api `:18`, bridge-api `:18` (`rg -n noExternal`).
  - In the 2.2.0 dists, each of sdk, swaps-api, bridge-api and wallet-sdk-core holds the token list: 624, 621, 621 and 621 of the 624 addresses in `@sodax/types` `chains/tokens.js` appear in their `dist/index.mjs` [verified in the verification pass, `rg -o "0x[0-9a-fA-F]{40}"` over the packed tarballs]. With the `@sodax/types` package itself, a dapp can carry up to 5 copies.
- **swaps-api and bridge-api use one runtime name** from types: `getChainType` (`rawTxSchemas.ts:7` / `:11`). Every other import is `import type`.
- **Weights** [verified, esbuild, any one name from the `@sodax/types` root]: 37.6 KB gzip / 142.5 KB min, made of:
  - `chains/tokens.js` 90.8 KB min;
  - `chains/chains.js` 25.3 KB min (7.8 KB of it token-free);
  - `swap/swap.js` 15.1;
  - `moneyMarket.js` 7.9.
- **Root `chains.ts` mixes the two concerns** [verified, compiled `chains.js`]:
  - token-free lines 9-393: `RelayChainIdMap`, `baseChainInfo`, families;
  - token-bearing lines 394-end: `spokeChainConfig`, `hubConfig`;
  - `utils.js:1` imports both.
- **P4 bundles** [verified, gzip KB]. The split is a simulation by transformation (`scripts/split-types.cjs` on a copy of the tsc dist: AST taint analysis moves 35 token-free names to `chain-info.js` and 21 guards to `chain-guards.js`).

  | Entry | 2.2.0 | types external only | + `sideEffects:false` | + split + flag |
  | --- | --: | --: | --: | --: |
  | `SwapsApi` | 40.7 | 43.8 | 40.5 | **7.7** |
  | `BridgeApi` | 39.7 | 42.8 | 39.5 | **6.9** |
  | both | 78.3 | 45.7 | 42.3 | **8.5** |
  | `getChainType` (types root) | 37.7 | — | 34.3 | **2.2** |
  | `ChainKeys` (types root) | 37.6 | — | **0.4** | 0.4 |
  | light subpath (5 names), split, no flag | — | — | — | 2.2 |
  | `spokeChainConfig` / token lists | 37.6 | — | 34.1 / 26.7 | same (the data itself) |

  - The split without the flag stays at 43.8 KB: the root still pulls everything.
- **Facade apps** [verified]:
  - `new Sodax()` (T2) goes 1,261.4 → **1,187.6 KB** when the API packages stop inlining types (`--api-src --types-pure`; 1,187.8 KB with `--api-src` alone).
  - The frontend's real set goes 1,294.7 (2.2.0) → 1,188.1 KB (T2 + flag + API packages not inlining): −106.6 KB, −8.2%.
- **In-flight conflicts** [verified, `gh pr diff` hunks]. All four add rows to both regions of `chains.ts` (`RelayChainIdMap`/`baseChainInfo`/families **and** `spokeChainConfig`) and to `utils.ts`:

  | PR | State | `chains.ts` | `utils.ts` |
  | --- | --- | --- | --- |
  | #534 | open | +98 −3 | +30 |
  | #497 | draft | +148 −3 | +36 |
  | #498 | draft, on #497's branch | +75 −26 | +5 −1 |
  | #95 | open | +69 −2 | +6 |

### Change
- **T10.1:** delete `noExternal` and the resolver hacks in the 4 tsup configs.
- **T14.1:** `"sideEffects": false` on `@sodax/types`.
- **T14.2:** split `chains.ts`/`utils.ts` by concern; root exports unchanged.
- **T14.3:** subpaths `./chains` (token-free), `./tokens`, `./config`, each with `default` and `typesVersions`.
- **T14.4:** the API packages (and wallet-sdk-react in wsr-1) import `@sodax/types/chains`.
- **Client (optional):** `import { ChainKeys, getChainType } from '@sodax/types/chains'`.

### Feasibility — Feasible with caveats · Proven (simulation)
- **Proven:** the size effects, on a transformed copy of the real dist.
- **Not done:** the real split in source, with types tests, knip and attw.
- **Caveat:** expected merge conflicts with #534/#497/#498/#95, because all four edit both regions of `chains.ts` that T14.2 moves. Land T14.2 right after #534 merges, as a move-only PR. The three open PRs then merge `main` and move their rows.
- T10.1 for the CJS twins relies on `require(esm)` of `@sodax/types`. That works: its exports have `default`, and `require('@sodax/types')` from a CJS file loads 158 exports with no warning on Node 22.18 [verified in the verification pass, `wf-verify-packaging/reqtypes/probe.cjs`]. It is inside the declared range: every package has `engines.node` `>=22.12.0`. The swaps-api and bridge-api `tsup.config.ts:14-17` comments still cite Node <20.19.

### Complexity — C3
- **PR T10.1:** ~30 LOC + tarball re-baseline.
- **PR T14.1:** 1 line.
- **PR T14.2:** moves ~385 + ~120 lines, plus tests.
- **PR T14.3:** ~50 LOC of manifest and barrels.
- **PR T14.4:** 2–3 files.
- **Not breaking.** Earlier estimate: 8 pts (T10.1 + T14.1–4). It agrees.
- **Risks:**
  1. The conflicts above.
  2. The simulation added 2 non-public helpers to root exports. The real split must keep `chainLogo` and `filterChainKeysByType` private.

### Benefit — B3
- **P4:** 40.7 → 7.7 KB gzip per API client (−81%); both 78.3 → 8.5 KB. Needs T14.1 + T14.2 together; T10 alone is +3 KB for a single client.
- **P1/P2:**
  - −74 KB gzip on `new Sodax()` once the API packages stop inlining;
  - `ChainKeys` from `@sodax/types` 37.6 → 0.4 KB with the flag alone;
  - wallet-sdk-react's chain imports become token-free (wsr-1).
- **P3:** one types instance per process. It also removes a cause of the backend's "two SDK graphs" note.
- **P5:** a smaller tarball. Chain plugins (sdk-1) can import light entries (research B B8 ask).
- **P6:** none.

### Recommendation
2.x. T10.1 and T14.1 now; T14.2 right after #534. Suggested wording: "Mark @sodax/types side-effect-free, split it by concern into chains, tokens and config subpaths, and stop inlining it into other packages".

### Corrections to earlier research
- **Research A T10 ("one copy … the tarball shrinks"):** correct for multi-package apps. For a P4 app using one API client, stopping inlining alone makes the bundle **larger** (40.7 → 43.8 KB) until the flag lands.
- **Research A T14 ("split … getChainType 34 → 2 KB"):** confirmed (2.2 KB). It needs the flag or a subpath; the split alone gives 0.

## Dependencies between these bullets
- **sdk-2 → sdk-6:** hard in the planned layout: the root must be per-file ESM [judgement, research B T12; tsup ESM `splitting: true` not evaluated].
- **sdk-2 → sdk-3:** template; sdk-3 deletes the CJS half.
- **sdk-2 → sdk-1:** needed for sdk-1's 2.x chain subpaths (chains.md). The facade's size drop does not need it: the published flat bundle with the same stubs is 330.5 KB vs 302.7 KB per-file [verified, verification pass].
- **sdk-2 → sdk-7:** sdk-2 brings T2's lazy ECC init (deps.md); per-file entries also keep polyfill-needing libraries out of partial imports [judgement].
- **sdk-2 → dk-1, wsr-1:** the same template, after alias conversion.
- **sdk-6:** the size and startup gains belong to sdk-1 and sdk-4; sdk-6 adds ~54 KB / ~3–5 ms on top. P1/P2 need dk-1 (dapp-kit subpaths, sdk as peer).
- **sdk-3:**
  - needs x-1/T10 (no inlined copies left in CJS);
  - the install gain needs sdk-4 (PancakeSwap's exact-pinned viem), and most of the combined gain is sdk-4's own (sdk-4 alone: 2 copies, 398 MB);
  - wagmi peer comes with wsr-2 (viem ≥2.43, TS ≥5.9.3);
  - the dapp-kit sdk peer is dk-1;
  - CI legs live in x-2/x-4;
  - users who cannot move need x-5 (release-2.x).
- **x-1:**
  - after #534;
  - feeds sdk-1 (plugins import light subpaths);
  - feeds api-1 (`@sodax/api` stays small only with `@sodax/types/chains`);
  - feeds wsr-1;
  - sdk-9/#543 may later replace the tokens/config entry.
- **x-2:** should record these scenarios: helper-only, frontend set, facade, P4 clients, duplicate viem.

## Not verified
- **Next.js (webpack/Turbopack) not re-run.** esbuild is a proxy; the Next numbers are the t2-probe README's.
- **TS consumer typing not re-run:** node10/node16, `typesVersions` for subpaths, TS1479 (research A P7).
- **Peer floors not tested:** the viem API floor 2.28.0 (P8) and wagmi 3's TS ≥5.9.3 were not re-verified, and no floor/ceiling CI leg was prototyped.
- **No real repo builds:**
  - the types split is a dist transformation, with no tests run;
  - wallet-sdk-core, swaps-api and bridge-api were not built with tsc.
- **Backend boot not run.** The require probe used the 0181a053 dists, not the backend's 2.2.0-rc.8, and NestJS apps were not booted.
- **Combined Node timing is a stub simulation:** both sides are esbuild bundles with stubbed libraries replaced by a no-op proxy. Unbundled per-file ESM with real EVM-only plugins (sdk-1) was not measured; it needs the sdk-1 code.
- **Timing caveats:**
  - Node timings were taken on a shared machine with other agents running (medians of 11 interleaved runs).
  - Two runs of the same unbundled probes differ by up to 89 ms (per-file require(esm): 897 vs 808 ms). Deltas under ~30 ms (sdk-6's −12 to −25 ms; bundled −3 to −5 ms) are within run-to-run spread.
  - The dual-graph timing is a single sample.
  - The first runs after new paths showed cache warm-up of up to 14 s; those runs were discarded.
- **Alternative layout not evaluated:** tsup multi-entry ESM with `splitting: true` instead of sdk-2's per-file output, as the base for sdk-6 subpaths.
- **Install probe gaps:**
  - it excludes `@sodax/*` (2.2.0 is past the `--before` cutoff);
  - audit counts reflect the advisory DB on 2026-10-19;
  - node_modules MB are allocated blocks (`du -sk`); apparent sizes are 27–37% smaller, and the B-scale MB bars were applied to allocated sizes.

## Resume notes
**Scratch root.** All work is in `S=/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-packaging`. It may be wiped; copy `scripts/` into `artifacts/feasibility-probes/packaging/deep/` before relying on it. The finishing pass is in the sibling `wf-finish-packaging/` (same scratchpad root): `scripts/bundle-node.mjs`, `scripts/time-file.mjs`, `entries/`, `out/`, `stub-regex.txt`, `results-{node,browser}.jsonl`, `bench-node.txt`. The verification pass is in the sibling `wf-verify-packaging/`: `scripts/run-bundles.sh`, `scripts/run-x1.sh`, `scripts/run-misc.sh`, `scripts/who-imports-viem.mjs`, `install/app-nopcs/` (sdk-4 alone), `reqtypes/probe.cjs`, `pubdual/probe.mjs`, `bench-node.txt`, `bench-node-unbundled.txt`, `results-*.jsonl`, and `packaging.before.md` (this file before the pass).

**Shared setup:**
- **Scripts:**
  - `scripts/bundle.mjs` (options `--sdk published|t2|t2eager`, `--stub`, `--types-pure`, `--types-root`, `--api-src`, `--app-viem`, `--viem`, `--files`, `--why`);
  - `scripts/extract-imports.cjs`;
  - `scripts/split-types.cjs`;
  - `scripts/scan-effects.cjs`.
- **Resolution roots:** `res/{published,t2,t2eager,typesplit,typesplitse,typesorigse}`. The tarballs are in `dl/sodax-220/`, with third-party deps symlinked into its `node_modules`. Node 22.18 is at `dl/node-22.18/node-v22.18.0-darwin-arm64/bin/node`.
- **Results:**
  - `results-sdk2.jsonl`, `results-sym.jsonl` (`results-x1.jsonl` was not in the scratch dir at verification time; the x-1 rows were re-run into `wf-verify-packaging/results-x1.jsonl`);
  - `imports-{frontend,whitelabel,backend}.json`;
  - `install/*/audit.json`;
  - `prs/pr-{534,497,498,95}.diff`.

**Next steps per bullet:**
- **sdk-2:**
  - Optional: re-run Next 16 with `artifacts/t2-probe/next-probe.sh` on the frontend set.
  - Build wallet-sdk-core, swaps-api and bridge-api with the T2 template in a throwaway worktree, then `node scripts/bundle.mjs … --api-src`-style checks against real dists.
- **sdk-3:**
  - Prototype the floor and ceiling legs in scratch with `npm i --ignore-scripts --before=<14 days ago> viem@2.28.0|2.29.2|latest wagmi@3 @tanstack/react-query@5.87.4`, then typecheck `tsfix/*.ts` under `--moduleResolution bundler` and `node10`.
  - Re-run research A P7 with `typescript@5.8.2` against `res/esmonly`.
  - Boot one backend app on the simulated ESM-only package.
- **sdk-6:** done (2026-10-19, scratch `wf-finish-packaging/`):
  - Combined Node timing: `scripts/bundle-node.mjs` (bundle.mjs plus a node `require` banner and `STUB_PROXY`), entries `entries/n-{full,swap}.mjs`, bundles in `out/`, timings via `deep-packaging/node-timing/bench.sh` → `bench-node.txt`.
  - Frontend set without `ClService`: `entries/fe-direct-no-cl.mjs` → `results-browser.jsonl`.
  - `stub-regex.txt` also stubs bignumber.js, which v3 keeps. For sdk-1+sdk-4 use the regex in `wf-verify-packaging/scripts/run-bundles.sh` (`$STUB`).
  - Still open (optional): measure the facade with real EVM-only plugins once sdk-1 has code.
- **x-1:**
  - Do the real T14.2 in a throwaway worktree after #534 merges. Run types tests, knip and attw.
  - Confirm `split-types.cjs`'s numbers.
  - Check `typesVersions` for `./chains` under node10.

## Verification (2026-10-19)

Adversarial pass over this file. Scratch: `wf-verify-packaging/` (same scratchpad root). Code at `0181a053`. Consumer refs rechecked: frontend `origin/main` = `1b915ec7`, whitelabel `origin/main` = `5e1fbbaa`, backend `origin/development` = `985959e9`.

**What was checked**
- **Scores:** 4 IDs × verdict, confidence, C, B and timing (20 checks) against the rubric.
  - No breaking change is timed 2.x. sdk-3 is 3.0; sdk-2, sdk-6 and x-1 are additive. x-1's T10.1 stays inside `engines.node` `>=22.12.0`, which every package declares.
  - C matches the PR breakdowns: sdk-2 has 4 package-wide PRs (C3); sdk-3 has 3 PRs plus a backend bump and a 3.0 migration (C4); sdk-6 has 3 PRs, ~550 LOC (C3); x-1 has 5 PRs (C3).
- **Citations:** 38 opened, all hold.
  - 26 at `0181a053`: 5 tsup-config lines (4 files), `Sodax.ts` ×3, `SpokeService.ts` ×2, `BitcoinSpokeService.ts:48`, `BTCWalletProvider.ts:19` and `:20`, `sponsoringApi.ts:63`, `packages/sdk/package.json:28-40`, `ci.yml:209`, `pnpm-workspace.yaml:36-39`, `evm/types.ts:51-55`, the 4 `instanceof` sites, `SodaxError.ts:80-88`, both `rawTxSchemas.ts`, `SodaxProvider.tsx:24`.
  - 12 in consumers, with `git show`. One needed a clarification: `hub-asset-registry.ts:234` imports `@sodax/types`, not the sdk.
- **Numbers:** about 140 figures.
  - 48 esbuild runs (`scripts/run-bundles.sh`, `run-x1.sh`, `run-misc.sh`, plus 6 one-offs). Every re-run figure matched to 0.1 KB: 10 of the 14 sdk-2 table cells, 17 x-1 figures, and the no-`ClService` set, eager-ECC, duplicate-viem and sdk-6 figures. The errors were in what a run stood for (change 1), in labels and in arithmetic (change 6), not in the measured sizes.
  - 2 Node benches, 13 medians, 11 interleaved rounds each (`bench-node.txt`, `bench-node-unbundled.txt`).
  - 4 installs recounted from their lockfiles, `du -sk` and `npm audit` JSON (20 figures, all matched), plus 1 new install (sdk-4 alone).
  - About 45 counts: backend imports (TS-AST), consumer file counts (`git grep`), aliases, the side-effect scan, `instanceof`, PR hunks, Jest leftovers, bignumber.js importers, token addresses.
- **Probes re-run:**
  - require(esm) of the ESM-only manifest on Node 22.18, 22.15 and 24.14: 510 exports, 23 names, no warning.
  - The import-only manifest error and the 3 dual-graph variants.
  - The published 2.2.0 files in one process: two `Sodax` classes.
  - TS2322 with TS 5.9.3: `dup.ts` fails, `same.ts` is clean.
  - New: `require('@sodax/types')` from CJS.

**What changed, and why**
1. **sdk-6, the share on top of sdk-1+sdk-4.** The finishing pass's stub list also removed bignumber.js. The sdk imports it in 14 files, and `plan-v3-scope.md:208` keeps it in v3.
   - With it kept, the facade is 302.7 KB, not 294.3, so sdk-6's share is −54.3 KB, not −45.9 KB. That is above the 50 KB bar.
   - bignumber.js is the whole 8.4 KB gap to the t2-probe README's 303 KB. The absolute-path entry was not the cause: both give the same size.
   - B2 stays, on the ground that no current consumer skips the facade [judgement]. Updated: summary, table, Today, Benefit, Recommendation, Corrections and Dependencies.
2. **sdk-3, B4 with sdk-4 → B3 (alone and on top of sdk-4).** The new sdk-4-alone install (334 pkgs, 398 MB, 2 copies, 26 vulnerable packages) shows that most of the combined drop is sdk-4's. The peer change adds −1 copy, −54 MB and −2 vulnerable packages (`ws`). This is the misattribution the finishing pass fixed for sdk-6.
3. **sdk-3, the install table's "advisories".** They were npm's vulnerable-package counts (`metadata.vulnerabilities.total`). The column is relabelled, and unique advisories are added: 47 / 47 / 46 / 44 / 47.
4. **sdk-2, the "Combined → B4" line.** It credited sdk-2 with sdk-1+sdk-4's facade drop. The published flat bundle with the same stubs is 330.5 KB, so sdk-2's share is ≤ 28 KB.
   - B4 is kept as an enabler, tagged [judgement]. Added: tsup ESM `splitting: true`, which wallet-sdk-react uses, was not evaluated as an alternative.
   - Confidence narrowed to Proven (sdk) / Code-traced (the other 3 packages). Dependencies sdk-2 → sdk-1, sdk-6 and sdk-7 were reworded; the sdk-7 reason now matches deps.md (lazy ECC).
5. **Timings.** A re-run gave lower absolute times: CJS 665, flat require(esm) 777, per-file require(esm) 808 ms; `import` 764 / 803 ms; swap-only 791 ms. The ranges now show both runs: +143 to +164 ms, +31 to +92 ms, −12 to −25 ms.
6. **Smaller fixes:**
   - backend imports: 99 statements and 24 `import type` (+3 all-inline), not 100 and 21 (TS-AST count);
   - `ts-jest` is in 5 manifests, not 4;
   - the facade grows +11.0 KB min, not +11.2;
   - duplicate viem is +320 KB min in total (236 KB is the app's viem package alone);
   - viem 2.50.4 is `@injectivelabs/sdk-ts`'s (it was "not traced");
   - token-list copies are now counted by address (624, 621, 621 and 621 of 624), not "6 hits for 5 addresses";
   - 1,187.6 KB used `--api-src --types-pure` (1,187.8 with `--api-src` alone);
   - x-1 T10.1 now cites a direct `require('@sodax/types')` probe and `engines`. The sdk-3 probe loads types through `import`, so it did not show this;
   - "certain", "never" and "cannot" wording was softened or scoped.

**What remains judgement**
- sdk-6 B2 vs B3, which turns on "common path".
- sdk-2 B4 as an enabler.
- sdk-3 B3 on top of sdk-4. The `ws` advisories also go with a bumped viem pin.
- That stub simulations stand for sdk-1/sdk-4. Stubs delete imports and add no registry or vendored code.
- x-1's facade −74 KB. It uses the API packages bundled from TS source as a stand-in for tsup without `noExternal`.

**Residual doubts**
- Node deltas under ~30 ms are inside run-to-run spread on this shared machine: two runs differ by up to 89 ms.
- MB figures are allocated blocks. By apparent size, sdk-3's standalone −54 MB is −28 MB.
- `measurements.md:76` and `:136` also dropped bignumber.js (the `$ALL` regex at `:262`); chains.md's 303 / 248 KB do not. `dapp-kit-surface.md:142-143` quotes 294.4 KB for the stubbed facade and a 43 KB facade-free gain, which looks like the same stub list; it was not checked here.
- The frontend and whitelabel name lists come from the first pass's AST scan. Only their file counts (125 and 32) were re-counted, with `git grep`.
- Jest-CJS consumers of the 2.x CJS twin after x-1 T10.1 were not tested. Research A says they already fail on `@mysten/sui`.
