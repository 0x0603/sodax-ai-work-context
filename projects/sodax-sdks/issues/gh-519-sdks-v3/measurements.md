---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-14
tags: [v3, bundle-size, lightweight, baseline, tree-shaking, dependencies]
---

# GH-519 · v3 weight baseline (published 2.2.0)

Measured 2026-10-14 against the **published** `@sodax/*@2.2.0` packages (npm `latest`, released
2026-10-12), not a local build. Source cross-checks are against `origin/main` `77281f0c`
(2026-10-13). Scripts are in `artifacts/bundle-baseline/` so v3 can be measured the same way.

Method: esbuild 0.25.10, `bundle + minify + treeShaking`, `platform: browser`, ESM, `es2022`,
`process.env.NODE_ENV=production`; react / react-dom / react-query external; Node builtins
external (they are listed, because a browser app must polyfill them). Byte attribution comes from
the esbuild metafile (`bytesInOutput`, grouped by the innermost `node_modules/<pkg>`).

## Headline numbers

| Consumer code | min | gzip | brotli | npm pkgs in bundle |
| --- | ---: | ---: | ---: | ---: |
| `new Sodax()` | 4,765 KB | **1,266 KB** | 839 KB | 81 |
| one helper: `import { getChainType } from '@sodax/sdk'` | 2,970 KB | **832 KB** | 589 KB | 65 |
| `import { SodaxError } from '@sodax/sdk'` | 2,970 KB | 832 KB | 589 KB | 65 |
| `import { getChainType } from '@sodax/types'` | 143 KB | 38 KB | 30 KB | 1 |
| `SwapsApi` from `@sodax/swaps-api` | 136 KB | 41 KB | 32 KB | 2 |
| `BridgeApi` from `@sodax/bridge-api` | 132 KB | 40 KB | 31 KB | 2 |
| dapp-kit `SodaxProvider` + `useQuote` / `useSwap` / `useStatus` | 4,775 KB | 1,269 KB | 840 KB | 82 |
| `SodaxWalletProvider` from `@sodax/wallet-sdk-react` | 10,217 KB | **2,596 KB** | 1,608 KB | 237 |
| `@sodax/wallet-sdk-react/xchains/evm` only | 405 KB | 124 KB | 98 KB | 12 |
| minimal swap dapp = the dapp-kit hooks above + wallet provider/hooks | 11,793 KB | **2,994 KB** | 1,779 KB | 258 |

Browser polyfills required: `@sodax/sdk` needs `buffer`, `crypto`; `@sodax/wallet-sdk-react` root
needs `buffer, crypto, events, fs, stream, string_decoder, util`. The EVM subpath and the API
packages need none.

Other costs:

| What | `@sodax/sdk` | `@sodax/swaps-api` (+ bridge-api) |
| --- | --- | --- |
| `npm i` (fresh, `--ignore-scripts`) | **412 packages, 777 MB** | 4 packages, 5.2 MB |
| `npm i @sodax/dapp-kit @sodax/wallet-sdk-react` (+ react, react-query) | **1,357 packages, 1.8 GB** | — |
| Node `await import()` | **0.86 s warm / 2.0 s cold**, +114–144 MB heap, ~263 MB RSS | 5–7 ms, +2 MB heap |
| `tsc` cost of one file importing it (TS 6.0.3, skipLibCheck) | 1,359 `.d.ts` files, 307,663 lines, ~333 MB, 0.75 s | 127 files, 62,571 lines, ~125 MB, 0.23 s |
| `npm audit --omit=dev` on the fresh install | **35 advisories: 11 high, 13 moderate, 11 low** | — |

(viem alone imports in 61 ms for comparison.) Every one of the 35 advisories is transitive through a
chain library: `@coral-xyz/anchor → toml`, `@solana/web3.js` v1 → `bigint-buffer` / `jayson` / `ws`,
`@stellar/stellar-sdk → axios / toml`, `@injectivelabs/sdk-ts`. The monorepo's own `overrides`
(`toml`, `socket.io-parser`, `@hpke/core`, `@tanstack/react-query` — `pnpm-workspace.yaml:117-130`)
apply only inside the monorepo; they do not ship to consumers, which is why the consumer install
still reports `toml`.

## Projected v3 gains (what-if, measured 2026-10-14)

No v3 code exists yet, so these come from two simulations:

- **Published + stubs**: the published 2.2.0 dists, with non-EVM chain libraries and their wallet
  libraries replaced by an empty module ("that chain plugin is not installed").
  Scripts: `measure-stub.mjs`, `measure-stub-react.mjs`.
