---
type: plan
repo: sodax-sdks
github: 519
updated: 2026-10-14
tags: [v3, scope, estimate, story-points, work-breakdown, feasibility]
related_issues: [gh-302, gh-456]
---

# GH-519 · v3 scope: verified approach, feasibility, packages, points

Every item below records:

- how it would be done;
- the code it rests on (`origin/main` `77281f0c`, 2026-10-13);
- a feasibility verdict, backed by a probe run on 2026-10-14 wherever a cheap probe existed.

Items that did not hold up are listed under § Dropped, with the reason.

This replaces the first version of this file, whose points came from LOC counts alone.

## Scale

- **Points**: Fibonacci, for one dev who knows the code, tests included.

  | Points | Rough effort |
  | ---: | --- |
  | 1 | ≤ ½ day |
  | 2 | ~1 day |
  | 3 | ~2 days |
  | 5 | 3–4 days |
  | 8 | ~1 week |
  | 13 | ~2 weeks |

- **Calibration caveat**: the "New World" project has an `Estimate` field, but only 4 of its 372
  items use it, so recalibrate after the first sprint.
- **Breaking ✔**: the item changes the public API, so it lands in 3.0.
- **Tier**:
  - P0 = the lightweight core;
  - P1 = recommended for 3.0;
  - P2 = 3.x or later.

## Probes behind the verdicts

| # | Probe | Result |
| --- | --- | --- |
| 1 | CommonJS `require()` of the published sdk ESM build (`dist/index.mjs`), then `new Sodax()`, on Node 22.15 | works (no top-level await in the graph) |
| 2 | Same, with `package.json` rewritten to ESM-only (no `require` condition, `main` → `.mjs`), then `require('@sodax/sdk')` | works |
| 3 | TS 5.8 with sodax-backend's settings (`module: commonjs`, `moduleResolution: node`), root import from the ESM-only package | typechecks |
| 4 | Subpath `@sodax/sdk/swap` under the same settings | fails TS2307. Fixed by `typesVersions` in the sdk, or by the backend moving to `module: nodenext` (TS 5.8 models `require(esm)`); both verified |
| 5 | Source build of a swap-only entry, using the existing service constructors (`measurements.md` § Projected v3 gains) | compiles and bundles, 169 KB gzip EVM-only |
| 6 | Tree-shaking `@sodax/types` by annotation only (`@__PURE__`, `@__NO_SIDE_EFFECTS__`, inlined `ChainKeys.X`) | stuck at 34 KB for `getChainType` → needs a module split |
| 7 | Importing only the PancakeSwap ABIs | pulls 447 KB unminified, including `@solana/web3.js`, bn.js, bignumber.js, decimal.js-light and big.js; the dist is not tree-shakeable |
| 8 | `@stellar/stellar-sdk/minimal` | exports all 11 names SODAX imports; prebuilt browser bundle 1,004 → 852 KB min |
| 9 | Privy against wagmi v3 | `@privy-io/react-auth` 3.49 has no wagmi peer; `@privy-io/wagmi` 4.0.19 peers `wagmi >=2`. Compatible |

## Design the scope assumes

- **D1 · Chain plugins.** Each non-EVM chain becomes `@sodax/chain-<name>`:
  - `.` holds the spoke service;
  - `./wallet` holds the wallet-sdk-core provider;
  - `./react` holds the wallet-sdk-react adapter.

  React wallet libraries are optional peers used only by `./react`. Versions stay in lockstep through
  the existing publish loop (`sdks-publish.yml:30,72` iterates a `PACKAGES` array). Plugin public types
  never expose chain-library types, so a later library swap is not breaking.
- **D2 · Keep the `Sodax` facade and the root exports.** Per-feature entries are added beside them.
  Most of v3 is then additive. Only these items break:
  - registering non-EVM chains;
  - wallet adapters;
  - ESM-only;
  - peers;
  - PancakeSwap `Price` / `Token` types;
  - whichever P1 items are chosen.
- **D3 · Build ESM with plain `tsc`, unbundled**, as `@sodax/types` already does (`packages/types/package.json`
  build script). The sdk tsconfig is already `NodeNext`; there are 0 extensionless relative imports and
  no JSON imports. tsup stays only where bundling is the point (`@sodax/libs` workarounds) and for the
  2.x CJS build.

## Items

