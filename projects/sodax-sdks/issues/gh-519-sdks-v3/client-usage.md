---
type: plan
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, client-usage, migration, examples, integrators]
related_issues: [gh-302, gh-456]
---

# GH-519 · v3 client usage: what each issue changes for integrators

For each of the 37 issues (30 parents and 7 single PRs, see `parent-issues.md`), this file says
what integrators get once the issue lands and what their code looks like before and after.

- **Before** is the real API at cc053fef, checked in source:
  - `SodaxProvider({ config })`;
  - `SodaxWalletProvider({ config: { [ChainType]: … } })`;
  - `useQuote({ params: { payload } })`;
  - `useSwap()` with vars `{ params, walletProvider }`;
  - `useWalletProvider({ xChainId })`;
  - `getSwapQuoteQueryOptions({ sodax, payload })`;
  - `useSwapLifecycle({ intentParams, srcWalletProvider, dstWalletProvider, chainSwitch })`;
  - `new SwapsApi({ baseUrl, timeout, apiKey })`;
  - `new EvmWalletProvider({ privateKey, chainId, rpcUrl })`;
  - `sodax.initialize()`, which today is a no-op.
- **After** is the API proposed by the research. Names marked *(proposed)* become final only in the
  ADRs: T1.1 for plugins and packages, and the ADR for the API-hooks package.

| Kind | Meaning |
| --- | --- |
| **auto** | Upgrade the package; no code change. |
| **opt-in** | A new 2.x API next to the old one; change code to get the benefit. |
| **3.0** | Breaking; the codemod (T17) does most of the work. |
| **internal** | Team or process work; users only notice the effect. |
| **later** | 3.x. |

## Index

| Issue | Kind | Client impact in one line |
| --- | --- | --- |
| A1 | internal | 2.x keeps getting fixes after 3.0; stay on it with `npm i @sodax/sdk@v2` |
| T1 | opt-in → 3.0 | Register the non-EVM chains you use with `plugins`; everything else drops out |
| T2 | auto | Bundles shrink on upgrade (one helper: 832 KB → under 1 KB) |
| T3 | opt-in → 3.0 | `config={{ EVM, SOLANA }}` becomes `adapters={[evm(), solana()]}` |
| T4 | 3.0 | Install viem / wagmi / react-query yourself (peers); ESM-only |
| T5 | auto → 3.0 | Installs lose 131 MB; in 3.0, `ClPrice` / `ClToken` replace PancakeSwap types |
| T6 | opt-in → 3.0 | Private-key signers move to `@sodax/wallet-sdk-core/server` |
| T7 | 3.0 | wagmi 3 + viem ≥ 2.43; install only the connectors you use |
| T8 | auto → 3.0 | Lighter ICON / Stellar / Solana; Anchor helpers removed in 3.0 |
| T9 | auto | dapp-kit hooks use your QueryClient (bug fix) |
| T10 | auto | One copy of the token list instead of up to five |
| T11 | internal | Size and advisory regressions are blocked in CI |
| T12 | opt-in | `createSodaxCore()` + `@sodax/sdk/<feature>`; ship only what you use |
| T13 | opt-in → 3.0 | `@sodax/dapp-kit/<feature>` subpaths; SDK names come from `@sodax/sdk` |
| T14 | auto + opt-in | `@sodax/types/chains` for chain keys without the token list |
| T15 | auto (3.0) | No Buffer polyfill needed for the EVM core |
| T16 | internal | AI skills match the version you installed |
| T17 | tooling | `npx @sodax/codemod <transform> src/` |
| T18 | opt-in | Lifecycle hooks for money market, staking, migration and DEX; `useRelayStatus` |
| T19 | opt-in | `signal`, `isRetryableError`, `error.context.requestId` |
| T20 | opt-in → 3.0? | `await sodax.initialize()` fetches remote config |
| T21 | opt-in | `get*QueryOptions` for every query; exported query keys |
| T22 | opt-in → 3.0 | Hooks find the wallet from context; one error type |
| T23 | 3.0 (custom wallets) | Custom wallet providers implement sign/send only |
| T24 | docs | Integration modes and an install matrix |
| T25 | auto | Bitcoin raw-tx `value` parsed as bigint |
| T26 | opt-in → 3.0 | `useQuote` → `useSwapQuote` and other renames; `SodaxProvider sodax={…}` |
| T27 | internal | Docs and AI tools describe the released version, not `main` |
| T28 | opt-in | `@sodax/api/swaps`, `@sodax/api/bridge`; the old packages become shims |
| T29 | internal | Bun, Deno and Workers are tested in CI |
| T30 | later | Typed per-chain account hooks |
| T31 | later | One wallet prompt for more features; `@sodax/sdk/testing`; Solana on Kit |
| T32 | later | `fromWalletClient(walletClient)` without wagmi |
| T33 | later | MCP build-tx tools from the valibot schemas |
| T34 | internal | Backend API drift caught in CI |
| T35 | later | Polling presets; `transport: 'api'` on the swap hooks |
| T36 | later | More embedded wallets, following the Privy pattern |

