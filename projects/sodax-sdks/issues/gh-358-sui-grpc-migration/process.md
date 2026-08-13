---
type: process
repo: sodax-sdks
github: 358
updated: 2026-08-13
---

# Process

## Log

- **2026-08-10** — Branch `feat/sui-grpc-transport` off `origin/main` (`1809f6278`). Note the local
  workspace default branch was `feat/ai-drift-check`, which predates the #360 stopgap; branching from
  it would have silently reintroduced the dead `fullnode.mainnet.sui.io:443` default.
- Scope moved three times as evidence came in: SDK-only → SDK + wallet-sdk-core → whole stack incl.
  replacing dapp-kit. Each move was forced by a fact, not a preference — see Findings.
- Steps 1–2 done (catalog bump, `@sodax/types`). Step 3 (SDK transport port) in progress.

## Findings

Everything below was measured, not inferred. Probe scripts were throwaway (session scratchpad).

### Endpoints

| Host | Auth | CORS | Result |
| --- | --- | --- | --- |
| `https://fullnode.mainnet.sui.io` gRPC-web | none | `*` | HTTP 200, `x-sui-chain: mainnet` |
| `https://fullnode.testnet.sui.io` gRPC-web | none | `*` | HTTP 200, `x-sui-chain: testnet` |
| `https://fullnode.mainnet.sui.io` JSON-RPC | — | — | `-32601 Method not found` |
| `https://sui-rpc.publicnode.com` JSON-RPC | — | — | works (the #360 stopgap, until Oct 2026) |

60 concurrent `core.getReferenceGasPrice()` calls → 60/60 in 242 ms, no rate-limit headers.

### gRPC vs JSON-RPC through `client.core` — identical

Probed both clients side by side against mainnet:

- `core.getObject({include:{json:true}})` → `latest_package_id` **byte-identical**
  (`af63819d…`, unprefixed on both). No `0x`-prefix normalisation needed.
- `core.simulateTransaction` → same `status`, same `gasUsed` keys, same `commandResults` →
  `bcs.U64.parse` decoded the same value.
- `core.listCoins` → same coin field set. **Neither** transport returns `previousTransaction`, so
  making it optional in `SuiCoinStruct` is honest rather than a gRPC-specific concession.

Two behavioural differences that compile fine and fail at runtime:

- `simulateTransaction` requires the sender **on the `Transaction` object**; gRPC tolerates it
  missing, JSON-RPC throws `Missing transaction sender`. `devInspectTransactionBlock` took it as a
  separate parameter, so both call sites need `setSenderIfNotSet`.
- `checksEnabled` defaults to `true` = dry-run semantics. `get_token_balance` happened to pass under
  the default, but devInspect parity for non-entry Move functions needs `checksEnabled: false`.

### Shape deltas worth remembering

- `GasCostSummary` matches `SuiGasEstimate` field-for-field — `estimateGas` needs no mapping at all.
- `listCoins`'s `Coin.type` is the full `0x2::coin::Coin<T>` tag, **not** `T`. Echo the requested
  `coinType` instead of parsing it.
- `CommandResult.returnValues` carries `{ bcs }` only — no Move type tag, on **either** transport.
  So `SuiExecutionResult.returnValues[i][1]` is `''` by contract, not by omission.
- `waitForTransaction` takes `pollSchedule` (absolute ms offsets, last interval repeats) instead of
  `pollInterval`, so `[0, pollingIntervalMs]` reproduces the old behaviour exactly.
- Timeouts reject with `AbortSignal.timeout`'s `DOMException`, name `TimeoutError`. The **message**
  differs per runtime — Node "The operation was aborted due to timeout", browsers "signal timed out"
  — so the existing `error.message.includes('timeout')` check silently misclassifies browser
  timeouts as `'failure'`. Pre-existing bug, fixed along the way.

### Cross-version safety (checked before scope grew)

2.x `Transaction.serialize()` → 1.x `Transaction.from()` round-trips both directions (both emit
serialized `version: 2`). Cross-copy `instanceof` is false, but `toMystenTransaction` already falls
back to `Transaction.from(await txn.toJSON())`. This is what would have made a partial (SDK-only)
scope safe; kept here because it also explains why the SDK↔wallet boundary is a JSON string.

### Build / packaging

- `@mysten/sui@2.23.2` is ESM-only (`exports` has no `require` condition) and declares
  `engines: node >=22`.
- Bundling it (`noExternal`) costs ~302 KB min / **~80 KB gzip per output format** → ~160 KB tarball
  against a 750 KB baseline with 15 % tolerance (~112 KB headroom). Blows the gate.
- Keeping it external works: `require('@mysten/sui/grpc')` succeeded on Node 22.15 (`require(esm)`
  unflagged since 20.19 / 22.12). Hence `engines.node >= 22.12.0` instead of bundling.

### dapp-kit

- `@mysten/dapp-kit@1.1.13` (latest) still types `useSuiClient(): SuiJsonRpcClient`. Upgrading the
  legacy package does **not** get us off JSON-RPC. Both 0.14 and 1.1 *require* `SuiClientProvider`.
- In 0.14.18's bundle the only client method called anywhere is `executeTransactionBlock`, confined
  to `useSignAndExecuteTransaction`, `useUnsafeBurnerWallet` (gated, default off), `ConnectButton`,
  `AccountDropdownMenu`, `useResolveSuiNSNames` — none of which this repo imports. So dapp-kit never
  issued an RPC call on our paths; the JSON-RPC exposure came entirely from us pulling its client out
  via `useSuiClient()` and using it as our transport.
- `@mysten/dapp-kit-core` types its client `DAppKitCompatibleClient = ClientWithCoreApi`, i.e. it
  takes our gRPC client. Confirms the replacement is the real fix.
- Repo imports only 8 dapp-kit APIs and no CSS / `ConnectButton` / `useSuiClientQuery`, so three of
  the migration guide's breaking changes don't apply here.
- `signTransaction(wallet, input)` has an **identical signature** in `@mysten/wallet-standard`
  0.15.6 and 0.21.13 — the feared wallet-standard jump is low risk.

## Changes During Work

- **Plan said the `SuiTransport` port would live in `@sodax/sdk` and be reused by
  `wallet-sdk-core`.** Wrong: `wallet-sdk-core` depends only on `@sodax/types`. `packages/libs` is
  also not the home — its charter is deps needing non-trivial build workarounds, which `@mysten/sui`
  does not. Resolution: each package constructs its own client (matching today's structure, where
  `SuiSpokeService` and `SuiWalletProvider` each build their own), with the shared *wire translation*
  as pure functions in `@sodax/types/src/sui/core.ts`.
- **Plan promised every commit green on its own.** Not achievable for the dependency commit:
  `@mysten/sui` 2.x removes `SuiClient` from `@mysten/sui/client`, so the catalog bump breaks
  `wallet-sdk-core` / `wallet-sdk-react` compilation until their migrations land. The dep bump and
  its consumers must share a commit, or intermediate commits are red.

## Review Feedback — File Layout (2026-08-13)

Maintainer on PR #367: *"Sui types can go into sui directory in types package and utils into
sui-utils.ts, no need for so many files"*, with `packages/sdk/src/shared/utils` named as the home for
`sui-utils.ts`, and *"try to follow established patterns"*. Target was the six-file
`packages/sdk/src/shared/services/spoke/sui/` folder.

Reworked to the repo's flat conventions (spoke services live directly under `spoke/`, per-chain
helpers as `shared/utils/<chain>-utils.ts`, chain types under `packages/types/src/<chain>/`):