### E1 · Build and packaging

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E1.1 | ESM via `tsc` (unbundled) for sdk, wallet-sdk-core, swaps-api, bridge-api. In 2.x the CJS build stays on tsup | D3. Measured: one helper import 832 → 37 KB once the module structure is kept | 3 | – | P0 (2.x) |
| E1.2 | ESM-only: drop the CJS twin and `.d.cts`; add `typesVersions` for subpaths | probes 1–4 | 2 | ✔ | P0 |
| E1.3 | Stop inlining `@sodax/types`. It is inlined only for the CJS build: "Force-bundle ESM-only packages for CJS compatibility" (`sdk/tsup.config.ts`), so externalize it in the ESM build now and drop the inlining with CJS | tsup configs of sdk, wallet-sdk-core, swaps-api, bridge-api | 1 | – | P0 (2.x) |
| E1.4 | Move `initEccLib(ecc)` (`BitcoinSpokeService.ts:48`) and `ECPairFactory` (`BTCWalletProvider.ts:19-20`) into constructors | the only module-level side effects found | 1 | – | P0 (2.x) |
| E1.5 | CI gates: size-limit per scenario, install footprint, consumer `npm audit`, attw | scripts already in `artifacts/bundle-baseline/` | 3 | – | P0 (2.x) |
| E1.6 | viem `^2.29`, wagmi `^3`, react-query `^5` as peers; CI on min and latest | — | 2 | ✔ | P0 |

### E2 · Chain plugins

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E2.1 | Contract `ChainPlugin { type, createSpoke(config), codec: { encodeAddress, decodeAddress, encodeToken }, rawTxSchema }`; one ADR covering plugin, core client and package layout | — | 3 | ✔ | P0 |
| E2.2 | Registry inside `SpokeService`. It replaces the 10 eager `new XSpokeService` (`SpokeService.ts:143-156`), and `getSpokeService` (`:158`) reads the registry. Per-chain fields become getters that throw `CHAIN_NOT_ENABLED`. The address codecs in `shared-utils.ts:152-262` delegate to the registry | Features reach chains through the dispatcher (`isAllowanceValid` 22, `approve` 19, `sendMessage` 15, `deposit` 12, …); direct chain access is only `spoke.bitcoin` (20) and `spoke.stellar` (1). Most of the 208 chain branches are hub / EVM narrowing that stays in core | 5 | ✔ | P0 |
| E2.3 | Move each chain's spoke, entities / utils, wallet provider, react xchain and tests into its plugin: Bitcoin 5, Solana 3, Stellar 3 (incl. `sponsoring/internal`), Injective 3 and Stacks 3 (each with its `@sodax/libs` workaround), ICON 2, Sui 2, NEAR 2 | Non-EVM libraries are imported by exactly 20 sdk files: spokes, `entities/{btc,injective,solana,stellar}`, `utils/{stacks,sui}-utils`, `shared-utils`, Stellar sponsoring (`SpokeService` and `selectSolvedIntentPacket` import only `rlp`, which stays in core) | 23 | ✔ | P0 |
| E2.4 | Add the plugin packages to the `PACKAGES` loop and set up npm | `sdks-publish.yml:30,72` | 1 | – | P0 |
| E2.5 | `@sodax/chains-all`: re-exports every plugin, for apps that support all chains | — | 1 | – | P0 |
| E2.6 | Port Tron (PR 372) and Aleo (PR 95) as plugins if they merge in v2 shape first | — | 5 | – | P1 (conditional) |

### E3 · Client core

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E3.1 | `createSodaxCore(options)` (config, hub, spoke, backendApi) plus per-feature entries (`@sodax/sdk/swap`, …) exporting the existing services and `createX(core)` factories | Services already take `{config, hubProvider, spoke, backendApi}`. Feature dependencies are only `backendApi`, plus `swap` from leverageYield / dex / partner. Probe 5 | 5 | – | P0 |
| E3.2 | Remote config by default: re-enable `ConfigService.initialize()` against the backend v2 config (`apps/api/.../config-v2.controller.ts:82`), with version check and fallback. The bundled fallback becomes an opt-in import | Disabled in `ffb3e7e3f` (2026-07-01, Swaps API v2). Needs a product call on the startup network dependency | 3 | – | P1 |
| E3.3 | Split `@sodax/types` modules: chain keys and the `getChainType` map in one module, chain info, configs and token lists in others, derived lookups lazy. Light entries added; the root stays an aggregator | Probe 6 | 5 | – | P0 |