## Baseline today (2.2)

```tsx
// React
import { QueryClientProvider } from '@tanstack/react-query';
import { SodaxProvider, useQuote, useSwap } from '@sodax/dapp-kit';
import { SodaxWalletProvider, useWalletProvider } from '@sodax/wallet-sdk-react';

<QueryClientProvider client={queryClient}>
  <SodaxWalletProvider config={{ EVM: evmOptions, SOLANA: solanaOptions }}>
    <SodaxProvider config={sodaxOptions}>{children}</SodaxProvider>
  </SodaxWalletProvider>
</QueryClientProvider>;

// in a component
const walletProvider = useWalletProvider({ xChainId: params.srcChainKey });
const quote = useQuote({ params: { payload: quoteRequest } }); // data is a Result
const { mutateAsync: swap } = useSwap();
await swap({ params, walletProvider });
```

```ts
// Node / backend
import { Sodax } from '@sodax/sdk';
import { EvmWalletProvider } from '@sodax/wallet-sdk-core';

const sodax = new Sodax(); // constructs every chain service, ~0.9 s import
const walletProvider = new EvmWalletProvider({ privateKey, chainId, rpcUrl });
const result = await sodax.swaps.swap({ params, walletProvider });

// API mode
import { SwapsApi } from '@sodax/swaps-api';
const swapsApi = new SwapsApi({ baseUrl, timeout, apiKey });
```

## Per issue

### A1 · Release tooling — internal

- **After.** 2.x keeps getting fixes after 3.0 work starts. New packages publish without anyone
  editing the publish lists by hand.
- **Client.** Nothing to change. Once 3.0.0 is `latest`, apps that stay on 2.x install from the
  maintenance line: `npm i @sodax/sdk@v2` (dist-tag `v2`, proposed). `latest` never moves back to 2.x.

### T1 · Chain plugins — opt-in in 2.x, required in 3.0

- **After.**
  - Apps install and bundle only the chains they use. An EVM-only app is about 83% smaller and
    installs in about 85 MB, with 0 advisories.
  - A chain the app did not register fails fast with `SodaxError('CHAIN_NOT_ENABLED')`, and the
    message names the package to install.
- **Client.**
  - 2.x: nothing changes. `new Sodax()` still has every chain; opting in early is possible.
  - 3.0: `new Sodax()` is hub + EVM only, so register the other chains you use:

  ```ts
  // npm i @sodax/sdk @sodax/chain-solana
  import { Sodax } from '@sodax/sdk';
  import { solanaPlugin } from '@sodax/chain-solana'; // (proposed)

  const sodax = new Sodax({ plugins: [solanaPlugin()] });

  // apps that want every chain (e.g. backends)
  import { allChainPlugins } from '@sodax/chains-all'; // (proposed)
  const all = new Sodax({ plugins: allChainPlugins() });

  // typed chain access; the sodax.spoke.solana getters are removed in 3.0
  const solana = sodax.spoke.getSpokeService(ChainKeys.SOLANA_MAINNET);
  ```

  - The codemod adds `plugins` for the chains it finds in your code (T17.3).

### T2 · Unbundled ESM, no import-time side effects — auto

- **After.**
  - Tree-shaking works: one helper costs under 1 KB instead of 832 KB gzip.
  - `'use client'` directives survive into the published files; tsup drops them today.
- **Client.** Upgrade; bundles shrink by themselves. Deep imports into `dist/` were never public and
  may break.

### T3 · Wallet adapters and per-provider state — opt-in in 2.x, required in 3.0

- **After.**
  - The wallet layer loads only the chains you pass: the EVM part is 124 KB, against 2.6 MB for
    today's provider.
  - Each provider has its own state, so SSR, tests and multiple providers stop sharing a global store.
