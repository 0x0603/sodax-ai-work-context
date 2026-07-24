---
type: plan
repo: sodax-sdks
github: 310
updated: 2026-07-24
---

# Plan

## Goal

Lift a chain-agnostic user-wallet balance reader into the core `@sodax/sdk`, expose it through a
dapp-kit hook, and migrate the demo off the wallet-SDK balance path.

## Decisions (locked with user before implementation)

1. **Full parity — all chain families** the current `xService` supports (EVM, Sonic/hub, Solana, Sui,
   Stellar, ICON, Injective, Bitcoin, Near, Stacks) in this PR.
2. **New SDK-backed dapp-kit hook** (`useBalances`). Keep `useXBalances` (wallet-backed) intact for
   wallet-layer consumers. Additive, non-breaking.
3. **Do not touch `wallet-sdk-react`.** Title scope is `feat(sdk,dapp-kit,demo)`. `XService.getBalances`
   stays; the demo just stops using it. Follow-up (out of scope): let `XService` delegate to the SDK
   reader to remove the temporary duplication.

## Approach

Three layers:

- **core SDK**: `SpokeService.getWalletBalance` / `getWalletBalances` (chain-agnostic router that mirrors
  `getDeposit`) + per-chain `*SpokeService.getWalletBalance/getWalletBalances`. Read the USER's
  `srcAddress` (not the asset manager); port the read logic from `wallet-sdk-react` `xchains/*`, but reuse
  each spoke service's existing read client (the same one `getDeposit` uses). No wallet/signer needed.
- **dapp-kit**: `useBalances` hook → `useSodaxContext()` → `sodax.spoke.getWalletBalances(...)` + `unwrapResult`.
- **demo**: 9 call-sites drop `useXService` + `useXBalances` → `useBalances`.

Key nuance: `getDeposit` reads the asset-manager/vault holder — do NOT copy its holder arg; substitute the
user's `srcAddress`. Native vs token branch via `isNativeToken(srcChainKey, token)` (two-arg, `@sodax/types`).

## Steps

1. `packages/sdk/src/shared/types/spoke-types.ts`: add `GetBalanceParams` / `GetBalancesParams`
   (`{ srcChainKey, srcAddress, token: XToken }` / `tokens: readonly XToken[]`).
2. `SpokeService.ts`: add `getWalletBalance` / `getWalletBalances` router (copy `getDeposit`'s
   `isHubChainKeyType` → `getChainType` switch), wrap in `Result`.
3. Per-chain services: implement `getWalletBalance` / `getWalletBalances` (see the per-chain table in
   process.md for source + client + quirks).
4. dapp-kit: `src/hooks/shared/useBalances.ts` (+ export in `shared/index.ts`); split a pure
   `getBalancesQueryOptions(sodax, inputs)` builder for testability. queryKey
   `['shared','balances',chainKey,tokens.map([symbol,address]),address]`, `refetchInterval: 5000`.
5. demo: migrate the 9 call-sites; keep `address` from `useXAccount`; change invalidation key
   `['shared','xBalances']` → `['shared','balances']`.
6. Tests (SDK router + EVM/Bitcoin, dapp-kit hook) + skills docs.

## Verification

- `packages/sdk`: `pnpm checkTs && pnpm test && pnpm build`.
- `packages/dapp-kit`: `pnpm checkTs && pnpm test && pnpm build`.
- `apps/demo`: `pnpm checkTs`.
- `pnpm build:packages`; `pnpm --filter @sodax/skills check:ai`.
- `biome lint` on changed files (repo gate; warnings-only rules are pre-existing).
- Manual QA: run demo, confirm balances render on swap / money-market / dex / leverage-yield for EVM +
  at least one non-EVM wallet.

## Risks

Porting ~10 chain families is the bulk of the work and duplicates logic still living in `wallet-sdk-react`
(accepted per decision #3). Each non-EVM family has idiosyncratic balance semantics — verify each against
its `xchains/*` source; do not generalize one family onto another.