### E4 · Heavy dependencies

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E4.1 | Vendor ~1K LOC from PancakeSwap (MIT), with property tests against PancakeSwap during migration:<br>• `TickMath`, `PositionMath`, `maxLiquidityFor*`, `tickToPrice`, `sqrtRatioX96ToPrice`;<br>• `getPoolId`, `decodePoolKey`, the 3 calldata encoders, 2 ABIs;<br>• a compatible `Price` / `Token` with `toSignificant`, which sodax-frontend calls at 7 sites | Imports at `ConcentratedLiquidityService.ts:35-54`, `EvmSolverService.ts:40`; probe 7 | 5 | ✔ (nominal types) | P0 |
| E4.2 | ICON reads (`call`, `getBalance`, `getTransactionResult`) → a ~60-line JSON-RPC client in the sdk and wallet-react. Private-key signing keeps icon-sdk-js in the server-only entry (E6.3) | `IconSpokeService.ts:43,129,146,171,201,287`; `IconWalletProvider.ts:53-96` | 2 | – | P0 (2.x) |
| E4.3 | `@stellar/stellar-sdk` → `/minimal` | Probe 8 | 1 | – | P0 (2.x) |
| E4.4 | Remove Anchor: hand-write the Borsh encoding for the 3 instructions used (deposit ×2, sendMessage), with byte-for-byte tests. This drops anchor, its high `toml` advisory, and 2 `Program.fetchIdl` RPC calls per deposit | `SolanaSpokeService.ts:113-170,293-307`; `entities/solana/utils/utils.ts:17-40` | 3 | – | P0 (2.x) |
| E4.5 | Move the vendored typings (near 6.9K, solana 4.1K lines) into their plugins | part of E2.3 | 1 | ✔ | P0 |
| E4.6 | Polyfill-free core: after E2.3 only 3 `Buffer` uses remain (`selectSolvedIntentPacket.ts:13,16`, `SpokeService.ts:602`) → viem `hexToBytes` / `bytesToHex` | `Buffer` counts per file | 1 | – | P0 |
| E4.7 | Solana spoke on `@solana/kit` + Codama, and wallet-react on Wallet Standard | Large. Privy's Solana peers are already Kit | 13 | – (plugin-internal per D1) | P2 |

### E5 · Execution model and errors

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E5.1 | Lifecycle / progress / resume engine around `relayTxAndWaitPacket` (every flow uses it) plus `getSubmitTxStatus` for swap / bridge / leverage. Per-flow step maps, plus dapp-kit hooks | swap 2, MM 4, bridge 1, staking 5, migration 4, leverage 2, dex 6 calls. Builds on PR 504 (open, mergeable) | 13 | – | P1 |
| E5.2 | Map `SwapsApiError` / `BridgeApiError` (5 transport codes) into `SodaxError` | `SodaxError` already carries 26 codes + feature + phase (`errors/codes.ts`) | 3 | ✔ (API clients) | P1 |
| E5.3 | Thread `signal` into fetch and polling loops; add a correlation-id header and put it in the error context | viem actions take no `AbortSignal`, so chain RPC calls stay uncancellable | 3 | – | P1 |
| E5.4 | EIP-5792 batching for every feature | after PR 504 | 5 | – | P2 |
| E5.5 | `testing` entry: typed fake wallet providers + API mocks | — | 3 | – | P2 |

### E6 · Wallet layer

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E6.1 | Signer-only interfaces. Reads move into the plugins' spokes: Solana `getAssociatedTokenAddress` / `getBalance` / `getTokenAccountBalance` / `waitForConfirmation`; Sui `viewContract` / `getCoins`; EVM / Stellar `waitForTransactionReceipt` | interfaces in `types/src/{evm,solana,stellar,sui,bitcoin,…}` | 8 | ✔ | P1 |
| E6.2 | Server-only entry for private-key and mnemonic signers (incl. ICON signing) | — | 2 | – | P0 |
| E6.3 | Dedupe the chain definitions ×3, ICON shim ×3, ICONEX queue ×2 | — | 2 | – | P1 |
| E6.4 | Adapters and no singletons:<br>• `chainRegistry.ts` (440 LOC of per-chain factories) becomes adapter objects passed to `SodaxWalletProvider` (63 LOC, today it wraps `frozen.EVM/SOLANA/SUI` providers from static imports);<br>• the global `create()` store (`useXWalletStore.ts:52`) becomes a per-provider `createStore`;<br>• the 6 static `getInstance()` XServices become per-instance | — | 13 | ✔ | P0 |
| E6.5 | wagmi v3: `useAccount` → `useConnection`, `mutate` API, connectors as optional peers | ~19 wagmi APIs in 10 files; probe 9 | 3 | ✔ | P0 |
| E6.6 | Reuse the app's QueryClient through `QueryClientContext` and wrap only when none exists | `EvmProvider.tsx:27-29,71-75` | 1 | – | P0 (2.x) |
| E6.7 | Typed per-chain account hooks; drop the `X` / `xChainId` naming | — | 3 | ✔ | P1 |
| E6.8 | Standards adapters (EIP-1193 / WalletClient, Wallet Standard) | — | 5 | ✔ | P2 |
| E6.9 | Embedded / social wallets as adapters | — | 3 | – | P2 |

