---
type: decision
scope: sodax-sdks
status: Accepted
tags: [sui, grpc, json-rpc, dapp-kit, transport, breaking-change]
date: 2026-08-10
related_issues: [358]
---

# 0002 — Sui: move the whole stack to gRPC, own the client, drop dapp-kit

> Status and scope live in the frontmatter above (single source of truth).

## Context

GH-358: Sui disabled JSON-RPC on public fullnodes on 2026-07-27. PR #360 shipped a stopgap that
repointed the packaged default at `https://sui-rpc.publicnode.com`.

The stopgap has a hard expiry. Sui's published schedule removes JSON-RPC **from `sui-node` itself in
mid-October 2026**. publicnode works today only because they run `sui-node` with JSON-RPC enabled;
when the code is deleted, no operator can keep it alive. So "point at a different provider" is not a
solution class, it is a countdown.

Four facts, each verified rather than assumed, shaped the decision:

1. **gRPC-web is live, free, public, keyless, CORS-open on Sui Foundation's own fullnodes.**
   `POST https://fullnode.mainnet.sui.io/sui.rpc.v2.LedgerService/GetServiceInfo` → HTTP 200,
   `access-control-allow-origin: *`; testnet the same. These are the *same hosts* that used to serve
   JSON-RPC, so gRPC is a return to first-party infrastructure, not a new dependency.

   **It is rate-limited per IP, which Sui does not document.** Measured: 150 concurrent calls all
   succeed, 200 → only 50 succeed, 250+ → all fail with `RESOURCE_EXHAUSTED`; sustained 30 req/s
   over 10 s lands at 77% success, so the sustained ceiling is ~20-25 req/s. Recovery is immediate,
   so it throttles rather than bans. An earlier 60-call burst found nothing and was mistaken for
   "no limit" — the ceiling only shows above ~150. A browser session is far below it, so it stays
   the packaged default, but any server-side caller shares one egress IP and must override
   `grpc_url`.

2. **`client.core` is already a transport-neutral port, and it is exact.** `SuiGrpcClient` and
   `SuiJsonRpcClient` both extend `BaseClient` and expose the same `core: CoreClient`. Probed live
   against mainnet through both: `getObject{json}`, `simulateTransaction` (`commandResults`,
   `gasUsed`, `status`) and `listCoins` returned identical results. So there is no need for two
   hand-written adapters — Mysten already owns the abstraction.

3. **Upgrading `@mysten/dapp-kit` does not help.** Even `@mysten/dapp-kit@1.1.13` (latest) types
   `useSuiClient(): SuiJsonRpcClient` and `SuiClientProviderContext.client: SuiJsonRpcClient`, and
   *requires* `SuiClientProvider` (`useSuiClientContext()` throws without it). The package is
   JSON-RPC-only and will not be updated. Its replacements, `@mysten/dapp-kit-core` /
   `@mysten/dapp-kit-react`, type their client as `DAppKitCompatibleClient = ClientWithCoreApi` —
   i.e. they accept our gRPC client via `createClient`.

4. **`@mysten/sui` 2.x is ESM-only and declares `engines: node >=22`.** Measured: bundling it into
   the SDK's CJS output adds ~80 KB gzip per format (~160 KB tarball), which blows the 750 KB + 15%
   size gate.

## Decision

1. **Whole Sui stack, one PR.** Catalog moves `@mysten/sui` → 2.23.2, `@mysten/wallet-standard` →
   0.21.13, and replaces `@mysten/dapp-kit` with `@mysten/dapp-kit-react`. Partial scopes were
   rejected: SDK-only leaves the sign/submit path on a two-month fuse, and stopping at dapp-kit
   1.1.13 keeps a JSON-RPC client in the tree for nothing.

2. **Sodax owns the gRPC client; the wallet kit consumes it, never supplies it.** The load-bearing
   change is deleting `useSuiClient()` from `SuiHydrator` — today dapp-kit's client *is* our RPC
   transport, which is why the wallet layer inherits dapp-kit's transport choices. After this,
   `createDAppKit({ createClient })` is handed our client instead.

3. **No escape hatch.** No `transport: 'grpc' | 'jsonRpc'` flag and no `rpc_url` fallback. A flag
   whose expiry date is already known is debt with a scheduled removal — i.e. a second breaking
   change — not safety. `rpc_url` is *renamed* to `grpc_url` rather than repurposed, because a field
   named `rpc_url` holding a gRPC endpoint is the kind of lie that costs someone an hour.

4. **Shared wire translation lives in `@sodax/types/src/sui/core.ts`.** `wallet-sdk-core` may not
   import from `@sodax/sdk` (dependency direction), and `packages/libs` is reserved for deps needing
   build workarounds, which `@mysten/sui` does not. Pure functions over structurally-mirrored inputs
   keep `@sodax/types` dependency-free and stop the two consumers drifting on translation.

5. **Keep `@mysten/sui` external; raise `engines.node` to `>=22.12.0`** rather than bundling it.
   The floor is the intersection of two constraints: `@mysten/sui` declares `>=22`, and `require()`
   of an ES module is only unflagged from **v22.12.0** in that line (v20.19.0 in the 20 line), which
   the CJS builds need. The tarball stays flat.

6. **One floor across the whole workspace, not just the forced packages.** Only `sdk`,
   `wallet-sdk-core`, `wallet-sdk-react` (direct `@mysten/sui`) and `dapp-kit` (via `@sodax/sdk`)
   are actually forced. `types`, `libs`, `swaps-api`, `skills` and `assets` would still run on Node
   20. They were raised anyway because **Node 20's security support ended 2026-04-30** — declaring
   `>=20.12.0` advertises an unpatched runtime as supported. Secondary benefit: one number instead
   of the three that had accumulated (`>=20.12.0`, `>=20.0.0`, `>=22.12.0`), which can no longer
   drift apart. Weakest part of this: `assets` (static images) and `skills` (markdown) have no
   runtime at all, so the field is meaningless there either way.

## Consequences

- `major` for the changesets `fixed` group (all 8 packages). Breaking public API in three packages:
  `SuiSpokeService.publicClient` (deprecated alias to `transport` for one release),
  `SuiSpokeChainConfig.grpc_url`, and the `SuiWalletProvider` browser/PK configs.
- Node < 22.12 CJS consumers break.
- Three duplicate `@mysten/sui` copies (1.8.0 / 1.21.2 / 1.30.5) collapse into one, which deletes
  every `as unknown as` version-skew cast in `wallet-sdk-react`.
- Consumers importing `@mysten/dapp-kit` directly must migrate themselves; the old package breaks in
  October 2026 regardless.
- The React layer is the only part no automated test can cover. Manual browser test is a merge gate.
