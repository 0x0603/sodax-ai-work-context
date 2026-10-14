---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-14
tags: [v3, idea-capture, lightweight, bundle-size, dx, ai, architecture]
related_decisions: [sodax-sdks/0003-progress-reporting-vocabulary]
related_issues: [gh-302, gh-456]
---

# GH-519 · v3 ideas — 0x0603 input

> **Draft for the user to post on #519.** The issue is R0bi7's: agents do not edit its body or
> comment on it. Numbers: `measurements.md`. Competitor precedent: `competitors.md`. Source refs are
> `origin/main` `77281f0c` (2026-10-13) unless marked otherwise.

## 1. Paste-ready input

Format follows the issue: bullets per package, no details, name prefix. Lightweight items first in
every section.

```markdown
**0x0603** — baseline measured on published 2.2.0 (esbuild, minified, browser): `new Sodax()` = 1.27 MB gzip;
importing one helper from `@sodax/sdk` = 832 KB gzip (tree-shaking does not work); minimal swap dapp
(dapp-kit + wallet-sdk-react) = 3.0 MB gzip; `npm i @sodax/sdk` = 412 packages / 777 MB. Lightweight first.
Measured v3 what-ifs for an EVM-only app (chain plugins, client-first actions, no PancakeSwap): swap dapp 3.0 MB →
~0.2 MB gzip (0.6 MB with WalletConnect); `npm i @sodax/sdk` 777 MB / 35 advisories → ~85 MB / 0; dapp install
1.8 GB / 81 advisories → 108 MB / 0; Node import 0.9 s → 0.1 s.

## `@sodax/sdk`
- [0x0603] Chain plugins: core = hub + EVM (viem) only; each non-EVM chain is an opt-in package with its chain lib, never in core deps (EVM-only what-if: `new Sodax()` −83% gzip, install 777 → ~85 MB; cf. LI.FI SDK v4 `@lifi/sdk-provider-*`)
- [0x0603] Replace the eager `Sodax` god object with client-first standalone actions (`getQuote(client, …)`, viem / LI.FI v4 / Aave style); all-in-one facade only as opt-in convenience
- [0x0603] Make tree-shaking work: no import-time side effects (`initEccLib`), unbundled multi-entry ESM dist, pure top-level constants
- [0x0603] Drop the PancakeSwap SDKs (358 MB of our install — six nested viem copies — plus Solana web3.js v1 and 20 advisories) — vendor the CL math + ABI fragments we use
- [0x0603] Replace thinly-used heavy libs: icon-sdk-js → tiny JSON-RPC client, stellar-sdk → `/minimal` entry, Solana web3.js v1 (critical fixes only) + anchor → @solana/kit + Codama client (70 → 33 MB install, 9 → 0 advisories), injective sdk-ts → minimal cosmjs pieces, bignumber.js → bigint
- [0x0603] viem / shared libs as peer dependencies with ranges, not exact-pinned deps (viem installs 8× / 355 MB with the sdk, 15× / 669 MB with the React layer; our exact 2.29.2 pin also blocks the `ws` fix for consumers)
- [0x0603] ESM-only (engines already Node ≥ 22.12, `require(esm)` works) — no CJS twin, no duplicate `.d.cts`
- [0x0603] Polyfill-free core (Uint8Array / WebCrypto, no global `Buffer`) → works in React Native, Workers, Bun, Deno without config
- [0x0603] Lazy-load chain modules on first use (Node import today 0.9–2 s, ~260 MB RSS → ~0.1 s / 75 MB for an EVM core; backend services pay it to read `ChainKeys`)
- [0x0603] Remote config on by default (token / chain lists out of the bundle; `initialize()` is a no-op today)
- [0x0603] Ship only the ABI fragments we call (ABIs are ~184 KB of the dist)
- [0x0603] Unsigned-tx first: every action can return a prepared tx/intent to sign anywhere (wallet, Safe, MPC, backend); execution helpers on top
- [0x0603] SDK-level lifecycle / progress events + resumable flows for every multi-step action (generalize `useSwapLifecycle`; cf. LI.FI `executeRoute` / `resumeRoute`, Across `onProgress`)
- [0x0603] One typed error model end to end: `Result<T, SodaxError<Code>>`, API clients included (cf. Aave `ResultAsync` + typed errors)
- [0x0603] Signer-only wallet interface (address / sign / send); receipt polling, ATA lookups, tx building move into chain modules (cf. Relay `AdaptedWallet`)
- [0x0603] Chain plugin contract (keys + spoke + wallet adapter + raw-tx schema in one place) — Stacks support is spread over 67 files in 9 packages
- [0x0603] `AbortSignal` on every async call (quotes, status polling, waits) — React Query already hands one to every queryFn
- [0x0603] Correlation id per user action, sent on every API call and carried in errors (support / debugging across SDK → API → relay)
- [0x0603] EIP-5792 batching (approve + action in one wallet prompt) as the default EVM path for every feature, not only swaps
- [0x0603] `testing` entry: typed mock wallet providers + API mocks for integrators
- [0x0603] v2 → v3 codemods + a short compat window

## `@sodax/dapp-kit`
- [0x0603] Per-feature subpath entries; stop `export * from '@sodax/sdk'`; sdk as a peer
- [0x0603] Query-key factory + `queryOptions()` builders for every read (prefetch, Suspense, SSR hydration), env/instance id in the key (cf. `@wagmi/core/query`)
- [0x0603] One error model (today: hooks returning `data.ok`, hooks throwing, `mutateAsyncSafe`)
- [0x0603] Resolve wallet provider + address from context instead of threading `walletProvider` through every mutation
- [0x0603] One hook family per action with a transport option, instead of parallel on-chain vs API families (swap / swapsApi, bridge / bridgeApi, leverageYield / leverageYieldApi)
- [0x0603] Consistent names: `chainKey` / `address` params; specific hook names (`useSwapQuote`, not `useQuote`)
- [0x0603] Polling presets instead of 52 hard-coded `refetchInterval`s; let `enabled` through
- [0x0603] `'use client'` entries + SSR-safe providers; `SodaxProvider` accepts an existing instance
- [0x0603] Lifecycle hooks for every multi-step flow (MM, bridge, vaults), same shape as `useSwapLifecycle`

## `@sodax/wallet-sdk-core`
- [0x0603] One entry per chain, chain libs as optional peers (an EVM-only app should not install Injective / Bitcoin / NEAR / ICON libs)
- [0x0603] Thin adapters over standards (EIP-1193 / viem WalletClient, Wallet Standard for Solana & Sui) instead of custom providers
- [0x0603] Move private-key / mnemonic signers to a server-only entry
- [0x0603] No import-time side effects (`initEccLib`, `ECPairFactory`), no global `Buffer`
- [0x0603] Dedupe with the sdk (viem chain defs written 3×, ICON interop shim 3×, ICONEX request queue 2×)

## `@sodax/wallet-sdk-react`
- [0x0603] Build-time chain opt-in: `adapters={[evm(), solana()]}` from subpaths (`xchains/evm` alone = 124 KB gzip vs 2.6 MB for `SodaxWalletProvider`; cf. LI.FI widget v4 `@lifi/widget-provider-*`)
- [0x0603] wagmi v2 → v3: connector wallet SDKs (MetaMask, Coinbase, WalletConnect…) become optional peers instead of hard deps (wagmi alone: 371 pkgs / 576 MB / 23 advisories → 24 pkgs / 102 MB / 0)
- [0x0603] Never shadow the app's QueryClient (EvmProvider wraps the whole subtree in its own today); bring-your-own wagmi config
- [0x0603] wagmi / viem / react-query as peers with ranges
- [0x0603] No module singletons (global zustand store, static XService instances) → state per provider instance, SSR-safe
- [0x0603] Typed per-chain account hooks; drop the `X` / `xChainId` naming; one shared config with dapp-kit
- [0x0603] Embedded / social wallets as adapters on subpaths (Privy pattern, extend to others)

## `@sodax/skills`
- [0x0603] Generate an API model (api-extractor / TypeDoc JSON) and derive hook index, query-key table, `llms-full.txt` from it — no hand-kept lists
- [0x0603] `@sodax/mcp`: read tools (quote, status, balances, positions) + build-unsigned-tx tools; never holds keys (LI.FI and Aave ship read-only MCPs that return unsigned txs)
- [0x0603] Tool schemas generated from our valibot schemas (→ JSON Schema), one source for MCP and agent kits
- [0x0603] Agent-framework adapters generated from the same tool definitions (Vercel AI SDK tools, Coinbase AgentKit)
- [0x0603] Pin every distribution channel to the released version; archive the v1 → v2 migration content
- [0x0603] Typecheck snippets for all packages (today: dapp-kit + wallet-sdk-react only)

## API Packages
- [0x0603] One `@sodax/api` with subpaths (swaps, bridge, leverage-yield, backend, sponsoring): one transport, one error type; the sdk uses it directly (no wrapper services, no third HTTP stack)
- [0x0603] Generate clients + schemas from the backend OpenAPI spec
- [0x0603] Don't bundle `@sodax/types` (each client is ~128 KB min, mostly a duplicated token list); validation schemas optional
- [0x0603] Exhaustive chain switches (swaps-api raw-tx schema has no BITCOIN branch and falls back to a permissive schema)
- [0x0603] "API mode" as the lightest integration path: quote + build tx server-side, client only signs (Rango / NEAR 1Click / deBridge pattern)

## Cross-cutting (`@sodax/types`, `@sodax/libs`, repo)
- [0x0603] Split `@sodax/types` into zero-runtime types + a data package with per-chain entries; `sideEffects: false`; stop inlining it (5 token-list copies in one swap dapp)
- [0x0603] Drop vendored third-party typings from types (near-api-js 6.7k lines, solana-web3 4k lines)
- [0x0603] Retire `@sodax/libs` vendoring (its Injective bundle carries a private copy of viem + ethers + axios)
- [0x0603] tsup → tsdown (tsup is unmaintained)
- [0x0603] CI budgets per scenario: gzip size via size-limit (LI.FI: quote ≤ 6 kB, EVM provider ≤ 115 kB), install footprint, `npm audit` on a fresh consumer install (35 advisories for the sdk, 81 incl. 1 critical for the React layer; repo `overrides` don't reach consumers)
- [0x0603] Runtime matrix in CI: Node, Bun, Deno, Workers, React Native, Vite / Next / Turbopack
- [0x0603] New package idea: `@sodax/widget` — drop-in swap / bridge UI on top of dapp-kit for partners (LI.FI Widget / Relay Kit style)
```

