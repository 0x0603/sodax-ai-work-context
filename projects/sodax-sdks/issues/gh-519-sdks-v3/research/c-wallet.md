---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, research, wallet, wallet-sdk-core, wallet-sdk-react, adapters, wagmi-v3, signer, iconex]
source_commit: cc053fef
---

# GH-519 · Cluster C — wallet layer

> **Written by a research agent on 2026-10-16**, against the read-only `origin/main` tree at
> cc053fef. The lead re-checked its load-bearing `path:line` claims (`plan-v3-order.md` §9). Where
> this report and `plan-v3-order.md` / `plan-v3-subissues.md` differ, those files win.
>
> **Reconciled after synthesis**
>
> - **The wallet boundary is variant H**, as this report recommends; it is adopted in `plan-v3-order.md` §2.4.
> - **T7.0 moves to cluster A.**
> - **T3.7 implements the interface defined by D's T22.1**, which includes `subscribe()`. This report's T22.4 entry is dropped as a duplicate.
> - **T31.6** (the Solana wallet on Wallet Standard) carries C's half of the Solana-Kit estimate.

Research for icon-project/sodax-sdks #519 (SDKs v3). Planning only — no repo was changed, nothing was posted.

- **Source of truth:** extracted tree of `origin/main` at **cc053fef** (2026-10-15). Every `path:line` below is
  relative to that tree (`$S/src-cc053fef`) unless it names a PR or a probe.
- **Probes:** all under `$S/agent-C/` (npm, `--ignore-scripts`). Commands and results are listed in § Probes.
- **Items owned:** T3, T6, T7, T9, T23 (full treatment); T30, T32, T36 (short).

---

## 0. Decisions in one screen