### E7 · dapp-kit

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E7.1 | Per-feature subpaths; sdk becomes a peer; stop `export *` | — | 2 | ✔ | P0 |
| E7.2 | Extend the existing `get*QueryOptions` pattern (8 today) to all 126 queries, plus a key factory | `swap/useQuote.ts:51` | 8 | ✔ (key shapes) | P1 |
| E7.3 | Wallet from context: `SodaxProvider` takes a `walletProviderResolver` that wallet-sdk-react exposes, with no hard dependency | 27 hook files take `walletProvider` | 5 | ✔ | P1 |
| E7.4 | Consistent names (`chainKey` / `address`, `useSwapQuote`) + a codemod table | — | 3 | ✔ | P1 |
| E7.5 | `'use client'` entries; `SodaxProvider` accepts an instance | — | 2 | – | P1 |
| E7.6 | Hooks on `SodaxError` (60 throws, 66 `.ok`, 19 `mutateAsyncSafe`) | — | 5 | ✔ | P1 |
| E7.7 | A `transport` option on the 5 high-level actions (quote / swap / status / allowance / approve). REST passthrough hooks stay under `./api` | The 22 swapsApi hooks are REST-level with different types (`QuoteResponseV2` vs `SwapQuote`), so a full merge does not fit | 5 | ✔ | P2 |
| E7.8 | Polling presets (52 `refetchInterval`) | — | 2 | – | P2 |

### E8 · API packages

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E8.1 | `@sodax/api`: merge swaps-api + bridge-api (same layout; `http.ts` duplicated) and move the sdk `backendApi` HTTP stack onto it. Keep the old packages as re-export shims for one major | — | 8 | – | P1 |
| E8.2 | Generate types from the backend OpenAPI in CI and assert that the valibot schemas match (a drift gate), not a generated client | Swagger in swaps-api / bridge-api / api / sponsoring-api, `/swaps/docs-json` asserted in a test, ~995 `@ApiProperty` | 3 | – | P2 |
| E8.3 | BITCOIN branch in the swaps-api raw-tx schema | — | 1 | – | P0 (2.x) |
| E8.4 | "API mode" docs and an example (raw tx already exists) | — | 3 | – | P1 |

### E9 · AI surface

| ID | Approach | Evidence | Pts | Breaking | Tier |
| --- | --- | --- | --: | :-: | :-: |
| E9.1 | Update the skills content (248 files, 30.8K lines) to v3. The existing `check:ai` suite (imports, snippets, tsx, keys, consistency, safety) catches what breaks | `packages/skills/package.json` | 8 | – | P0 |
| E9.2 | TypeDoc JSON → generated hook index, query-key table, `llms-full.txt` (no API model tooling exists today) | — | 5 | – | P1 |
| E9.3 | `@sodax/mcp`: read tools + build-unsigned-tx tools | — | 8 | – | P2 |
| E9.4 | valibot → JSON Schema tool schemas | — | 5 | – | P2 |
| E9.5 | Pin channels to the release; archive v1 → v2 | — | 2 | – | P1 |

### E10 · Migration and docs (sodax-sdks)

| ID | Approach | Evidence | Pts | Tier |
| --- | --- | --- | --: | :-: |
| E10.1 | ts-morph codemods: plugin registration, wallet config → adapters, ESM imports | — | 5 | P0 |
| E10.2 | Docs: with the facade kept, the changes centre on setup, chain and wallet pages (205 pages in total) | — | 8 | P0 |
| E10.3 | Apps: demo 86 files, playground 32, examples ~43 | — | 5 | P0 |
| E10.4 | The same three for the P1 renames (codemod 3, docs 5, apps 3) | — | 11 | P1 |
| E10.5 | Downstream, each under a cross-repo parent issue: sodax-frontend 5, sodax-backend 3 (ESM-only verified by probes 1–4), intents-whitelabel 3 | — | 11 | after RC |