- `SuiTransport` + `SuiWaitForTransactionParams` → `packages/types/src/sui/transport.ts`.
- `isTimeoutError` (+ the new `toMystenTransaction` bridge) → `packages/sdk/src/shared/utils/sui-utils.ts`.
- `SuiGrpcTransport` → `packages/sdk/src/shared/services/spoke/SuiGrpcTransport.ts`, re-exported
  from the spoke barrel — which also closes the review-bot finding that `SuiTransport` was
  unreachable from the package's public export chain.

Two constraints found while doing it:

- **`@sodax/types` is zero-dependency**, so the port cannot name `@mysten/sui`'s `Transaction`.
  `simulate`/`estimateGas` now take the narrow `SuiTransaction` (`{ toJSON() }`) that
  `ISuiWalletProvider` already uses, and `SuiGrpcTransport` rebuilds a real `Transaction` via
  `toMystenTransaction` — the same bridge `SuiWalletProvider` has had all along.
- **The type could not go in `sui/sui.ts`**: it needs `SuiGasEstimate` from `common/common.ts`,
  which already imports `sui/sui.ts` — madge (`check:circular-deps`) rejects the cycle even for
  type-only imports. Hence the separate `sui/transport.ts`, which `common` does not import.

Gates re-run after the move: lint, circular-deps, knip, build:packages, checkTs, check-exports,
check:ai, check:ai-dev-files, check:doc-links, tests (18/18 tasks, sdk 68 files / 2141 tests),
size (789.4 KB, unchanged). Not committed — left in the worktree for review.

### Closing the round-trip doubt (2026-08-13)

The narrow-`SuiTransaction` port means `SuiGrpcTransport` may rebuild the transaction via
`Transaction.from(await tx.toJSON())`. Two things were unproven, so both were checked:

- **Offline.** Round-tripping a deposit-shaped PTB (`mergeCoins` + `splitCoins(tx.gas)` + object and
  pure args + `moveCall` with a type argument) keeps the JSON byte-identical and `inputs` deeply
  equal. One real difference: `Argument` carries an in-memory `type: 'object' | 'pure'` hint that
  the JSON plan does not encode, so it is absent after a rebuild. The inputs it points at are
  self-describing, which is why nothing downstream needs it — but a naive `getData()` comparison
  fails on it. Covered in `sui-utils.test.ts` with the hint stripped explicitly.
- **Live mainnet, via a real `Sodax`.** Same call through both paths returned identical output:
  `simulate` (`get_token_balance`) → `{"returnValues":[[[22,201,237,247,182,16,1,0],""]]}` both
  ways; `estimateGas` on a real raw swap-intent PTB → `computationCost 246000 / storageCost 9355600
  / storageRebate 8283924 / nonRefundableStorageFee 83676` both ways. Also re-verified
  `fetchAssetManagerAddress`, `getCoins` and `getDeposit` (`depositBnUSD = 299853006358806`, vs
  `299852799681048` on 2026-08-10 — a live balance, so it moves).

Residual, documented rather than removed: the fast path (`instanceof Transaction`) mutates the
caller's transaction when setting the sender, the rebuild path mutates a copy. The JSDoc on
`SuiTransport.simulate` now says callers must not rely on their instance coming back mutated. A
consumer with a second `@mysten/sui` copy in `node_modules` takes the rebuild path — same results
per the parity run, just no visible mutation.

**Not closed by this session:** whether the maintainer wants the API change at all (the feedback
asked for a file move; widening `simulate`/`estimateGas` to `SuiTransaction` is what made the port
fit a zero-dependency `@sodax/types`), and the manual browser-extension pass in `apps/demo`, which
remains the merge gate.