| Topic | Decision | Main evidence |
| --- | --- | --- |
| C1 package boundary | **Hybrid.** React adapters stay in `@sodax/wallet-sdk-react` as per-chain subpaths (the existing `./xchains/<chain>`), and each chain's React wallet libs become optional peers. Signers follow the spoke: if T1 ships `@sodax/chain-<name>`, the browser signer goes in `./wallet` and the private-key signer in `./server`; if it doesn't, they go in `@sodax/wallet-sdk-core/<chain>` with optional peers. No `./react` subpath in chain packages. | Adapter code imports ≥10 wallet-sdk-react internals (§C1.2). The Privy subpath and isolation gate are an in-repo precedent. Signer and spoke share the same heavy chain libs. |
| T3 adapters | Opaque `ChainAdapter<T>` values from `evm()` (root) and `solana()`, `sui()`… (subpaths). Options are today's `ChainTypeConfig<T>`. One zustand `createStore` per provider, read through context. Services are created per instance. In 2.x the `config` prop keeps working: it is converted to adapters internally. | `chainRegistry.ts:62-98` already defines factories through `defineChain`; the API and store probes compile. |
| T6 server entry | New `@sodax/wallet-sdk-core/server` with `PrivateKey<Chain>WalletProvider` classes (2.x, additive). In 3.0 the root classes lose their private-key branches. | All 9 provider classes mix the two modes in one class. near-api-js is used only by the NEAR private-key path but is inlined into the published dist. |
| T7 wagmi v3 | Mostly a version bump: v3 keeps deprecated aliases. The one compile break is `createConnector` `connect()` with `withCapabilities`, in the Privy connector (and in PR #163). **Viem floor ≥ 2.43.0** (runtime). TypeScript peer ≥ 5.9.3 (catalog has 5.5.4). Breaking, so it lands in the 3.0 window. | Typecheck probe: 1 error before the fix, 0 after. Runtime import probe fails on viem 2.29.2 and 2.42.0. |
| T9 QueryClient | Use `useContext(QueryClientContext)`; create a private client only when none exists. Pure 2.x bug fix, 1 point. | `EvmProvider.tsx:27-30,69-77` against the docs contract at `SodaxWalletProvider.tsx:35-36`. |
| T23 signer-only | Most read methods already have **zero** sdk call sites. Remove those. Make the receipt waits optional rather than removing them: the API-mode example depends on the EVM one. Dedupe: ICONEX relay ×3 (separate queues defeat WALLET-L-1), EVM chain defs ×3, `isNativeToken` ×2. | Call-site table in §T23. |

Cluster C total ≈ **50 pts**, plus ~12 if signers move into chain packages. The scope estimated 29 for E6.1–E6.6. The difference is mostly expand-phase compatibility work and the private-key split across 9 classes; see each table.

---

## C1. Package boundary

### C1.1 What the code looks like today

- **Import graph (no cycles today):**
  - `types` has no deps.
  - `sdk` depends on types, libs, swaps-api and bridge-api plus chain libs (`packages/sdk/package.json` deps). It does **not** depend on wallet-sdk-core.
  - `wallet-sdk-core` depends on types and libs plus chain libs (`packages/wallet-sdk-core/package.json:64-86`).
  - `wallet-sdk-react` depends on wallet-sdk-core, types, libs, chain libs and wagmi (`packages/wallet-sdk-react/package.json:76-100`).
  - `dapp-kit` depends on sdk and nothing wallet-related.
- **wallet-sdk-react already ships per-chain subpaths.**
  - `"./xchains/*"` is exported at `packages/wallet-sdk-react/package.json:40`.
  - tsup auto-discovers `src/xchains/<chain>/index.ts` (`tsup.config.ts:8-13`).
  - The per-chain subpaths export XService and connector classes, e.g. `src/xchains/solana/index.ts`.
- **Privy precedent (merged, PR #486):**
  - `./privy` subpath (`package.json:44`) with optional peer `@privy-io/react-auth: "*"` (`package.json:119,123-126`).
  - A separate DTS pass (`tsup.privy-dts.config.ts`).
  - A post-build gate allowing only `dist/privy/` to import `@privy-io/*` (`scripts/check-privy-isolation.mjs`).
  - The user explicitly rejected an add-on package for Privy (gh-456 brief, "Settled" #2 and #9a).
- **wallet-hw precedent (PR #163, open, `CONFLICTING`, last updated 2026-09-21):**
  - A separate `packages/wallet-hw` with Ledger/Trezor SDK deps and `viem`/`wagmi: 2.x` peers.
  - It plugs in through a new `EVM.wagmiConnectors` field.
  - It is published as non-private at `0.0.1-test`. The release tooling rejects that: `scripts/release.mjs:89-97` (`readAlignedVersion`) requires one shared version, and `:230-251` (`packageListErrors`) requires every publishable package to appear in the hardcoded `PACKAGES` lists (`scripts/bump-versions.sh:7`, `.github/workflows/sdks-publish.yml:30,72`).
- **Root entry pulls every chain (verified on published 2.2.0).** From `dist/index.mjs`, the root reaches 16 dist files and imports `@creit.tech/stellar-wallets-kit`, `@hot-labs/near-connect`, 7 × `@injectivelabs/*`, `@mysten/*`, `@solana/*`, `@stellar/stellar-sdk`, `icon-sdk-js`, `near-api-js`, `sats-connect`, `@sodax/libs/{stacks,injective}` and `wagmi/connectors` (probe P8). The cause is `chainRegistry.ts:1-42` (static imports) plus `SodaxWalletProvider.tsx:7-9`.

### C1.2 React adapter code is coupled to wallet-sdk-react internals

Per-chain React modules import internal modules (counts from `src/providers/*` and `src/xchains/*`):

- `@/useXWalletStore` (providers/solana, providers/sui, xchains/{stellar,icon,injective}).
- `@/core/XService` and `@/core/XConnector` (every xchain).
- `@/context/WalletConfigContext` (providers).
- `@/constants`, `@/utils`, `@/types`.
- `@/shared/guards` (sui, icon).
- `@/hooks/index.js` (xchains/bitcoin).

Moving them into `@sodax/chain-<name>/react` (D1) would turn the store accessor, `ChainActions`, the `XService`/`XConnector` base classes, the hydration helpers and the constants into a cross-package public API. A signer, by contrast, needs only `BaseWalletProvider` and `shallowMerge` (`wallet-sdk-core/src/wallet-providers/BaseWalletProvider.ts`, 51 lines).

### C1.3 Comparison

| Criterion | D1 (spoke, signer and React adapter all in `@sodax/chain-<name>`) | B (keep wallet packages; per-chain subpaths; chain libs as optional peers) | **H (recommended): signer next to the spoke, React adapter in wallet-sdk-react subpath** |
| --- | --- | --- | --- |
| Bundle | Same for all three once per-entry isolation and unbundled ESM (T2) are in place | Same | Same |
| Install | Chain package brings spoke and signer libs; app installs React wallet libs | App must install every chain lib (2–6 per chain). Under pnpm the app must list them even when `@sodax/chain-<name>` already depends on them (an optional peer is not satisfied by a sibling's dependency) | Like D1: `npm i @sodax/chain-solana @solana/wallet-adapter-react` |
| Who controls chain-lib versions | We do (deps) for spoke and signer; app controls React libs within our range | App controls all (peer ranges); ranges are declared twice (chain package dep and wallet optional peer) | Like D1 |
| Packages to publish | +0 beyond T1, but each chain package gains a React build (tsx, React peers, `'use client'`, DOM tests) | +0 | +0 beyond T1 |
| Public API surface | The adapter kit (store, base classes, hydration helpers) becomes cross-package API | Adapter contract stays internal | Adapter contract stays internal; the chain package exposes only the signer class and config types, which are already public in wallet-sdk-core |
| Migration (apps) | `import { solana } from '@sodax/chain-solana/react'` | `from '@sodax/wallet-sdk-react/xchains/solana'` plus installing libs | `from '@sodax/wallet-sdk-react/xchains/solana'` |
| Cycle risk | Low, provided wallet-sdk-react never imports chain packages | None new | wallet-sdk-react `./xchains/<c>` → chain package `./wallet` (optional peer) → wallet-sdk-core and types. Chain package `.` → sdk (optional peer). No cycles. |
| Dedupe side benefit | ICON shim, ICONEX relay and chain constants live once per chain | None | Same as D1 for signer and spoke |
| Precedent in repo | wallet-hw (separate package; stuck on release gates) | Privy subpath (merged) | Both, each used where it fits |

**Recommendation: H.**

- If T1 decides against chain packages, H degrades to B for signers only: wallet-sdk-core per-chain subpaths with chain libs as optional peers.
- The React side is the same under both T1 outcomes, so T3 can start before T1 settles packaging.
- One coupling must be inverted under any option. The EVM hooks import Injective: `hooks/useEvmSwitchChain.ts:6,14,91-114` and `hooks/useEthereumChainId.ts:1-2,19`. This is sub-issue T3.5.

### C1.4 Interface assumptions (for T1 / cluster B, and for T22 / cluster D)

- **A1.** `@sodax/types` keeps every `I<Chain>WalletProvider`, the `IWalletProvider` union (`types/src/wallet/providers.ts:17-26`) and `GetWalletProviderType` (`:34-53`) as closed unions. Plugins implement them; wallets need no module augmentation.
- **A2.** If chain packages exist, `@sodax/chain-<name>` exposes:
  - `./wallet`: the browser (adapter-backed) signer `<Chain>WalletProvider` plus its config and defaults types.
  - `./server`: `PrivateKey<Chain>WalletProvider`.
  - Chain libs are regular deps shared with `.`.
  - `@sodax/sdk` is an optional peer (only `.` needs it).
  - `@sodax/wallet-sdk-core` is a regular dependency (`BaseWalletProvider` only), pinned to the shared version like other internal deps.
  - **No `./react`.**
- **A3.** `@sodax/wallet-sdk-react/xchains/<name>` imports only its React wallet libs and `@sodax/chain-<name>/wallet`, never the spoke (`.`).
- **A4.** EVM stays in core: wallet-sdk-core root is `BaseWalletProvider` plus `EvmWalletProvider`; wallet-sdk-react root is the provider, the hooks and `evm()` (wagmi is a required peer, ≈10 MB in v3, probe P11).
- **A5 (for T22 `walletProviderResolver`).** wallet-sdk-react exposes `useWalletProviderSource(): WalletProviderSource`. The interface is declared structurally in `@sodax/types`, so dapp-kit needs no dependency on wallet-sdk-react:
  ```ts
  export interface WalletProviderSource {
    getWalletProvider<K extends SpokeChainKey | ChainType>(key: K): GetWalletProviderType<K> | undefined;
    subscribe(onChange: () => void): () => void; // useSyncExternalStore-compatible
  }
  ```
  Its identity is stable per provider mount, and it is backed by the per-provider store (T3.1). This is sub-issue T3.7, created only when T22 is scheduled.
- **A6.** Adapters are opaque values built in client modules. Like `PrivySource`, they cannot cross a React Server Component boundary (`providers/evm/privySource.ts:23-36`).

---

## T3 (9) — wallet-sdk-react chain adapters `adapters={[evm(), solana()]}`, no global singletons

### Evidence map (cc053fef)

- **Static chain registry.**
  - `src/chainRegistry.ts` is 440 lines. Static imports of every chain's XService, its connectors, the wallet-sdk-core providers and Injective libs are at `:1-42`.
  - The factory contract `ChainServiceFactory` is at `:62-91`, `defineChain` at `:98`, the per-chain entries at `:167-400` (9 chain types), and `createChainServices` at `:404-440`.
  - The registry is also read by `useXWalletStore.ts:9,69-77` (`setXConnection` side effect), `hooks/useInitChainServices.ts:5,29` and `hooks/useChainGroups.ts:6,45`.
- **Provider.**
  - `src/SodaxWalletProvider.tsx` is 63 lines. It statically imports the EVM, Solana and Sui providers (`:7-9`).
  - It freezes config on mount (`:14-18,43-44`) and nests Solana (innermost), then Sui, then EVM (outermost) at `:50-60`.
  - It starts services through `useInitChainServices` (`:46`). That hook hardcodes ICON, Injective and Stellar reconnects (`hooks/useInitChainServices.ts:6-8,34-42`).
- **Two global zustand stores.**
  - `src/useXWalletStore.ts:52` is `create()(devtools(persist(immer())))`, with persist key `'xwagmi-store'` at `:155-156` and a storage probe at `:162-168`.
  - `src/useWalletModalStore.ts:46` is the second, ephemeral store.
  - Both are created at **import time**. The persisted store attempts hydration as soon as the module loads.
  - `useXWalletStore` is not exported (`src/index.ts`), but the public non-hook `getXService()` reads it (`src/actions/getXService.ts:6-12`).
  - 28 source files and 6 test files (21 references) touch the store.
- **9 static singletons (scope says 6).**
  - Definitions: `EvmXService.ts:183-195`, `SuiXService.ts:14-30`, `SolanaXService.ts:14-27`, `BitcoinXService.ts:7-21`, `InjectiveXService.ts:11-59`, `StellarXService.ts:28-57`, `IconXService.ts:40-57`, `NearXService.ts:8-42`, `StacksXService.ts:13-28`. PR #534 adds a 10th (`TronXService`).
  - Callers inside connectors: `StellarWalletsKitXConnector.ts:24`, `NearXConnector.ts:16`, `InjectiveXConnector.ts:27`, `BitcoinXConnector.ts:24`, `SuiXConnector.ts:22`, `SolanaXConnector.ts:16`.
  - Callers inside actions: `xchains/stellar/actions.ts:9`, `xchains/injective/actions.ts:20`.
  - Hydrators mutate singleton fields: `EvmHydrator.tsx:26,32`, `SolanaHydrator.tsx:27,50,85`, `SuiHydrator.tsx:41,52`.
- **Config types already form a per-chain slot map.** `src/types/config.ts:130-191` defines `ChainMeta`, `ChainTypeConfig<T>` and `SodaxWalletConfig`, so adapter options can reuse them unchanged.

### Approach

**Adapter API.** All of this compiled in probe P6.

```ts
// '@sodax/wallet-sdk-react' (root)
export type ChainAdapter<T extends ChainType = ChainType> = { readonly chainType: T; readonly [ADAPTER]: true };
export function evm(options?: EvmTypeConfig): ChainAdapter<'EVM'>;                 // options = today's EVM slot
export type SodaxWalletProviderProps =
  | { children: ReactNode; adapters: readonly ChainAdapter[]; storageKey?: string; config?: never }
  /** @deprecated 2.x only — pass `adapters`. Removed in 3.0. */
  | { children: ReactNode; config: SodaxWalletConfig; adapters?: never; storageKey?: string };

// '@sodax/wallet-sdk-react/xchains/solana' (and sui, bitcoin, stellar, injective, icon, near, stacks, tron…)
export function solana(options?: SolanaTypeConfig): ChainAdapter<'SOLANA'>;

// internal (not exported): today's ChainServiceFactory + Provider + reconnect + captured options
type AdapterDefinition<T extends ChainType, S extends XService = XService> = {
  chainType: T; options: ChainTypeConfig<T>; displayName: string; iconUrl?: string;
  createService(options: ChainTypeConfig<T>): S;                       // per instance, replaces getInstance()
  Provider?: ComponentType<{ options: ChainTypeConfig<T>; children: ReactNode }>; // EVM / Solana / Sui / (Aleo)
  defaultConnectors?(options: ChainTypeConfig<T>): XConnector[];
  discoverConnectors?(service: S, getStore: StoreAccess): Promise<void>;
  createActions?(service: S, getStore: StoreAccess): ChainActions;
  createWalletProvider?(service: S, getStore: StoreAccess): IWalletProvider | undefined;
  reconnect?(service: S, getStore: StoreAccess): Promise<void>;       // replaces useInitChainServices.ts:34-42
};
```

- Adapters are opaque. The definition is stored in a `WeakMap` keyed by the frozen adapter value, the same pattern as `privySource.ts:30-36`. Third parties therefore cannot depend on the internals, and no extension point is published. This follows the gh-456 "Settled" #3 reasoning.
- **Privy composes unchanged:** `evm({ privy: privy({ appId }) })`. `EvmAdapterFields.privy` is at `types/config.ts:102`; `setupPrivySource` already runs per mount (`EvmProvider.tsx:46-56`).
- **wallet-hw composes** if #163 lands `EVM.wagmiConnectors`: `evm({ wagmiConnectors: [...ledgerEvmConnectors()] })`. T3 and T7 do **not** add that field themselves (no API for a caller that is not in main).

**Store per provider.** Compiled with zustand 4.5.2 in probe P5.

- `createXWalletStore(storageKey = 'xwagmi-store')` uses vanilla `createStore` with the same devtools/persist/immer stack.
- It is created in `useState(() => …)` inside `SodaxWalletProvider` and published through `WalletStoreContext`.
- Hooks call `useWalletStore(selector)`, which is `useStore(useContext(WalletStoreContext), selector)`.
- Non-React paths (chain actions, connectors, registry callbacks) receive the existing `StoreAccessor` closure (`chainRegistry.ts:47-60`). They never import a module-level store.
- The wallet-modal store moves into the same context.
- `usePersistHydrated` and `whenPersistReady` take the store from context or a parameter (`hooks/usePersistHydrated.ts:6-36`).
- **SSR.** One store is created per render tree, so nothing leaks across requests on the server. Persist storage still throws when there is no window, so behaviour is unchanged. The server snapshot stays `false`. Services are still created in an effect (client only), as in `useInitChainServices.ts:21`.
- **`'use client'`.** Published 2.2.0 dist has **no** `'use client'`: tsup drops it (probe P8), so Next.js apps wrap the provider in their own client file. Per-file output from T2 (cluster A) would preserve the directive.

**Expand phase (2.x, non-breaking).**

1. **T3.1 — store per provider.** For single-provider apps nothing changes: hooks and `getXService()` used **outside** any provider fall back to a module-level reference to the most recently mounted store. That matches today's global-store behaviour, where a header outside the provider still sees the account. A dev warning is logged.
2. **T3.2 — services per provider.**
   - The registry calls `new XService(cfg)`.
   - `XService.setXConnectors()` binds the service into each connector.
   - Hydrators and actions read `state.xServices[type]`.
   - `static getInstance()` stays as a deprecated alias that returns the current default store's instance.
3. **T3.3 — `adapters` prop and `evm()`.**
   - `configToAdapters(config)` maps each present slot to its adapter, so the old prop keeps working. It still imports every chain, so bundle size is unchanged.
   - `useWalletConfig()`, `useIsChainEnabled()` and `useEnabledChainTypes()` (public, `context/WalletConfigContext.ts:14-32`) are synthesized from the adapters, so the existing hook contract holds.
   - Provider nesting is generic but ordered by chain type, keeping EVM outermost as today.
4. **T3.4 — per-chain factories.** Move each registry entry plus its Provider and reconnect logic into `xchains/<chain>/adapter.ts(x)` and export the factory from the existing subpath.
5. **T3.5 — invert the Injective coupling.** The Injective adapter registers a "wrong chain / switch" capability in `chainActions`. `useEvmSwitchChain` reads it, so its public behaviour (Injective branch at `:96-114`) is kept. sodax-frontend calls `useEvmSwitchChain` 12×.

**Contract phase (3.0, breaking) — T3.6.** Remove:

- the `config` prop and `configToAdapters`;
- the `chainRegistry` map;
- every `getInstance()`;
- `getXService()` (use `useXService`);
- the outside-provider fallback (hooks now throw a clear error);
- the hardcoded reconnects;
- the root's type imports of non-EVM `*WalletDefaults` (`types/config.ts:20-30`; each adapter's options type moves to its subpath).

The root then imports only EVM. Chain React libs and signer packages become optional peers. A gate generalizing `check-privy-isolation.mjs` asserts that only `dist/xchains/<chain>/**` (and chunks used only by it) import that chain's libs.

**3.0 dependency target for wallet-sdk-react:**

- deps: `@sodax/types`, `@sodax/wallet-sdk-core`, `zustand`, `immer`;
- peers: `react`, `@tanstack/react-query`, `wagmi ^3`, `viem` (floor from T4);
- optional peers: per-chain React libs, signer packages, `@walletconnect/ethereum-provider` and `@privy-io/react-auth`.

**Downstream impact (read-only scan).**

- sodax-frontend (`apps/web`, HEAD 6623d817) uses `SodaxWalletProvider` once (`providers/wallet-providers.tsx:11`), plus hooks: `useXAccount` 29, `getXChainType` 16, `useXService` 12, `useWalletProvider` 12, `useEvmSwitchChain` 12, `useXAccounts` 10. It has no `getInstance()`, `getXService()` or store access. Migration is one provider call; hook names stay (T30 renames are separate).
- In sodax-sdks itself, 6 apps pass `config={…}`. The mapping to `adapters` is mechanical (codemod in T17 / D).

### Feasibility

**Feasible.**

- The factory pattern already exists (`defineChain`).
- The store refactor is mechanical: about 29 source files and 6 test files.
- The API types and store design compile (probes P5, P6).
- Cost is above the scope's 13 because of the expand-phase compatibility (fallback store, deprecated statics, config conversion). Skipping expand (breaking directly in 3.0) would save about 3–4 points but give apps no early migration path.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T3.1 | `refactor(wallet-sdk-react): scope wallet stores to each SodaxWalletProvider` | `createStore` plus context for the wallet and modal stores. Outside-provider fallback to the last mounted store (dev warning). `storageKey` prop with default `'xwagmi-store'`. | `src/useXWalletStore.ts`, `src/useWalletModalStore.ts`, `src/SodaxWalletProvider.tsx`, `src/hooks/*`, `src/providers/*/*`, `src/xchains/{icon,injective,stellar}/actions.ts`, `src/actions/getXService.ts`, 6 test files | 5 | no | expand-2.x | — | #534 and #497 (`chainRegistry.ts`, `types/config.ts`); #95 (`SodaxWalletProvider.tsx`, `chainRegistry.ts`, `providers/index.ts`) |
| T3.2 | `refactor(wallet-sdk-react): create chain services per provider` | Services are constructed by the registry and injected into connectors on `setXConnectors`. Hydrators and actions read the store. `getInstance()` stays as a deprecated alias. | `src/xchains/*/*XService.ts` (9), 6 connectors, 2 actions files, 3 hydrators, `src/core/XService.ts`, `src/core/XConnector.ts` | 3 | no | expand-2.x | T3.1 | #534 (`xchains/tron/*`), #497, #95 |
| T3.3 | `feat(wallet-sdk-react): add adapters prop and evm() adapter` | Opaque adapter type, `defineAdapter`, props union, `configToAdapters`, config context synthesized from adapters, generic Provider nesting, `evm()` in root. | `src/SodaxWalletProvider.tsx`, new `src/adapters/*`, `src/providers/evm/*`, `src/context/WalletConfigContext.ts`, `src/index.ts` | 3 | no | expand-2.x | T3.2 | #163 and T9.1 (`providers/evm/EvmProvider.tsx`, `types/config.ts`) |
| T3.4 | `feat(wallet-sdk-react): per-chain adapter factories` | Move each registry entry, Provider (Solana, Sui) and reconnect into `xchains/<chain>/adapter.ts(x)`; export `solana()`, `sui()`, `bitcoin()`, `stellar()`, `injective()`, `icon()`, `near()`, `stacks()` (plus `tron()` and `aleo()` if merged). **Can split per chain and run in parallel**: each PR touches only its folder plus one import line in the legacy converter. | `src/xchains/<chain>/*`, `src/chainRegistry.ts`, `src/providers/{solana,sui}/*` | 3 (or ~0.5 per chain) | no | expand-2.x | T3.3 | #534, #497, #95 (each adds a chain that then needs an adapter) |
| T3.5 | `refactor(wallet-sdk-react): remove Injective imports from EVM hooks` | Injective adapter registers a wrong-chain capability; `useEvmSwitchChain` and `useEthereumChainId` read it and stop importing `InjectiveXService` and `@injectivelabs/wallet-base`. | `src/hooks/useEvmSwitchChain.ts`, `src/hooks/useEthereumChainId.ts`, `src/xchains/injective/*`, `src/types/chainActions.ts` | 2 | no | expand-2.x | T3.3 | — |
| T3.6 | `feat(wallet-sdk-react)!: drop legacy config, registry and singletons` | Removals listed above; root imports EVM only; per-chain optional peers; isolation gate (generalized `check-privy-isolation.mjs`). | `src/**`, `package.json`, `tsup.config.ts` (or tsc after T2), `scripts/check-*-isolation.mjs` | 5 | **yes** | contract-3.0 | T3.4, T3.5; T6.4/T6.5 (where signers live); T4 (A: peer policy); T2 (A: per-file ESM); T1 (B: packaging decision) | T7.1 (`package.json`, `pnpm-lock.yaml`) |
| T3.7 | `feat(wallet-sdk-react): expose a WalletProviderSource for dapp-kit` | `useWalletProviderSource()` over the store (A5); structural type in `@sodax/types`. | `src/hooks/`, `packages/types/src/wallet/` | 1 | no | expand-2.x | T3.1; T22 (D) accepting the contract | — |

---

## T6 (8) — wallet-sdk-core chain providers into plugins; server-only entry for private-key and mnemonic signers

### Inventory (cc053fef)

Every class accepts a union config and branches internally, so the private-key code always ships to browsers.

| Chain | Class (file) | Private-key branch | Libs only the private-key path needs | Libs the browser path needs | Browser-unsafe? |
| --- | --- | --- | --- | --- | --- |
| EVM | `evm/EvmWalletProvider.ts:154` | guard `:130-133`, `privateKeyToAccount` `:23,168` | `viem/accounts` (light) | viem (`walletClient` passed in) | no |
| Solana | `solana/SolanaWalletProvider.ts:51` | guard `:42`, `Keypair.fromSecretKey` `:64` | — (same lib) | `@solana/web3.js`, `@solana/spl-token`; `Buffer` at `:104,239` | no (Buffer is used in both modes) |
| Sui | `sui/SuiWalletProvider.ts:76` | `isPkSuiWallet` `:42`, `Ed25519Keypair` `:3` | `@mysten/sui/keypairs/ed25519` | `@mysten/sui` | no |
| Stellar | `stellar/StellarWalletProvider.ts:85` | guard `:52-54`, `Keypair.fromSecret` `:105-109` | — | `@stellar/stellar-sdk` | no |
| Stacks | `stacks/StacksWalletProvider.ts:54` | guard `:30-32` | — | `@sodax/libs/stacks/*` | no |
| ICON | `icon/IconWalletProvider.ts:44` | `Wallet.loadPrivateKey` `:52-56`, guard `:126-128` | icon-sdk-js `Wallet`, `SignedTransaction` | today icon-sdk-js (builder `:74-84`, `IconService` for receipts `:95-104`); after T23/E4.2 none | no |
| NEAR | `near/NearWalletProvider.ts:36` | guard `:26-28`, `KeyPairSigner` `:45-50` | **near-api-js** (`Account`, `JsonRpcProvider`, `KeyPairSigner`, `actions`); browser path uses only a type from `@hot-labs/near-connect` (`:4`) | none at runtime | no, but near-api-js is **inlined** into the published dist (probe P8) |
| Bitcoin | `bitcoin/BTCWalletProvider.ts:45` | guard `:32-34`, `ECPair.fromPrivateKey(Buffer…)` `:55-56`, `secp256k1.ecdsaSign` `:157`, `bip322.Signer` `:170` | ecpair, `secp256k1` (native addon `gypfile:true`, elliptic fallback via `browser` field), bip322-js | bitcoinjs-lib, `@bitcoinerlab/secp256k1` (taproot) | **yes**: native addon and Buffer |
| Injective | `injective/InjectiveWalletProvider.ts:85` | guard `:42-49`, `MsgBroadcasterWithPk` / `PrivateKey.fromMnemonic` `:103-114`, `Buffer` sign `:273` | `MsgBroadcasterWithPk` (Node-oriented) | `@injectivelabs/sdk-ts`, cosmjs-types; `Buffer` `:79` | **yes**: Node-oriented broadcaster |
| Tron (#534) | `tron/TronWalletProvider.ts` (PR) | `isPrivateKeyTronWalletConfig` | viem/accounts `sign` | — | no |

**Import-time side effects.**

- `BTCWalletProvider.ts:19-20` (`bitcoin.initEccLib(ecc)`, `const ECPair = ECPairFactory(ecc)`) is the only module-level call in wallet-sdk-core.
- In wallet-sdk-react the import-time effects are the two zustand `create()` calls (removed by T3.1).
- E1.4 under T2 (cluster A) owns the BTC fix. `initEccLib` must remain reachable from both modes because taproot PSBT handling needs it, so it should become a once-guard called in the constructor.

**`noExternal` implications.**

- `wallet-sdk-core/tsup.config.ts:14` (`noExternal: ['near-api-js', '@sodax/types']`) applies to **both** formats.
- Published 2.2.0 `dist/index.mjs` (494 KB) contains no `near-api-js` import specifier (it is inlined), and `baseChainInfo` is defined inside the dist (types inlined).
- After T6.3, near-api-js is reachable only from `./server`. In 2.x it still has to be inlined there for CJS. With ESM-only (T4) and T10, `noExternal` goes away.
- Four runtime `dependencies` are **type-only**: `@hot-labs/near-connect`, `@injectivelabs/ts-types`, `@injectivelabs/wallet-core`, `@solana/wallet-adapter-base` (`types/library-exports.ts:35-36,49`, `near/types.ts:1`, `injective/types.ts:3-4`, `solana/types.ts:2`; none appears among the dist's import specifiers). They become optional peers or structural types in T6.4.

### Approach

1. **T6.1 — per-chain entries (2.x).** Add `@sodax/wallet-sdk-core/{evm,solana,sui,stellar,stacks,icon,near,bitcoin,injective}` exports and `typesVersions`; the root barrel stays. This gives CJS consumers and the 3.0 optional-peer isolation an entry boundary.
2. **T6.2 / T6.3 — server entry (2.x, additive).**
   - Add `@sodax/wallet-sdk-core/server` exporting `PrivateKey<Chain>WalletProvider`. Each takes the existing `PrivateKey<Chain>WalletConfig` type (Injective keeps `secret: { privateKey } | { mnemonics }`), so migration is an import plus a class rename.
   - Shared signing logic moves to `src/server/<chain>.ts`. The deprecated private-key branch of each root union class delegates to it, so code is not duplicated.
   - In Bitcoin, swap `secp256k1` for `@noble/curves`, which viem already brings. That drops `elliptic`, `node-gyp-build` and the native build from installs.
3. **T6.4 — contract (3.0).**
   - Root classes accept browser configs only (types narrowed, guards removed).
   - The root exports `BaseWalletProvider` and EVM (non-EVM moves to subpaths or to chain packages).
   - Private-key-only libs (near-api-js, ecpair, bip322-js, `MsgBroadcasterWithPk` usage) are reachable only from `./server`.
   - Type-only deps become optional peers.
4. **T6.5.\<chain\> — conditional on T1 creating chain packages (3.0).** Move `src/wallet-providers/<chain>` to `packages/chain-<name>/src/wallet` and `src/server/<chain>` to `packages/chain-<name>/src/server` (A2). There are 8 sub-issues (bitcoin, solana, stellar, injective, stacks, icon, sui, near) and they **can run in parallel**.
5. **T6.6 — ICON browser signer without icon-sdk-js (2.x).**
   - Build the `icx_sendTransaction` JSON by hand.
   - Relay through ICONEX.
   - Do receipts through a small JSON-RPC call.
   - Coordinate the JSON-RPC client shape with T8 / E4.2 (cluster B).

**Feasibility:** feasible. The scope's 2 points assumed an entry re-export; splitting 9 mixed-mode classes (and their 9 test files) costs about 8 points.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T6.1 | `feat(wallet-sdk-core): per-chain subpath entries` | 9 exports plus `typesVersions`; tsup multi-entry (or tsc after T2); `verify-dist-exports`. | `packages/wallet-sdk-core/package.json`, `tsup.config.ts`, `src/wallet-providers/*/index.ts` | 2 | no | expand-2.x | (T2 optional) | #534, #497, #95 (`wallet-providers/index.ts`, `package.json`) |
| T6.2 | `feat(wallet-sdk-core): server entry with private-key signers (EVM, Solana, Sui, Stellar, Stacks)` | `./server` entry and 5 `PrivateKey*WalletProvider` classes sharing logic; root private-key branches deprecated (JSDoc). | `src/server/*`, `src/wallet-providers/{evm,solana,sui,stellar,stacks}/*`, `package.json`, `tsup.config.ts` | 3 | no | expand-2.x | — | #498 (`evm/EvmWalletProvider.ts`) |
| T6.3 | `feat(wallet-sdk-core): server signers for Bitcoin, Injective, NEAR, ICON` | 4 classes (plus Tron if #534 merged); near-api-js, ecpair and bip322 only imported from `src/server/*`; `secp256k1` → `@noble/curves`. Parallel with T6.2 (trivial conflict in `package.json` exports). | `src/server/*`, `src/wallet-providers/{bitcoin,injective,near,icon}/*`, `package.json` | 5 | no | expand-2.x | T6.2 scaffold; A-T2 (E1.4 lazy ECC init) | #534 (`tron/*`, `wallet-providers/index.ts`), #95 |
| T6.4 | `feat(wallet-sdk-core)!: browser-only root signers` | Remove private-key branches and union guards from root classes; root is Base plus EVM; type-only deps become optional peers. | `src/wallet-providers/**`, `src/types/library-exports.ts`, `package.json` | 3 | **yes** | contract-3.0 | T6.2, T6.3; T4 (A: ESM-only), T10 (A) | T23.2 (same classes) |
| T6.5.\<chain\> ×8 | `refactor(chain-<name>)!: move <chain> signers into the chain package` | `./wallet` and `./server` per A2. **Parallel per chain.** | `packages/chain-<name>/src/{wallet,server}`, `packages/wallet-sdk-core/src/wallet-providers/<chain>` | 1–2 each | **yes** | contract-3.0 | T1 chain scaffold (B: E2.3/E2.4) for that chain; T6.4; T23.2 | B's per-chain spoke moves (same package) |
| T6.6 | `refactor(wallet-sdk-core): ICON browser signer without icon-sdk-js` | Hand-built tx JSON, ICONEX relay, JSON-RPC receipt. | `src/wallet-providers/icon/*` | 2 | no | expand-2.x | T6.3; T8 (B: E4.2 client shape) | T23.4 (same file) |

---

## T7 (8) — wagmi v3; connector SDKs as optional peers

### Every wagmi API in use (non-test) and its v3 status

Verified against the installed wagmi 3.7.7 `.d.ts` (`dist/types/exports/index.d.ts`, `hooks/*.d.ts`).

| API | Where (cc053fef) | v3 status / replacement |
| --- | --- | --- |
| `useAccount` | `providers/evm/EvmHydrator.tsx:2,14`; `hooks/useEvmSwitchChain.ts:3,95` | Deprecated alias of **`useConnection`** (`exports/index.d.ts:23-24`); same fields (`address`, `status`, `connector`, `chainId`) |
| `useConnect().connectAsync` | `EvmActions.tsx:2,19` | Deprecated → `mutateAsync` (`useConnect.d.ts:8-11`) |
| `useSignMessage().signMessageAsync` | `EvmActions.tsx:2,20` | Deprecated → `mutateAsync` (`useSignMessage.d.ts:7-10`) |
| `useSwitchChain().switchChain` | `useEvmSwitchChain.ts:106` | Deprecated → `mutate` (`useSwitchChain.d.ts:9`) |
| `useReconnect().reconnect` | `EvmHydrator.tsx:21` | Deprecated → `mutate` (`useReconnect.d.ts:9`) |
| `useConfig`, `useConnectors`, `usePublicClient`, `useWalletClient` | `EvmHydrator.tsx:2`; `EvmActions.tsx:2` | Unchanged |
| `WagmiProvider`, `Config`, `State`, `CreateConnectorFn` | `EvmProvider.tsx:2`; `privySource.ts:2`; `types/config.ts:31` | Unchanged (types are re-exported in our public API) |
| `createConfig`, `http`, `createStorage`, `cookieStorage`, `cookieToInitialState` | `xchains/evm/EvmXService.ts:9-18,126-175` | Unchanged |
| `getPublicClient` (`wagmi/actions`) | `EvmXService.ts:8,199,212,262` | Unchanged |
| `disconnect` (`wagmi/actions`) | `EvmActions.tsx:3,70` | Unchanged |
| `walletConnect`, `WalletConnectParameters` (`wagmi/connectors`) | `EvmProvider.tsx:3,39`; `types/config.ts:32,96` | Unchanged API; the SDK is now an **optional peer**: `@walletconnect/ethereum-provider ^2.21.1`, loaded through a guarded dynamic `import()` |
| `createConnector`, `ChainNotConfiguredError` | `privy/privyConnector.ts:2,62` | **Compile break.** `connect<withCapabilities>()` must return `accounts` shaped by `withCapabilities` (`@wagmi/core` v3 `createConnector.d.ts:38-48`). Sites: `privyConnector.ts:227,231,321`. v2's `@wagmi/core` 2.20.3 has no `withCapabilities`, so the fix ships with the bump. |
| `Connector` type | `xchains/evm/EvmXConnector.ts:3` | Unchanged |
| `wagmi/chains` (12 chains) | `EvmXService.ts:19-32`; `xchains/injective/InjectiveXService.ts:7` | Unchanged (re-exports `viem/chains`) |

**Connectors we configure.**

- WalletConnect, only when `walletConnect.projectId` is set (`EvmProvider.tsx:37-43`).
- The Privy source connector (`:46-56`).
- EIP-6963 injected wallets (wagmi's default multi-injected discovery; `createConfig` at `EvmXService.ts:131-161` does not disable it).
- `mock` only in tests.

Under wagmi 2.16.9, `@wagmi/connectors@5.9.9` **hard-depends** on Coinbase (two copies), the MetaMask SDK, Base, Gemini, Safe and WalletConnect (`npm view`). Under v3 the only connector SDK we need is `@walletconnect/ethereum-provider`, and only when the WalletConnect option is used. It becomes an optional peer of wallet-sdk-react. A Vite 7.3.6 build of an app that imports `walletConnect` succeeds **without** it installed (probe P3).

**Privy (probe 9 re-verified).**

- `@privy-io/react-auth` 3.49.1 (2026-10-15) and 3.40.0 have **no** wagmi or viem peer.
- Both pin viem **exactly** as a regular dependency (2.57.7 / 2.56.0) and depend on `@walletconnect/ethereum-provider` 2.22.4.
- `@privy-io/wagmi` 4.0.19 peers `viem 2.57.5` exactly and is not used (gh-456 "Settled" #1).
- Our Privy integration is our own `createConnector`, which needs the `withCapabilities` fix. Compatible.

**Viem minimum (for T4 / cluster A):**

- wagmi 3.7.7 with viem **2.29.2** (catalog, `pnpm-workspace.yaml:38`) fails at runtime: `SyntaxError: 'viem/actions' does not provide an export named 'sendCallsSync'`, and `wagmi/connectors` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED './tempo'`.
- With 2.42.0 the root loads but `wagmi/connectors` still fails.
- **2.43.0** (2025-12-17) is the first version where everything loads.
- A clean build with zero Rollup "is not exported" warnings needs about 2.57. Counts were 18 at 2.43–2.47, 1 at 2.52 and 0 at 2.57.7.
- Recommended: peer floor `>=2.43.0`, and catalog at the newest viem older than the 14-day cooldown (today 2.57.0, released 2026-09-29; 2.57.5 and 2.57.7 are inside the window).

**TypeScript.**

- wagmi ≥3.7 declares `typescript >=5.9.3` (optional peer); 3.0–3.6 declared `>=5.7.3`.
- The catalog has `5.5.4` (`pnpm-workspace.yaml:37`).
- Our EVM code typechecks with TS 5.5.4 when `skipLibCheck` is true (our setting).
- With `skipLibCheck: false`, wagmi's own d.ts produce 1572 errors under 5.5.4. Under 5.9.3 there are 79, caused by missing optional connector peers, viem 2.43's lack of `SignTransactionRequest`, and a react-query 5.87.4 generic-arity mismatch.
- `@sodax/types` typechecks clean on 5.9.3. The TS bump is cluster A's toolchain item.

### Approach

1. **Prerequisites (cluster A):** TypeScript catalog ≥5.9.3 and the viem floor ≥2.43.0 in T4's peer policy. Repo gates to expect: `minimumReleaseAge` and `trustPolicy: no-downgrade` (`pnpm-workspace.yaml:7,10`).
2. **T7.1** in one PR:
   - catalog `wagmi` → 3.7.x;
   - wallet-sdk-react moves `wagmi`, `viem` and `@tanstack/react-query` to peers;
   - `@walletconnect/ethereum-provider` becomes an optional peer;
   - Privy connector: `connect({ chainId, isReconnecting, withCapabilities } = {})` returns `withCapabilities ? [{ address, capabilities: {} }] : [address]` (`as never`). Typechecked in probe P4;
   - rename to `useConnection` and `mutate`/`mutateAsync` (4 files; compiled in P4);
   - update test mocks (`EvmHydrator.test.tsx:33` mocks `useAccount`).
3. **Not expandable in 2.x.** wagmi types are public in wallet-sdk-react (`types/config.ts:31-32,94,96`; `xchains/evm` exports `createWagmiConfig` / `tryCookieToInitialState`), and wagmi must be a single copy shared with apps that use wagmi hooks. It is therefore inherently a major. It is also small and independent, so it is a good first PR in the breaking window.

**Feasibility:** feasible and settled by probes P2–P4. The size estimate of 3 holds.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T7.0 | (cluster A) `chore(repo): TypeScript ≥5.9.3 and viem floor ≥2.43.0` | Toolchain and peer policy. | `pnpm-workspace.yaml`, all packages | A's estimate | — | before T7.1 | T4 | — |
| T7.1 | `feat(wallet-sdk-react)!: wagmi v3 with wagmi, viem and react-query as peers` | Bump; peers; WalletConnect SDK optional peer; Privy `withCapabilities`; v3 names; tests; README and docs pointers. | `packages/wallet-sdk-react/{package.json,src/providers/evm/*,src/hooks/useEvmSwitchChain.ts,src/privy/privyConnector.ts,src/**/*.test.tsx}`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | 3 | **yes** | contract-3.0 | T7.0 (A), T4 (A) | #163 (`EvmProvider.tsx`, `types/config.ts`; wallet-hw peers `wagmi 2.x` and its Ledger/Trezor `connect()` return `{ accounts: [account] }`, the same v3 break); T9.1 and T3.3 (`EvmProvider.tsx`); T3.6 (`package.json`) |

---

## T9 (7) — wallet-sdk-react reuses the app's QueryClient

**Bug (re-verified at cc053fef):**

- `providers/evm/EvmProvider.tsx:27-30` creates `new QueryClient()`.
- `:69-77` wraps **children** in `<QueryClientProvider client={private}>`.
- As a result, every dapp-kit hook rendered under `SodaxWalletProvider` with EVM enabled resolves wagmi's private client: dapp-kit has 49 files calling `useQueryClient`, and none passes a client explicitly.
- That contradicts the documented contract: "Must be wrapped by `<QueryClientProvider>`" (`SodaxWalletProvider.tsx:35-36`; README and `docs/CONFIGURE_PROVIDER.md`).
- Affected stacks: the demo (`apps/demo/src/providers.tsx:197-207`) and sodax-frontend (`apps/web/providers/wallet-providers.tsx:10-11`).

**Exact fix** (typechecked in probe P4; `QueryClientContext` is exported by `@tanstack/react-query` 5.87.4):

```tsx
import { type ReactNode, useContext, useMemo, useRef } from 'react';
import { QueryClient, QueryClientContext, QueryClientProvider } from '@tanstack/react-query';
// …
const appQueryClient = useContext(QueryClientContext);
const fallbackRef = useRef<QueryClient | null>(null);
if (!appQueryClient && !fallbackRef.current) fallbackRef.current = new QueryClient();
// …
const tree = (
  <WagmiProvider reconnectOnMount={reconnectOnMount} config={wagmiConfig} initialState={initialState}>
    <EvmHydrator />
    <EvmActions onDisconnect={privyDisconnect} />
    {PrivyHost ? <PrivyHost>{children}</PrivyHost> : children}
  </WagmiProvider>
);
const fallback = fallbackRef.current;
return appQueryClient || !fallback ? tree : <QueryClientProvider client={fallback}>{tree}</QueryClientProvider>;
```

This is a **pure 2.x bug fix**: no API change, and it matches the docs. Behaviour changes worth noting in the release note:

1. dapp-kit hooks now use the app's client, so `createSodaxQueryClient` options (`onMutationError`, the per-config cache reset) now apply. This is intended.
2. wagmi's internal queries now live in the app's cache. They don't collide with dapp-kit keys, which are namespaced (`staking`, `mm`, `swapsApi`, …). But a global `queryClient.clear()` or an unfiltered `invalidateQueries()` now refetches the connector client, so `walletProvider` is briefly `undefined` (`EvmHydrator.tsx:83-96`).
3. Apps that swap QueryClient instances (the demo recreates one per `configKey`) trigger one wagmi refetch per swap.
4. Apps with no `QueryClientProvider`, or a duplicate react-query copy (context miss), keep today's private-client behaviour.

**Feasibility:** trivial; no test depends on the private client.

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T9.1 | `fix(wallet-sdk-react): reuse the app's QueryClient in EvmProvider` | Fix above, a test proving a dapp-kit-style hook sees the outer client, and a release note. | `src/providers/evm/EvmProvider.tsx`, `src/providers/evm/EvmProvider.test.tsx` | 1 | no | expand-2.x | — | #163 (same file, `useMemo`/return block); T3.3 and T7.1 (same file) |

---

## T23 (5) — signer-only wallet interfaces; dedupe chain defs, ICON shims and the ICONEX queue

### Read/RPC members per interface and who calls them

| Interface (types file:line) | Read members | sdk / dapp-kit callers through the wallet provider | Decision for 3.0 |
| --- | --- | --- | --- |
| `IEvmWalletProvider` (`evm/evm.ts:89-103`) | `waitForTransactionReceipt` `:93` | `sdk/src/leverageYield/LeverageYieldService.ts:3168`; `dapp-kit/src/utils/approvalPlan.ts:99`; public helper `sdk/src/shared/utils/evm-utils.ts:15-19` (exported through `shared/utils/index.ts:1`, no internal callers); **also our API-mode example** `apps/swap-api-example/src/components/SwapCard.tsx:54` | Switch internal callers to `spoke.waitForTxReceipt` (`SpokeService.ts:1273`); make the member **optional**, because API-mode clients have no spoke. Keep the EIP-5792 members (`:95,100,102`): they are wallet RPC. |
| `IStellarWalletProvider` (`stellar/stellar.ts:103-115`) | `waitForTransactionReceipt` `:110`, `sendTransaction?` `:112` | `approvalPlan.ts:119` | Spoke for internal callers; make optional |
| `IIconWalletProvider` (`icon/icon.ts:62-67`) | `waitForTransactionReceipt` `:66` | none (spoke used: `SpokeService.ts:1304`) | Make optional |
| `ISolanaWalletProvider` (`solana/solana.ts:127-142`) | `waitForConfirmation` `:133`, `getAssociatedTokenAddress` `:139`, `getBalance` `:140`, `getTokenAccountBalance` `:141` | **none** (sdk uses static spoke helpers: `SolanaSpokeService.ts:144,209,214,231,392,399`) | **Remove**. Keep `buildV0Txn` (`:137`): it builds **and signs** (`SolanaSpokeService.ts:197,333,340`). |
| `ISuiWalletProvider` (`sui/sui.ts:294-307`) | `viewContract` `:298`, `getCoins` `:306` | **none** (`SuiSpokeService.ts:62-63,72,156,288,335` use their own transport) | **Remove** |
| `IStacksWalletProvider` (`stacks/stacks.ts:231-239`) | `getBalance` `:235` | **none** | **Remove** |
| `INearWalletProvider` (`near/near.ts:100-104`) | `getRawTransaction` `:103` (descriptor builder, not RPC: `NearWalletProvider.ts:78-81`) | **none** (`NearSpokeService.ts:192,315,352` call only `signAndSubmitTxn`) | **Remove** |
| `IInjectiveWalletProvider`, `IBitcoinWalletProvider` | none beyond send/sign | — | unchanged |
| `ITronWalletProvider` (PR #534) | `waitForTransactionReceipt` | — | make optional |

**What breaks for custom implementers:**

- Removing interface members does not break implementers. It breaks code that **calls** those members through the interface type: after T23.1 there are none inside sdk/dapp-kit, and no app calls them (scan of `apps/`).
- The only implementer-visible break is an object literal typed as the interface that keeps a removed member (excess-property error).
- Turning a receipt method optional breaks callers who use it unguarded: `SwapCard.tsx:54` would need `?.` or the concrete class.
- wallet-sdk-core classes drop the removed read methods in 3.0.
- Typed test fakes (`satisfies I…WalletProvider`) shrink.

### Dedupe (re-verified locations)

- **EVM chain definitions ×3** (identical copies of `hyper`, `robinhoodChain`, `getEvmViemChain`):
  - `sdk/src/shared/utils/constant-utils.ts:19,45,64`;
  - `wallet-sdk-core/src/wallet-providers/evm/EvmWalletProvider.ts:60,72,91`;
  - `wallet-sdk-react/src/xchains/evm/EvmXService.ts:50,76,96-111` (as `SODAX_EVM_CHAINS` from `wagmi/chains`).
  - wallet-sdk-react already depends on wallet-sdk-core, whose root already exports all three, so it can import them (×3 → ×2) with no new API.
  - The sdk copy cannot import wallet-sdk-core, and `@sodax/types` has no runtime viem. The canonical home is either a viem-dependent light entry of `@sodax/types` (T14, cluster A) or B's EVM core. Until that decision, the sdk keeps its copy.
- **ICON shim ×3:** `sdk/src/shared/services/spoke/IconSpokeService.ts:1-2`, `wallet-sdk-core/src/wallet-providers/icon/IconWalletProvider.ts:3,24`, `wallet-sdk-react/src/xchains/icon/IconXService.ts:3,7`. This is resolved by **removal**, not sharing: E4.2 / T8 (cluster B) moves reads to JSON-RPC, T6.6 builds the browser signer without icon-sdk-js, and icon-sdk-js remains only in the server signer.
- **ICONEX relay queue ×3, not ×2:**
  - `sdk/src/shared/entities/icon/HanaWalletConnector.ts:47,65` (exported through `entities/icon/index.ts:2`, **no internal callers**);
  - `wallet-sdk-core/src/wallet-providers/icon/IconWalletProvider.ts:31,189-271` (300 s timeout);
  - `wallet-sdk-react/src/xchains/icon/iconex/index.tsx:2,55-90` (60 s timeout, different correlation).
  - Each copy serializes only its own requests on the one shared `window` event channel, so the WALLET-L-1 guarantee ("at most one request in flight") does not hold across modules. This is a correctness fix, not just cleanup.
- **`isNativeToken` ×2:** `wallet-sdk-react/src/utils/index.ts:11-25` (hardcoded list, case-sensitive, misses NEAR's `'NEAR'`) against `types/src/utils/utils.ts:195` (config-driven). sodax-frontend uses the React one once.

**Feasibility:** feasible and cheaper than the scope's 8 + 2 points.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T23.1 | `refactor(sdk,dapp-kit): wait for receipts through the spoke` | `LeverageYieldService.ts:3168` → `this.spoke.waitForTxReceipt`; `approvalPlan.ts:99,119` → the sodax instance's spoke; deprecate the `evm-utils.ts:15-19` helper and the to-be-removed members (JSDoc). | `packages/sdk/src/leverageYield/LeverageYieldService.ts`, `packages/sdk/src/shared/utils/evm-utils.ts`, `packages/dapp-kit/src/utils/approvalPlan.ts`, `packages/types/src/{evm,stellar,icon,solana,sui,stacks,near}/*.ts` (JSDoc) | 2 | no | expand-2.x | — (coordinate with D on dapp-kit) | #512, #509, #523 (`LeverageYieldService.ts`) |
| T23.2 | `feat(types,wallet-sdk-core)!: signer-only wallet interfaces` | Remove zero-caller reads; receipts optional; drop the methods from classes; update fakes and tests; API-mode example uses `?.`. | `packages/types/src/*/{evm,stellar,icon,solana,sui,stacks,near}.ts`, `packages/wallet-sdk-core/src/wallet-providers/**`, `apps/swap-api-example/src/components/SwapCard.tsx` | 3 | **yes** | contract-3.0 | T23.1; land before T6.5 | #534, #497, #95 (`types/src/wallet/providers.ts`; their new interfaces add reads); #498 (`types/src/evm/evm.ts`); T6.4 (same classes) |
| T23.3 | `refactor(wallet-sdk-react): use wallet-sdk-core EVM chain definitions` | `EvmXService.ts` builds `SODAX_EVM_CHAINS` from `getEvmViemChain`, `hyper` and `robinhoodChain`. | `src/xchains/evm/EvmXService.ts`, `src/privy/{index,privyConfig}.ts` (consumers of `SODAX_EVM_CHAINS`) | 1 | no | expand-2.x | — | #498 (adds Monad to the same lists); T7.1 (same file) |
| T23.4 | `fix(wallet-sdk-core,wallet-sdk-react): one ICONEX relay queue` | Single relay in the wallet-sdk-core ICON module (add the HAS_ACCOUNT/HAS_ADDRESS requests the React copy uses); React `IconHanaXConnector` and actions use it; deprecate the sdk copy (removed with B's 3.0 spoke move). | `packages/wallet-sdk-core/src/wallet-providers/icon/*`, `packages/wallet-sdk-react/src/xchains/icon/**`, `packages/sdk/src/shared/entities/icon/HanaWalletConnector.ts` (JSDoc) | 2 | no | expand-2.x | — | T6.6 (same file) |
| T23.5 | `refactor(wallet-sdk-react): isNativeToken delegates to @sodax/types` | Keep the `(xToken) => boolean` signature. | `src/utils/index.ts` | 1 | no | expand-2.x | — | — |

---

## T30 (3) — typed per-chain account hooks; drop the X / xChainId naming

- **Approach.** Add typed hooks next to the old ones. In root: `useAccount<T extends ChainType>(chainType: T)`, whose address type is derived from `GetWalletProviderType<T>`. Per-chain hooks go in subpaths, e.g. `useSolanaAccount` from `./xchains/solana`. Keep `useXAccount` and the other `useX*` hooks as deprecated aliases through 3.x, then remove them in the next major. Naming should match T26's table (cluster D).
- **Depends on:** T3.3 (adapters and store), T26 (D: names).
- **Touches:** `src/hooks/useXAccount*.ts`, `src/hooks/index.ts`, docs.
- **Phase:** later (3.x, additive).

## T32 (3) — wallet adapters over standards

- **Approach.**
  - EVM: `fromEip1193(provider)` / `fromWalletClient(walletClient)` helpers returning `IEvmWalletProvider` without wagmi. `EvmWalletProvider` already accepts `walletClient` and `publicClient` (`EvmWalletProvider.ts:135`).
  - Sui: `@mysten/dapp-kit-react` 2.x is already Wallet Standard-based.
  - Solana: Wallet Standard arrives with B's `@solana/kit` move (T31).
- **Depends on:** T23.2, T3.3; T31 (B) for Solana.
- **Touches:** wallet-sdk-core EVM module, new `xchains/*` options.
- **Phase:** later.

## T36 (2) — embedded / social wallets as adapters

- **Approach.** Generalize the internal Privy source mechanism (`providers/evm/privySource.ts:30-48`: opaque value, `WeakMap` factory, Host component) into internal EVM wallet sources. Further embedded wallets then ship as subpath entries with optional peers, like `./privy`. The setup contract stays private (gh-456 "Settled" #3).
- **Depends on:** T3.3, T7.1.
- **Touches:** `src/providers/evm/*`, new `src/<wallet>/`.
- **Phase:** later.

---

## C7. In-flight work and merge order

| PR | Wallet-side files | Collides with | Recommended order |
| --- | --- | --- | --- |
| #534 Tron (ready, `MERGEABLE`, updated 2026-10-16) | `wallet-sdk-react/src/{chainRegistry.ts,constants.ts,types/config.ts,xchains/tron/*}` (adds a 10th `getInstance()` singleton); `wallet-sdk-core/src/wallet-providers/{index.ts,tron/*}` (union private-key/browser class); `types/src/{wallet/providers.ts,tron/*}` (interface with `waitForTransactionReceipt`) | T3.1–T3.4, T6.1–T6.3, T23.2 | **Merge #534 first.** T3, T6 and T23 then include Tron. Each sub-issue lists it. |
| #498 Monad (draft) | `wallet-sdk-core/src/wallet-providers/evm/EvmWalletProvider.ts` (`getEvmViemChain`), `wallet-sdk-react/src/xchains/evm/EvmXService.ts` (`SODAX_EVM_CHAINS` and transports), `sdk/src/shared/utils/constant-utils.ts`, Tron files | T23.3 (chain defs), T7.1 (`EvmXService.ts`), T6.2 (`EvmWalletProvider.ts`) | Land T23.3 early in 2.x so Monad adds one line in two places instead of three. Otherwise whichever lands second takes a small rebase-free merge (merge, never rebase). |
| #497 XRP (draft, `CONFLICTING`) | `wallet-sdk-{core,react}/package.json` (new deps), `chainRegistry.ts`, `types/config.ts`, `xchains/xrp/*`, `wallet-providers/xrp/*`, Tron files | Same as #534, plus T6.1 / T3.6 (package.json) | After #534. If it lands after T3.4, it ships as an `xrp()` adapter (template: any T3.4 chain). |
| #95 Aleo (`CONFLICTING`, 2026-09-07) | 18 wallet-react files including `SodaxWalletProvider.tsx` (a 4th provider-managed slot), `providers/aleo/*`, `chainRegistry.ts`, `utils/index.ts`; wallet-core Aleo provider and `package.json` | T3.1, T3.3, T3.4 (provider nesting), T6.x | If it merges in v2 shape, the T3.4 Aleo adapter follows the Solana/Sui pattern. If not, port it as an adapter directly. |
| #163 wallet-hw (open, `CONFLICTING`, 2026-09-21) | `wallet-sdk-react/src/providers/evm/EvmProvider.tsx` (`wagmiConnectors` in `useMemo`), `types/config.ts` (`EvmAdapterFields.wagmiConnectors`); new `packages/wallet-hw` | T9.1 and T3.3 (same block), T7.1 (wallet-hw peers `wagmi 2.x`; its Ledger/Trezor `connect()` has the same v3 `withCapabilities` break); release gates (`release.mjs:89-97,230-251`) | Not ours to edit. Note it in our own PR only if it blocks us. T9.1 should land regardless (one-line conflict for #163). |
| #483, #488, #501, #511, #509, #523 | none in wallet packages | T23.1 shares `LeverageYieldService.ts` with #512, #509, #523 | Land T23.1 after the user's #512 and #509 to avoid churn. Only the approve-wait block (3155–3178) is touched. |

---

## Cross-cluster dependencies

**Cluster C sub-issues that depend on other clusters:**

| Sub-issue | Depends on | Why |
| --- | --- | --- |
| T7.1 | T7.0 / T4 (A) | viem floor ≥2.43.0, peer policy, TS ≥5.9.3 |
| T6.2, T6.3 | T2 (A, E1.4) | BTC lazy ECC init |
| T6.4 | T4, T10 (A) | ESM-only, no inlined types |
| T6.5.\<chain\> | T1 (B: E2.3/E2.4) | Chain package scaffolds and the `PACKAGES` lists |
| T6.6 | T8 (B, E4.2) | ICON JSON-RPC client |
| T3.6 | T1, T2, T4 | Packaging decision, per-file ESM with `'use client'`, peers |
| T23.3 | T14 (A) | Canonical viem chain map for the sdk copy |
| T23.1 | D | Touches dapp-kit `approvalPlan.ts` |

**Other clusters that depend on cluster C:**

| Sub-issue | Depends on | Why |
| --- | --- | --- |
| T22 (D) | T3.1 + T3.7 | Per-provider store and the `WalletProviderSource` contract |
| T17 (D) | T3.3 / T3.4 / T3.6, T6.2 / T6.4, T7.1 | Codemod `config` → `adapters`, `PrivateKey*` imports, wagmi v3 names; app updates |
| T16 (D) | T3, T6, T7 | Skills content |
| T24 (D) | T23.2 | EVM receipt stays optional on the signer for API mode |
| T11 (A) | T3.6, T6.4 | An "EVM-only wallet-react" size scenario and a wallet-sdk-core install-size gate measure the payoff |
| T1 (B) | A2 / A3 | No `./react` in chain packages; signers in `./wallet` and `./server` |

---

## Delivery assumption ("expand, then contract") for cluster C

- **Holds:** T9.1, T23.1, T23.3–T23.5, T3.1–T3.5, T3.7, T6.1–T6.3 and T6.6 ship in 2.x without breaking anything.
- **Challenges:**
  1. Size and install wins for the wallet layer appear **only at contract time**. The legacy `config` path keeps every chain statically imported, and the union classes keep private-key libs in the root. 2.x delivers migration paths, not weight.
  2. wagmi v3 (T7.1) cannot be expanded: its types are public, and one wagmi copy must be shared with apps. Land it first in the breaking window.
  3. Expand roughly doubles T3's cost (fallback store, deprecated statics, converter). A direct 3.0 break would save about 3–4 points but give apps no early path.

---

## Corrections to plan-v3-scope.md (stale or wrong at cc053fef)

1. **E6.4** — "6 static `getInstance()` XServices" is wrong: there are **9** (list in §T3), and #534 makes it 10. There are also **two** global zustand stores (`useXWalletStore.ts:52`, `useWalletModalStore.ts:46`), both created at import time. The other figures are confirmed: `chainRegistry.ts` 440 lines, `SodaxWalletProvider.tsx` 63 lines, `useXWalletStore.ts:52`.
2. **E6.3** — "ICONEX queue ×2" is wrong: there are **3** (§T23), with different timeouts. The separate queues break WALLET-L-1's cross-module serialization. Chain defs ×3 and ICON shim ×3 are confirmed.
3. **E1.6 / E6.5** — "viem `^2.29`" with wagmi `^3` is wrong: wagmi 3.7.7 needs viem **≥2.43.0** at runtime (probe P2). wagmi ≥3.7 also declares TS ≥5.9.3, against the catalog's 5.5.4.
4. **E6.5** — "`useAccount` → `useConnection`, `mutate` API" are **deprecations** in v3, not removals. The only compile break is `createConnector`'s `withCapabilities` (Privy connector, and PR #163). The v3 status of every wagmi API in use is mapped in §T7.
5. **E6.6** — line refs drifted to `EvmProvider.tsx:27-30` and `:69-77`.
6. **E6.1** — most read members have **zero** callers through the wallet provider. The remaining 3 internal call sites move in a 2-point PR. The EVM receipt wait is used by our API-mode example (`SwapCard.tsx:54`), so it should become optional rather than be removed. Estimate: 5, not 8.
7. **E6.2** — 2 points is low. Nine mixed-mode classes need splitting (≈8 points across T6.2 and T6.3). The win is concrete: near-api-js (inlined into the 494 KB dist), ecpair, `secp256k1`/elliptic, bip322-js and `MsgBroadcasterWithPk` leave the browser path.
8. **D1** — "`./react` holds the wallet-sdk-react adapter" in each chain package conflicts with the code: the adapters depend on ≥10 wallet-sdk-react internals (§C1.2). Keep them in wallet-sdk-react subpaths (H).
9. **D1 release note** — lockstep is enforced by more than `sdks-publish.yml:30,72`. `scripts/bump-versions.sh:7` repeats the list, and `scripts/release.mjs:89-97,230-251` fail the release on non-aligned versions or list drift. Every new package (chain packages, wallet-hw) must join both lists and the shared version.
10. **Probe 9** — still compatible with Privy 3.49.1. Missing from the original note: Privy pins viem exactly as a regular dependency (2.56.0 / 2.57.7) and brings `@walletconnect/ethereum-provider` 2.22.4.

---

## Probes run (all in `$S/agent-C/`)

| # | Command (abridged) | Result |
| --- | --- | --- |
| P1 | `npm view wagmi@latest peerDependencies`; `npm view @wagmi/connectors@8.2.0 peerDependencies peerDependenciesMeta`; peers per minor 3.0–3.7 | wagmi 3.7.7 (2026-08-27): viem `2.x`, react `>=18`, typescript `>=5.9.3` (optional), react-query `>=5.0.0`. Connectors 8.2.0: all SDKs optional, including `@walletconnect/ethereum-provider ^2.21.1`. TS peer is `>=5.7.3` for 3.0–3.6 and `>=5.9.3` from 3.7.0. |
| P2 | `wagmi3/`: `npm i --ignore-scripts wagmi@3.7.7 viem@<v> …`; `node -e "import('wagmi')"` and `import('wagmi/connectors')` | viem 2.29.2: root `SyntaxError … 'sendCallsSync'`, connectors `ERR_PACKAGE_PATH_NOT_EXPORTED './tempo'`. 2.42.0: root OK, connectors fail. **2.43.0: all OK.** `./tempo` first appears in viem 2.43.0 (`npm view viem@X exports`). |
| P3 | `npx vite build app` (Vite 7.3.6; app imports `walletConnect` from `wagmi/connectors`; WalletConnect SDK **not** installed) | Build succeeds. Rollup "is not exported" warnings from `@wagmi/core` tempo zone actions: 18 at 2.43 and 2.47, 1 at 2.52, **0 at 2.57.7**. |
| P4 | `wsr-v3/`: copied cc053fef wallet-sdk-react EVM and Privy sources; `@sodax/types` mapped to real src; wallet-sdk-core and `@injectivelabs/wallet-base` stubbed; `tsc` with wagmi 3.7.7, viem 2.43.0, TS 5.9.3 | 1 error: `privy/privyConnector.ts(62,55)` (`connect()` vs `withCapabilities`). After the 2-site patch: **0**. With the T9 fix plus v3 names: **0**. TS 5.5.4 with `skipLibCheck` true: **0**. `skipLibCheck` false: 1572 lib errors (TS 5.5.4), 79 (TS 5.9.3). |
| P5 | `wsr-v3/src/probe/storeFactory.tsx`: vanilla `createStore` with devtools, persist and immer, context, `useSyncExternalStore` hydration (zustand 4.5.2) | Compiles; `.persist` typed on the vanilla store. |
| P6 | `wsr-v3/src/probe/adapters.tsx`: `ChainAdapter`, `defineAdapter` (`WeakMap`), `evm()` / `solana()` over the real `ChainTypeConfig`, props union, `configToAdapters` | Compiles; passing both `config` and `adapters` is rejected (`@ts-expect-error` holds). |
| P7 | `tsc -p tsconfig.types59.json` (cc053fef `packages/types/src`, TS 5.9.3) | 0 errors. |
| P8 | `npm pack @sodax/wallet-sdk-core@2.2.0` and `@sodax/wallet-sdk-react@2.2.0`; import-graph walk | Core `dist/index.mjs` 494 KB: no `near-api-js` specifier (inlined), `baseChainInfo` inlined, externals include secp256k1, ecpair, bip322-js and icon-sdk-js. React root reaches 16 dist files and imports every chain lib (§C1.1); no `'use client'` in dist. |
| P9 | `npm view @privy-io/react-auth@{3.40.0,3.49.1} peerDependencies dependencies`; `@privy-io/wagmi@latest` | No wagmi or viem peer; deps pin viem 2.56.0 / 2.57.7 and WalletConnect 2.22.4. `@privy-io/wagmi` 4.0.19 peers viem 2.57.5 exactly (not used). |
| P10 | `npm pack @wagmi/core@2.20.3`; read `createConnector.d.ts` | v2 `connect()` has no `withCapabilities`, so the Privy fix ships with the bump. |
| P11 | `du -sh` in `wagmi3/node_modules` | wagmi, `@wagmi/core` and `@wagmi/connectors` ≈ 9.9 MB without optional connector SDKs. v2's 5.9.9 hard-deps are listed in P1/§T7. |
| P12 | `npm view secp256k1@5 browser gypfile dependencies` | `gypfile: true`, `browser: { ./index.js: ./elliptic.js }`, depends on elliptic and node-gyp-build. |

Downstream scans (read-only `git grep` on local clones): sodax-frontend `6623d817`, intents-whitelabel `5e1fbba`, sodax-backend `9d3d8b06` (sodax-backend has no wallet packages).
