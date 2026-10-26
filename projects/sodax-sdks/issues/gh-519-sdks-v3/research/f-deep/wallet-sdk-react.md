---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, wallet, react]
---

# wallet-sdk-react — deep dive (feasibility, complexity, benefit)

1. Today every app ships all nine chains: `SodaxWalletProvider` is 2,510 KB gzip, and importing only `useXAccount` still costs 1,989 KB. With EVM only, the initial wallet JS drops to ~160 KB. With lazy chains, an all-chain app also starts at ~162 KB; this is a module-graph simulation, not a prototype. Both figures assume a per-file wallet-sdk-core (sdk-2): against today's one-file wallet-sdk-core dist, the EVM-only build starts at ~924 KB.
2. Solana and Sui can load lazily if their providers mount *beside* the app instead of around it. A React probe showed no SSR loss, no blocked hydration and no remount. EVM should stay static. Inside wallet-sdk-react, exactly 5 files hold every static edge from the root to non-EVM code; the EVM path's wallet-sdk-core import (`EvmHydrator.tsx:3`) is one more while that package ships one file.
3. wagmi v3 (wsr-2) cuts today's install by 541 MB and 15 vulnerable packages (distinct advisories 68 → 67). For an EVM-only app, wsr-1 + wsr-2 take the install from 1,859 MB to 460 MB. It falls to ~110 MB only after wallet-sdk-core splits too (wsc-3). It is not a bundle win for code-split builds: the initial JS of the wagmi surface our EVM path uses goes 97 → 112 KB gzip (+15 KB; +19 KB by a second method), because the viem bump to 2.57.3 adds weight.
4. wsr-3 is a ~20-line 2.x fix with a real effect: whitelabel's `retry`, `refetchOnWindowFocus` and mutation `onError` settings are bypassed today.
5. wsr-4 is low value: only 4 of 61 consumer calls use a static chain. wsr-5 needs a product decision: Privy is unreleased, no consumer uses it, it adds 737 KB gzip to the initial load and 1.2 GB to the install, and it drags in wagmi v2.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| wsr-1 | Feasible with caveats / Code-traced (bundle: simulated) | C4 | B4 | 3.0 (opt-in in 2.x) | Initial wallet JS 1,744 → ~162 KB gzip in the simulation, with a per-file wallet-sdk-core (sdk-2); ~924 KB EVM-only against today's. Solana and Sui can mount lazily as siblings. EVM stays static. |
| wsr-2 | Feasible with caveats / Code-traced (connector break and bundle proven) | C3 | B4 | 3.0 | −541 MB and −15 vulnerable packages (−1 distinct advisory) on today's package. One compile break (`withCapabilities`), also on viem 2.57.3. TS 5.9.3 is not needed to compile. No initial-bundle gain (+15 to +19 KB with the viem bump). |
| wsr-3 | Feasible / Code-traced | C1 | B2 | 2.x | App QueryClient defaults and handlers are silently bypassed under `SodaxWalletProvider` today. |
| wsr-4 | Feasible / Code-traced | C2 | B1 | Later | 4 of 61 consumer calls use a static chain. Only EVM and ICON have address types narrower than `string`. |
| wsr-5 | Needs a decision / Code-traced | C4 (social login alone: C2) | B2 | Later (social login in 2.x on request) | Privy email login (EVM) is on main but unreleased. No open demand for social login or Solana. Heavy. |

Method notes used throughout:
- **Bundles:** esbuild 0.25.12 from the t2probe store, `bundle`, `minify`, browser ESM, es2022. `react`, `react-dom`, `react/jsx-runtime` and `@tanstack/react-query` are external, as in the baseline. Builds are single-file unless marked "split". A split figure is the sum of per-file gzip over the entry's static-import closure ("initial"). Output reachable only through `import()` counts as "on demand"; dead chunks are excluded.
- **Script:** `scratch/deep-wsr/scripts/measure.mjs`. The dist is the t2probe build of 0181a053; wallet-sdk-react is unmodified there.
- **Installs:** npm 11.6.0, `npm i --ignore-scripts --before=2026-10-05` in a fresh scratch dir. Size is `du -sk node_modules`, packages are counted from `package-lock.json`, and advisory figures come from `npm audit --omit=dev` (run 2026-10-19). Unless a line says "distinct advisories", the figure is npm's vulnerable-package count (`metadata.vulnerabilities.total`), not a count of distinct advisories; the README advisory recount has both for the main installs. Every install row includes the base react 19.1.1, react-dom 19.1.1 and react-query 5.87.4, which alone is 10 MB, 5 packages and 0 advisories.
- **Consumers:** sodax-frontend `1b915ec7` and intents-whitelabel `5e1fbba`.

---

## wsr-1 · Opt-in chain adapters, lazy chain code, per-provider state
**Bullet:** "Use opt-in chain adapters (adapters={[evm(), solana()]}), lazy-load their wallet integrations, and scope state to each provider"  ·  **T-ids:** T3.1–T3.12

### Today
- **Static imports of every chain [verified]:**
  - `SodaxWalletProvider.tsx:7-9` imports the EVM, Solana and Sui providers and nests them at `:50-60` (Solana innermost, EVM outermost).
  - `chainRegistry.ts:8-16,26-42` imports every chain's XService, connectors, wallet-sdk-core provider and Injective libs.
  - `useXWalletStore.ts:9` imports `chainRegistry`, so **any hook that reads the store pulls every chain**.
- **Exactly 5 wallet-sdk-react files hold the static edges from the root to non-EVM code [verified, `rg -n "from ['\"](@/|\./|\.\./)+(xchains|providers)/(solana|sui|stellar|icon|injective|bitcoin|near|stacks)"` plus a chain-lib import grep]:**
  - `SodaxWalletProvider.tsx:8-9`;
  - `chainRegistry.ts`;
  - `hooks/useInitChainServices.ts:6-8` (ICON, Injective and Stellar reconnects);
  - `hooks/useEvmSwitchChain.ts:6,14` and `hooks/useEthereumChainId.ts:1-2` (the Injective coupling, T3.5).
  - One more route leaves the package: `EvmHydrator.tsx:3` imports `EvmWalletProvider` from the root of `@sodax/wallet-sdk-core`, whose dist is one file (`tsup.config.ts:7`, `splitting: false`). From the t2probe dist, that one import costs 851 KB gzip and keeps the Stellar, ICON, Bitcoin, Injective and Solana libraries. From the per-file source it costs 123 KB [verified, esbuild single-file; see Verification].
- **Bundle today, from the dist [verified]:**

  | Entry | min | gzip | npm packages |
  | --- | ---: | ---: | ---: |
  | `SodaxWalletProvider` + `useXAccount` | 9,991 KB | **2,510 KB** | 237 |
  | ↳ split: initial / on demand | | 1,917 / 696 KB | |
  | `useXAccount` alone | 8,178 KB | **1,989 KB** | 160 |
  | `@sodax/wallet-sdk-react/xchains/evm` | 418 KB | 128 KB | 13 |

  - The root's output keeps imports of 6 Node builtins, so it needs polyfills for them: `buffer`, `crypto`, `events`, `stream`, `string_decoder` and `util`. `fs` is referenced in the graph but tree-shaken [verified, `builtins-in-output.mjs` on the dist entry].
  - The dist has **no `'use client'`**: a grep across `dist/**/*.mjs` finds 0 files, although `SodaxWalletProvider.tsx:1` has one in source.