### E11 · Quality

| ID | Approach | Pts | Tier |
| --- | --- | --: | :-: |
| E11.1 | Runtime matrix in CI (Node, Bun, Deno, Workers, React Native, Vite / Next / Turbopack) | 5 | P1 |

## Dropped or re-scoped (with reason)

| Was | Decision | Why |
| --- | --- | --- |
| Unsigned-tx first | dropped | Already in place: `Raw extends boolean` on actions, `TxReturnType<C, Raw>` (`types/src/common/common.ts:214`), 377 matches in 28 files. Docs only (E8.4) |
| viem-style standalone actions | dropped | The per-feature factories (E3.1) give the same tree-shaking at a third of the cost |
| bignumber.js → bigint | dropped from v3 | ~18 KB min of gain; `BigNumber` is in the public MM math API, so breaking for little |
| Trimming Injective `sdk-ts` | dropped | No slimmer path for its EIP-712 / cosmjs signing; it stays inside the Injective plugin |
| ABI fragments | dropped | ABIs are pure `as const` literals, so the unbundled dist tree-shakes them. Trimming would break their public export |
| One hook family for API + on-chain | re-scoped → E7.7 (P2) | The API hooks are REST passthroughs with different types |
| OpenAPI-generated client | re-scoped → E8.2 drift gate | Handwritten valibot schemas are stricter |
| Solana on Kit | P2 | The Anchor removal (E4.4) gets most of the benefit for 3 pts |

## Totals

| Tier | Pts | ~Dev-weeks (×0.65 day/pt) |
| --- | --: | --: |
| P0 (lightweight core) | 116 | ~15 |
| P1 (recommended for 3.0) | 92 (+5 if Tron / Aleo must be ported) | ~12 |
| P2 | 52 | ~7 |
| **Total** | **260** (first version: 348) | ~34 |
| Downstream (E10.5) | 11 | |

P0 by epic:

| Epic | Pts |
| --- | --: |
| E1 | 12 |
| E2 | 33 |
| E3 | 10 |
| E4 | 13 |
| E6 | 19 |
| E7 | 2 |
| E8 | 1 |
| E9 | 8 |
| E10 | 18 |

## Ships in 2.x first (non-breaking, ~18 pts)

| Item | Pts |
| --- | --: |
| E1.1 ESM via tsc | 3 |
| E1.3 externalize types | 1 |
| E1.4 lazy `initEccLib` | 1 |
| E1.5 CI gates | 3 |
| E4.2 ICON JSON-RPC | 2 |
| E4.3 Stellar `/minimal` | 1 |
| E4.4 drop Anchor | 3 |
| E6.6 QueryClient | 1 |
| E8.3 BITCOIN branch | 1 |
| the other v2 bugs from `ideas.md` §3 | ~2 |

Measured effect: importing one helper goes from 832 → 37 KB. Anchor and its `toml` high advisory leave
every install, along with 2 RPC calls per Solana deposit.

## Order

1. **2.x quick wins.**
2. **One ADR (E2.1 + E3.1 + D1–D3).**
3. **E2.2 registry, then the parallel tracks:**
   - E2.3 chains, split across devs;
   - E6.4 adapters;
   - E4.1 PancakeSwap.
4. **E3.1 core and entries, E3.3 types split, E1.2 ESM-only, E1.6 peers, E6.5 wagmi v3.**
5. **API freeze, then E10.1–10.3 and E9.1.**
6. **3.0 RC, then E10.5 downstream.** E5.1 lifecycle can start as soon as PR 504 merges.

## Remaining risks

These are cost and coordination risks; feasibility itself is no longer in question.

- **In-flight work in v2 shape adds port cost:** PR 504 lifecycle / batching, PR 372 Tron, PR 95 Aleo.
  Agree a cutoff.
- **Remote config by default (E3.2)** makes startup depend on the backend. Needs a product decision.
- **ESM-only:** sodax-backend needs either our `typesVersions` (zero change for it) or `module: nodenext`.
  Keep `apps/node-cjs` as the CI smoke test.
- **Calibration:** these points are calibrated on this code reading, not on team velocity.
