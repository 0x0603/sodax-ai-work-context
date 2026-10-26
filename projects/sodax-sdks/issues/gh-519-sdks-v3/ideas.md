---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, idea-capture, lightweight, bundle-size, dx, ai, architecture]
related_decisions: [sodax-sdks/0003-progress-reporting-vocabulary]
related_issues: [gh-302, gh-456]
---

# GH-519 · v3 ideas — 0x0603 input

> **Draft for the user to post on #519.** The issue is R0bi7's: agents do not edit its body or
> comment on it. Numbers: `measurements.md`. Competitor precedent: `competitors.md`. Source refs are
> `origin/main` `77281f0c` (2026-10-13) unless marked otherwise.

## 1. Paste-ready input

One table, sorted by importance score (the user asked for a ranking over per-package grouping). Aligned
with `plan-v3-scope.md` on 2026-10-16, then corrected the same day against the per-item research
(`plan-v3-order.md`): every row maps to a scoped item, and the ideas the scope
dropped are gone (reasons in its § Dropped). Lifecycle and batching rows reflect the user's own 2.x
issues (#505, #507, #529, #531, #532).

```markdown
0x0603: lightweight first. Measured on published 2.2.0; the v3 column is a measured what-if for an EVM-only app.

| | Today | v3 |
| --- | --- | --- |
| Minimal swap dapp (gzip) | 3.0 MB | ~0.2 MB (0.6 MB with WalletConnect) |
| `npm i @sodax/sdk` | 777 MB · 35 advisories | ~85 MB · 0 |
| dapp-kit + wallet-sdk-react install | 1.8 GB · 81 advisories | 108 MB · 0 |
| Node import + `new Sodax()` | 0.9 s | 0.1 s |

Sorted by **Score** = importance out of 10: measured weight impact first, then correctness / security, then DX. Breaking items score a bit higher because 3.0 is their window.
When: **Now** = non-breaking, ship in 2.x · **Must** = 3.0 lightweight core · **Should** = recommended for 3.0 · **Later** = 3.x

| # | Score | Package | What | When |
| --: | --: | --- | --- | --- |
| 1 | 10 | `@sodax/sdk` | 0x0603: Chain plugins: core = hub + EVM; each non-EVM chain is an opt-in `@sodax/chain-<name>`; `@sodax/chains-all` for all-chain apps | Must |
| 2 | 9 | `@sodax/sdk` | 0x0603: Unbundled ESM built with `tsc`, no import-time side effects (`initEccLib`) → one helper import 832 → 37 KB | Now |
| 3 | 9 | `@sodax/wallet-sdk-react` | 0x0603: Chain adapters `adapters={[evm(), solana()]}`; no global singletons | Must |
| 4 | 8 | `@sodax/sdk` | 0x0603: ESM-only; viem / wagmi / react-query as peers with ranges | Must |
| 5 | 8 | `@sodax/sdk` | 0x0603: Vendor the ~1K LOC of PancakeSwap CL math and drop its SDKs (131 MB, 20 advisories); the `Price` / `Token` type swap waits for 3.0 | Now |
| 6 | 8 | `@sodax/wallet-sdk-core` | 0x0603: Chain wallet providers move into the chain plugins; private-key / mnemonic signers in a server-only entry | Must |
| 7 | 8 | `@sodax/wallet-sdk-react` | 0x0603: wagmi v3: wallet SDKs become optional peers (576 → 102 MB) | Must |
| 8 | 7 | `@sodax/sdk` | 0x0603: Lighter chain libs: ICON reads via a small JSON-RPC client, Stellar `/minimal`, Solana instructions without Anchor (the dependency itself goes in 3.0) | Now |
| 9 | 7 | `@sodax/wallet-sdk-react` | 0x0603: Reuse the app's QueryClient (today `EvmProvider` wraps its own) | Now |
| 10 | 7 | Cross-cutting | 0x0603: Stop inlining `@sodax/types` (5 token-list copies in one swap dapp) | Now |
| 11 | 7 | Cross-cutting | 0x0603: CI gates: bundle size, install size, consumer `npm audit`, attw | Now |
| 12 | 7 | `@sodax/sdk` | 0x0603: Per-feature entries (`@sodax/sdk/swap`, …) next to the `Sodax` facade, which stays | Must |
| 13 | 7 | `@sodax/dapp-kit` | 0x0603: Per-feature subpaths; sdk as a peer; no `export *` | Must |
| 14 | 7 | Cross-cutting | 0x0603: Split `@sodax/types` into light entries (chain keys / configs / token lists) | Now |
| 15 | 6 | `@sodax/sdk` | 0x0603: Polyfill-free core (no `Buffer`) | Must |
| 16 | 6 | `@sodax/skills` | 0x0603: Update the content to v3 (the `check:ai` suite gates it) | Must |
| 17 | 6 | Cross-cutting | 0x0603: Migration: codemods, docs, demo apps | Must |
| 18 | 6 | `@sodax/sdk` | 0x0603: Lifecycle / progress / resume for every flow (swaps-api, bridge, leverage-yield already in progress in 2.x) | Should |
| 19 | 6 | `@sodax/sdk` | 0x0603: One error shape for API failures (transport code, retryable); `AbortSignal` + correlation id on API calls and polling | Should |
| 20 | 5 | `@sodax/sdk` | 0x0603: Remote config by default (token / chain lists out of the bundle) — needs a product call | Should |
| 21 | 5 | `@sodax/dapp-kit` | 0x0603: `queryOptions` builders + query-key factory for every query (8 of 126 today) | Should |
| 22 | 5 | `@sodax/dapp-kit` | 0x0603: Wallet from context instead of a `walletProvider` argument; one error style instead of three | Should |
| 23 | 5 | `@sodax/wallet-sdk-core` | 0x0603: Signer-only interface (RPC reads move into the plugins); dedupe chain defs and ICON shims with the sdk | Should |
| 24 | 5 | API packages | 0x0603: "API mode" docs: server builds the tx, client only signs | Should |
| 25 | 4 | API packages | 0x0603: BITCOIN branch in the swaps-api raw-tx schema | Now |
| 26 | 4 | `@sodax/dapp-kit` | 0x0603: Consistent names (`chainKey` / `address`, `useSwapQuote`); `'use client'` entries; `SodaxProvider` accepts an instance | Should |
| 27 | 4 | `@sodax/skills` | 0x0603: Generate the hook index and query-key table; pin docs and AI channels to the release branch | Should |
| 28 | 4 | API packages | 0x0603: One `@sodax/api` (swaps + bridge + the sdk's backend client); old packages as re-export shims | Should |
| 29 | 4 | Cross-cutting | 0x0603: Runtime matrix in CI (Node, Bun, Deno, Workers, React Native, Vite / Next) | Should |
| 30 | 3 | `@sodax/wallet-sdk-react` | 0x0603: Typed per-chain account hooks; drop the `X` / `xChainId` naming | Should |
| 31 | 3 | `@sodax/sdk` | 0x0603: EIP-5792 batching for the remaining features; `testing` entry (fake wallets, API mocks); Solana plugin on `@solana/kit` | Later |
| 32 | 3 | `@sodax/wallet-sdk-core` | 0x0603: Adapters over standards (EIP-1193, Wallet Standard) | Later |
| 33 | 3 | `@sodax/skills` | 0x0603: MCP-ready tool schemas from valibot for the existing SODAX MCP servers (no third server) | Later |
| 34 | 3 | API packages | 0x0603: OpenAPI drift gate against our valibot schemas | Later |
| 35 | 2 | `@sodax/dapp-kit` | 0x0603: `transport` option on quote / swap / status / allowance / approve; polling presets | Later |
| 36 | 2 | `@sodax/wallet-sdk-react` | 0x0603: Embedded / social wallets as adapters | Later |
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
- `plan-v3-scope.md` keeps the `Sodax` facade (most of v3 becomes additive). Does the team agree, or
  prefer a hard break with codemods?