## 2. Evidence behind the bullets

Only what is not already in `measurements.md`.

### `@sodax/sdk`

- **God object.** `Sodax` constructor `packages/sdk/src/shared/entities/Sodax.ts:46-134` builds 12
  services (`:66-133`); `SpokeService` imports all 10 spokes (`SpokeService.ts:30-39`) and exposes
  them as public fields.
- **Side effects.** `initEccLib(ecc)` — `BitcoinSpokeService.ts:48`. Dist has 142 top-level
  `var x = call(...)` initializers.
- **PancakeSwap** — `dex/ConcentratedLiquidityService.ts:35-54`, `swap/EvmSolverService.ts:40`; pins
  explained at `pnpm-workspace.yaml:78-83`.
- **viem pin** — `pnpm-workspace.yaml:38` (`2.29.2`, released 2025-05-10), wagmi `:39` (`2.16.9`);
  hard dependency of sdk, dapp-kit, wallet-sdk-core, wallet-sdk-react, types.
- **CJS** — `engines.node >=22.12.0` in every package; `apps/node-cjs` is the CJS smoke test and keeps
  working through `require(esm)` as long as the graph has no top-level await.
- **Remote config off** — `shared/config/ConfigService.ts:158-181` (`TODO(config-v2)`); sodax-backend
  already has `apps/api/src/api/v2/config/config-v2.controller.ts` (backend checkout 2026-09-09).