- **Which chain SDKs dominate.** Marginal cost of each chain on top of the EVM-only source build (502 KB gzip, WalletConnect inlined), single-file [verified]:

  | Chain | Marginal gzip | Dominant code |
  | --- | ---: | --- |
  | Injective | **+907 KB** | `@sodax/libs` (injective/wallet-strategy bundles its own viem, ethers and protobuf), core-proto-ts |
  | Stellar | +325 KB | `@stellar/stellar-sdk`, wallets-kit |
  | Bitcoin | +219 KB | bitcoinjs-lib, elliptic (via wallet-sdk-core's import-time side effect) |
  | ICON | +149 KB | icon-sdk-js |
  | Solana | +123 KB | web3.js v1 |
  | Sui | +112 KB | `@mysten/sui` |
  | Stacks | +65 KB | `@sodax/libs/stacks` |
  | NEAR | +52 KB | near-api-js, near-connect |

- **Install today [verified]:**
  - `@sodax/wallet-sdk-react@2.2.0-rc.8` + base: **1,859 MB, 1,724 packages, 99 vulnerable packages** (1 critical, 40 high, 32 moderate, 26 low; 68 distinct advisories). An EVM-only app pays all of it.
  - Per-chain wallet libraries, each with base:

    | Chain libraries | Size | Packages | Advisories |
    | --- | ---: | ---: | --- |
    | Stellar (wallets-kit ^1.7.5, stellar-sdk 15.1.0) | 454 MB | 679 | 42: 1 critical, 12 high |
    | Solana (wallet-adapter-react 0.15.35 pulls `@solana-mobile` and react-native) | 423 MB | 517 | 20: 17 high |
    | Injective (6 × 1.18.14) | 211 MB | 172 | 13 |
    | Sui | 89 MB | 66 | 0 |
    | ICON | 57 MB | 110 | 7 |
    | Bitcoin (sats-connect) | 42 MB | 46 | 4 high |
    | NEAR | 20 MB | 72 | 0 |
    | `@sodax/libs` rc.8 | 12 MB | 1 | 0 |

- **Module-level state [verified]:**

  | State | Count | Where (command) |
  | --- | ---: | --- |
  | zustand stores | 2 | `useXWalletStore.ts:52` (persist key `'xwagmi-store'`, `:156`) and `useWalletModalStore.ts:46` (`rg -n "= create<"`) |
  | singletons | 9 | Defined at `IconXService.ts:53`, `InjectiveXService.ts:55`, `NearXService.ts:36`, `EvmXService.ts:190`, `BitcoinXService.ts:15`, `SolanaXService.ts:23`, `SuiXService.ts:26`, `StellarXService.ts:46`, `StacksXService.ts:22`; called from 24 non-test sites (`rg -n "static getInstance" \| wc -l`; `rg -n '\.getInstance\('`) |
  | ICONEX queue | 1 | `xchains/icon/iconex/index.tsx:55` |
  | warn-once Sets | 3 | `useXConnectors.ts:10`, `useWalletProvider.ts:12`, `matchConnectorIdentifier.ts:4` |
  | Privy WeakMap / WeakSet | 1 / 1 | `privySource.ts:30` / `PrivyStartupGuard.tsx:9` |

  - The store is touched by 29 non-test files, including its definition, and 6 test files.
  - PR #534 (open, head `ecbdeddc`) adds a 10th singleton at `xchains/tron/TronXService.ts:21,30`.
- **Bug class from singletons [verified]:**
  - ICON and Injective ignore new config after the first creation (`IconXService.ts:53-58`; `InjectiveXService.ts:50-59` documents it).
  - Stellar, NEAR, Bitcoin and Stacks re-apply their arguments.
  - So "remount with a new `key` to change config" (`SodaxWalletProvider.tsx:32-33`) does not apply new ICON or Injective RPCs.
- **SSR [code-traced]:** module-level stores do not leak across requests today, because every write happens in effects (`useInitChainServices.ts:21`) and persist throws without `window` (`useXWalletStore.ts:162-168`).
- **Consumers [verified]:**
  - sodax-frontend enables EVM, Solana, Sui, Stellar, ICON and Injective (`apps/web/providers/constants.ts`, `walletConfig`). It sets EVM `ssr: true` but passes **no** `initialState`.
  - whitelabel enables all 9 chain types and loads the whole wallet tree with `next/dynamic({ ssr: false })` (`src/providers/app-providers.tsx:16-20`), so its app shell waits for the wallet JS: ≈2.3 MB gzip in the all-chain source build above [derived; whitelabel's own build was not measured].
  - Neither imports wagmi, `@solana/wallet-adapter-react`, `@mysten/dapp-kit` or `@privy-io` (`git grep`, 0 hits each).
  - Only the in-repo `apps/example-next-js-16/app/layout.tsx:16` uses EVM cookie `initialState`.

### Change
- **Opt-in adapters:** `config` → `adapters`. Each `xchains/<c>` subpath exports a factory; the root imports EVM only.
- **Lazy chains:** non-EVM chain code loads with `import()`:
  - on first pick;
  - when the wallet modal opens, as a preload;
  - at startup for chains with a persisted connection.
- **Solana and Sui mount as lazy siblings:** `<Suspense fallback={null}><SolanaBridge/></Suspense>` next to `{children}`, not around them.
- **Per-provider state:** each provider gets its own store and services, which replace the static `getInstance()` singletons.

```tsx
// before (2.x): every chain is bundled, even unconfigured ones
<SodaxWalletProvider config={{ EVM: { chains }, SOLANA: {} }}>{children}</SodaxWalletProvider>

// after (proposed): EVM static; solana() is a small descriptor whose implementation is code-split
import { SodaxWalletProvider, evm } from '@sodax/wallet-sdk-react';
import { solana } from '@sodax/wallet-sdk-react/xchains/solana';
<SodaxWalletProvider adapters={[evm({ chains }), solana()]}>{children}</SodaxWalletProvider>
```

### Feasibility — Feasible with caveats · Code-traced
- **Proven within the toy scope [verified, `scripts/lazy-probe.mjs`].**
  - **Setup:** React 19.1.4 / react-dom 19.1.4 / happy-dom 20.9.0, with toy providers (not wallet-sdk-react code). Three patterns:
    - NAIVE: `<Suspense fallback={null}><Lazy>{children}</Lazy></Suspense>`;
    - WRAP: `fallback={children}`, the "non-suspending fallback" idea;
    - SIBLING: the provider mounted beside the app.
  - **Results:**

    | Test | NAIVE | WRAP | SIBLING |
    | --- | --- | --- | --- |
    | `renderToString`, chunk not loaded | app missing from HTML | app in HTML | app in HTML |
    | `renderToPipeableStream`, chunk resolves on the server | app in HTML | app in HTML | app in HTML |
    | `hydrateRoot` while the client chunk is 50 ms late | app effects wait for the chunk | app effects wait for the chunk | **app hydrates at once**; bridge gets context after load |
    | Client-only render, state set before the chunk arrives | app invisible until load | **app remounts on load** (2 mounts, state reset) | app visible, state kept, no remount |

  - **Conclusion:** only SIBLING keeps SSR HTML, hydration and app state. The "multiple renderers" warnings are a probe artefact: server and client run in one process.
- **Sibling mounting fits Solana and Sui, not EVM as built [verified by grep].**
  - `@solana/wallet-adapter-react` hooks are used only in `SolanaActions.tsx:2` and `SolanaHydrator.tsx:2`.
  - `@mysten/dapp-kit-react` hooks are used only in `SuiActions.tsx:2` and `SuiHydrator.tsx:9`.
  - No exported hook needs those contexts. EVM differs on three counts:
    - the exported `useEvmSwitchChain` calls wagmi `useAccount` and `useSwitchChain` (`useEvmSwitchChain.ts:3,95,106`);
    - `PrivyHost` wraps children (`privy/setup.tsx:19-29`, `EvmProvider.tsx:75`);
    - `WagmiProvider` takes the SSR `initialState` (`EvmProvider.tsx:72`).
  - Making EVM lazy is possible, but it loses SSR connection state and gains nothing for P1 [judgement]. Keep EVM static.
- **Bytes a lazy design could reach [verified simulation, `scripts/lazy-sim.mjs`; nothing runs].**
  - **What the simulation does:** it patches the 5 edge files in memory, uses `React.lazy` siblings for Solana and Sui and `import()` for reconnects and the registry, and resolves `@sodax/wallet-sdk-core` per chain folder. That stands in for a per-file wallet-sdk-core build (sdk-2). Today the package exports only `.` and ships one file.
  - **Initial: 162 KB gzip** (27 files: viem, `@sodax/types` 143 KB min, wagmi core).
  - **On demand, per chain:**

    | Chunk | gzip |
    | --- | ---: |
    | Injective | 659 KB |
    | Stellar | 420 KB |
    | ICON | 150 KB |
    | WalletConnect | 132 KB (plus the Reown modal; 452 KB for the whole WalletConnect path) |
    | Solana | 120 KB |
    | Sui | 113 KB |
    | Bitcoin | 82 KB |
    | Stacks | 67 KB |
    | NEAR | 54 KB |

  - **Sanity check:** the union of on-demand chunks is 1,724 KB. The same graph without splitting is 2,363 KB, against 2,337 KB for the unpatched source.
  - **Not counted:** the ~20–60 lines of registry code per chain.
- **Blockers:**
  - **Build:** code splitting needs per-file ESM output (T3.10, sdk-2 analogue). Today tsup emits chunks without `'use client'`.
  - **App UX:**
    - hooks that read a not-yet-loaded chain (`useXConnectors`, `useXService`, `useIsWalletInstalled`) return empty or loading states;
    - the frontend wallet modal must show them;
    - first connect on a big chain waits: Injective's 659 KB takes ≈3.3 s at the 1.6 Mbit/s Lighthouse throttle [derived: 659 × 8 / 1600].
- **Decisions:**
  1. **Is lazy opt-in or the default?** Options: (a) opt-in per adapter in 2.x; (b) the default in 3.0.
  2. **Headless object:** ship `createSodaxWallets()` (T3.8) as the `WalletProviderSource` for dk-4, or keep only the prop.
  3. **Fallback outside a provider:** keep the 2.x "last mounted store" fallback, or throw.

### Complexity — C4
- **PR breakdown [judgement on LOC]:**
  1. Per-provider store and services (T3.1+T3.2): 29 store files, 24 `getInstance` sites, 6 test files; ~700–900 LOC.
  2. `adapters` prop, `evm()` and the config converter (T3.3): ~400 LOC.
  3. Per-chain factories (T3.4): 8 small PRs of ~100–200 LOC each.
  4. Injective decoupling (T3.5): ~100 LOC.
  5. Per-file ESM build that keeps `'use client'` (T3.10).
  6. Lazy chains, sibling mounting, preload and reconnect, plus `createSodaxWallets` (T3.8/T3.9): ~800–1,200 LOC.
  7. 3.0 removals and a per-chain isolation gate (T3.6).
  - Total ≳3k LOC in a package of 8,141 non-test and 5,118 test LOC.
- **Tests and migration:**
  - persisted reconnect per chain under late loading;
  - SSR and hydration with real providers;
  - Hydrator ordering.
  - Migration: one provider call in each consumer (frontend `wallet-providers.tsx:11`, whitelabel `wallet-provider.tsx:74`) plus a modal loading state; 6 in-repo apps pass `config` (c-wallet §T3); a codemod (x-3).
- **Coordination:** PRs #534 (Tron), #497 (XRP), #95 (Aleo) and #163 (wallet-hw) edit `chainRegistry.ts`, `SodaxWalletProvider.tsx`, `types/config.ts` and `EvmProvider.tsx`.
- **Breaking:** additive in 2.x. Removing `config`, `getInstance()` and `getXService()` breaks in 3.0.
- **Top 2 risks:**
  1. Late-loading races on the signing path: `walletProvider` stays undefined after a reload, or wallets bind in the wrong order.
  2. Churn with the chain PRs above, plus connect latency on big chains.
- **Versus earlier points:** T3.1–T3.10 = 33 pts. That is plausible for this C4. Skipping the 2.x expand phase saves the ~3–4 pts c-wallet quoted.

### Benefit — B4
- **P1, EVM-only React dapp:**
  - Bundle: initial wallet JS 1,744 → **160 KB** gzip, −1,584 KB or −91% [derived from two split source builds]. The 1,744 KB baseline is the source build; the dist gives 1,917 KB.
  - The 160 KB needs opt-in **and** a per-file wallet-sdk-core (sdk-2). With opt-in alone and today's one-file wallet-sdk-core dist, the initial is ~924 KB, −47% [verified, esbuild split: wallet-sdk-react EVM-only source plus `EvmWalletProvider` from the t2probe wallet-sdk-core dist]. That alone still clears B4's 200 KB line.
  - Install: 1,859 MB / 99 vulnerable packages →
    - **1,025 MB / 51** with wsr-1 alone (wallet-sdk-react drops its chain libs; wallet-sdk-core unchanged);
    - 460 MB / 31 with wsr-2 too;
    - ≈110–120 MB once wallet-sdk-core is EVM-only (wsc-3).

    The first two are verified installs; the last is derived (wagmi v3 stack 97 MB plus SODAX packages; `measurements.md` what-if 108 MB).
- **P2, multi-chain dapp:**
  - Opt-in alone barely helps: the frontend's 6-chain set is 2,083 KB gzip against 2,337 KB, −11% [verified].
  - With lazy chains, initial is **~162 KB** against 1,744 KB, −91% [derived from the simulation], with the same wallet-sdk-core precondition. At the mobile throttle that is 8.7 s → 0.8 s for wallet JS [derived].
  - Whitelabel's `ssr:false` wallet gate would stop holding the app shell on 2.3 MB.
- **P3, P4:** none. This is a React, bundler-only package.
- **P5:** per-provider services remove the ICON/Injective remount bug and module-state leaks between tests. More async states to maintain [judgement].
- **P6:** smaller, explicit adapter surface [judgement].
- **Unblocks:** dk-4 (`WalletProviderSource` from the per-provider store) and the adapter shape for wsr-5.

### Recommendation
- **Timing:** 3.0, with the expand phase (T3.1–T3.5, T3.8, opt-in lazy chains) in 2.x.
- **Order:**
  1. Merge #534.
  2. Per-provider store.
  3. Adapters.
  4. Per-file ESM, in wallet-sdk-react and wallet-sdk-core (sdk-2).
  5. Lazy siblings.
- **Corrected wording:** "Use opt-in chain adapters (adapters={[evm(), solana()]}), load non-EVM chain code on demand with Solana and Sui providers mounted beside the app, and scope state to each provider"

### Corrections to earlier research
- **e-519 wsr-1, "lazy-load can't be promised; EVM, Solana and Sui wrap the app":** this is too strong for Solana and Sui. No exported hook uses their contexts, and the sibling probe passes. Only EVM is tied to wrapping, through `useEvmSwitchChain`, PrivyHost and SSR `initialState`.
- **`plan-v3-order.md` §12, "124 KB vs 2.6 MB" (an estimate):**
  - Now simulated: 162 KB initial against 1,744 KB split, 2,337 KB single-file. The 162 KB assumes a per-file wallet-sdk-core; with today's dist, an EVM-only build is ~924 KB.
  - The order of magnitude holds.
  - The lazy chunks are uneven: Injective alone is 659 KB.
- **c-wallet §T3, "9 singletons":** confirmed. Not noted before: ICON and Injective ignore config on remount.
- **This file's earlier "Bundle, needs opt-in only" (160 KB):** too strong. The source builds resolved wallet-sdk-core per file. With today's one-file dist, opt-in alone reaches ~924 KB (verification pass).

## wsr-2 · wagmi v3, connector SDKs optional
**Bullet:** "Upgrade to wagmi v3 and install connector SDK dependencies only when their connectors are used"  ·  **T-ids:** T7.0, T7.1

### Today
- **Catalog [verified]:**
  - `pnpm-workspace.yaml:36-39`: react-query 5.87.4, TS 5.5.4, viem 2.29.2, wagmi 2.16.9. An override pins react-query at `:133`.
  - Cooldown `minimumReleaseAge: 20160` at `:7`; `trustPolicy: no-downgrade` at `:10`.
  - wallet-sdk-react depends on wagmi and viem directly (`package.json:98-99`).
- **wagmi 2.16.9 pulls every connector SDK [verified, `npm view`].** `@wagmi/connectors` 5.9.9 **hard-depends** on:
  - `@metamask/sdk` 0.32.0;
  - Coinbase wallet-sdk 4.3.6, plus `cbw-sdk` 3.9.3 (a second Coinbase copy);
  - `@base-org/account` 1.1.1;
  - `@gemini-wallet/core`;
  - the Safe apps SDK and provider;
  - `@walletconnect/ethereum-provider` 2.21.1.
- **wagmi API use [verified path:line]:**
  - `EvmActions.tsx:2-3,19-20`: `useConfig`, `useConnect().connectAsync`, `useSignMessage().signMessageAsync`, the `disconnect` action.
  - `EvmHydrator.tsx:2,14-21`: `useAccount`, `useReconnect`, `useWalletClient`, among others.
  - `useEvmSwitchChain.ts:3,95,106`.
  - `EvmProvider.tsx:2-3,39,72`.
  - `EvmXService.ts:8-32,131-171,199,212,262`.
  - Privy `createConnector` at `privy/privyConnector.ts:62`, with `connect()` at `:227` returning `{ accounts: [address] }` at `:231` and `:321`.
  - Public wagmi types in `types/config.ts:31-32`.
- **Consumers [verified]:**
  - 0 direct wagmi imports in both.
  - **Neither configures WalletConnect** (frontend EVM slot `{ ssr, chains }`; whitelabel `{ reconnectOnMount, ssr, chains }`), yet both install the full WalletConnect and Reown stack today.
- **wallet-sdk-react source is unchanged since the earlier probes' commit** (`git diff --stat cc053fef 0181a053 -- packages/wallet-sdk-react/src` is empty) [verified].

### Change
- wagmi 2.16.9 → 3.7.7. wagmi, viem (≥2.43) and react-query become peers.
- `@walletconnect/ethereum-provider` becomes an optional peer.
- The Privy connector honours `withCapabilities`.
- The v3 names replace the deprecated ones.

```bash
# before: every connector SDK installs, used or not
npm i @sodax/wallet-sdk-react
# after (3.0)
npm i @sodax/wallet-sdk-react wagmi@^3 viem @tanstack/react-query
npm i @walletconnect/ethereum-provider   # only when EVM.walletConnect.projectId is set
```

App code is unchanged for both consumers, since neither imports wagmi.

### Feasibility — Feasible with caveats · Code-traced
- **Past the cooldown [verified, `npm view <pkg> time`]:**
  - wagmi 3.7.7, the latest (2026-08-27, 53 days old);
  - `@wagmi/connectors` 8.2.0 and `@wagmi/core` 3.6.5 (same day);
  - newest viem before the cutoff: 2.57.3 (2026-10-04);
  - TS 5.9.3 (2025-09-30). TS 7.0.2 is the latest.
- **Peers [verified]:**
  - wagmi 3.7.7: viem `2.x`, react `>=18`, react-query `>=5.0.0`, **typescript `>=5.9.3` as an optional peer**.
  - connectors 8.2.0: every connector SDK is an optional peer, WalletConnect `^2.21.1` included.
- **The one compile break, proven by a stand-in probe [verified, `tsprobe-wagmi3/`].**
  - In wagmi 3.7.7, `connect<withCapabilities>()` must return accounts shaped by `withCapabilities` (`@wagmi/core` `createConnector.d.ts`).
  - A connector with our `connect()` shape fails with TS2322. The fix compiles with 0 errors.
  - Results are the same on TS 5.5.4 and 5.9.3 with `skipLibCheck` (our setting).
  - **So TS 5.9.3 is recommended, not required to compile** [verified within probe scope].
- **Same break on the real sources with viem 2.57.3 [verified, `wf-finish-wsr/tsc57/`].**
  - **Scope:** 45 wallet-sdk-react source files at `0181a053`: the EVM provider, hydrator, actions and XService, `useEvmSwitchChain`, the Privy connector and runtime (7 of 12 `privy/` files), the store, core and types. This is the file set of c-wallet probe P4. `chainRegistry.ts` and `xchains/injective/index.ts` are P4's stubs, and `@sodax/wallet-sdk-core` and `@injectivelabs/wallet-base` are stubbed. `@sodax/types` maps to the real `packages/types/src`. The other chains are not in scope. The set holds 9 of the 10 non-test files that import wagmi; the 10th is `InjectiveXService.ts` (`rg -l "from ['\"](wagmi|@wagmi)"`). The 5 `privy/` files left out don't import wagmi.
  - **Toolchain:** wagmi 3.7.7 (`@wagmi/core` 3.6.5), viem 2.57.3, TS 5.9.3, P4's tsconfig (`strict`, `skipLibCheck`). Installed with `npm i --ignore-scripts --before=2026-10-05`.
  - **Result:** unpatched, there is 1 error, `privy/privyConnector.ts(62,55)` TS2345. With P4's `withCapabilities` patch (7 changed lines, `diff | grep -c '^[<>]'`), there are 0 errors. Command: `tsc -p tsconfig.json`.
  - c-wallet P4 had already compiled the same file set on viem 2.43.0, and the result was the same.
  - The verification pass re-ran the set with TS 5.5.4, the catalog version: 1 error unpatched and 0 patched, as on 5.9.3 [verified]. So TS 5.9.3 is not needed to compile the real EVM path either.
- **Deprecated, still working [verified, wagmi 3.7.7 d.ts]:**
  - `useAccount` → `useConnection` (`exports/index.d.ts:23-24`);
  - `connectAsync`, `signMessageAsync`, `switchChain` and `reconnect` → `mutate` / `mutateAsync`.
  - Removed: `useConnect().connectors` and `useReconnect().connectors`, which we don't use.
- **viem ≥2.43:**
  - The runtime floor comes from earlier probe P2 (c-wallet §T7), not re-run. The bundle and typecheck here used 2.57.3, the newest viem past the cooldown; the 2.43.0 floor itself was not measured.
  - Our viem surface outside the core module [verified, `rg` in `packages/*/src`, non-test]: 3 `viem/chains` imports, 1 `viem/accounts`, and EIP-5792 through `WalletClient` methods (`wallet-sdk-core EvmWalletProvider.ts:227,251,273`). No `viem/experimental`.
  - wallet-sdk-react's EVM and Privy sources typecheck on viem 2.57.3 with no viem-related error (above) [verified within that scope].
  - The sdk and wallet-sdk-core on viem 2.57.x were not typechecked. That needs a repo install, which the hard rules forbid. See Not verified and sdk-3.
- **Decision:** keep the TS ≥5.9.3 peer as a recommendation, or bump the catalog. TS 6 and 7 exist.

### Complexity — C3
- **PRs:**
  1. Catalog: viem ≥2.43 (shared with sdk-3/T7.0), plus optional TS.
  2. wallet-sdk-react, ~200–400 LOC [judgement]:
     - peers;
     - the Privy fix (signature plus 2 returns);
     - renames in 3 source files: `EvmActions.tsx`, `EvmHydrator.tsx` and `useEvmSwitchChain.ts` (`rg -l` for the deprecated names);
     - test mocks (`EvmHydrator.test.tsx` mocks `useAccount`);
     - the WalletConnect optional peer.
  3. Docs and skills.
- **Breaking:** yes, in 3.0. It changes the peer major, and wagmi types are public (`types/config.ts:31-32`; `xchains/evm` exports `createWagmiConfig`).
- **Coordination:** #163 (wallet-hw's connectors have the same `withCapabilities` break); `EvmProvider.tsx` with wsr-3 and wsr-1.
- **Top 2 risks:**
  1. viem 2.29 → 2.57 type fallout across sdk and wallet-sdk-core. This is not checked. wallet-sdk-react's EVM path is clean in the scratch typecheck.
  2. WalletConnect apps that don't add the peer hit a runtime connect failure, so this must be documented.
     - **Shown for esbuild [verified, `scripts/grep-out.mjs` on the v3 sodax-shape entry]:** the build emits no error or warning, only a debug-level `ignored-dynamic-import` note. The output keeps a bare `import("@walletconnect/ethereum-provider")`, and connectors 8.2.0 rethrows its failure (`walletConnect.js:164-185`).
     - webpack, Vite and Turbopack were not tested. The source has `/* turbopackOptional: true */` and a `try` block "for webpack" at `:163-166`.
- **Versus earlier points:** T7.0 (2) + T7.1 (3) = 5. That fits.

### Benefit — B4
- **Install [verified]:**

  | Install | Size | Packages | Advisories |
  | --- | ---: | ---: | --- |
  | EVM stack, wagmi 2.16.9 + viem 2.29.2 | 575 MB | 378 | 23 (1 high) |
  | EVM stack, wagmi 3.7.7 + viem 2.57.3 | **97 MB** | **24** | **0** |
  | wagmi 3 + WalletConnect 2.25.0 | 455 MB | 301 | 0 |

  Opting in to WalletConnect therefore costs +358 MB [derived].
- **Standalone on today's all-chain package [verified, npm `overrides: { wagmi: 3.7.7 }` on wsr 2.2.0-rc.8]:** 1,859 MB / 1,724 packages / 99 vulnerable packages → **1,318 MB / 1,442 / 84**, a saving of −541 MB and −15 vulnerable packages (distinct advisories 68 → 67).
- **Combined with wsr-1 for P1:** 1,025 → 460 MB, 51 → 31 vulnerable packages (distinct advisories 53 → 51) [verified]. Both consumers would drop WalletConnect entirely.
- **Bundle: no initial-JS gain on code-split builds [verified, `wf-finish-wsr/out/bundle.txt`].**
  - **Method:** this file's esbuild method, through `measure.mjs`. There are two entries, each with the same source for every stack:
    - `minimal.tsx`: `createConfig` with `injected()`, 2 chains, `WagmiProvider` and 3 hooks;
    - `sodax-shape.tsx`: the wagmi surface wallet-sdk-react's EVM path uses. That is 12 chains, cookie storage, `cookieToInitialState`, 9 hooks, `disconnect` and `getPublicClient`, and a static `walletConnect` import called only when a `projectId` is set (as in `EvmProvider.tsx:3,37-39`).

    Each stack was installed with `npm i --ignore-scripts --before=2026-10-05`. The v3 stack has `@wagmi/connectors` 8.2.0 with no optional SDKs. wagmi 2.16.9 + viem 2.57.3 isolates the viem bump.

  | Entry, gzip KB | wagmi 2.16.9 + viem 2.29.2 (today) | wagmi 2.16.9 + viem 2.57.3 | wagmi 3.7.7 + viem 2.57.3 |
  | --- | ---: | ---: | ---: |
  | minimal, single file | 20 | 21 | 21 |
  | minimal, split initial | 87 | 105 | 44 |
  | sodax-shape, single file | 460 | 481 | **112** |
  | sodax-shape, split initial / on demand | 97 / 403 | 118 / 409 | **112 / 0** |

  - **Code-split builds, the common path:**
    - At the same viem, v3 changes initial JS by −6 KB (118 → 112).
    - The viem bump (to 2.57.3) adds +21 KB (97 → 118). So the net change from today is **+15 KB**: 97 → 112 KB [derived from the table].
    - **Cross-check, second method [verified, verification pass]:** single-file builds with `@walletconnect/ethereum-provider` stubbed, which is what an ideal splitter loads first, give 93 / 114 / 112 KB. That is +19 KB net: +21 KB from viem and −2 KB from wagmi v3. So 4 KB of the −6 KB above is esbuild split overhead. The conclusion holds.
    - The 403 KB on-demand WalletConnect stack (`@reown/*` and `@walletconnect/*`) is gone because the peer is not installed. Neither consumer sets a `projectId`, so neither loads it: `EvmProvider.tsx:37-39` adds the connector only when one is set.
    - Applied to wsr-1's ~162 KB lazy initial, expect ≈177–181 KB with v3 [derived: 162 + 15 or + 19; not measured together].
  - **Single-file builds:** 460 → 112 KB (−348 KB), because esbuild inlines v2's WalletConnect `import()` when splitting is off.
  - **esbuild with splitting, minimal app: 87 → 44 KB.**
    - v2 leaves 3,759 KB min of dead chunks from the connector SDKs' `import()` calls. v3 leaves 37 KB [verified].
    - Code shared with those chunks is hoisted into the initial chunk. This mechanism is [judgement]; the bytes are measured.
    - This is esbuild-specific. Other bundlers were not tested.
  - **Node builtins [verified, `scripts/builtins-in-output.mjs`]:** the v2 sodax-shape output keeps an `events` import from the WalletConnect stack. The v3 outputs keep none.
  - **Effect on the score:** none. B4 rests on the install and advisory numbers.
- **P1–P2:** as above. **P3–P4:** none. **P5:** removes the deprecated `@metamask/sdk` 0.32.0 from the tree.
- **Caveat:** apps that enable Privy keep wagmi v2 in their install. `@privy-io/react-auth` → `x402 ^0.7.1` → `wagmi ^2.15.6` [verified, `npm view`; the Privy install contains `@wagmi/connectors` 6.2.0].

### Recommendation
- **Timing:** 3.0, as the first PR of the window. Keep TS ≥5.9.3 as a documented recommendation unless the repo moves anyway.
- **Corrected wording:** "Upgrade to wagmi v3 (viem ≥2.43) and make connector SDKs optional peers, installed only when their connectors are used"

### Corrections to earlier research
- **e-519 wsr-2 / Decision 6, "TS ≥5.9.3 repo-wide":** a recommendation, not a blocker. The stand-in probe and the 45-file real set both compile on 5.5.4 with `skipLibCheck`.
- **measurements.md:** v2 → v3 measured again: 575 MB / 23 advisories → 97 MB / 0, consistent with 576 → 102 MB.
- **Any claim that wagmi v3 shrinks the bundle:** it holds only for single-file builds (−348 KB, SODAX-shaped entry) and for a minimal injected-only app under esbuild splitting (−43 KB, an esbuild dead-chunk effect). For the SODAX-shaped entry on a code-split path, initial JS rises 15–19 KB with the viem bump. WalletConnect was already a dynamic import in v2 (`@wagmi/connectors` 5.9.9 `walletConnect.js:158`).
- **This file's earlier Not verified, "only a stand-in connector was compiled":** wrong. c-wallet P4 compiled the real EVM and Privy sources on viem 2.43.0, and this run repeated it on viem 2.57.3.

## wsr-3 · Reuse the app's QueryClient
**Bullet:** "Reuse the app's QueryClient instead of creating a nested one"  ·  **T-ids:** T9.1

### Today
- **The nested client [verified]:**
  - `providers/evm/EvmProvider.tsx:27-30` creates `new QueryClient()` with no options.
  - `:70-77` wraps **children** in its own `QueryClientProvider`.
  - The `SodaxWalletProvider.tsx:35-36` doc says apps must provide one.
  - dapp-kit has 49 non-test files calling `useQueryClient` (c-wallet §T9; re-counted in the verification pass with `rg -l "useQueryClient\("`).
- **wagmi's wallet-client query [verified]:** it fixes its own options, `staleTime: Infinity` (wagmi 2.16.9 `useWalletClient.js`) and `gcTime: 0` (`@wagmi/core` `getWalletClient.js`).
- **User-visible effects in consumers [verified]:**
  - **Whitelabel:**
    - its app client sets `staleTime 60s`, `retry 2`, `refetchOnWindowFocus false` and a `MutationCache.onError` logger (`src/lib/query-client.ts:3-25`);
    - every component under `WalletProviderWrapper` (`app-providers.tsx:56-65`) gets the private client instead: staleTime 0, retry 3, refetch on focus, no error log.
  - **Frontend:** `staleTime: 60s` and its dehydrate settings (`app/get-query-client.ts`) are bypassed the same way, because QueryProvider > WalletProviders > SodaxWalletProvider.
  - **Invalidation works today.** App `useQueryClient()` calls under the provider hit the same private client as the queries they invalidate: frontend 9 and whitelabel 2 `invalidateQueries` calls, all key-filtered. Whitelabel's third call (`src/components/admin/user-management.tsx:118`) runs under the admin page's own `QueryClientProvider` (`src/app/admin/(protected)/page.tsx:59-63`), so it is unaffected.
  - **Unused features:** 0 `HydrationBoundary`, 0 `dehydrate(`, 0 `prefetchQuery` and 0 devtools in both apps, so SSR dehydration and devtools are latent issues only.

### Change
Use `useContext(QueryClientContext)`, and create a private client only when none exists (c-wallet §T9 code).

```tsx
<QueryClientProvider client={appClient /* staleTime 60s, retry 2 */}>
  <SodaxWalletProvider config={cfg}>
    <App /> {/* before: useQueryClient() → private client; after: appClient */}
```

### Feasibility — Feasible · Code-traced
- **No API change:** `QueryClientContext` is exported by react-query 5.87.4 (c-wallet P4 typecheck; not re-run).
- **Edge case:** a duplicate react-query copy misses the context and falls back to today's behaviour. The `pnpm-workspace.yaml:127-133` comment documents that failure mode.

### Complexity — C1
- **One PR:** ~20 LOC plus ~60 LOC of tests showing a dapp-kit-style hook sees the outer client.
- **Breaking:** no.
- **Coordination:** the same block as #163, wsr-1 and wsr-2.
- **Top 2 risks:**
  1. Apps' own defaults now apply to SODAX queries (e.g. whitelabel stops refetching on focus): intended, but it belongs in the release note.
  2. An unfiltered `invalidateQueries()` or `clear()` would refetch wagmi's connector client (`EvmHydrator.tsx:83-96`). Neither consumer does this.
- **Versus earlier points:** T9.1 = 1 pt. Agrees.

### Benefit — B2
- **P1, P2:** app QueryClient config and handlers work as documented. There is one cache instead of an unused outer one.
- **P5:** removes a doc/code contradiction.
- **Measured size or speed effect:** none.

### Recommendation
- **Timing:** 2.x, now.
- **Wording:** keep it as worded.

### Corrections to earlier research
- **e-519 wsr-3, "wagmi queries then pick up the app's defaults":** the main effect is the reverse. Today **SODAX's own queries** miss the app's defaults. wagmi's wallet-client query keeps its own staleTime.

## wsr-4 · Typed per-chain account hooks
**Bullet:** "Add typed per-chain account hooks"  ·  **T-ids:** T30.1

### Today
- **Hook and type shape [verified]:**
  - `useXAccount` (`hooks/useXAccount.ts:10-38`) returns `XAccount = { address: string | undefined; xChainType: ChainType | undefined; publicKey?: string }` (`types/account.ts:3-7`). The union is not discriminated.
  - Wallet address types are narrower than `string` only for EVM (`Address`, `types/src/evm/evm.ts:91`) and ICON (`IconEoaAddress`, `icon/icon.ts:64`). Injective is a `string` alias; every other chain returns `Promise<string>`.
  - `GetAddressType` (`common/common.ts:84-101`) maps Stellar and Sui to `Hex` and NEAR to `Address`. Those are not wallet account formats, so it does not fit here [code-traced].
- **Call sites [verified, `git grep -F "useXAccount("`, excluding definitions]:**
  - **Frontend:** 40 calls.
    - 3 use a static chain: `icxsoda-migration.tsx:21` (`'ICON'`), `stake-store-provider.tsx:56` (Sonic constant), `evm-chain-item.tsx:29` (`'EVM'`).
    - 8 address casts ``as `0x${string}` ``, all in staking (e.g. `unstake-request-item.tsx:96,129`). Only one (`stake-store-provider.tsx:58`) follows a static call; the other 7 cast addresses from dynamic chain keys. A 9th cast of that form (`supply-dialog-footer.tsx:396`) is a tx hash.
  - **Whitelabel:** 21 calls, 1 static (`use-btc-trading-balance.ts:26`), 0 address casts. Its one cast of that form (`src/app/layout.tsx:47`) is a config fee receiver.
- **Naming clash [verified]:** wagmi 3.7.7 exports `useAccount` as a deprecated alias of `useConnection` (`exports/index.d.ts:23-24`).

### Change
Infer the address type from a literal key, and return a discriminated union for dynamic keys.

```ts
const { address } = useXAccount({ xChainId: SONIC_MAINNET_CHAIN_ID });
useStake({ srcAddress: address as `0x${string}` | undefined });   // today
// proposed: address is `0x${string}` | undefined when the key is a literal EVM chain; no cast
```

### Feasibility — Feasible · Code-traced
- **Approach:** type-level only, with an overload on `useXAccount<K>`, plus per-chain address types in `@sodax/types`.
- **Decision:** generic `useXAccount<K>`, or per-chain hooks in subpaths (`useSolanaAccount`). Don't name a root hook `useAccount`.

### Complexity — C2
- **PRs:** 1–2, ~150–300 LOC (types, overloads, tests, docs).
- **Breaking:** additive.
- **Coordination:** dk-6 / T26 names.
- **Top 2 risks:**
  1. Naming churn.
  2. False precision: per-chain branded types for chains whose addresses are plain strings today.
- **Versus earlier points:** T30.1 = 3 pts. A bit high for the value.

### Benefit — B1
- **P1:** EVM-only apps gain a typed `0x` address.
- **P2:** 4 of 61 consumer calls benefit, and 1 of 8 casts goes away [verified counts]. The 7 staking casts come from dynamic keys (see dk-5/dk-6).
- **P6:** clearer types for agents [judgement].

### Recommendation
- **Timing:** Later (3.x, additive).
- **Corrected wording:** "Type useXAccount's address by chain (narrow for EVM and ICON), without adding a hook named useAccount"

### Corrections to earlier research
- **client-usage.md T30, `useAccount('SOLANA')`:** that name clashes with wagmi, and Solana's address type is `string`, so it gains nothing today.

## wsr-5 · Embedded and social wallets, starting with Privy
**Bullet:** "Support embedded and social wallet integrations through adapters, starting with Privy"  ·  **T-ids:** T36.1

### Today
- **What is on main [verified]:** PR #486 merged on 2026-10-13 and closed #456.
  - It adds email login only: `buildPrivyConfig` hardcodes `loginMethods: ['email']` (`privy/privyConfig.ts:46`) and turns off external wallets (`:48`).
  - Only the EVM embedded wallet is created (`:49-51`).
  - The wiring is `EVM: { privy: privy({ appId }) }`, with `privy()` exported from `./privy`.
- **Unreleased [verified]:** `npm view @sodax/wallet-sdk-react@2.2.0 exports` has no `./privy`. 2.2.0 was published on 2026-10-12, a day before the merge.
- **Consumers [verified]:** 0 Privy mentions in either app.
- **Demand [verified, `gh issue list --search`]:**
  - #456 said "V1 = EVM only. Solana can be a follow-up".
  - frontend#1069 (email login) closed 2026-10-19.
  - frontend#544 (closed; opened 2025-11-20; developer feedback) has an unchecked item "Social or email login in the wallet sdk". Email login has since shipped (#486).
  - No other issue asks for social login, and none asks for Solana embedded wallets. Queries: privy, social login, embedded wallet, google login, web3auth, email login, passkey, on sodax-sdks and sodax-frontend with `--state all`.
- **Cost:**
  - Install [verified]: Privy 3.47.0 + base is **1,164 MB / 693 packages / 25 advisories**; with wagmi 3 it is 1,337 MB. Most of it comes from `x402` → wagmi v2 + `@wagmi/connectors` 6.2.0 (329 MB).
  - Bundle [verified]: `privy()` from the dist is 1,529 KB gzip single-file; split, **737 KB initial** + 891 KB on demand. `@solana-program/*` had to be stubbed: in the t2probe store, `@solana-program/token` 0.9.0 doesn't bundle against `@solana/kit` 2.3.0 under esbuild (missing export `sequentialInstructionPlan`).
  - PR #486 lists the limit "Privy initialises for every visitor once `EVM.privy` is set".

### Change
- **Social login:** expose `loginMethods`. Privy 3.40.0 accepts `google`, `apple`, `twitter`, `discord`, `github`, `passkey`, `sms` and others (`types-*.d.ts`).
- **Solana embedded wallet:** a Privy Solana connector. One `privy()` value is shared by the EVM and Solana adapters.
- **Lazy Privy:** load Privy only on first use, or when a stored Privy session exists.

```ts
// today (main): EVM: { privy: privy({ appId }) }
const p = privy({ appId, loginMethods: ['email', 'google', 'apple'] });          // proposed
<SodaxWalletProvider adapters={[evm({ privy: p }), solana({ privy: p })]} />      // one session, two chains
```

### Feasibility — Needs a decision · Code-traced
- **Social login:**
  - Small in code: one option, plus the matching Privy dashboard setting.
  - Untested: the OAuth redirect or popup return against the connector's 3 s restore budget (`privy/constants.ts:10`).
- **Solana without migrating the SDK to `@solana/kit` [code-traced from Privy 3.40.0 d.ts, not run]:**
  - Privy's `/solana` signing hooks take `transaction: Uint8Array` (`solana.d.ts:81,93,244,270`), so web3.js v1 transactions can be serialized and passed in.
  - But `/solana` imports `@solana/kit` and `@solana-program/memo` at runtime (`dist/esm/solana.mjs`). Apps must install them: 33 MB, 50 packages, 0 advisories [verified].
  - Privy discovers wallets with `getWallets()` and doesn't register its embedded wallet, so `@solana/wallet-adapter-react` won't list it. A custom connector is needed [code-traced].
- **"Adapters" fit:** Privy is a cross-chain source (one login, wallets on several chains). It fits as a source value passed to each chain adapter, with one Host per source, not as a chain adapter [judgement].
- **Decisions:**
  1. Is social login wanted, and which providers?
  2. Solana embedded wallets: now, or after demand?
  3. Lazy Privy, which needs wsr-1's sibling pattern.

### Complexity — C4
- **Breakdown [judgement]:**
  - Social login alone: **C2**, ~100–200 LOC plus OAuth-return tests.
  - Solana: a connector bridged through the existing runtime, a shared Host and docs/skills, at a scale similar to #486 (88 files, +6,378/−247 LOC with docs; `gh pr view 486`). It sits on a signing path, which the rubric lists under C5. It stays C4 because Privy signs and the SDK only passes serialized bytes [judgement].
- **Breaking:** additive.
- **Coordination:** depends on the wsr-1 adapter shape and wsr-2 (`withCapabilities`).
- **Top 2 risks:**
  1. Embedded signing on a funds path: Solana byte round-trips, custody UX.
  2. 737 KB gzip and 1.2 GB install for every app that enables Privy.
- **Versus earlier points:** T36.1 = 2 pts. That is low if Solana is in scope.

### Benefit — B2
- **P1/P2:** onboarding without a wallet extension, but no consumer uses Privy [verified]. The only request found is frontend#544's 2025 "social or email login" item.
- **P5:** no gain.
- **Cost:** the weight above.
- Benefit could reach B4 only if product names it a need [judgement].

### Recommendation
- **Timing:**
  - Release the email login as is.
  - Add social login in 2.x when product asks.
  - Solana embedded wallets later.
  - Make Privy lazy with wsr-1.
- **Corrected wording:** "Support embedded and social wallets as wallet sources passed to chain adapters: social login on today's Privy email login, then Solana, with Privy loaded only when used"

### Corrections to earlier research
- **e-519 wsr-5, "Solana Privy needs `@solana/kit`":** the app must install kit for Privy, but the SDK's Solana stack need not migrate (`Uint8Array` API).
- **c-wallet P9, "no wagmi or viem peer":** true for peers, but the `x402` dependency installs wagmi v2.

---

## Dependencies between these bullets
- **wsr-1:**
  - its install win for P1 needs **wsc-3** (wallet-sdk-core still installs 507 MB / 31 vulnerable packages (51 distinct advisories) alone [verified]);
  - its bundle win (160 / 162 KB) needs **sdk-2** applied to wallet-sdk-core (per-file ESM); with today's one-file dist, the EVM-only initial is ~924 KB [verified];
  - lazy chunks need per-file ESM (**sdk-2** pattern, T3.10);
  - peer policy comes from **sdk-3**;
  - signer packaging comes from **sdk-1** and **wsc-1**;
  - **dk-4**: its option (b) can ship first on today's wallet-sdk-react (dapp-kit-flows.md), and its hook moves onto wsr-1's per-provider store and `WalletProviderSource` later;
  - migration needs **x-3**;
  - budgets need **x-2**;
  - it is bundler-only per **x-4**;
  - a 3.0 break means **x-5** backports.
- **wsr-2:** the toolchain floor is shared with **sdk-3**. It combines with wsr-1 for the install numbers above. Privy (wsr-5) keeps wagmi v2 in installs.
- **wsr-3:** independent. Shares `EvmProvider.tsx` with wsr-1 and wsr-2. **api-2** should follow the same QueryClient rule.
- **wsr-4:** naming with **dk-6**. The staking casts point at **dk-5/dk-6** param types. Types live in **x-1**.
- **wsr-5:** uses the wsr-1 adapter shape and the wsr-2 connector API. **wsc-4** (Wallet Standard) is relevant for Solana. Docs and skills go through **sk-1..4**.

## Not verified
- **A repo-wide typecheck on viem 2.57.x, for sdk and wallet-sdk-core.**
  - It needs `pnpm install` in a worktree, and the hard rules forbid both. It belongs to sdk-3.
  - Checked: wallet-sdk-react's EVM and Privy file set (45 files, other chains and wallet-sdk-core stubbed) on wagmi 3.7.7 + viem 2.57.3.
  - The viem ≥2.43 runtime floor comes from earlier probe P2 and was not re-run.
- **The full wallet-sdk-react package on wagmi 3.7.7.** The non-EVM chains were stubbed, but they don't import wagmi, apart from `InjectiveXService.ts:7` (`wagmi/chains`) [verified, `rg "from ['\"](wagmi|@wagmi)"`].
- **The v3 bundle in webpack, Vite or Turbopack** (esbuild only). That includes how each one treats the missing `@walletconnect/ethereum-provider` optional import.
- **The v3 bundle with the WalletConnect peer installed.**
- **The 160 / 162 KB figures against a real per-file wallet-sdk-core build.** The source tree stands in for it; packaging.md did not build wallet-sdk-core with the sdk-2 template.
- **The bundle weight at the viem floor 2.43.0.** Only 2.29.2 and 2.57.3 were measured.
- The EVM-only wallet-sdk-core install (~110–120 MB is derived).
- A working lazy implementation:
  - reload reconnect per chain;
  - Hydrator ordering;
  - `wallet-adapter` `autoConnect` under late mount;
  - Next.js streaming with the real providers.

  Only a toy React probe and a bundler simulation exist.
- How bundle numbers transfer to other bundlers: esbuild only, with React and react-query external, and split sizes summed per file. Vite or webpack may differ.
- Privy:
  - the OAuth return flow;
  - Solana `Uint8Array` interop;
  - newer Privy (≥3.47) registering Wallet Standard wallets (checked on 3.40.0 only).
- How stable install and advisory numbers are: npm 11.6.0 auto-installs peers; audit run on 2026-10-19.

## Resume notes
Scratch root: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-wsr/`

- **Shared:**
  - Scripts:
    - `scripts/measure.mjs` (bundle; needs `ESBUILD=<t2probe>/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild`);
    - `scripts/src-measure.sh <label> <keep-chains|ALL|NONE> [--split]`;
    - `scripts/chains.sh`;
    - `scripts/inst.sh <name> <specs…>`.
  - Outputs:
    - `out/*.json` (per-package bytes);
    - `inst/results.tsv` (every install row);
    - `inst/<name>/{package-lock.json,audit.json}`;
    - `npmview/*.time.json`.
  - Cleanup: delete `dl-wagmi3/` (114 MB, now unused). Disk was at 95% on 2026-10-19.
- **Finish run scratch:** `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-wsr/`
  - `scripts/entries/{minimal,sodax-shape}.tsx`, copied into `v2/src`, `v2v57/src` and `v3/src`.
  - `scripts/measure.mjs` is the deep-wsr script with `logLevel: 'warning'`. Re-run with `ESBUILD=… node scripts/measure.mjs <label> <entry> [--split]`.
  - `scripts/grep-out.mjs` and `scripts/builtins-in-output.mjs`.
  - Outputs: `out/bundle.txt`, `out/builtins.txt` and `out/*.json`.
  - `v2/` and `v2v57/` keep only `package-lock.json`: their node_modules were deleted (573 + 541 MB). Reinstall with the same `npm i --before` specs from `install.log`.
  - `tsc57/`: the 45-file typecheck. `tsc-unpatched.log` has 1 error and `tsc-patched.log` has 0. `privyConnector.orig.ts` is the unpatched file.
- **wsr-1:** done. Re-run with:
  - `node scripts/lazy-sim.mjs` (output in `out/lazy-sim.txt`);
  - `NODE_ENV=development node scripts/lazy-probe.mjs`.

  Next:
  1. Prototype a real Solana sibling in a scratch copy of `packages/wallet-sdk-react/src`, then run `SolanaHydrator.test.tsx` against it.
  2. Measure with Vite for comparison.
- **wsr-2:**
  - Done:
    - the EVM and Privy typecheck on viem 2.57.3 (`wf-finish-wsr/tsc57/`);
    - the v2 vs v3 bundle (`wf-finish-wsr/out/bundle.txt`).
  - Open:
    1. The repo-wide viem 2.57 typecheck (sdk-3). It needs a worktree and `pnpm install`, which this workflow does not allow.
    2. Optional: the same two entries under Vite or webpack, to check the 97 → 112 KB code-split result and the missing-peer behaviour.
- **wsr-3:** done. Optional: re-typecheck the c-wallet §T9 fix on react-query 5.87.4.
- **wsr-4:** done. Counts are reproducible with the `git grep -F "useXAccount("` and cast greps in the report.
- **wsr-5:**
  1. Check `@privy-io/react-auth@3.47.0` `dist/esm/solana.mjs` for `registerWallet`.
  2. Test the Google OAuth return against `privyConnector.ts` restore (3 s budget).
  3. Re-measure the Privy bundle with a coherent `@solana/kit` ≥3 in a scratch install. `out/privy.json` holds the stubbed run.

## Verification (2026-10-19)
An adversarial pass over wsr-1..5, run after the finisher. Sources: the worktree at `0181a053`; sodax-frontend `1b915ec7` and intents-whitelabel `5e1fbbaa` (both `origin/main`); the t2probe dists; the deep-wsr and wf-finish-wsr scratch. Scratch for this pass: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-wsr/`. It holds `out/` (bundle-rerun.txt, wsc-dist-check.txt, lazy-sim-rerun.txt, lazy-probe.txt), `entries2/`, `scripts/measure-v.mjs` and `tsc/*.log`. The reinstalled v2 and v2v57 node_modules were deleted afterwards; their lockfiles are in `inst/`.

### What was checked
- **Scores:** verdict, confidence, C, B and timing for all 5 IDs against the rubric (25 checks).
  - No breaking change is timed 2.x. wsr-1's 2.x part is additive, and wsr-3 changes no API.
  - Both B4s rest on measured installs: −541 MB and −15 vulnerable packages for wsr-2; −834 MB and −48 vulnerable packages for P1 under wsr-1. wsr-1's bundle gain clears 200 KB even without sdk-2.
  - The C ratings match the PR breakdowns.
- **Citations:** 79 opened.
  - 63 are in sodax-sdks at `0181a053`, 12 in the consumers (via `git show` and `git grep`), and 4 in installed third-party packages: wagmi 3.7.7 d.ts, `walletConnect.js` in connectors 8.2.0 and 5.9.9, and Privy 3.40.0 `solana.d.ts`.
  - One was off by a line: whitelabel `app-providers.tsx:15-20` is `:16-20` (fixed).
- **Numbers:** 72 figures re-derived.
  - 21 bundle figures re-run with the earlier scripts. All match to the KB:
    - every cell of the wsr-2 table, after reinstalling v2 and v2v57 from their lockfiles (wagmi 2.16.9 with viem 2.29.2 or 2.57.3, as labelled);
    - 160, 1,744 / 696, 2,337, 2,083, 2,510, 1,989 and 128;
    - the lazy-sim table (162; 1,724), whose output is byte-identical;
    - Privy 1,529 / 737 / 891.
  - 9 recomputed from the saved JSON: the 502 KB EVM-only base and the 8 per-chain marginals.
  - 22 install figures:
    - 20 rows of `deep-wsr/inst/results.tsv` against the report's tables;
    - the sums and differences re-done: 99 = 1 + 40 + 32 + 26; 1,859 − 1,318 = 541; 99 − 84 = 15; 455 − 97 = 358;
    - 2 sizes re-measured with `du -sk`: v2 573 MB / 378 packages (575 MB in the TSV), v3 97 MB / 24 packages.
  - 15 counts re-run:
    - `useXAccount(` code calls: 40 + 21, 4 of them static;
    - dapp-kit files calling `useQueryClient(`: 49; wallet-sdk-react `@/` imports: 192 (both moved out of Not verified);
    - the `` as `0x${string}` `` casts;
    - `invalidateQueries(`: 9 / 3;
    - singletons: 9 `static getInstance`, 24 `.getInstance(` calls;
    - store files: 29 / 6;
    - LOC: 8,141 / 5,118;
    - the 5 edge files;
    - tsc errors: 1 / 0;
    - the 7-line patch;
    - 45 files: 42 byte-identical to `0181a053`, 2 P4 stubs and 1 patched;
    - `'use client'` in 0 of 29 dist `.mjs` files;
    - 6 in-repo apps;
    - #486's size.
  - 5 derived figures redone: −1,584 KB / −91%; 8.7 → 0.8 s; 3.3 s; −11%; +15 = +21 − 6.
- **Probes re-run:**
  - the toy React probe: all 4 rows match;
  - the missing-peer esbuild check: one bare `import()` in the output, and only a debug-level `ignored-dynamic-import` message;
  - the builtins check: v2 sodax-shape keeps `events`, and the v3 outputs keep none.

### New probes in this pass
1. **wallet-sdk-core packaging** (`out/wsc-dist-check.txt`). `scripts/measure-v.mjs` adds `--stub-importer`, so chain stubs apply only to source importers.
   - Importing only `EvmWalletProvider`: 851 KB gzip from the t2probe dist, single-file, and 123 KB from the per-file source.
   - wallet-sdk-react EVM-only source plus that dist import: 924 KB initial (split) and 1,273 KB single-file. With the wallet-sdk-core source instead, it is 160 KB.
   - Cause [verified]:
     - wallet-sdk-core's tsup emits one file (`tsup.config.ts:7`), and the top of that file imports the libraries of 7 non-EVM chains (`dist/index.mjs:1-24`; NEAR imports none);
     - esbuild keeps 5 of them for the one EVM import (Sui and Stacks are dropped);
     - `BTCWalletProvider.ts:19-20` adds top-level calls;
     - `"sideEffects": false` (`package.json:48`) only helps per-file output;
     - the published 2.2.0 has 7 files and one `.` export (`npm view`).
2. **A second bundle method for wsr-2** (`out/bundle-rerun.txt`): single-file builds with WalletConnect stubbed give 93 / 114 / 112 KB.
3. **TS 5.5.4 on the 45-file set** (`tsc/*.log`): 1 error unpatched, 0 patched.

### What changed, and why
- **The 160 / 162 KB figures need a per-file wallet-sdk-core (sdk-2).** With today's dist, opt-in alone gives ~924 KB, but the report said "needs opt-in only".
  - Edited: summary lines 1–2, the wsr-1 row, wsr-1 Today, Feasibility, Benefit and Corrections, Dependencies, and Not verified.
  - B4 stays: −820 KB still clears 200 KB, and the install gain is unchanged.
- **wsr-2 bundle:**
  - Added the second method: +19 KB net, and −2 KB for wagmi v3 at constant viem. The edits are in the row, summary line 3 and Benefit.
  - "The required viem bump" now names 2.57.3. The 2.43.0 floor was not measured.
  - The "esbuild splitting saves 43 KB" correction now says it applies to the minimal app only.
- **wsr-2 Feasibility:**
  - Added the TS 5.5.4 result.
  - The 45-file scope now reads "9 of the 10 wagmi importers".
- **wsr-2 Complexity:**
  - "Renames in 4 files" is 3 source files (`rg -l`).
  - The missing peer leaves a debug-level note, not nothing.
- **wsr-1 Today:**
  - Removed `fs` from the polyfill list. The output keeps 6 builtins, not 7.
  - Tagged whitelabel's "2.3 MB" as derived.
- **wsr-3 and Not verified:** the 49 `useQueryClient` files and the 192 `@/` imports were re-counted, so they left Not verified.
- **wsr-3:** in whitelabel, 2 invalidate calls hit the private client, not 3. The third is in the admin tree, which has its own client. The conclusion holds.
- **wsr-4:** casts are now scoped to addresses. The frontend has a 9th such cast on a tx hash, and whitelabel has one on a config value.
- **wsr-5:**
  - frontend#544 (2025) asked for "social or email login", so "no issue asks" was wrong.
  - B2 is kept: the item is unchecked in a closed issue, and email login has shipped [judgement].
  - Added #486's size and the C5 tension.

No verdict, C, B or timing changed.

### Still judgement
- **C4 for wsr-1 and wsr-5:** both carry a signing-path risk, which the rubric lists under C5.
- **C3 for wsr-2:** it is a 3.0 peer-major break, but consumers only add peers, and its size is far below C4's ≳1.5k LOC.
- **wsr-3 as a non-breaking 2.x fix:** after it, apps' QueryClient defaults apply to SODAX queries.
- **The rest:** all LOC and point estimates, B2 for wsr-3 and wsr-5, B1 for wsr-4, "EVM stays static", and Privy as a source rather than an adapter.

### Residual doubts
- **Bundler:** every bundle number is from esbuild. Both consumers build with Next.js, and webpack or Turbopack may keep more or less of the one-file wallet-sdk-core dist and of the v2 dead chunks.
- **Mixed build:** the 924 KB build mixes wallet-sdk-react source with the wallet-sdk-core dist. No real opt-in dist was built.
- **Privy subtree:** the 329 MB figure was not re-derived, because its node_modules were deleted.
- **Installs:**
  - they used 2.2.0-rc.8, because 2.2.0 is after the `--before` cutoff;
  - npm 11.6.0 auto-installs peers;
  - advisory counts are as of 2026-10-19.
- **viem 2.57.x:** sdk and wallet-sdk-core remain unchecked on it (sdk-3).
- **Consistency fix (2026-10-20).** The README critic found that the "advisories" figures here were npm vulnerable-package counts (`metadata.vulnerabilities.total`). They are relabeled, with distinct-advisory counts from the README advisory recount. The dk-4 edge now matches dapp-kit-flows.md: option (b) ships first. No score changes.