- **Client.**

  ```tsx
  // before
  <SodaxWalletProvider config={{ EVM: evmOptions, SOLANA: solanaOptions }}>

  // after (2.x opt-in; the only form in 3.0)
  import { SodaxWalletProvider, evm } from '@sodax/wallet-sdk-react';
  import { solana } from '@sodax/wallet-sdk-react/xchains/solana'; // (proposed names)

  <SodaxWalletProvider adapters={[evm(evmOptions), solana(solanaOptions)]}>
  ```

  - Hooks stay the same (`useXAccount`, `useWalletProvider`).
  - In 3.0:
    - `getXService()` and the static `getInstance()` are removed;
    - you install the React wallet libraries for each non-EVM chain you enable yourself (optional
      peers).
  - Privy keeps its shape: `evm({ privy: privy({ appId }) })`.
  - *Proposed (§12), T3.8 and T3.9:* a headless config, plus lazy chains for apps that support many
    chains.

  ```tsx
  // created once, outside React
  const wallets = createSodaxWallets({ adapters: [evm(evmOptions), solana(), sui(), bitcoin()] }); // (proposed)

  <SodaxWalletProvider wallets={wallets}>
    <SodaxProvider sodax={sodax} wallets={wallets}>{children}</SodaxProvider> {/* no glue hook */}
  </SodaxWalletProvider>;

  // non-React code (replaces getXService / getInstance)
  const provider = getWalletProvider(wallets, ChainKeys.SOLANA_MAINNET);
  ```

    - Non-EVM chain code loads on demand, or at startup for chains that were connected before, so an
      all-chain app starts near the EVM size (≈124 KB) instead of 2.6 MB.
    - The trade-off: connector lists for a chain show a loading state until it loads. The wallet
      modal preloads on open.

### T4 · ESM-only packages; viem, wagmi, react-query as peers — 3.0

- **After.** One viem, wagmi and react-query copy shared with your app (today up to 8 viem copies,
  355 MB), and security fixes without waiting for a SODAX release.
- **Client.**
  - Install the peers yourself: `npm i @sodax/sdk viem` (React packages also need
    `wagmi @tanstack/react-query`).
  - Ranges: the sdk takes `viem ^2.29.2`; wallet-sdk-react takes `viem >=2.43` because of wagmi v3.
  - Node CommonJS keeps working through `require(esm)` on Node ≥ 22.12.
  - TypeScript `moduleResolution: node` keeps working (`typesVersions`). With `module: node16` and
    CommonJS, switch to `nodenext` or `bundler`; otherwise you get TS1479.

### T5 · PancakeSwap replaced by vendored math — auto in 2.x, small change in 3.0

- **After.** Every install loses 131 MB, 20 advisories and six nested viem copies, including apps that
  never use the DEX.
- **Client.**
  - 2.x: nothing.
  - 3.0: if your code names PancakeSwap's `Price` / `Token` types, switch to `ClPrice` / `ClToken`
    from `@sodax/sdk` *(proposed)*.
  - Method calls such as `toSignificant()` keep working.

### T6 · Server-only signers — opt-in in 2.x, required in 3.0

- **After.** Browser bundles stop carrying private-key signing and its libraries, and backends get one
  explicit entry.
- **Client.**

  ```ts
  // before (the same class served browser and server)
  import { EvmWalletProvider } from '@sodax/wallet-sdk-core';
  const signer = new EvmWalletProvider({ privateKey, chainId, rpcUrl });

  // after (2.x opt-in; required in 3.0)
  import { PrivateKeyEvmWalletProvider } from '@sodax/wallet-sdk-core/server'; // (proposed)
  const signer = new PrivateKeyEvmWalletProvider({ privateKey, chainId, rpcUrl });

  // 3.0, non-EVM chains: from the chain package
  import { PrivateKeySolanaWalletProvider } from '@sodax/chain-solana/server'; // (proposed)

  // 3.0, EVM (proposed, plan-v3-packages.md): wallet-sdk-core folds into the sdk and stays as a shim
  import { PrivateKeyEvmWalletProvider } from '@sodax/sdk/wallet/server';
  ```

  Browser apps change nothing; they use wallet adapters (T3).

### T7 · wagmi v3 — 3.0, first PR of the window

- **After.** The connector SDKs become optional: the wagmi stack goes from 576 MB / 23 advisories to
  102 MB / 0, and the deprecated MetaMask SDK goes away.