- **Backend pays full import cost** — 7 sodax-backend apps depend on `@sodax/sdk`; e.g.
  `apps/stateful-api/src/config/configuration.ts:14` imports only `ChainKeys` + a type.
- **Wallet interface mixes signer and RPC duties** — `ISolanaWalletProvider` must implement
  `waitForConfirmation`, `buildV0Txn`, `getAssociatedTokenAddress`
  (`packages/types/src/solana/solana.ts:127-139`); `IEvmWalletProvider.waitForTransactionReceipt`
  (`evm/evm.ts:59-63`). Newer optional `signAndSendTransaction?` members (`injective.ts:124-126`,
  `solana.ts:132`) show the interface drifting as API raw-tx flows were added.
- **Errors** — `Result<T, E = Error | unknown>` (`packages/types/src/common/common.ts:80`) is `unknown`
  at public boundaries; sdk services carry typed codes (`SwapService.ts` `swap()` docs) but API clients
  throw `SwapsApiError`.
- **Cancellation / tracing** — no `signal` in `SwapService`, `MoneyMarketService`, `BridgeService`
  (0 matches); `backendApi/api-utils.ts:193` uses an internal `AbortController` for timeouts only.
  No request / correlation id header anywhere in sdk, swaps-api, bridge-api (`rg` for
  `x-request-id|traceparent|correlation` finds none).
- **Lifecycle prior art** — decision `0003-progress-reporting-vocabulary` deliberately kept progress
  local to dapp-kit for v2 (YAGNI; "no prior art in sdk"). v3 is the point to revisit it with
  `useSwapLifecycle` (gh-302) as the model.
- **Add-a-chain cost** — Stacks: 67 non-test TS files across 9 packages mention it (sdk 19, types 13,
  wallet-sdk-react 20, wallet-sdk-core 6, libs 3, swaps-api 2, bridge-api 2, dapp-kit 1, skills 1).
  The original Stacks commit `cdbcc074` changed 49 files (+1,412). One EVM chain (Robinhood, #326,
  `3881758f0`) changed 20 files; the viem chain object is defined in sdk, wallet-sdk-core and
  wallet-sdk-react.

### `@sodax/dapp-kit`

- Barrel: `packages/dapp-kit/src/index.ts:5` `export * from '@sodax/sdk'`, which re-exports
  `@sodax/types` (`packages/sdk/src/index.ts:15`).
