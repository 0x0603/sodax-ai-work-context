---
type: plan
repo: sodax-sdks
github: 358
updated: 2026-08-10
---

# Plan

## Goal

Remove every JSON-RPC code path from `sodax-sdks` and put all Sui traffic on gRPC, on Sui
Foundation's own fullnodes. One PR, no follow-up ticket.

## Approach

One rule drives the design: **Sodax owns its gRPC client; the wallet kit consumes it, never
supplies it.** Today `wallet-sdk-react` pulls dapp-kit's `SuiClient` out of `useSuiClient()` and
hands it to `wallet-sdk-core` as the RPC transport — that is the coupling that makes the wallet
layer hostage to whatever transport dapp-kit ships.

```
                        SuiGrpcClient  (@mysten/sui/grpc)
                               │
     ┌─────────────────────────┼──────────────────────────┐
@sodax/sdk              @sodax/wallet-sdk-core     @mysten/dapp-kit-core
SuiSpokeService         SuiWalletProvider          (accepts ClientWithCoreApi
  (reads)                 (sign + submit)           via createClient)
```

Shared wire translation lives in `@sodax/types/src/sui/core.ts` (pure functions over
structurally-mirrored inputs) because `wallet-sdk-core` may not import from `@sodax/sdk`, and
`packages/libs` is reserved for deps needing build workarounds — `@mysten/sui` needs none.

## Steps

1. `pnpm-workspace.yaml`: `@mysten/sui` 1.21.2 → 2.23.2, `@mysten/wallet-standard` 0.15.6 → 0.21.13,
   drop `@mysten/dapp-kit`, add `@mysten/dapp-kit-react` 2.1.15. `engines.node` → `>=22.12.0`.
2. `@sodax/types`: `SuiSpokeChainConfig.rpc_url` → `grpc_url`; `SuiCoinStruct.previousTransaction`
   optional; shared `core.ts` mappers.
3. `@sodax/sdk`: new `shared/services/spoke/sui/` transport port + gRPC impl + `isTimeoutError`.
4. Route `SuiSpokeService` through the port; `publicClient` → `transport` (deprecated alias kept).
5. `@sodax/wallet-sdk-core`: own gRPC client; browser mode takes a `signTransaction` callback
   instead of `{ client, wallet, account }`.
6. `@sodax/wallet-sdk-react`: `createDAppKit` + `DAppKitProvider`; rewrite SuiProvider / SuiHydrator /
   SuiActions / SuiXService / SuiXConnector; fix `assertSuiProviderShape`; delete the version-skew casts.
7. Apps, docs, skills, changeset (`major`).

## Verification

- CI order: `lint` → `check:circular-deps` → `check:knip` → `build:packages` → `check-exports` →
  `size:check` → `checkTs` → `check:ai` → `check:doc-links` → `test` → demo + next16 builds.
- `pnpm why @mysten/sui` must show exactly one version.
- Live mainnet smoke: `fetchAssetManagerAddress`, `getCoins`, `getDeposit`, `estimateGas` through a
  real `Sodax`, diffed against the same script on `origin/main`. Identical values = acceptance.
- Manual browser test with a real Sui wallet extension. Not automatable; the only check on the
  dapp-kit-core/react migration.

## Risks

- **React layer** — wallet types become `UiWallet`/`UiWalletAccount`, `chain: 'sui:mainnet'` becomes
  `network: 'mainnet'`, and nothing in CI drives a browser extension. Isolated to its own commit so
  it can be reverted without touching the RPC work.
- **`setSenderIfNotSet`** — `simulateTransaction` needs the sender on the `Transaction`;
  `devInspectTransactionBlock` took it as a parameter. Compiles fine, fails at runtime.
- **`checksEnabled`** — defaults to `true` (dry-run semantics). `viewContract`/`getDeposit` need
  `false` for devInspect parity.
- **`object.json` field names** — Mysten's JSDoc warns they may differ per transport. Verified
  identical today; `content: true` + BCS parse is the fallback.
- **Node < 22.12 CJS consumers** break (`@mysten/sui` 2.x is ESM-only and declares `node >=22`).
- `major` moves all 8 packages in the changesets `fixed` group; repo sits at `2.0.0-rc.17` with no
  `.changeset/pre.json` — version numbers are the release manager's call.
