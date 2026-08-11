---
type: outcome
repo: sodax-sdks
github: 358
status: Pushed, awaiting PR
updated: 2026-08-10
---

# Outcome

- PR: not opened yet — branch pushed
- Commits: `feat/sui-grpc-transport`, 8 commits off `origin/main` (`1809f6278`), 68 files
- Tests: all 12 gates green at the tip

## Summary

In progress. Migrating every Sui path in `sodax-sdks` from JSON-RPC to gRPC before Sui deletes
JSON-RPC from `sui-node` in mid-October 2026.

## What Changed

All eight steps done and pushed. Split into 8 commits by logical unit. **Only the tip is
green**: `@mysten/sui` 2.x removes `SuiClient` from `@mysten/sui/client`, so the dependency
commit cannot build until the consumer packages migrate. `git bisect` across this range will
not build — the commits are for review, not for bisecting.

    chore(deps)              move the Sui stack to @mysten/sui 2.x and dapp-kit-react
    feat(types)!             point the Sui chain config at a gRPC endpoint
    feat(sdk)!               run Sui reads over gRPC behind a transport port
    feat(wallet-sdk-core)!   run Sui signing and submission over gRPC
    feat(wallet-sdk-react)!  migrate the Sui provider to dapp-kit-react
    chore(apps)              point the sample apps at the Sui gRPC endpoint
    docs                     document the Sui gRPC transport and the new wallet config
    docs(changeset)          sui grpc transport

- **Dependencies** — catalog `@mysten/sui` 1.21.2 → 2.23.2, `@mysten/wallet-standard` 0.15.6 →
  0.21.13, `@mysten/dapp-kit` replaced by `@mysten/dapp-kit-react` 2.1.15. Lockfile now resolves
  exactly one version of each, down from three `@mysten/sui` copies and two wallet-standard copies.
  `engines.node` → `>=22.12.0` in sdk / wallet-sdk-core / wallet-sdk-react.
- **`@sodax/types`** — `SuiSpokeChainConfig.rpc_url` → `grpc_url`;
  `SuiCoinStruct.previousTransaction` optional; new `src/sui/core.ts` holding the shared
  `client.core` → `@sodax/types` mappers (both consumer packages use them; `wallet-sdk-core` may not
  import from `@sodax/sdk`, and `packages/libs` is only for deps needing build workarounds).
- **`@sodax/sdk`** — new `shared/services/spoke/sui/` with `SuiTransport` (port), `SuiGrpcTransport`
  (translation + the six object guards) and `isTimeoutError`. `SuiSpokeService.publicClient` is now
  a deprecated alias of `transport`.
- **`@sodax/wallet-sdk-core`** — `SuiWalletProvider` owns a `SuiGrpcClient`; browser mode takes
  `{ grpcUrl, address, signTransaction }` instead of `{ client, wallet, account }`. Dropped the
  `@mysten/wallet-standard` dependency and the JSON-RPC-only `response` policy.
- **`@sodax/wallet-sdk-react`** — `createDAppKit` + `DAppKitProvider`; `useSuiClient()` deleted;
  every `as unknown as` version-skew cast gone.

### Verification

- Gates green: lint, circular-deps, knip, build:packages, attw, size (789.4 KB vs 862.5 KB ceiling),
  checkTs, check:ai-dev-files, check:ai, check:doc-links, test (18/18 tasks), demo + Next 16 builds.
- `apps/node-cjs` proves `require('@mysten/sui/grpc')` resolves under CommonJS — the gate that
  justified keeping the ESM-only dep external instead of bundling it.
- **Live mainnet smoke through the real `Sodax` object**: `fetchAssetManagerAddress`, `getCoins`,
  `getDeposit`, `estimateGas` all returned real values, and `waitForTransactionReceipt` classified an
  unknown digest as `timeout`.
- **Acceptance met**: replaying the same three reads through `SuiJsonRpcClient` on publicnode
  returned byte-identical output — same asset-manager address, same six coins, same
  `depositBnUSD = 299852799681048`.

### Backward compatibility

Field renames keep deprecated aliases that win when set, so existing overrides keep working:
`SuiSpokeChainConfig.rpc_url`, `SuiChainEntry.rpcUrl`, `PrivateKeySuiWalletConfig.rpcUrl`. This is
safe because a `sui-node` serves gRPC-web on the same origin it served JSON-RPC on — self-hosted and
full-service endpoints need no change; only a JSON-RPC-only provider must be repointed. Covered by
tests in all three packages.

Two things have no alias and are hard breaks: `BrowserExtensionSuiWalletConfig` (the old shape took a
`SuiClient` type that no longer exists) and `SuiSignAndExecutePolicy.response`.

### Caught during self-review

`UiWallet` carries no `id` (only `chains | icon | name | version`), so `SuiXConnector`'s inherited
`wallet.id ?? wallet.name` always collapsed to `name`, while `SuiHydrator`/`SuiActions` used
`getWalletUniqueIdentifier` (= underlying `id ?? name`). Any wallet exposing an `id` would have
diverged and broken connect-by-id. Fixed by deriving the identifier in one place.

## Follow-ups

- **Manual browser test is still outstanding** and is a merge gate: connect / disconnect / reconnect
  on reload / sign a personal message / one deposit, with a real Sui wallet extension in `apps/demo`.
  Nothing in CI drives an extension.
- `apps/node/src/sui.ts` still imports the long-deleted `SuiSpokeProvider`; the file is excluded from
  build/lint/test so it does not fail CI. Pre-existing, untouched here.
- Sibling repos under GH-358 are out of scope: `sodax-frontend` and `intents-whitelabel` carry their
  own Sui RPC defaults and need their own sub-issues. `sodax-backend` inherits the SDK default and is
  fixed by this PR.
- Consumers importing `@mysten/dapp-kit` directly must migrate to `@mysten/dapp-kit-core`/`-react`
  themselves — flagged in the changeset.