- **Source**: esbuild over the `origin/main` `77281f0c` source, with workspace packages resolved to
  `packages/*/src` (one `@sodax/types` copy, no flat dist). Entries construct only what a feature
  needs. Scripts: `measure-src.mjs`, `entries-v3/`. Sanity check: the source build of `new Sodax()` is
  1,196 KB gzip against 1,266 KB for the published dist; the gap is the two extra inlined
  `@sodax/types` copies.

Both simulations overstate the savings. Stubbed code simply disappears, and no replacement code
(plugin registry, vendored CL math, JSON-RPC client) is counted.

### Bundle (minified + gzip, browser)

| Consumer code | 2.2.0 | v3 what-if | Δ | Assumes |
| --- | ---: | ---: | ---: | --- |
| `new Sodax()`, every feature | 1,266 KB | 214 KB | −83% | EVM-only plugins, no PancakeSwap / bignumber.js, one `@sodax/types` copy |
| swap only, EVM | 1,266 KB¹ | 169 KB | −87% | client-first: only hub + spokes + backend API + `SwapService` (`entries-v3/src-swap-only.ts`) |
| ↳ SODAX's own bytes (viem excluded; the app ships it) | — | 92 KB | | 147K of its 369K min are `@sodax/types` data (token list, chain table) |
| one helper (`getChainType`) | 832 KB | 37 KB | −96% | unbundled dist only (the sdk's existing `sideEffects: false` then works) |
| minimal swap dapp (dapp-kit + wallet-sdk-react) | 2,994 KB | 946 KB | −68% | published dists; non-EVM chain and wallet libraries not installed |
| ↳ also no PancakeSwap / bignumber.js | | 878 KB | −71% | |
| ↳ v3 shape: swap-only sdk + EVM wallet adapter + wagmi hooks | | 186 KB | −94% | source build; injected wallets only; dapp-kit hook layer not counted |
| ↳ the same plus a WalletConnect connector | | 582 KB | −81% | WalletConnect + Reown AppKit add ~400 KB |

¹ Today there is no way to import less than the whole SDK.

No what-if got below **34 KB for `getChainType`**. `@sodax/types` keeps its token list alive through
two things that esbuild, like rollup by default, treats as side effects:

- derived top-level lookups, such as `new Map(Object.entries(...).map(...))` and
  `[spokeChainConfig[...].supportedTokens.bnUSD, ...]`;
- property reads on `ChainKeys`.

Marking initializers pure and inlining chain keys did not move it. Getting under ~1 KB needs the data
split (or remote config), not a flag.

Download time at Lighthouse's mobile throttle (1.6 Mbit/s), transfer only:

| Bundle | Time |
| --- | --- |
| 2,994 KB (today) | ≈ 15 s |
| 186 KB (v3 shape) | ≈ 1 s |
| 582 KB (v3 shape with WalletConnect) | ≈ 3 s |

### Install (npm, `--ignore-scripts`, fresh dir)

| Install | 2.2.0 | v3 what-if | Assumes |
| --- | --- | --- | --- |
| `@sodax/sdk` | 412 pkgs · 778 MB · 35 advisories (11 high) | 18 pkgs · 82 MB · 0 | core = viem from a range (2.57.5 today) + valibot + types + API clients + rlp; the sdk package itself adds 2.6–5.2 MB |
| ↳ viem as a peer (the app already has it) | | 5 pkgs · 5 MB · 0 | |
| ↳ keeping today's exact `viem@2.29.2` | | 18 pkgs · 60 MB · 2 | `ws` advisory, unfixable for consumers |
| dapp-kit + wallet-sdk-react (+ react, react-query) | 1,357 pkgs · 1.8 GB · 81 (1 critical, 28 high) | 29 pkgs · 108 MB · 0 | EVM-only, wagmi 3.7.7, viem 2.57.5 |
| ↳ plus WalletConnect | | 299 pkgs · 454 MB · 0 | the app adds `@walletconnect/ethereum-provider` |
| wagmi (+ viem, react, react-query) | v2.16.9: 371 pkgs · 576 MB · 23 | v3: 24 pkgs · 102 MB · 0 | |

Cost of each chain plugin, paid only by apps that opt in (today's library versions, installed alone):

| Plugin | pkgs | MB | advisories |
| --- | ---: | ---: | --- |
| Solana: web3.js v1 + spl-token + anchor + bn.js | 104 | 70 | 9 (6 high) |
| ↳ Solana on `@solana/kit` + `@solana-program/token` | 49 | 33 | 0 |
| Sui | 21 | 46 | 0 |
| Stellar | 57 | 30 | 3 high |
| ICON (icon-sdk-js; a small JSON-RPC client would be ~0) | 105 | 47 | 7 |
| Injective | 116 | 178 | 7 low |
| Bitcoin | 12 | 15 | 0 |
| NEAR | 66 | 9 | 0 |
| Stacks (`@sodax/libs`) | 1 | 13 | 0 |
| PancakeSwap, if kept as a DEX add-on | 120 | 131 | 20 (5 high) |

### Node, types, package

| | 2.2.0 | v3 what-if |
| --- | --- | --- |
| `import` + `new Sodax()` from node_modules (how backend services use it) | 888 ms · 268 MB RSS | core deps (viem + types + API clients) 92 ms · 74 MB; `@sodax/types` alone 10 ms · 48 MB |
| the same, both sides bundled (like for like) | 214 ms · 143 MB | EVM-only 29 ms · 62 MB; swap-only 26 ms · 59 MB |
| `tsc` cost of `import { Sodax }` (TS 6.0.3, skipLibCheck) | 1,363 files · 353 MB · 1.22 s | 586 files · 193 MB · 0.42 s (non-EVM library types stubbed) |
| `@sodax/sdk` package on disk | 5.2 MB | ~2.6 MB if ESM-only (drops the 1.73 MB CJS twin and the duplicate 943 KB `.d.cts`) |

Node timings are medians of 7 warm runs on Node 22.15. An empty process uses 38 MB RSS.

## Where the weight comes from

### `new Sodax()` — top contributors (minified bytes in the output)

`@stellar/stellar-sdk` 1,013K · `@sodax/sdk` 706K · `icon-sdk-js` 450K ·
`@injectivelabs/core-proto-ts-v2` 283K · viem 215K · `@mysten/sui` 194K · `@solana/web3.js` 184K ·
`@noble/curves` 136K · `@sodax/swaps-api` 129K · `@sodax/bridge-api` 126K · `@sodax/libs` 117K ·
bitcoinjs-lib 95K · bn.js 88K · `@pancakeswap/v3-sdk` 83K · `@coral-xyz/anchor` 81K ·
`@injectivelabs/exceptions` 74K · `@injectivelabs/sdk-ts` 74K

### What-if: the same `new Sodax()` with libraries stubbed out

| Stubbed to an empty module | gzip | vs today |
| --- | ---: | ---: |
| nothing (today) | 1,266 KB | — |
| non-EVM chain libs: stellar, icon, solana + spl-token, anchor, sui, injective, bitcoinjs + secp256k1, `@sodax/libs` (stacks), cosmjs-types, bn.js, rlp | 384 KB | −70% |
| + PancakeSwap SDKs + bignumber.js | 317 KB | −75% |

This is an upper bound on chain-split savings: the stubbed code is simply absent and no replacement
code is counted. § Projected v3 gains refines it with source builds (one `@sodax/types` copy) and
per-feature entries. The remaining 317 KB is mostly `@sodax/sdk` itself (every feature, plus its bundled copies of
`@sodax/types` and near-api-js), viem, and the two extra `@sodax/types` copies inside
swaps-api / bridge-api.

### `@sodax/sdk` dist composition (unminified `dist/index.mjs`, 1.71 MB)

`@sodax/types` (bundled copy) 239K · `shared/services` (spokes, hub, relay, erc20) 219K · ABIs 184K ·
`LeverageYieldService` 115K · near-api-js (bundled) 97K · `MoneyMarketService` 85K ·
`dex/AssetService` 75K · `@noble/curves` (bundled) 68K · `SwapService` 59K · `BridgeService` 59K ·
`StakingService` 52K · `migration-guards` 42K. The package also ships the same 943 KB `.d.ts`
twice (`index.d.ts` + `index.d.cts`) and a 1.73 MB CJS twin of the ESM file.

### Install weight on disk (`npm i @sodax/sdk@2.2.0`)

`@pancakeswap/*` **358 MB** on disk, but only ~4 MB of it is PancakeSwap code: six of its packages
each nest a private `viem@2.37.13` (42–55 MB per directory), because their exact pin and our exact
`viem@2.29.2` pin cannot share one copy (installed alone, the three PancakeSwap SDKs are 120 packages /
131 MB) · `@injectivelabs/*` 109 MB · viem 46 MB (top-level copy) · typescript 24 MB (auto-installed peer
via `@mysten/sui → gql.tada`) · ethers 19 MB (via `@injectivelabs/sdk-ts`) · core-js + core-js-pure
30 MB (via icon-sdk-js) · rxjs 11 MB (via injective).

React layer (`npm i @sodax/dapp-kit @sodax/wallet-sdk-react`, 1,357 packages / 1.8 GB): the
wallet-connection SDKs alone are ~416 MB — `@reown/*` 220 MB, `@walletconnect/*` 153 MB,
`@metamask/*` 48 MB, `@coinbase/*` 4 MB — all hard deps of `@wagmi/connectors@5.9.9` under the pinned
`wagmi@2.16.9` (`@reown/appkit` comes in through `@walletconnect/ethereum-provider`). npm warns that
`@metamask/sdk@0.32.0` is deprecated. In wagmi v3 (`@wagmi/connectors` 8.x) every one of these is an
optional peer. `npm audit --omit=dev` on this install: **81 advisories — 1 critical, 28 high, 34
moderate, 18 low**. The critical one is `protobufjs@7.4.0` (GHSA-xq3m-2v4x-88gg, code execution from a
crafted schema) via `@creit.tech/stellar-wallets-kit → @trezor/connect → @trezor/protobuf`; Trezor ships
its own schemas, so the effective risk is lower than the label.

Three viem versions get installed as **8 copies, 355 MB — 46% of the `@sodax/sdk` install**: the SDK's
own exact pin `viem@2.29.2` (catalog, `pnpm-workspace.yaml:38`, released 2025-05-10), `2.37.13`
exact-pinned by PancakeSwap (6 nested copies), and `2.57.5` under `@injectivelabs/sdk-ts`. The React
install has **15 copies, 669 MB (37%)**, adding `2.23.2` ×5. A dapp with its own viem gets one more. The
pinned `2.29.2` also carries the `ws` advisory, which `npm audit` marks unfixable for consumers
(`fixAvailable: false`) — only a SODAX release can move it.

## Why tree-shaking fails (verified in source / dist)

1. **Module-level side effect** — `initEccLib(ecc)` at
   `packages/sdk/src/shared/services/spoke/BitcoinSpokeService.ts:48` keeps bitcoinjs-lib +
   `@bitcoinerlab/secp256k1` in every bundle that imports anything from the SDK.
2. **One flat dist file** — `packages/sdk/tsup.config.ts` (`entry: ['src/index.ts']`,
   `splitting: false`); 503 exports from one module; 142 top-level `var x = call(...)` initializers
   in the dist (`Object.values(ChainKeys)`, `filterChainKeysByType("EVM")`, …) that a bundler cannot
   prove pure.
3. **Eager god object** — the `Sodax` constructor builds every service
   (`packages/sdk/src/shared/entities/Sodax.ts:46-134`); `SpokeService` statically imports all 10
   chain spoke services (`packages/sdk/src/shared/services/spoke/SpokeService.ts:30-39`).
4. **`@sodax/types` has no `sideEffects` field** (`packages/types/package.json`) — `getChainType`
   alone drags in `chains/tokens.js` (91K), `chains/chains.js` (25K), `swap/swap.js` (15K).
5. **`@sodax/types` is bundled into four packages** — `noExternal: ['@sodax/types']` in the tsup
   configs of sdk, swaps-api (`:18`), bridge-api (`:18`), wallet-sdk-core (`:14`). Counted with a
   probe token address: the `new Sodax()` bundle contains the token list **3 times**, the minimal swap
   dapp **5 times** (sdk, swaps-api, bridge-api, wallet-sdk-core copies + the external `@sodax/types`
   that wallet-sdk-react imports).
6. **`@sodax/libs/injective/wallet-strategy` ships a private viem** — its `chunk-Y4RK47ZM.mjs`
   bundles viem (869 modules), ethers, axios and protobuf runtime, ~2.9 MB minified with
   `build-WWOWWBEG.mjs`; it can never dedupe against the app's viem.

## Dependencies used for very little

- **PancakeSwap SDKs** (9 packages; 358 MB in our install, almost all nested viem copies; alone
  120 packages / 131 MB / 20 advisories, because `@pancakeswap/swap-sdk-core` pulls `@solana/web3.js`
  v1 + spl-token even for EVM use): used in two files —
  `packages/sdk/src/dex/ConcentratedLiquidityService.ts:35-54` (TickMath, PositionMath, price
  helpers, CL ABIs, calldata encoders) and `packages/sdk/src/swap/EvmSolverService.ts:40` (one ABI).
- **icon-sdk-js** (450K min + core-js polyfills): only `IconService` + `HttpProvider`
  (`IconSpokeService.ts:1-4, 43`) for `call` / `getBalance` / `getTransactionResult` JSON-RPC
  (`:125-287`). The file also carries a CJS-interop hack (`:2`).
- **@stellar/stellar-sdk** (1,013K min, the largest single contributor): imported from the root entry
  in 6 files; v15.1.0 ships `./minimal`, `./no-axios`, `./no-eventsource` subpaths that are unused.
- **bignumber.js** in 14 source files, next to native bigint; bn.js only for Solana/anchor
  (`shared/entities/solana/pda/pda.ts`, `SolanaSpokeService.ts`).
- **Dynamic config is off** — `ConfigService.initialize()` is a no-op (fetch commented out,
  `packages/sdk/src/shared/config/ConfigService.ts:158-181`), so every token/chain change needs a
  package release and the full token list stays bundled.

## Reproduce

```bash
# isolated dirs; --ignore-scripts because these are downloaded packages
mkdir -p $W/{npm-sdk,npm-api,npm-react,tools}
(cd $W/npm-sdk   && npm i --ignore-scripts @sodax/sdk@<ver>)
(cd $W/npm-api   && npm i --ignore-scripts @sodax/swaps-api@<ver> @sodax/bridge-api@<ver>)
(cd $W/npm-react && npm i --ignore-scripts --legacy-peer-deps @sodax/dapp-kit@<ver> \
   @sodax/wallet-sdk-react@<ver> react@19 react-dom@19 @tanstack/react-query@5)
(cd $W/tools     && npm i --ignore-scripts esbuild@0.25.10)
B=artifacts/bundle-baseline
node $B/measure.mjs $W/tools/node_modules/esbuild $W/npm-sdk/node_modules $W/out $B/entries/sdk-*.mjs
node $B/measure-stub.mjs $W/tools/node_modules/esbuild $W/npm-sdk/node_modules \
  $B/entries/sdk-new-sodax.mjs '^(@stellar/|icon-sdk-js|@solana/|@coral-xyz/|@mysten/|@injectivelabs/|bitcoinjs-lib|@bitcoinerlab/|@sodax/libs|cosmjs-types|bn\.js|rlp)' "non-EVM stubbed"
node $B/import-time.mjs $W/npm-sdk/node_modules/@sodax/sdk/dist/index.mjs

# v3 what-ifs (§ Projected v3 gains)
bash $B/install-groups.sh $W        # every dependency group → $W/groups/<name>, results in $W/install-results.tsv
git -C <sodax-sdks> worktree add --detach $W/src 77281f0c   # read-only source; `git worktree remove` it after
E=$W/groups/tools/node_modules/esbuild
NONEVM='^(@stellar/|icon-sdk-js|@solana/|@coral-xyz/|@mysten/|@injectivelabs/|bitcoinjs-lib|@bitcoinerlab/|@sodax/libs|cosmjs-types|bn\.js|near-api-js|@near-js/)'
ALL="${NONEVM%)}|@pancakeswap/|bignumber\.js)"
WALLETS='|@hot-labs/|@creit\.tech/|sats-connect|ecpair|bip322-js|secp256k1'
cd $B/entries-v3
node ../measure-src.mjs $E $W/groups/sdk/node_modules $W/src src-new-sodax.ts "new Sodax, EVM-only" "$ALL" 1
node ../measure-src.mjs $E $W/groups/sdk/node_modules $W/src src-swap-only.ts "swap-only, EVM-only" "$ALL" 1
node ../measure-src.mjs $E $W/groups/sdk/node_modules $W/src src-one-helper.ts "one helper" "" 0
EXTERNAL_RE='^(react|react-dom|react/jsx-runtime|@tanstack/react-query)$' \
  node ../measure-src.mjs $E $W/groups/react/node_modules $W/src v3-dapp-approx.ts "v3 dapp" "${ALL%)}${WALLETS})" 1
node ../measure-stub-react.mjs $E $W/groups/react/node_modules ../entries/full-dapp-swap.mjs "${NONEVM%)}${WALLETS})" "dapp, EVM-only"
# Node timing: build for platform=node with STUB_PROXY=1, then run time-import.mjs 7× and take the median
STUB_PROXY=1 node ../measure-src.mjs $E $W/groups/sdk/node_modules $W/src src-new-sodax.ts n1 "$ALL" 1 node $W/n1.mjs
node ../time-import.mjs $W/n1.mjs
```