- Error models: `hooks/shared/unwrapResult.ts`, `useSafeMutation.ts` (`mutateAsyncSafe`), `useQuote`
  returns the raw `Result` as `data`.
- Query keys hand-written; drift: `hooks/mm/useEModes.ts:27` uses `'moneyMarket'` where the
  convention is `'mm'`; `hooks/mm/useMMAllowance.ts:37` keys on chain/token/action only while the
  query uses the whole payload (amount, user) — masked by `refetchInterval: 5000` + `gcTime: 0`.
- Wallet threading: the demo calls `useWalletProvider` 26× and passes `walletProvider` 144× (agent
  count, not re-counted).

### `@sodax/wallet-sdk-react`

- QueryClient shadowing — `providers/evm/EvmProvider.tsx:27-30` creates `new QueryClient()`,
  `:71-77` wraps **children** in `<QueryClientProvider>`; `SodaxWalletProvider.tsx:59` nests the app
  inside it. dapp-kit hooks use the ambient client (48 files call `useQueryClient`, none pass a client),
  so under `SodaxWalletProvider` they resolve to wagmi's private client. The demo's
  `createSodaxQueryClient()` + per-config cache reset (`apps/demo/src/providers.tsx:194-208`) therefore
  does not reach those hooks. Verified by reading; not executed.
- Static chain imports — `chainRegistry.ts:25-42` imports every XService and connector.
- wagmi v2 pin (`pnpm-workspace.yaml:39`, `2.16.9`) → `@wagmi/connectors@5.9.9` hard-depends on
  Coinbase, MetaMask (deprecated `@metamask/sdk@0.32.0`) and WalletConnect (→ `@reown/appkit`):
  ~416 MB installed whether or not the app uses them. `@wagmi/connectors` 8.x (wagmi v3) makes them
  optional peers (`npm view`, 2026-10-14).
- Singletons — `useXWalletStore.ts:53-54` (`devtools(persist(...))`, key `'xwagmi-store'` `:156`).
- Duplicate helper — `utils/index.ts:11-25` `isNativeToken(xToken)` hard-codes native addresses
  (misses NEAR's `'NEAR'`, case-sensitive) vs `packages/types/src/utils/utils.ts:195`
  `isNativeToken(chainId, token)` reading config. Same name, different behavior.

### `@sodax/wallet-sdk-core`

- Import-time effects: `wallet-providers/bitcoin/BTCWalletProvider.ts:19-20` (`bitcoin.initEccLib`,
  `ECPairFactory`).
- `noExternal: ['near-api-js', '@sodax/types']` — `tsup.config.ts:14`.

### API packages

- `http.ts` is 242 lines in both packages; 10 lines differ after normalising names.
- `bridge-api/src/rawTxSchemas.ts:5-9` says it is a copy of the swaps-api file, "nothing enforces that
  the two stay in step", and they already differ (BITCOIN branch). swaps-api's switch
  (`swaps-api/src/rawTxSchemas.ts:120-138`) has no exhaustiveness check; unknown chain types get
  `AnyRawTxSchema`.

### `@sodax/skills`

- 44 `SKILL.md`; ~0.6 MB of the content is v1 → v2 migration material.
- Hand-maintained `hooks-index.md` / `querykey-conventions.md` have already drifted (the eModes key).
- Snippet typechecking covers dapp-kit + wallet-sdk-react only (`check-ai-snippets.sh:22`, agent ref).

## 3. v2 bugs found on the way (not v3 ideas — user decides; do not post from an agent)

1. **wallet-sdk-react hides the app's QueryClient** (above). Impact: `createSodaxQueryClient`
   options (e.g. `onMutationError` → Sentry) and the demo's per-config cache reset do not apply under
   `SodaxWalletProvider` when EVM is configured.
2. **`useBitcoinBalance` returns `0n` on an HTTP error** (`dapp-kit/src/hooks/bitcoin/useBitcoinBalance.ts`,
   `if (!response.ok) return 0n`) and its key omits the RPC URL — a mempool.space outage shows a zero
   balance instead of an error.
3. **`useMMAllowance` key omits amount / user** — up to 5 s of a stale "allowance OK" after the amount
   changes.
4. **swaps-api raw-tx schema** has no BITCOIN branch; Bitcoin raw txs validate against the permissive
   fallback (may be intended — swaps on BTC go through another path; not checked).

## 4. Open questions to raise with the team

- Chain usage share (which chains justify being in core vs plugin)? Needs analytics, not code.
- Partner integration mix: SDK vs Swaps API vs whitelabel? Decides how far "API mode" goes.
- Any partner on Node < 22.12 or a CJS-only toolchain that `require(esm)` would break?
- Keep `Sodax` class as a compat facade in v3, or hard break with codemods?