- **Client.**
  - `npm i wagmi@3 viem@^2.43`; an app that already uses wagmi shares the copy.
  - Install only the connectors you use, e.g. `@walletconnect/ethereum-provider` for WalletConnect.
  - `useAccount` → `useConnection`. The old name is deprecated in v3 but still works.
  - TypeScript ≥ 5.9.3 is recommended (wagmi's peer).

### T8 · Lighter chain libraries — auto in 2.x, small change in 3.0

- **After.**
  - Smaller ICON, Stellar and Solana footprint.
  - Each Solana deposit makes 2 fewer RPC calls.
  - ICON receipt numbers become real `bigint`; today they are BigNumber despite the type.
- **Client.** Nothing in 2.x. In 3.0, these change:
  - the deprecated Anchor helpers (`getProvider`, `getAssetManagerIdl`, `getConnectionIdl`,
    `getAssetManagerProgram`, `getConnectionProgram`) are removed;
  - `IconSpokeService.iconService` changes type.

### T9 · QueryClient reuse — auto (2.x bug fix)

- **After.** dapp-kit hooks under `SodaxWalletProvider` use your QueryClient, so your defaults,
  `onError` (e.g. Sentry) and cache resets apply.
- **Client.**
  - Nothing to change.
  - Side effect: wagmi's queries now live in your cache, so an unfiltered `queryClient.clear()` makes
    wagmi refetch, and `walletProvider` is briefly `undefined`.

### T10 · Stop inlining `@sodax/types` — auto

- **After.** One copy of chain and token data instead of up to five in one dapp.
- **Client.** Nothing.

### T11 · CI gates — internal

- **After.** A PR that grows the bundle, the install footprint or the advisory count fails CI.
  Releases can quote real numbers.
- **Client.** Nothing; sizes stay stable from release to release.

### T12 · `createSodaxCore` and per-feature entries — opt-in in 2.x

- **After.** Ship only the features you use: an EVM swap-only app is about 169 KB gzip, against
  1.27 MB for `new Sodax()`.
- **Client.**

  ```ts
  // before
  const sodax = new Sodax(options);
  await sodax.swaps.swap({ params, walletProvider });

  // after (opt-in)
  import { createSodaxCore } from '@sodax/sdk/core'; // (proposed)
  import { createSwapService } from '@sodax/sdk/swap';

  const core = createSodaxCore(options); // hub + EVM; add `plugins` for other chains
  const swaps = createSwapService(core);
  await swaps.swap({ params, walletProvider });
  ```

  - The `Sodax` class stays; it is built on the core.
  - CommonJS consumers keep using the root import in 2.x, because the subpaths are ESM.

### T13 · dapp-kit subpaths; the sdk becomes a peer — opt-in in 2.x, required in 3.0

- **After.** React apps load only the hook groups they use, and no longer get the whole SDK through
  dapp-kit's re-export. Next.js gets correct client boundaries.
- **Client.**

  ```ts
  // before: one barrel, SDK names included
  import { useQuote, useSwap, ChainKeys, type SwapQuote } from '@sodax/dapp-kit';

  // after
  import { useSwapQuote, useSwap } from '@sodax/dapp-kit/swap'; // subpaths (2.x)
  import { ChainKeys, type SwapQuote } from '@sodax/sdk';       // required in 3.0
  ```

  - 3.0: add `@sodax/sdk` to your own dependencies (it becomes a peer). The codemod rewrites the
    imports (T17.1).
  - Chain-specific hooks live under `@sodax/dapp-kit/bitcoin` and similar subpaths, and need that
    chain package installed (T13.10).
  - *Proposed, T28.5–T28.8:* API-only React apps skip the SDK entirely:

  ```tsx
  // npm i @sodax/api @tanstack/react-query   (no @sodax/sdk)
  import { SodaxApiProvider, useSwapsApiQuote } from '@sodax/api/react'; // (proposed, T28.5–T28.8)

  <SodaxApiProvider config={{ baseUrl, apiKey }}>{children}</SodaxApiProvider>;
  ```

  SDK users keep importing these hooks from `@sodax/dapp-kit`, which re-exports them.

### T14 · Split `@sodax/types` — auto, plus opt-in in 2.x

- **After.** Code that only needs chain keys stops paying for token lists: 34 KB → 2 KB.
  `sideEffects: false` helps bundlers automatically.
- **Client.**

  ```ts
  // before (e.g. a backend config that needs only ChainKeys)
  import { ChainKeys } from '@sodax/sdk';

  // after
  import { ChainKeys, getChainType } from '@sodax/types/chains'; // (proposed subpath)
  ```

  The root `@sodax/types` stays unchanged.

### T15 · Polyfill-free core — auto (3.0 for the full effect)

- **After.** The EVM core runs on Workers, React Native, Bun and Deno without polyfills.
- **Client.** After 3.0, EVM-only apps can delete their `buffer` polyfill setup. Non-EVM chain plugins
  may still need their own libraries' polyfills.

### T16 · Skills for v3 — internal

- **After.** AI agents write code for the version you installed; a v2→v3 skill guides upgrades.
- **Client.** Developers using AI tools install skills from the release channel and get
  version-correct guidance.

### T17 · Migration: codemods, docs, apps, downstream — tooling

- **After.** You upgrade by running a codemod instead of reading a diff.
- **Client.**

  ```bash
  npx @sodax/codemod <transform> src/ --dry   # (proposed CLI) sodax-codemod <transform> <paths> [--dry]
  ```

  - Transforms:
    - dapp-kit SDK imports;
    - hook renames;
    - `plugins` registration;
    - `config` → `adapters`;
    - server-signer imports;
    - the 3.0 rewrites.
  - Report-only rules flag `data?.ok` checks and literal query keys.

### T18 · Lifecycle hooks for every flow — opt-in in 2.x

- **After.** Money market, staking, migration and DEX get the same states as swap (idle → submitting
  → pending → settled or failed) and resume after a reload or a relay timeout.
- **Client.**

  ```tsx
  // today, swap only (bridge and leverage-yield are in progress in 2.x)
  const lc = useSwapLifecycle({ intentParams, srcWalletProvider, dstWalletProvider, chainSwitch });

  // after (proposed names), same shape for the other flows
  const mm = useMoneyMarketLifecycle({ /* supply / borrow / withdraw / repay */ });

  // any flow: poll delivery by source tx (sodax.spoke.getRelayStatus underneath)
  const relay = useRelayStatus({ srcChainKey, srcTxHash });
  ```

### T19 · Uniform API errors, AbortSignal, request ids — opt-in in 2.x

- **After.**
  - Retryable errors can be told apart from fatal ones.
  - Stale quotes and polls stop sending requests.
  - Support traces one user action from the SDK into backend logs.
- **Client.**

  ```ts
  const ac = new AbortController();
  const res = await sodax.swaps.swap({ params, walletProvider, signal: ac.signal }); // (proposed)
  if (!res.ok) {
    if (isRetryableError(res.error)) retryLater();
    report(res.error.context.requestId); // the same id the backend logs
  }

  // standalone API clients take per-call options
  await swapsApi.getQuote(request, { signal });
  ```

  - An abort after broadcast still returns the error with `srcTxHash`; an abort never hides a sent
    transaction.
  - dapp-kit passes React Query's signal through, so old quote polls cancel by themselves.

### T20 · Remote config v2 — opt-in in 2.x, possibly default in 3.0

- **After.** New tokens and chains go live without an SDK release.
- **Client.**

  ```ts
  const sodax = new Sodax();
  await sodax.initialize(); // a no-op today; after T20.1 it fetches /v2/be/config/all, with the bundled config as fallback
  ```

  - dapp-kit refreshes the config in the background (T20.2).
  - Default-on in 3.0 only if product approves: token lists and metadata only, never contract
    addresses or API URLs.

### T21 · Query key factory and `queryOptions` builders — opt-in in 2.x

- **After.** Prefetch, SSR hydration and Suspense for every query, plus reliable invalidation. The
  stale-allowance key bug is fixed.
- **Client.**

  ```ts
  // today, 8 builders exist, e.g.
  await queryClient.prefetchQuery(getSwapQuoteQueryOptions({ sodax, payload }));

  // after: builders for every query plus exported keys (today's key shapes are kept)
  queryClient.invalidateQueries({ queryKey: sodaxKeys.mm.all }); // (proposed name)
  ```

### T22 · Wallet provider from context; one error style — opt-in in 2.x, small change in 3.0

- **After.** No more `walletProvider` on every call (55 hook files take it today), and one error type
  everywhere.
- **Client.**

  ```tsx
  // before
  const walletProvider = useWalletProvider({ xChainId: params.srcChainKey });
  await swap({ params, walletProvider });

  // after (proposed)
  function Providers({ children }) {
    const wallets = useWalletProviderSource(); // from @sodax/wallet-sdk-react, inside SodaxWalletProvider
    return <SodaxProvider sodax={sodax} wallets={wallets}>{children}</SodaxProvider>;
  }
  await swap({ params }); // the wallet comes from context; passing walletProvider still works
  ```

  - Every hook error is a `SodaxError` with `code`, `feature` and `phase`.
  - 3.0: six status and quote queries throw instead of returning `{ ok }` in `data`, so `data?.ok`
    checks move to `error`. The codemod reports them.

### T23 · Signer-only wallet interfaces — 3.0, for custom wallet authors

- **After.**
  - Custom wallets (MPC, Safe, embedded) implement a few sign and send methods.
  - One ICONEX queue restores the WALLET-L-1 audit fix.
- **Client.**
  - Apps that use the built-in providers change nothing; the ICONEX fix is automatic.
  - Custom `I…WalletProvider` implementations drop the read methods (balances, token accounts, …),
    and `waitForTransactionReceipt` becomes optional.

### T24 · Integration modes and API mode docs — docs

- **After / Client.**
  - One page to choose between the SDK, API mode and raw transactions (`raw: true`).
  - An install matrix per persona (`plan-v3-order.md` §11).

### T25 · BITCOIN raw-tx branch — auto

- **After.** Bitcoin raw transactions from the swaps and leverage-yield APIs parse correctly; `value`
  becomes a bigint as typed.
- **Client.** Nothing. Code that already did `BigInt(tx.value)` keeps working.

### T26 · Consistent hook names; `SodaxProvider` accepts an instance — opt-in in 2.x, required in 3.0

- **After.** Predictable names, and one SDK instance shared by app and provider.
- **Client.**

  ```ts
  // the old names are deprecated in 2.x, removed in 3.0; the codemod renames them
  useQuote  → useSwapQuote      useStatus → useSwapIntentStatus
  useSupply → useMMSupply       useClaim  → useStakingClaim
  // params: xChainId / chainId / spokeChainKey → chainKey; userAddress → address

  <SodaxProvider sodax={sodax}>   // instead of a second new Sodax() inside the provider
  ```

### T27 · Pinned docs and AI channels; generated hook index — internal

- **After / Client.** docs.sodax.com and the AI tools describe the released version, not `main`, so
  2.x users never read v3 instructions.

### T28 · One `@sodax/api` — opt-in in 2.x

- **After.** One light package for every SODAX HTTP API, with one transport and one error base,
  usable without the SDK.
- **Client.**

  ```ts
  // before
  import { SwapsApi } from '@sodax/swaps-api';
  import { BridgeApi } from '@sodax/bridge-api';

  // after (the old packages keep working as shims for one major)
  import { SwapsApi } from '@sodax/api/swaps';
  import { BridgeApi } from '@sodax/api/bridge';
  // proposed: '@sodax/api/leverage-yield', '@sodax/api/backend'
  ```

  - `SwapsApiError` and `BridgeApiError` stay `instanceof`-compatible.
  - `toSodaxError(e)` maps them into the SDK's error type.

### T29 · Runtime matrix — internal

- **After / Client.** Bun, Deno and Workers support is tested in CI, not just claimed.

### T30 · Typed per-chain account hooks — later

```ts
const { address } = useAccount('SOLANA'); // (proposed) typed for Solana; useXAccount stays as a deprecated alias
```

### T31 · Later bundle — later

- **Batching.** One wallet prompt (approve + action) for money market, staking, migration, DEX and
  partner, with wallets that support EIP-5792.
- **Testing.**

  ```ts
  import { createFakeEvmWalletProvider } from '@sodax/sdk/testing'; // (proposed)
  ```

- **Solana on Kit.** Internal to `@sodax/chain-solana`; `raw: true` output stays identical.

### T32 · Wallet adapters over standards — later

```ts
import { fromWalletClient } from '@sodax/wallet-sdk-core'; // (proposed)
const walletProvider = fromWalletClient(viemWalletClient); // no wagmi, no React layer
```

### T33 · MCP-ready tool schemas — later

- **After / Client.** The existing SODAX MCP servers gain build-unsigned-tx tools. Developers can
  reuse the schemas from `@sodax/api/tools` *(proposed)*.

### T34 · OpenAPI drift gate — internal

- **After / Client.** Backend changes that would break client parsing are caught before release.

### T35 · Polling presets and a transport option — later

```tsx
<SodaxProvider polling={{ quote: 5_000, status: 3_000 }}>   // (proposed)
useSwapQuote({ params, transport: 'api' });                 // same hook, over the API
```

### T36 · Embedded / social wallets as adapters — later

More embedded wallets plug in the way Privy does today: `evm({ privy: privy({ appId }) })`. Each one
gets its own optional subpath.
