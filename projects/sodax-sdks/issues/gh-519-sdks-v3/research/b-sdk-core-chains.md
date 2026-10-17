---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, research, chain-plugins, registry, settlement, mpc-relay, pancakeswap, icon, stellar, anchor, remote-config]
source_commit: cc053fef
---

# GH-519 · Cluster B — sdk core and chains

> **Written by a research agent on 2026-10-16**, against the read-only `origin/main` tree at
> cc053fef. The lead re-checked its load-bearing `path:line` claims (`plan-v3-order.md` §9). Where
> this report and `plan-v3-order.md` / `plan-v3-subissues.md` differ, those files win.
>
> **Reconciled after synthesis**
>
> - **Chain packages export `.`, `./wallet` and `./server`, with no `./react`.** React adapters stay in `@sodax/wallet-sdk-react/xchains/<chain>` (cluster C §C1). Where this report says `./react` (T1.17, T1.18–25), read it as `./server`.
> - **T1.18–25 is paired per chain with C's T6.5.** One PR and one dev per chain.
> - **T1.18–25 depends on that chain's 2.x move (T1.7–T1.14).**
> - **Aleo's WASM is 55 MB unpacked** (`@provablehq/wasm@0.12.1`), not 43 MB.
> - **`spoke.bitcoin` has 21 matches at cc053fef.**
> - **T18.1** (cluster D) covers MPC-relay chains after #534.

- Source of truth: extracted `origin/main` at `cc053fef` (2026-10-15). Every `path:line` below is relative
  to that tree unless prefixed with another repo (`sodax-frontend@6623d817`, `sodax-backend@985959e9`
  (`development`), `intents-whitelabel@5e1fbba`) or a PR number.
- In-flight PRs read with `gh pr view` / `gh pr diff` on 2026-10-16.
- Probes ran in `scratchpad/agent-B/` (list at the end). Nothing was changed in any clone and nothing was posted.

## Key decisions (one screen)

1. **Plugin option is `plugins`, not `chains`.** `SodaxDefaultConfig.chains` already means per-chain
   config (`packages/types/src/sodax-config/sodax-config.ts:153`), and sodax-backend passes
   `new Sodax({ chains })` that way (`sodax-backend: packages/shared-dtos/src/configs/sdk-service-config.dto.ts:87`).
2. **Core = hub (Sonic) + EVM, built in.** Non-EVM chains are `ChainPlugin`s. The new `createSodaxCore()`
   registers **no** non-EVM plugin from day one, because it is a new API. `new Sodax()` registers every
   built-in in 2.x and flips to EVM-only in 3.0.
3. **Dispatch by chain key, then chain type.** Monad (#498) is chain type `EVM` but has its own spoke,
   so a key-level plugin must win over the type-level one.
4. **The contract models settlement**, which in-flight work already needs: intent relay (optionally
   split-tx) or MPC relay (memo / address). It also models a codec with `encodeRecipient` (#534) and
   capability hooks for every chain-specific branch still left in core.
5. **2.x keeps chain code inside `@sodax/sdk`** (`src/chains/<name>/`, behind a lint boundary).
   Separate packages that the sdk registers by default would form a package cycle, and turbo refuses
   that (probe B-2). 3.0 extracts each chain into `@sodax/chain-<name>` with the sdk as a peer, and the
   sdk drops default registration.
6. **Merge #534 (Tron + `SpokeService.settle` + MPC relay client) before the registry.** XRP (#497),
   Monad (#498) and Aleo (#95) come in afterwards as plugin-native chains that are opt-in from day one.
7. **PancakeSwap**: in 2.x, vendor the math, codecs and encoders and drop `v3-sdk` + `infinity-sdk`.
   That removes all six nested viem copies. Swapping `Price`/`Token` is the only change consumers can
   see, so it goes in the contract window.
8. **T8 has 5 sub-issues**:
   - ICON reads over JSON-RPC. This also fixes a BigNumber-vs-`bigint` type mismatch.
   - Stellar `/minimal`. All 20 imported names are verified (probe B-1).
   - Anchor-free Solana instructions (internal, 2.x).
   - Dropping the dependencies is a 3.0 item, because the Anchor helpers are public exports.
9. **T20**: the v2 config endpoint is live, but today's version gate would reject it for every SDK newer
   than the backend's pinned SDK. Product also has to decide the trust boundary (remote contract
   addresses / API URLs).

---

## B1 · Plugin boundary

### What each chain imports today

Non-EVM chain libraries are imported by exactly **20 sdk files** at `cc053fef` (22 counting the two
`rlp`-only files, `SpokeService.ts` and `swap/selectSolvedIntentPacket.ts`, where `rlp` stays in core).

The table below lists every sdk-internal import of the chain modules (spoke service + chain
entities/utils). "Kit" means it must come from the plugin kit; "own" means it moves with the chain.

| Chain | Chain libs | sdk internals imported | @sodax/types (values) | Notes |
| --- | --- | --- | --- | --- |
| **Bitcoin** — `BitcoinSpokeService.ts`, `entities/btc/{RadfiProvider,btc-utils}.ts` | bitcoinjs-lib, @bitcoinerlab/secp256k1 | Kit: `ConfigService` (type), spoke param types (`types/spoke-types.ts`), `balance-utils` (`createBalanceCollector`, `settleWalletBalances`, `WalletBalanceMap`), `sleep`, `RelayExtraData` (`types/relay-types.ts`), `OnDemandRelayData` (`types/types.ts`). Own: RadfiProvider, btc-utils | `BITCOIN_DUST_SATS`, `ChainKeys`, `detectBitcoinAddressType`, `getIntentRelayChainId`, `isNativeBitcoinToken`, `isNativeToken`, `usesBip322MessageSigning`, `BOUND_*` hosts | `initEccLib(ecc)` runs at module level (`BitcoinSpokeService.ts:48`). Features reach it directly 20 times (B2) |
| **Solana** — `SolanaSpokeService.ts`, `entities/solana/{pda,utils,types}` | @solana/web3.js, @solana/spl-token, @coral-xyz/anchor, bn.js | Kit: ConfigService, spoke types, balance-utils, `sleep` | `getIntentRelayChainId`, `isNativeToken`, `ChainKeys`, **`spokeChainConfig`** (`entities/solana/utils/utils.ts:3,79`) | Reads the bundled config directly instead of `ConfigService`; fix this during the move |
| **Stellar** — `StellarSpokeService.ts`, `entities/stellar/CustomSorobanServer.ts`, `sponsoring/**` | @stellar/stellar-sdk | Kit: ConfigService, spoke types, balance-utils, `sleep`. Own: `parseToStroops`, CustomSorobanServer. Sponsoring also imports `BackendApiService` (type), `api-utils` (`apiKeyHeader`, `mergeHeaders`, `RequestOverrideConfig`), `SpokeService` (type), `errors/SodaxError` + `errors/wrappers` | `ChainKeys`, `getIntentRelayChainId`, `isNativeToken` | `SponsoringService.ts:134-136` reads `spoke.stellar.server` |
| **Sui** — `SuiSpokeService.ts`, `SuiGrpcTransport.ts`, `utils/sui-utils.ts` | @mysten/sui (bcs, transactions, grpc, client) | Kit: ConfigService, spoke types, balance-utils. Own: sui-utils, SuiGrpcTransport | `toSui*` helpers, `ChainKeys`, `isNativeToken` | `apps/node-cjs/src/index.ts:36,40,70` uses `sdk.spoke.sui.transport` (the getter must keep this working in 2.x) |
| **ICON** — `IconSpokeService.ts`, `utils/icon-utils.ts`, `entities/icon/*` | icon-sdk-js, rlp | Kit: ConfigService, spoke types, balance-utils, `sleep`, `BigIntToHex`, `hexToBigInt`, `encodeAddress` (ICON codec). Own: icon-utils, HanaWalletConnector + its guards (`guards.ts` `isJsonRpcPayloadResponse` …) | `ChainKeys`, `getIntentRelayChainId`, `isNativeToken` | `encodeSimulationParams` is used by core (`SpokeService.ts:637-638`) |
| **Injective** — `InjectiveSpokeService.ts`, `entities/injective/Injective20Token.ts` | @injectivelabs/sdk-ts, @injectivelabs/networks, cosmjs-types | Kit: ConfigService, spoke types, `WalletBalanceMap`, `sleep` | `ChainKeys`, `getIntentRelayChainId`, `isNativeToken` | — |
| **Stacks** — `StacksSpokeService.ts`, `utils/stacks-utils.ts` | @sodax/libs/stacks/core | Kit: ConfigService, spoke types, balance-utils, `sleep` | `ChainKeys`, `getIntentRelayChainId`, `isNativeToken` | — |
| **NEAR** — `NearSpokeService.ts` | near-api-js (bundled by tsup, `tsup.config.ts:13`) | Kit: ConfigService, spoke types, balance-utils, `sleep`, `RateLimitConfig` (`types/types.ts`) | `ChainKeys`, `getIntentRelayChainId`, `isNativeToken` | `getLimit`/`getAvailable` are used by core (`SpokeService.ts:1194-1228`) |
| **Tron** (#534) — `TronSpokeService.ts`, `tron-utils.ts` | none (viem only) | Kit: ConfigService, spoke types, balance-utils, `retry`, **MPC relay client** (`mpcRelay/MpcRelayApiService.ts`) | chain keys, `MpcRelayChainMap` | `shared-utils.ts` imports `../services/spoke/tron-utils.js` for the codec. That is a core→chain import and must move into the plugin codec |
| **XRP** (#497) | none in the sdk (wallet side adds `xrpl`, `ripple-keypairs`, `@gemwallet/api`) | Kit: ConfigService, spoke types, `retry`, MPC relay client, `mpc-message` (`computeSignedMessageHash`) | — | Memo mode, withdraw scheme 3 (raw ed25519 + pubkey) |
| **Monad** (#498) | none (viem) | Kit: ConfigService, spoke types, `retry`, MPC relay client, `mpc-message`, `erc20Abi`, `getEvmViemChain` | — | Chain type `EVM`; the dispatch is key-specific |
| **Aleo** (#95) | `@provablehq/sdk` (43 MB WASM, lazy `import()`, but a **hard dependency** of @sodax/sdk) | Kit: ConfigService, spoke types, `sleep`. Own: aleo-utils, bech32m | chain keys | Split-tx intent relay (adds itself to `IntentRelayApiService.ts:523`) |

No chain module imports a feature module (swap, MM, bridge…), and none imports `errors/*`. The coupling
runs one way only: core and features reaching into chains.

### The plugin kit — `@sodax/sdk/plugin` (2.x: `src/plugin/index.ts`)

This is the minimal surface, derived from the table. Everything else is plugin-internal.

- **Contract types**:
  - `ChainPlugin`, `ChainPluginContext`, `SpokeChainService<K>`;
  - `AddressCodec`, `SettlementMode`, `ChainCapabilities`;
  - `defineChainPlugin()`.
- **Core types plugins compile against**:
  - `ConfigService` (type only);
  - `DepositParams`, `EstimateGasParams`, `GetDepositParams`, `GetBalanceParams`, `GetBalancesParams`,
    `SendMessageParams`, `WaitForTxReceiptParams`, `WaitForTxReceiptReturnType`, `VerifyTxHashParams`;
  - `WalletBalanceMap`, `RelayExtraData`, `OnDemandRelayData`, `RateLimitConfig`.
- **Helpers**: `createBalanceCollector`, `settleWalletBalances`, `sleep`, `retry`, `BigIntToHex`,
  `hexToBigInt`, `invariant`.
- **MPC relay** (after #534): the REST client from `mpcRelay/MpcRelayApiService` (`waitForDeposit`,
  `waitForWithdrawal`, `getDepositAddress`, `notify`, `submitWithdraw`, `toDepositId`), the
  `MpcRelaySettlement` interface, and the `mpc-message` helpers.
- **For key-level EVM plugins (Monad)**: `getEvmViemChain`, `erc20Abi`.
- **Not in the kit**: `parseToStroops` (Stellar-only, moves with it) and the ICON guards (move with ICON).
  `@sodax/types` light entries come from T14.

3.0 stability: the kit is semver'd, but it is documented as first-party-only (no third-party plugin
promise). Chain packages peer-depend on `@sodax/sdk` within the same major, and the lockstep version
keeps them aligned.

### Package-cycle check

Could the sdk keep registering all chains by default in 2.x while the chain code lives in separate
packages? **No, without a cycle.** `@sodax/chain-x` needs `@sodax/sdk` (the kit) as a workspace
devDependency to build and test. If `@sodax/sdk` depends on `@sodax/chain-x` for default registration,
turbo hard-fails:

```
x Invalid package dependency graph: Cyclic dependency detected: @probe/sdk, @probe/chain-solana
```

(probe B-2, turbo 2.5.8; the repo runs `turbo ^2.4.0`, `package.json:51`, with `build.dependsOn: ["^build"]`
in `turbo.json`). The only cycle-free way to get default registration with separate packages is a
third package (`@sodax/core` holding hub/EVM/config/kit), with the sdk facade depending on core plus all
chains. That moves most of `src/shared` across packages in 2.x, right under the in-flight PRs, so it is
**rejected**.

### Expand path (recommended)

**2.x (non-breaking):**

1. **Registry in place.** `src/plugin/` gets the contract and a `ChainRegistry`. Each existing chain gets
   a plugin definition next to its current files. `SpokeService` creates chain services lazily through
   the registry, and the per-chain fields become lazy getters (T1.2–T1.4).
2. **Boundary.**
   - A `scripts/check-chain-boundaries.mjs` gate (same style as the existing `scripts/check-*.mjs`) makes
     non-EVM chain libraries importable only under `src/chains/**`.
   - `src/chains/<a>` may import only `src/plugin/**`, `@sodax/types`, its own dir and its libraries.
   - Nothing outside `src/chains/**` may value-import from it, except the root entry and the
     default-plugin list. Type-only imports stay allowed in `SpokeService.ts` for the 2.x back-compat
     getters.
   - The 18 feature files that import the `shared/index.js` barrel switch to direct imports. Today the
     barrel re-exports every chain service through `shared/services/spoke/index.ts`.
3. **Move each chain** into `src/chains/<name>/`, one PR per chain. The chains run in parallel. The root
   entry re-exports them, so root exports are identical (guarded by a root-export snapshot test).
4. **Entries.**
   - `new Sodax({ plugins })` and `defaultPlugins()` (all built-ins).
   - `createSodaxCore({ plugins })` (default: none).
   - Experimental `@sodax/sdk/chains/<name>` entries, which become `@sodax/chain-<name>` in 3.0 (codemod).
   - Chains added after the registry lands (XRP, Monad, Aleo) are **never** in `defaultPlugins()`. They
     carry no back-compat obligation, and two of them bring heavy dependencies.

**3.0 (breaking):**

5. `git mv packages/sdk/src/chains/<name> packages/chain-<name>/src`, plus cluster C's `./wallet` and
   `./react` parts. Kit imports become `@sodax/sdk/plugin`, and chain libraries move from the sdk's
   `dependencies` to the plugin package.
6. `new Sodax()` and `createSodaxCore()` register hub + EVM only. The per-chain getters
   (`sodax.spoke.bitcoin`…) go away. Typed access goes through
   `sodax.spoke.getSpokeService(ChainKeys.X)`, using a declaration-merging service registry that each
   plugin augments.
7. `@sodax/chains-all` provides `allChainPlugins()` for apps that want every chain.

---

## B3 · In-flight chain PRs

### What "MPC relay settlement" means

**Intent-relay chains** (every chain on main) have SODAX spoke contracts (asset manager + connection).
A spoke tx emits a packet, and the intent relay delivers it to the hub.

**MPC-relay chains** have **no SODAX spoke contracts**. #534's description:

> "Tron settles through the MPC relay (NEAR chain signatures) rather than the intent relay: a deposit is
> paid to a shared reserve carrying a payload-hash memo and tracked over the relay's REST API."

Withdrawals are hub burns. The MPC network signs the release, and the user authorizes it with a
per-chain signature scheme (`MpcWithdrawScheme`): Tron scheme 1, XRP scheme 3 (raw ed25519 + 33-byte
pubkey, #497), Monad scheme 0 (EIP-191, #498). There are two deposit methods (`MpcDepositMethod = 'memo' | 'address'`):

- **memo**: Tron, XRP. The payload hash rides a tx-level memo to the shared reserve.
- **address**: Monad, which "settles in address mode". The relay derives a one-off deposit address per
  payload, the user sends a plain transfer to it, and the relay sweeps it into the reserve.

Membership in `MpcRelayChainMap` (types) decides which chains settle this way.

#534 also adds **`SpokeService.settle(params: SettleParams): Result<TxHashPair, SettlementFailure>`**, a
single seam that features call after `create*Intent`:

- MPC relay: poll the deposit/withdrawal record.
- Intent relay: verify the tx hash, then `relayTxAndWaitPacket`.
- Bitcoin outbound on-demand identity: `od:<hash>`.

MM (4 sites), swap (1) and bridge (1) stop calling `relayTxAndWaitPacket` directly. One
`spoke.bitcoin.getOnDemandRelayIdentity` call leaves MM. #534 also adds `encodeRecipient` next to
`encodeAddress` (MPC chains left-pad the 20-byte identity to 32 bytes), and `EvmSolverService` uses it
for `dstAddress`.

### Must the ChainPlugin contract model it? Yes

```ts
type SettlementMode =
  | { kind: 'intent-relay'; splitTx?: boolean }               // splitTx: relay needs payload bytes (Solana, Bitcoin, Aleo)
  | { kind: 'mpc-relay'; depositMethod: 'memo' | 'address' }; // Tron, XRP (memo); Monad (address)
capabilities.mpcSettlement?: (spoke) => MpcRelaySettlement;  // waitForDeposit / waitForWithdrawal
capabilities.outboundRelayIdentity?: (spoke, tx) => RelayIdentity; // Bitcoin on-demand
codec.encodeRecipient?: (address) => Hex;                     // default = encodeAddress
```

- `SpokeService.settle` reads `plugin.settlement`.
- `IntentRelayApiService.ts:523` (`isSplitTxChain`, Solana/Bitcoin; Aleo adds itself) reads `splitTx`.
- At registration, core asserts that `settlement.kind` agrees with `MpcRelayChainMap`. This keeps #534's
  fail-loud rule that a chain must not fall through to the intent relay.
- Withdraw schemes and deposit methods stay plugin-internal (`deposit` / `sendMessage`).
- `rawTxSchema` from the old E2.1 contract is **dropped**: raw-tx schemas live in
  `packages/swaps-api/src/rawTxSchemas.ts`, which depends only on `@sodax/types`, not on the sdk registry.

### File overlap with the plugin refactor

| PR | State | sdk files it shares with the refactor | Other overlap |
| --- | --- | --- | --- |
| **#534** Tron + settle (gcranju) | open, mergeable, opened 2026-10-16. **Supersedes #372** (closed 10 minutes earlier, same title) and #388 | `SpokeService.ts` (8 dispatch switches + `settle`), `shared-utils.ts` (codecs + `encodeRecipient`), `guards.ts`, `spoke/index.ts`, `services/index.ts`, `spoke-types.ts`, `SonicSpokeService.ts`, `EvmSolverService.ts` (also T5), MM / Bridge / Swap / Recovery (settle routing) | types (chain-keys, chains, tokens, common, wallet/providers, new `tron/`), wallet-sdk-core `tron/`, wallet-sdk-react `chainRegistry.ts`, `constants.ts`, `types/config.ts`, `xchains/tron/`; also `.changeset/*` and `apps/node` (both dead machinery) |
| **#497** XRP (draft) | base `main`, last update 2026-10-01. **Contains an old copy of the Tron work** | same as #534, plus `XrpSpokeService.ts`, `xrp-utils.ts`, `mpc-message.ts` | wallet-sdk-core (+`xrpl`, `ripple-keypairs`), wallet-sdk-react (+`@gemwallet/api`), `pnpm-workspace.yaml` `@types/react` override |
| **#498** Monad (draft) | **stacked on #497** (base `feat/xrp-mpc-integration`) | `SpokeService.ts` (an `isMonadChainKeyType` branch inside every EVM case), `shared-utils.ts`, `guards.ts`, `constant-utils.ts`, `EvmSolverService.ts`, MM / Bridge / Staking / Migration / AssetService | skills (7 files), wallet `evm` files |
| **#95** Aleo | base `main`, last update 2026-09-07, mergeable UNKNOWN | `SpokeService.ts`, `shared-utils.ts`, `guards.ts`, `IntentRelayApiService.ts`, `spoke/index.ts`, `spoke-types.ts`; adds `@provablehq/sdk` to `packages/sdk/package.json` | wallet-sdk-core / react (18 files), skills (24) |
| #511, #512, #509, #523 (the user's) | open, mergeable | feature services only (Swap / Bridge / LeverageYield; #512 also `IntentRelayApiService.ts:134`, the `data?` type). None touches `SpokeService.ts` or `shared-utils.ts` | — |
| #483 | conflicting | `errors/guards.ts`, `leverageYield/positionLegQuote.ts` | none with B |
| #488 | mergeable | `migration/{Icx,}MigrationService.ts` | none with B (the ICON branches there are pure guards) |
| #163 wallet-hw | conflicting | none in the sdk | cluster C |

### Cutoff and merge order

1. **#534 merges before T1.2 starts.**
   - It adds the settlement seam T1.3 needs.
   - It removes relay and Bitcoin-on-demand branching from three features.
   - Tron is viem-only, so default-registering it in 2.x costs ~0 weight.
   - Porting #534 onto the registry afterwards would mean rewriting its 8 switch cases and its
     `settle` MPC branch, which is more rework than adding one built-in plugin during T1.2.
   - Cutoff: **when T1.1 (ADR) is accepted**. If #534 is not merge-ready by then, T1.2 proceeds, and
     #534 merges main and turns into a plugin definition.
   - #534 is marked `!`, but the team has shipped `!` commits inside 2.x before (`c2519166` sui!,
     `e57a4a4b` leverage-yield!), so it can land in a 2.x minor.
2. **#509, #523, #511, #512 and #488 merge any time.** They don't touch registry files. T1.7 (Bitcoin
   move) edits Swap, Bridge and LeverageYield, so schedule it after them.
3. **#497 (XRP) and #498 (Monad) come after T1.3–T1.5, as opt-in plugins.**
   - Both must first merge main after #534, because they carry a stale Tron copy that conflicts
     line-for-line.
   - Monad's key-level dispatch should be built into the registry (T1.2) rather than added as an
     `if (isMonadChainKeyType)` inside every EVM branch.
   - XRP's weight is wallet-side (`xrpl`, `@gemwallet/api`), which is exactly what the plugin model
     keeps out of core.
4. **#95 (Aleo) comes after T1.3–T1.5, as an opt-in plugin.** It adds a 43 MB WASM dependency to every
   `@sodax/sdk` install, so it must not merge into core in v2 shape.
5. Team convention: update branches by merging main, never by rebasing.

---

## T1 · Chain plugins (10) — E2.1–E2.6, E4.5

### Approach

**Contract** (`packages/sdk/src/plugin/types.ts`, exported as `@sodax/sdk/plugin`):

```ts
export type ChainPluginContext = { config: ConfigService; hubProvider: EvmHubProvider };

export interface SpokeChainService<K extends SpokeChainKey = SpokeChainKey> {
  estimateGas(p: EstimateGasParams<K>): Promise<GetEstimateGasReturnType<K>>;
  deposit<R extends boolean>(p: DepositParams<K, R>): Promise<TxReturnType<K, R>>;
  getDeposit(p: GetDepositParams<K>): Promise<bigint>;
  getWalletBalance(p: GetBalanceParams<K>): Promise<bigint>;
  getWalletBalances(p: GetBalancesParams<K>): Promise<WalletBalanceMap>;
  sendMessage<R extends boolean>(p: SendMessageParams<K, R>): Promise<TxReturnType<K, R>>;
  waitForTransactionReceipt(p: WaitForTxReceiptParams<K>): Promise<Result<WaitForTxReceiptReturnType<K>>>;
}

export interface AddressCodec {
  encodeAddress(address: string): Hex;   // identity / hub-wallet salt (shared-utils.ts:152-193 today)
  decodeAddress(encoded: Hex): string;   // reverseEncodeAddress (shared-utils.ts:213-259)
  encodeToken?(token: string): Hex;      // encodeTokenIdentifier (shared-utils.ts:199-208); default encodeAddress
  encodeRecipient?(address: string): Hex;// #534; default encodeAddress
}

export interface ChainPlugin<S extends SpokeChainService = SpokeChainService> {
  readonly id: string;                           // 'solana'
  readonly chainType: ChainType;                 // 'SOLANA'
  readonly chainKeys?: readonly SpokeChainKey[]; // key-level claim (Monad) beats type-level
  readonly settlement: SettlementMode;           // see B3
  readonly codec: AddressCodec;
  createSpoke(ctx: ChainPluginContext): S;       // called lazily, once per core
  readonly capabilities?: {
    allowance?: { isValid; approve; buildApproveTxs };            // Stellar trustline
    simulationEncoding?: (spoke: S, token: string, assetManager: string) => { encodedToken: Hex; encodedSrcAddress: Hex }; // ICON, Sui
    verifyTxHash?: (spoke: S, p: VerifyTxHashParams) => Promise<Result<boolean>>; // Solana, NEAR, Stellar, Sui, Stacks
    resolveSrcAddress?: (spoke: S, address: string) => Promise<string>;           // Bitcoin TRADING
    prepareSigner?: (spoke: S, walletProvider: IWalletProvider) => Promise<void>;  // Bitcoin Radfi auth
    outboundRelayIdentity?: (spoke: S, tx: string) => RelayIdentity;              // Bitcoin on-demand
    mpcSettlement?: (spoke: S) => MpcRelaySettlement;                             // Tron, XRP, Monad
    rateLimits?: { getLimit; getAvailable };                                      // NEAR
  };
}
export function defineChainPlugin<S extends SpokeChainService>(p: ChainPlugin<S>): ChainPlugin<S>;
```

**Registry and SpokeService (2.x):**

- `new ChainRegistry(plugins)` validates duplicate claims and resolves by key, then by type (hub/EVM are
  built in).
- `registry.codec(key)` and `registry.isEnabled(key)` are pure: no instances, no I/O.
- `SpokeService` takes `{ config, hubProvider, registry }`.
- `getSpokeService(key)` creates the service through `plugin.createSpoke(ctx)` on first use and caches
  it per plugin.
- `public get bitcoin()` and the other per-chain fields are getters (a getter-only property is still
  `readonly` to TS). This keeps `sodax.spoke.bitcoin/stellar/near` working for the 13 dapp-kit hook
  files, the demo, `apps/node-cjs`, and intents-whitelabel (`src/lib/stellar-utils.ts:24`).
- A chain that isn't enabled throws `SodaxError('CHAIN_NOT_ENABLED')`, a new code in `errors/codes.ts`.
- The 8 dispatch switches collapse into `this.getSpokeService(key).<method>(...)`.
- Constructing `SpokeService` / `EvmHubProvider` directly gets a **required** `registry`. Nothing does
  this today: no docs, skills or tests, and no downstream repo. Only the dead `apps/node` does. A
  required parameter fails closed at compile time, where a silent EVM-only default would not. If the
  lead wants strict semver here, `EvmHubProvider` could instead lazy-`import()` the legacy codec (its
  only codec use is async, `EvmHubProvider.ts:77-78`).

**Facade and core:**

- `new Sodax(options & { plugins? })` uses `plugins ?? defaultPlugins()`: all 9 built-ins in 2.x, and
  Tron once #534 lands.
- `createSodaxCore({ plugins })` (T12.1) defaults to `[]`.
- `GetSpokeServiceType` / `SpokeServiceType` (`SpokeService.ts:82-114`) keep their explicit conditional
  types in 2.x. In 3.0 they move to a declaration-merging registry:

  ```ts
  // @sodax/sdk/plugin
  export interface ChainServiceRegistry {}      // chain type -> service class
  export interface ChainKeyServiceRegistry {}   // key-level overrides (Monad)
  // @sodax/chain-stellar
  declare module '@sodax/sdk/plugin' { interface ChainServiceRegistry { STELLAR: StellarSpokeService } }
  ```

  This keeps `getSpokeService(ChainKeys.STELLAR_MAINNET)` typed as `StellarSpokeService` whenever the
  plugin is imported.

**3.0 contract:** extract each chain directory into `@sodax/chain-<name>` (`.` from cluster B,
`./wallet` from C's T6, `./react` from C's T3). The sdk peer range is `^3`. Then:

- the default flips to hub + EVM;
- the per-chain getters are removed;
- non-EVM libraries leave `packages/sdk/package.json:66-91`;
- `@sodax/chains-all` is published;
- `bump-versions.sh:7` and `sdks-publish.yml:30,72` gain the new packages (`release.mjs:229-248`
  fails the release if the two lists drift from the publishable set).

The publish step uses `SODAX_SDKS_NPM_PUBLISH_TOKEN` (`sdks-publish.yml:80`). Confirm that the token can
create new `@sodax/*` packages: a granular token scoped to existing packages would fail on the first
3.0 publish.

### Work inventory (B2) — every place that touches a concrete chain spoke or chain library

| # | Site (cc053fef) | Coupling | Routes through | Sub-issue |
| --: | --- | --- | --- | --- |
| 1 | `SpokeService.ts:132-141` 10 public fields; `:143-156` constructor with 10 eager `new` (`:146-155`) | all | lazy registry getters | T1.2 |
| 2 | `SpokeService.ts:158-201` `getSpokeService` switch on chain type | all | `registry.resolve(key)` (key, then type) | T1.2 |
| 3 | dispatch switches: `estimateGas :494`, `deposit :707`, `getDeposit :835`, `getWalletBalance :902`, `getWalletBalances :971`, `sendMessage :1040`, `waitForTxReceipt :1273` | all | `getSpokeService(key).<method>` | T1.2 |
| 4 | Stellar trustline inside `isAllowanceValid :205` (`:230`), `approve :254` (`:292-293`), `buildApproveTxs :322` (`:351-355`), `requestTrustlineForApproval :428` | Stellar | `capabilities.allowance` | T1.3 |
| 5 | `resolveSimulationEncoding :631-657` (ICON `:637`, Sui `:639`) | ICON, Sui | `capabilities.simulationEncoding` | T1.3 |
| 6 | Bitcoin effective address in `sendMessage :1052-1054` and `verifySimulation :1166-1168` | Bitcoin | `capabilities.resolveSrcAddress` | T1.3 |
| 7 | `getLimit :1194`, `getAvailable :1212` | NEAR | `capabilities.rateLimits` | T1.3 |
| 8 | `verifyTxHash :1230-1264` | Solana, NEAR, Stellar, Sui, Stacks | `capabilities.verifyTxHash` (default: true) | T1.3 |
| 9 | `settle()` (#534): MPC switch + Bitcoin on-demand | Tron, Bitcoin | `plugin.settlement` + capabilities | T1.3 |
| 10 | `IntentRelayApiService.ts:523-524` `isSplitTxChain` | Solana, Bitcoin | `settlement.splitTx` | T1.3 |
| 11 | `shared-utils.ts:24-28` imports @mysten/sui/bcs, @solana/web3.js, @stellar/stellar-sdk, @sodax/libs/stacks, btc-utils (bitcoinjs); codecs `:152-259` | all non-EVM libs | `registry.codec(key)` | T1.4 |
| 12 | 25 codec call sites: `EvmHubProvider.ts:78`; `MigrationService.ts:1013,1042,1245`; `PartnerFeeClaimService.ts:379`; `AssetService.ts:405`; `LeverageYieldService.ts:2480`; `RecoveryService.ts:200`; `StakingService.ts:850,1037`; `BridgeService.ts:951`; `MoneyMarketService.ts:881,1091`; `SwapService.ts:2013` (reverse); `EvmSolverService.ts:128,129`; `SpokeService.ts:614,644,645,1055,1169`; plus chain-internal `IconSpokeService.ts:274-275`, `SonicSpokeService.ts:325-326`, `shared-utils.ts:206` | — | `this.spoke.codec(key)` / registry passed to `EvmHubProvider` | T1.4 |
| 13 | **20 × `spoke.bitcoin.*`**: Swap `1674,1675,1678,2004,2059`; MM `657,660,671,737,888,1098,1294,1297,1308`; Bridge `786,787,790,795`; LeverageYield `1053,1054` (`RadfiProvider.ts:661` is only an error string) | Bitcoin | `resolveSrcAddress`, `prepareSigner`, `outboundRelayIdentity`, plus a `walletMode` read through the plugin | T1.7 |
| 14 | `SponsoringService.ts:134-136` `spoke.stellar.server`; `sponsoring/internal/{horizon,stellarSponsoredCreate}.ts` (stellar-sdk) | Stellar | moves into the Stellar plugin; `Sodax.sponsoring` becomes a lazy getter in 2.x | T1.9 |
| 15 | `SwapService.ts:2004-2016` `resolveCancelSrcAddress`, `:2057-2061` `buildCancelRelayIdentity` | Bitcoin | capabilities | T1.7 |
| 16 | `entities/solana/utils/utils.ts:79` reads `spokeChainConfig` | Solana | `ConfigService` | T1.8 |
| 17 | `Sodax.ts:62,76` `radfiSigner` plumbed into `ConfigService`; `SodaxOptions.radfi` | Bitcoin | kept in 2.x; `bitcoinPlugin({ radfi })` in 3.0 | T1.7 / T1.20 |
| 18 | 18 feature files import the `shared/index.js` barrel, which re-exports every chain service (`shared/services/index.ts` → `spoke/index.ts`) | all | direct module imports; chain re-exports move to the root entry | T1.5 |
| 19 | Pure feature branching on chain type, with no chain library or service import: Stellar trustline params (swap `1386,1459,1542`, bridge `244,326,423`, staking `245,341`, dex `142,208`, migration `207,237,340,420`, MM `325,337,355,431`, LeverageYield `3144`); ICON migration (`MigrationService.ts:172,182,1138`); Stacks raw `srcPublicKey` (`SwapService.ts:1653`) | — | **stays** (guards in `guards.ts` import only viem and @sodax/types). Optional later cleanup: uniform allowance params | — |
| 20 | dapp-kit: 13 hook files use `sodax.spoke.{bitcoin,stellar,near}` (`hooks/bitcoin/*` ×8, `useStellarGate`, `useStellarTrustlineCheck`, `useEstablishTrustline`, `useNearStorageCheck`, `useRegisterNearStorage`) | Bitcoin, Stellar, NEAR | getters keep them working in 2.x; in 3.0 they move to dapp-kit chain subpaths | cluster D (T13) |

Dispatcher call counts per method:

| Method | Calls |
| --- | --: |
| `isAllowanceValid` | 22 |
| `approve` | 19 |
| `sendMessage` | 15 |
| `deposit` | 12 |
| `verifyTxHash` | 12 |
| `buildApproveTxs` | 4 |
| `estimateGas` | 2 |
| `waitForTxReceipt` | 1 |
| **Total** | **87** |

Per feature:

| Feature | Calls |
| --- | --: |
| moneyMarket | 16 |
| migration | 15 |
| swap | 13 |
| leverageYield | 12 |
| dex | 10 |
| staking | 10 |
| bridge | 9 |
| partner | 1 |
| recovery | 1 |

None of these calls changes: they already go through the dispatcher.

### Feasibility

**Feasible.** 2.x stays non-breaking because default registration keeps every chain, and the getters
preserve every observed access path (dapp-kit, demo, intents-whitelabel, `apps/node-cjs`). The two
exceptions are the `SpokeService` / `EvmHubProvider` constructor parameter (no known consumer) and the
experimental entries.

The 3.0 extraction is mechanical once the boundary check is green. The only real design risks are:

- the key-level dispatch (Monad);
- the MPC settlement seam. #534 already shapes it, which is why it should merge first.

Probes: B-2 (package cycle). Import inventories were verified with `rg` (see the table above).

### Sub-issues

Chain moves T1.7–T1.15 can run **in parallel, one developer each**, once T1.2–T1.5 are merged.
Per-chain extraction T1.17–T1.25 is likewise parallel.

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T1.1 | `docs(sdk): ADR for chain plugins, plugin kit, settlement modes and v3 package layout` | Contract, kit surface, key→type resolution, settlement modes (#534/#497/#498), `plugins` option naming, 2.x in-package layout plus 3.0 extraction, declaration-merging types, factory naming (`solanaPlugin()` vs C's adapters) | `packages/sdk/docs/` (ADR) | 3 | no | expand-2.x | — (reads #534) | — |
| T1.2 | `refactor(sdk): chain plugin contract, ChainRegistry and lazy spoke services` | Adds `src/plugin/`. Built-in plugin definitions sit next to the existing files (no moves). `SpokeService` takes `registry`; lazy creation, per-chain getters, key-level resolution; dispatch switches collapse; `CHAIN_NOT_ENABLED`. Adds a root-export snapshot test (`Object.keys(await import(root))`) to guard every later move | `shared/services/spoke/SpokeService.ts`, `src/plugin/**`, `errors/codes.ts`, `shared/entities/Sodax.ts`, `shared/entities/EvmHubProvider.ts` (ctor), tests | 5 | no¹ | expand-2.x | T1.1; #534 merged or cutoff passed | **#534, #497, #498, #95** (`SpokeService.ts`, `spoke/index.ts`) |
| T1.3 | `refactor(sdk): route chain capabilities and settlement through plugins` | Inventory rows 4–10: Stellar allowance, ICON/Sui simulation encoding, NEAR limits, `verifyTxHash`, Bitcoin effective address, `settle()` reading `plugin.settlement`, `splitTx` in the intent relay; assert the plugin agrees with `MpcRelayChainMap` | `SpokeService.ts`, `IntentRelayApiService.ts:523`, plugin definitions | 3 | no | expand-2.x | T1.2 | #534 (`settle`); #512 (`IntentRelayApiService.ts`, different hunk at `:134`); #95 |
| T1.4 | `refactor(sdk): address codecs through the chain registry` | Codec per plugin (EVM/hub built in). Internal callers (row 12) use `spoke.codec(key)`; `EvmHubProvider` takes the registry. The free `encodeAddress`/`reverseEncodeAddress`/`encodeTokenIdentifier` stay exported in 2.x as an all-chains legacy module that only the root uses (downstream callers: none outside the repo's smoke apps). `encodeRecipient` (#534) joins the codec | `shared/utils/shared-utils.ts`, 14 caller files, `EvmHubProvider.ts` | 3 | no | expand-2.x | T1.2 | #534, #497, #498, #95 (`shared-utils.ts`); light textual overlap with caller files |
| T1.5 | `build(sdk): enforce the chain import boundary; drop shared-barrel imports` | `scripts/check-chain-boundaries.mjs` + test (rules in B1); 18 feature files import from direct modules; chain re-exports move from `shared/services/spoke/index.ts` to `src/index.ts` (root exports unchanged, snapshot from T1.2). Wired into `checkTs` or `lint` | `scripts/`, `packages/sdk/package.json` scripts, 18 feature files (import lines only), `shared/services/spoke/index.ts`, `src/index.ts` | 2 | no | expand-2.x | T1.2 | trivial import-line overlap with any open feature PR |
| T1.6 | `feat(sdk): plugins option, defaultPlugins() and experimental @sodax/sdk/chains/* entries` | `new Sodax({ plugins })` (replaces the default set when given); `defaultPlugins()` from root; `chains/<name>` export entries + `typesVersions`; docs page "selecting chains (experimental)" | `Sodax.ts`, `packages/sdk/package.json` exports, docs | 2 | no | expand-2.x | T1.4, T12.1, T12.2 (A: T2) | `package.json` exports (T12.2) |
| T1.7 | `refactor(sdk): Bitcoin as a built-in plugin under src/chains/bitcoin` | Move `BitcoinSpokeService` + `entities/btc/*` + tests. Codec, settlement `intent-relay {splitTx}`, capabilities. Replace the 20 `spoke.bitcoin.*` feature sites (row 13) and rows 15 and 17. Lazy `initEccLib` if A's E1.4 hasn't landed | `src/chains/bitcoin/**`, Swap / MM / Bridge / LeverageYield, `scripts/test-cast-comment-baseline.json` (path keys) | 5 | no | expand-2.x | T1.3–T1.5; A: E1.4 (same line, `BitcoinSpokeService.ts:48`) | #534 (MM), #509 / #511 / #512 / #523 (same feature files, different hunks) |
| T1.8 | `refactor(sdk): Solana as a built-in plugin` | Move the spoke + `entities/solana/*` + tests; `isSolanaNativeToken` reads `ConfigService` | `src/chains/solana/**` | 2 | no | expand-2.x | T1.3–T1.5; T8.4 first (fewer files to move) | none open |
| T1.9 | `refactor(sdk): Stellar (incl. sponsoring) as a built-in plugin` | Move the spoke + `CustomSorobanServer` + `sponsoring/**` + `parseToStroops`; allowance capability; `Sodax.sponsoring` lazy | `src/chains/stellar/**`, `sponsoring/**`, `Sodax.ts` | 3 | no | expand-2.x | T1.3–T1.5; T8.3 | none open in sdk |
| T1.10 | `refactor(sdk): Sui as a built-in plugin` | Move the spoke + `SuiGrpcTransport` + `sui-utils` + tests; simulation encoding, `verifyTxHash` | `src/chains/sui/**` | 2 | no | expand-2.x | T1.3–T1.5 | none open |
| T1.11 | `refactor(sdk): ICON as a built-in plugin` | Move the spoke + `icon-utils` + `entities/icon/*` + ICON guards | `src/chains/icon/**`, `shared/guards.ts` (ICON part) | 2 | no | expand-2.x | T1.3–T1.5; T8.1 first | #534 / #95 (`guards.ts`, if still open) |
| T1.12 | `refactor(sdk): Injective as a built-in plugin` | Move the spoke + `Injective20Token` + tests | `src/chains/injective/**` | 2 | no | expand-2.x | T1.3–T1.5 | none open |
| T1.13 | `refactor(sdk): Stacks as a built-in plugin` | Move the spoke + `stacks-utils` + tests (`@sodax/libs/stacks` stays) | `src/chains/stacks/**` | 2 | no | expand-2.x | T1.3–T1.5 | none open |
| T1.14 | `refactor(sdk): NEAR as a built-in plugin` | Move the spoke + tests; rate-limits capability; NEAR stays bundled for CJS (`tsup.config.ts:13`) until T4 | `src/chains/near/**` | 2 | no | expand-2.x | T1.3–T1.5 | none open |
| T1.15 | `refactor(sdk): Tron as a built-in plugin` | Move `TronSpokeService` + `tron-utils`; codec incl. `encodeRecipient`; settlement `mpc-relay {memo}` | `src/chains/tron/**` | 1 | no | expand-2.x | #534, T1.3–T1.5 | — |
| T1.16 | `feat(sdk): XRP, Monad and Aleo as opt-in plugins` (one PR per chain, owned by the PR authors) | Rebuild #497 / #498 / #95 on the kit; not in `defaultPlugins()`; Monad claims `chainKeys: ['monad']` | `src/chains/{xrp,monad,aleo}/**` | 3 + 2 + 3 | no | expand-2.x | T1.3–T1.5, T1.6 | #497, #498, #95 (superseded) |
| T1.17 | `build: @sodax/chain-* package scaffold and publish wiring` | Template `package.json` (`exports` `.`, `./wallet`, `./react`; peers `@sodax/sdk ^3`, optional wallet/react peers), tsc ESM build per A's T2, vitest; add to `bump-versions.sh:7` / `sdks-publish.yml:30,72`; confirm the npm token can create packages | `packages/chain-*/` template, `scripts/bump-versions.sh`, `.github/workflows/sdks-publish.yml` | 2 | no | contract-3.0 (prep possible in 2.x) | A: T2, T4 | — |
| T1.18–T1.25 | `refactor!: extract <chain> into @sodax/chain-<name>` (Bitcoin, Solana, Stellar, Sui, ICON, Injective, Stacks, NEAR) | `git mv packages/sdk/src/chains/<name> packages/chain-<name>/src`; kit imports become `@sodax/sdk/plugin`; chain libraries move dependency lists; tests move; merge C's wallet/react parts | `packages/chain-<name>/**`, `packages/sdk/package.json` | 1 each (Bitcoin, Stellar: 2) | yes | contract-3.0 | T1.17; C: T6 / T3 for `./wallet` / `./react` | — |
| T1.26 | `refactor!: extract Tron (and XRP, Monad, Aleo if merged) into packages` | Same as above | `packages/chain-{tron,…}` | 1 each | yes | contract-3.0 | T1.17 | — |
| T1.27 | `feat(sdk)!: hub and EVM only by default; typed chain access via the plugin registry` | `defaultPlugins` → `[]`; remove the per-chain getters; declaration-merging `GetSpokeServiceType`; `CHAIN_NOT_ENABLED` messages name the package | `SpokeService.ts`, `Sodax.ts`, `src/plugin/types.ts` | 3 | yes | contract-3.0 | T1.18–T1.26; D: T13 (dapp-kit chain hooks), T26 (`SodaxProvider` plugins) | — |
| T1.28 | `feat: @sodax/chains-all` | `allChainPlugins()` + re-exports | `packages/chains-all/` | 1 | no | contract-3.0 | T1.18–T1.26 | — |
| T1.29 | `chore(sdk)!: remove the transitional chains/* entries and non-EVM dependencies` | Delete the `./chains/*` exports and the legacy all-chains codec module; `@sodax/libs` leaves the sdk dependencies | `packages/sdk/package.json`, `src/index.ts` | 1 | yes | contract-3.0 | T1.27 | — |

¹ No known consumer constructs `SpokeService` / `EvmHubProvider` directly. Root exports are byte-identical
(snapshot test).

**Totals.** sdk side ≈ 57 pts: 2.x 40, 3.0 17. In-flight ports add 8, and the wallet/react parts belong to
cluster C. The old E2 estimate was 33 + 1. The difference comes from the explicit capability and
boundary work and the separate extraction step. Skipping the 2.x consolidation (moving files only at
3.0) saves about 8 pts, but it puts the whole boundary job into the breaking window and leaves 2.x
without opt-in entries.

---

## T5 · Drop PancakeSwap SDKs; vendor CL math (8) — E4.1

### Evidence

- **Imports.** All in two source files: `dex/ConcentratedLiquidityService.ts:35-54` and
  `swap/EvmSolverService.ts:40`.
  - `Price, Token` from `@pancakeswap/swap-sdk-core`.
  - `CLPoolManagerAbi, CLPositionManagerAbi, decodePoolKey, getPoolId,
    encodeCLPositionManager{Mint,IncreaseLiquidity,DecreaseLiquidity}Calldata` from `@pancakeswap/infinity-sdk`.
  - `maxLiquidityForAmount0Precise, maxLiquidityForAmount1, maxLiquidityForAmounts, PositionMath,
    sqrtRatioX96ToPrice, TickMath, tickToPrice` from `@pancakeswap/v3-sdk`.
  - `EvmSolverService.ts:45` builds `MintPositionEventAbi` from `CLPositionManagerAbi` **at module load**.
    That puts infinity-sdk into every entry that imports `EvmSolverService`: swap and leverage-yield
    (`LeverageYieldService.ts:87`).
- **ABI functions actually used**:
  - CLPoolManager: `getSlot0`, `getFeeGrowthGlobals`, `getPoolTickInfo` (`ConcentratedLiquidityService.ts:1305,1479,1490,1496`);
  - CLPositionManager: `positions` (`:1433`), `modifyLiquidities` (via the encoders), event `MintPosition` (`:471`).
  - The in-repo `shared/abis/pancakeSwapInfinity.abi.ts` (263 lines) already has `positions` and
    `modifyLiquidities`. It lacks `getFeeGrowthGlobals`, `getPoolTickInfo` and `MintPosition`.
- **Where the weight comes from** (lockfile, cc053fef): the six packages that each nest `viem@2.37.13`
  are `infinity-sdk`, `permit2-sdk`, `sdk`, `swap-sdk-evm`, `v2-sdk` and `v3-sdk`. **`swap-sdk-core` has
  no viem dependency.** It pulls `@solana/web3.js@1.98.4`, `big.js`, `bn.js`, `decimal.js-light`,
  `toformat`, `tiny-invariant` and `tiny-warning` (probe B-3). Dropping `v3-sdk` + `infinity-sdk` alone
  therefore removes **all** the nested viem copies. Catalog pins are at `pnpm-workspace.yaml:78-83`.
- **Public exposure.**
  - The sdk does **not** export `Price`/`Token` by name (`dex/index.ts` exports the services;
    `rg "export .*\b(Price|Token)\b"` finds only `TokenWithConversion`).
  - They surface structurally in `ClPositionInfo.tickLowerPrice/tickUpperPrice: Price<Token,Token>`
    (`ConcentratedLiquidityService.ts:184-185`), `TokenWithConversion = Token & …` (`:201`),
    `EnrichedToken` (`:210-215`), `PoolData.price` (`:245`) and `token0/token1/*UnderlyingToken`
    (`:255-264`).
  - They are also the parameters of `ClService.priceToTick(price, token0: Token, token1: Token, tickSpacing)`
    (`:1829`), which uses only `decimals`.
  - PancakeSwap's `Price` has `private get adjustedForDecimals` and `Fraction` has `private static
    tryParseFraction` (`swap-sdk-core@1.6.0 dist/index.d.ts:188,314`). That makes them **nominal**: no
    vendored class is assignable *to* them.
- **Downstream usage.**
  - sodax-frontend: **12 `toSignificant(n)` call sites in 7 files** (`apps/web/app/(apps)/pool/**`:
    `claim-tab-content.tsx:73`, `manage-position-dialog.tsx:285-287`, `supply-confirmation-step.tsx:41`,
    `position-card.tsx:89,203,204,207`, `usePoolContext.ts:42`, `usePreselectChainFromPosition.ts:87`,
    `pool-store-provider.tsx:57`).
  - Token reads there: `token0/1.decimals` (33), `.address` (2), `.symbol` (2).
  - `priceToTick` is called with pool tokens (`_utils/index.ts:37`).
  - No direct `@pancakeswap` import in sodax-frontend. The demo has 6 `toSignificant` sites; dapp-kit
    calls `priceToTick` only (`hooks/dex/useLiquidityAmounts.ts:39-40`, `utils/dex-utils.ts:143-144`).
  - sodax-backend and intents-whitelabel use none of this.

### Approach

1. **Vendor the math** (`src/dex/clmm/math/`, ~350 LOC ported from v3-sdk 3.10.0 dist): FullMath,
   SqrtPriceMath, `mostSignificantBit`/`mulShift`, TickMath, `maxLiquidityFor*`, PositionMath,
   `tickToPrice`, `sqrtRatioX96ToPrice`. `ConcentratedLiquidityService` imports the local math.
2. **Vendor the Infinity pieces** (`src/dex/clmm/infinity/`, ~280 LOC + ABI fragments):
   - `getPoolId`;
   - `decodePoolKey` + `decodeCLPoolParameters` / `decodeHooksRegistration`;
   - `encodeCLPoolParameters` / `encodeHooksRegistration` + `HOOKS_REGISTRATION_OFFSET`;
   - an `ActionsPlanner` subset: actions 0, 1, 2, 13, 14, 18, 20, 21 with their `ACTIONS_ABI` entries,
     and `finalizeModifyLiquidityWith{SettlePair,Close,CloseWrap}`;
   - the 3 calldata encoders;
   - 6 ABI fragments, added to `shared/abis/pancakeSwapInfinity.abi.ts`. `EvmSolverService` reads
     `MintPosition` from the local fragment.

   `v3-sdk` and `infinity-sdk` leave `dependencies` (kept as `devDependencies` for the equivalence tests).
3. **Contract**: own `ClPrice`/`ClToken` classes (~200 LOC).
   - `Fraction`-style `numerator`/`denominator`.
   - `toSignificant(digits = 6, format?, rounding = ROUND_HALF_UP)` and `toFixed`, implemented over
     bigint (no decimal.js / big.js).
   - `invert()`, `baseCurrency`, `quoteCurrency`.
   - `ClToken`'s public fields are `chainId, address, decimals, symbol, name`, plus `equals`, `sortsBefore`.
   - **No private members**, so a PancakeSwap `Token` a caller builds still passes structurally.
   - Widen `priceToTick`'s parameters to `{ decimals: number }`.
   - Drop `swap-sdk-core`.
   - Trim the 610-line `packages/types/src/dex/pancakeswap-infinity.ts` ambient classes down to the 4
     types it exists for (`PoolKey`, `EncodedPoolKey`, `Slot0`, `CLPositionConfig`, `dex/dex.ts:7-12`).
4. **Freeze the equivalence tests** into recorded fixtures and remove the PancakeSwap devDependencies,
   so OSV no longer sees them.

**Test strategy.**

- Seeded property tests: a small inline PRNG, so no new dependency (`fast-check` is not in the repo).
  N ≥ 10k per function.
- Math is compared vendored vs PancakeSwap:
  - `getSqrtRatioAtTick` over the full tick range at a coarse step plus boundaries and random ticks;
  - `getTickAtSqrtRatio` on random ratios;
  - `maxLiquidityFor*` with amounts up to 2^128;
  - `getToken{0,1}Amount`;
  - `tickToPrice` / `sqrtRatioX96ToPrice` numerator and denominator equality.
- `toSignificant(1..18)` / `toFixed` must produce identical strings.
- Golden calldata equality for mint / increase / decrease (with and without wrap) on random inputs, plus
  `getPoolId` / `decodePoolKey` over the configured pools.

**Back-compat.**

- Steps 1–2 are internal: no public type changes.
- Step 3 changes nominal types. Known consumers (frontend, demo, dapp-kit) keep compiling, because they
  only read `.toSignificant(n)`, `.decimals/.address/.symbol` and pass pool tokens back. Code that
  annotates with PancakeSwap's own classes would break.
- The team has shipped `!` in 2.x minors, so step 3 *could* ride 2.x. It is scheduled in the contract
  window by default.

### Feasibility

**Feasible.**
- Size: ≈ 1.0–1.2K LOC TS, including types.
- All of it is pure functions, which makes property-test equivalence provable.
- Probe B-3 settled the symbol locations and dependency shapes from the PancakeSwap tarballs.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T5.1 | `refactor(sdk): vendor concentrated-liquidity tick and liquidity math` | Step 1 + property tests vs `v3-sdk` (devDependency) | `src/dex/clmm/math/**`, `ConcentratedLiquidityService.ts`, tests | 3 | no | expand-2.x | — | none open |
| T5.2 | `refactor(sdk): vendor Infinity pool-key codecs, calldata encoders and ABI fragments; drop v3-sdk and infinity-sdk` | Step 2 + golden calldata tests; dependency removal; changes the consumer install (−6 nested viem) | `src/dex/clmm/infinity/**`, `shared/abis/pancakeSwapInfinity.abi.ts`, `EvmSolverService.ts:40,45`, `packages/sdk/package.json`, `pnpm-workspace.yaml:78-83` | 3 | no | expand-2.x | T5.1 | #534 / #498 touch `EvmSolverService.ts` (import lines `:16` vs `:40`, auto-mergeable) |
| T5.3 | `feat(sdk)!: replace PancakeSwap Price and Token with ClPrice and ClToken` | Step 3 + demo + docs; frontend needs no change (verify by building it against an rc) | `ConcentratedLiquidityService.ts`, `src/dex/clmm/price.ts`, `packages/types/src/dex/pancakeswap-infinity.ts`, `apps/demo/src/components/dex/*` | 3 | yes (nominal) | contract-3.0 (or 2.x, team call) | T5.2 | — |
| T5.4 | `test(sdk): freeze PancakeSwap equivalence tests into fixtures and drop the devDependencies` | Step 4 | tests, `packages/sdk/package.json`, lockfile | 1 | no | contract-3.0 | T5.3 | — |

---

## T8 · Lighter chain libs (7) — E4.2–E4.4 (B6)

### T8-a ICON over JSON-RPC

- **sdk calls** (`IconSpokeService.ts`):
  - `IconService` + `HttpProvider` are built in the constructor (`:43`) and kept as a **public field**
    `iconService` (`:34`). There is a CJS-interop hack at `:1-3`.
  - Reads:

    | Call | JSON-RPC method | Where |
    | --- | --- | --- |
    | `call(tx).execute()` | `icx_call` | `:129` balanceOf, `:201` multicall `tryAggregate` on `cxa4aa9185e23558cff990f494c1fd2845f6cbf741` |
    | `getBalance(addr).execute()` | `icx_getBalance` | `:146`, `:171` |
    | `getTransactionResult(hash).execute()` | `icx_getTransactionResult` | `:287` (polling loop; every thrown error retries until the deadline) |

  - Builders: `CallTransactionBuilder` + `Converter.toRawTransaction` (`:80-91`, `:238-251`) produce the
    raw tx returned for `raw: true`, and `CallBuilder` (`:116-121`, `:150`, `:196-200`).
  - `estimateStepCost` already uses `fetch` against `debug_estimateStep` (`utils/icon-utils.ts:4-31`).
- **Response shapes and errors.**
  - `icx_call` returns a bare hex string for int returns and an object for `tryAggregate`
    (`{ returnData: [{ success, returnData }] }`).
  - `icx_getBalance` returns a hex string. icon-sdk-js turns it into a BigNumber, and the code calls
    `.toFixed()`.
  - `icx_getTransactionResult` returns hex fields. icon-sdk-js converts `status` to a number (the code
    checks `=== 1`) and `cumulativeStepUsed`/`stepUsed`/`stepPrice` to **BigNumber**
    (`icon-sdk-js@1.5.3 build/data/Formatter/TransactionResult.d.ts`). But `IconTransactionResult`
    declares them `bigint` (`packages/types/src/icon/icon.ts:43-60`), and the code casts
    `as unknown as IconTransactionResult` (`IconSpokeService.ts:289`). So today the receipt's runtime
    shape contradicts its type.
  - JSON-RPC `error` (pending / executing / not-found codes while a tx is in flight) must throw, so the
    retry loop keeps today's semantics. HTTP non-2xx and a malformed `result` must throw with context.
- **Approach.**
  - Add `IconRpcClient` (~90 LOC; `call`, `getBalance` → `bigint`, `getTransactionResult` → mapped to
    the declared types, `estimateStep`) and `buildIcxCallTransaction(...)`, a pure replacement for
    builder + Converter.
  - Golden tests vs icon-sdk-js (devDependency) with an injected clock for `timestamp`, and mocked
    `fetch` for the response and error cases.
  - `iconService` changes type to `IconRpcClient`. No consumer exists in sodax-sdks, sodax-frontend,
    intents-whitelabel or sodax-backend; call it out in the release notes.
  - `icon-sdk-js` leaves the sdk `dependencies`.
- **Wallet side** (shared with cluster C):
  - wallet-sdk-react `IconXService.ts:42-95` uses `call` (`tryAggregate`) and `getBalance`, so it
    switches to the client.
  - wallet-sdk-core `IconWalletProvider.ts`: the browser-extension path uses builders +
    `waitTransactionResult` (`:74-96`), so it switches too. The **private-key path keeps icon-sdk-js**
    (`Wallet.loadPrivateKey`, `SignedTransaction`, `:53,90`) until C's T6 server-only entry. So
    wallet-sdk-core's install only gets lighter after T6.
  - In 2.x there are two copies of the client: the sdk's, and wallet-sdk-core's, which react reuses
    (the sdk doesn't depend on wallet-sdk-core). The 3.0 ICON plugin package hosts one copy.

### T8-b Stellar `/minimal`

- **12 import statements** (`rg` at cc053fef):
  - sdk ×6: `StellarSpokeService.ts:31`, `CustomSorobanServer.ts:8`, `shared-utils.ts:27`,
    `SponsoringService.ts:2`, `sponsoring/internal/horizon.ts:1`, `sponsoring/internal/stellarSponsoredCreate.ts:11`.
  - wallet-sdk-core ×3: `wallet-providers/stellar/{StellarWalletProvider.ts:2,types.ts:2}`,
    `types/library-exports.ts:39` (public `export { Networks }`).
  - wallet-sdk-react ×3: `xchains/stellar/{StellarXService.ts:3 (namespace: Horizon, TransactionBuilder,
    BASE_FEE, Networks), utils.ts:12, CustomSorobanServer.ts:8}`.
- **20 distinct names**: `Account, Address, Asset, Contract, FeeBumpTransaction, Horizon, Keypair, Memo,
  MemoType, Networks, NotFoundError, Operation, TimeoutInfinite, Transaction, TransactionBuilder,
  nativeToScVal, rpc, scValToBigInt, xdr, BASE_FEE`.
- **Probe B-1:** at 15.1.0, all 20 resolve from `@stellar/stellar-sdk/minimal`, both for types
  (`tsc` OK) and at runtime (none missing).
- **Type identity.** stellar-base symbols (`Networks` enum, `Keypair`, `Transaction`…) are the same
  declarations under root and `/minimal` (`minimal/index.d.ts: export * from "@stellar/stellar-base"`).
  So wallet-sdk-core's public `Networks` re-export keeps its identity. `Horizon`/`rpc` are separate
  declaration files under `lib/minimal/`, so the public `StellarSpokeService.server: Horizon.Server` and
  `sorobanServer` (`StellarSpokeService.ts:118-119`) change declaration source. Property access is
  fine (`apps/stellar-sponsor-example` only reads `.serverURL`).
- **Under node10 resolution** (sodax-backend: `moduleResolution: node`, `skipLibCheck: true`), the
  sdk's `.d.ts` imports of `@stellar/stellar-sdk/minimal` resolve to `any`. stellar-sdk has no
  `typesVersions`. The backend uses no Stellar surface, so the effect is benign. A11's attw / consumer
  typecheck gate should cover it.
- **Win and limits.**
  - The win is bundle-only (prebuilt browser bundle 1,004 → 852 KB min, probe 8). The package's
    dependency list is unchanged, so the install doesn't shrink.
  - `/minimal` still includes `StellarToml`. stellar-sdk 15.1.0 depends on `toml ^3.0.0`, affected by
    CVE-2026-63376 (<4.1.2). The repo override `toml: "^4.1.2"` (`pnpm-workspace.yaml:121-124`) does
    not reach consumers. stellar-sdk ≥16 uses `smol-toml` (`npm view`).
  - A stellar-sdk major bump (15 → 16/17) is a separate decision with protocol and API risk. It is not
    folded in here.

### T8-c Solana without Anchor

- **Anchor use.**
  - `entities/solana/utils/utils.ts:4,17-67` covers `getProvider`, `getAssetManagerIdl`,
    `getConnectionIdl` (each runs `Program.fetchIdl`, one RPC round-trip), `getAssetManagerProgram` and
    `getConnectionProgram`.
  - Deposit fetches **2 IDLs** (`SolanaSpokeService.ts:113-114`); `sendMessage` fetches **1** (`:293`).
    Each `getProvider` also opens a new `Connection`.
  - BN is used at `:107,297`.
- **The 3 instructions.**
  - `asset_manager.transfer(amount: u64, to: bytes, data: bytes)` in two account variants: native
    (`:118-139`) and SPL / Token-2022 (`:145-171`).
  - `connection.sendMessage(dstChainId: u128, dstAddress: bytes, payload: bytes)` (`:295-307`).
  - Discriminators are `sha256("global:<snake_name>")[0..8]`. **Probe B-4** computed
    `transfer = [163,52,200,231,140,3,69,186]` and `send_message = [57,40,34,178,189,10,65,26]`, matching
    the vendored IDL types (`entities/solana/types/asset_manager.ts:514-515`, `connection.ts:85-86`).
- **Borsh layout.**
  - Data = discriminator ‖ args in order: `u64` LE 8 bytes, `u128` LE 16 bytes, `bytes` = `u32` LE length
    + raw.
  - Account metas follow IDL order with IDL `writable` / `signer` flags.
  - Anchor 0.30 encodes an optional account passed as `null` (`nativeVaultAccount`, `tokenVaultAccount`,
    `signerTokenAccount`, `mint`, `dapp`) as the **program id**, non-writable and non-signer.
  - `remainingAccounts` are appended (the connection config PDA, `:131-136`).
  - PDAs stay in `pda.ts`. They use `findProgramAddressSync`; the BN-typed `receipt()` helper is unused
    and gets deleted.
- **IDL source and byte-for-byte test plan.**
  1. Fetch the on-chain IDLs once (`anchor idl fetch <programId>` or a script; mainnet programs
     `AnCCJjheynmGqPp6Vgat9DTirGKD4CtQzP8cwTYV8qKH` and the connection program from the chain config).
     Commit them as test fixtures.
  2. Build each instruction twice, once with Anchor (`new Program(fixtureIdl, provider)`, with
     `fetchIdl` mocked) and once with the hand encoder, for native, SPL legacy, Token-2022 and
     `sendMessage`. Assert equal `programId`, `keys` (pubkey, flags, order) and `data`.
  3. Also assert the full serialized v0 tx for `raw: true`.

  The runtime uses the *fetched* IDL, not the vendored type file. Note: the vendored type pins
  `tokenProgram` to the legacy address, while the code passes Token-2022 for xStock mints (`SolanaSpokeService.ts:140-143`).
  So the fixture, not the type file, is the reference.
- **Back-compat.** The 5 Anchor helpers are **public root exports** (`shared/entities/index.ts` →
  `solana/index.ts` → `utils/index.ts`), with zero downstream users (only the dead `apps/node` defines
  its own copy). In 2.x, internal code stops using them; with tsc-unbundled ESM they tree-shake out.
  3.0 deletes them and drops `@coral-xyz/anchor` + `bn.js`.
- **Advisories.** Anchor 0.30.1 also depends on `toml ^3.0.0` (`npm view`). The consumer-side toml
  advisory disappears only once **both** Anchor is gone and stellar-sdk ≥16 is in use, or Stellar is
  opt-in (T1 3.0).

### Feasibility

**Feasible.**
- Stellar is verified by probe B-1, and the Solana discriminators by probe B-4.
- The ICON surface is 3 JSON-RPC methods plus one builder.
- Caveats:
  - toml stays reachable through stellar-sdk 15;
  - icon-sdk-js stays in wallet-sdk-core until C's T6;
  - the Anchor dependency removal is a 3.0 item.

### Sub-issues

T8.1, T8.3 and T8.4 are parallel with each other. Sequence each one before its chain's move (T1.11, T1.9,
T1.8), or after it, but not concurrently.

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T8.1 | `refactor(sdk): ICON reads and raw-tx building over a JSON-RPC client` | T8-a for the sdk; drop icon-sdk-js from sdk dependencies; fix the receipt numeric types | `IconSpokeService.ts`, `utils/icon-utils.ts`, new `IconRpcClient.ts`, tests, `packages/sdk/package.json` | 3 | no² | expand-2.x | — | none open (#488 touches migration, not ICON spoke) |
| T8.2 | `refactor(wallet-sdk-core,wallet-sdk-react): ICON reads over JSON-RPC` | T8-a wallet part; the private-key signing path untouched | `wallet-sdk-react/src/xchains/icon/IconXService.ts`, `wallet-sdk-core/src/wallet-providers/icon/IconWalletProvider.ts` | 2 | no | expand-2.x | T8.1 (client shape); C: T6 for the full icon-sdk-js removal | #95 (wallet files, if still open) |
| T8.3 | `refactor: import @stellar/stellar-sdk from /minimal` | 12 imports across 3 packages, one PR | the 12 files listed in T8-b | 1 | no | expand-2.x | — | none open |
| T8.4 | `refactor(sdk): build Solana transfer and sendMessage instructions without Anchor` | Hand Borsh encoders + IDL fixtures + byte-for-byte tests; remove the `fetchIdl` RPCs; keep the 5 exported helpers (deprecated) | `SolanaSpokeService.ts`, `entities/solana/**`, tests | 3 | no | expand-2.x | — | none open |
| T8.5 | `chore(sdk)!: remove the Anchor helpers and drop @coral-xyz/anchor, bn.js and icon-sdk-js` | Contract cleanup; remove the icon-sdk-js golden-test devDependency (freeze fixtures) | `entities/solana/utils/*`, `packages/sdk/package.json` | 1 | yes | contract-3.0 | T8.1, T8.4 | — |

² `IconSpokeService.iconService` changes type. No known consumer; flag it in the release notes.

---

## T12 · Per-feature entries + createSodaxCore (7) — E3.1 (B4)

### Evidence

- **Service constructors.** All take `{ config, hubProvider, spoke }`:
  - SwapService, BridgeService and LeverageYieldService also take `backendApi` (`SwapService.ts:245-249`,
    `BridgeService.ts:136-140`, `LeverageYieldService.ts:664-668`);
  - MM (`:196-199`), Dex (`DexService.ts:7-10`), Partner (`PartnerService.ts:8-11`), Staking
    (`StakingService.ts:166-169`), Migration (`MigrationService.ts:103-106`) and Recovery
    (`RecoveryService.ts:49-52`) take only the base three;
  - Sponsoring takes `{ config, spoke, api }` (`SponsoringService.ts:128`).
- **The facade** builds the core in `Sodax.ts:46-80` (logger, analytics, fee, apiKey, radfiSigner, merged
  `instanceConfig`, BackendApiService `:66`, ConfigService `:68-77`, EvmHubProvider `:79`, SpokeService
  `:80`) and then every service (`:81-133`).
- **Cross-feature dependencies.** No feature takes another feature *instance*:
  - dex imports a **type** from `swap/EvmSolverService` (`ConcentratedLiquidityService.ts:17`, erased);
  - partner imports the static `SolverApiService` (`PartnerFeeClaimService.ts:9`);
  - leverageYield imports the static `EvmSolverService` + `SolverApiService` (`LeverageYieldService.ts:87-88`);
  - swap, bridge, leverageYield and sponsoring import `backendApi` modules.

  Consequence: `@sodax/sdk/leverage-yield` pulls the `EvmSolverService` / `SolverApiService` modules.
  Until T5.2 that drags infinity-sdk along (`EvmSolverService.ts:40,45`). Until T1.4 it also drags every
  chain codec library, because `EvmSolverService.ts:16` imports `encodeAddress`.
- **What must live in core:**
  - `ConfigService` + the merged config;
  - `BackendApiService` (needed by `ConfigService` for remote config, and by swap, bridge, leverage and
    sponsoring);
  - `EvmHubProvider` and `SpokeService` + `ChainRegistry`;
  - the relay clients: `IntentRelayApiService` (`relayTxAndWaitPacket`) and the MPC relay client
    (#534, both used by `settle`);
  - the EVM shared services: Erc20, Permit2, Erc4626, hub asset manager / vault token;
  - the ABIs used across features, errors, logger, analytics, pure guards, non-codec shared-utils.
- **Exports today**: `.` and `./package.json` only (`packages/sdk/package.json:28-40`).
  `scripts/verify-dist-exports.mjs` walks `exports` generically, so new entries are checked
  automatically. `knip.json` has `entry: ["src/index.ts", …]`, and new entry modules must be added there.

### Approach

1. **`createSodaxCore(options?: SodaxOptions & { plugins?: readonly ChainPlugin[] }): SodaxCore`** in
   `src/core/createSodaxCore.ts`. It is the code extracted from `Sodax.ts:47-80`, plus `ChainRegistry`.

   ```ts
   export type SodaxCore = Readonly<{
     instanceConfig: SodaxConfig; config: ConfigService; backendApi: BackendApiService;
     hubProvider: EvmHubProvider; spoke: SpokeService; registry: ChainRegistry;
   }>;
   ```

   `Sodax`'s constructor becomes `const core = createSodaxCore({ ...options, plugins: options?.plugins ??
   defaultPlugins() })` plus the services, with identical public fields.
2. **Feature entries.** Each feature's existing `index.ts` gains a factory, e.g.
   `createSwapService(core: SodaxCore): SwapService` (= `new SwapService(core)`, since the constructors
   are structural). Optionally, `EvmSolverService` / `SolverApiService` move to `src/shared/intents/`, so
   leverage-yield and partner don't import from `swap/`.
3. **Exports map** (subpaths are ESM-only through the `default` condition, which Node ≥22.12 can still
   `require()`, matching `engines.node >=22.12.0` at `packages/sdk/package.json:41-43`):

   ```jsonc
   "./core":           { "types": "./dist/esm/core/index.d.ts",        "default": "./dist/esm/core/index.js" },
   "./plugin":         { … "./dist/esm/plugin/index.js" },
   "./swap", "./money-market", "./bridge", "./staking", "./migration", "./dex",
   "./partner", "./recovery", "./leverage-yield", "./backend-api", "./sponsoring" (Stellar; moves to chain-stellar in 3.0),
   "./chains/<name>"   (experimental, T1.6)
   ```

   Add `typesVersions` with explicit keys for node10 resolvers. Never use a `*` catch-all, which would
   shadow the root types. The `dist/esm/*` layout is cluster A's T2 decision.

**Is it fully non-breaking in 2.x? Yes**, with one hard condition: the root ESM build must already be
the tsc-unbundled output (cluster A's T2). Otherwise root (tsup bundle) and entries (separate modules)
load two copies of every class and of the config. `isSodaxError` has a structural fallback
(`errors/SodaxError.ts:80-90`), but the duplicated weight and state are real. The CJS twin stays bundled
for `require('@sodax/sdk')`. Mixing root CJS with subpath ESM in one CommonJS process is a documented
"don't".

### Feasibility

**Feasible and additive.** The scope's probe 5 (swap-only source build, 169 KB gzip EVM-only) still
applies. The constructors are unchanged at cc053fef.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T12.1 | `feat(sdk): createSodaxCore; the Sodax facade built on it` | Step 1; `defaultPlugins()`; tests that `Sodax` fields are unchanged | `src/core/**`, `shared/entities/Sodax.ts`, `src/index.ts` | 3 | no | expand-2.x | T1.2 (preferred; can land before with core = all chains if T1.2 waits on the #534 cutoff) | none open (`Sodax.ts` is untouched by open PRs) |
| T12.2 | `feat(sdk): per-feature subpath entries with createX(core) factories` | Steps 2–3; knip entries; size-limit scenarios per entry (A's T11); attw | feature `index.ts` files, `packages/sdk/package.json`, `knip.json` | 3 | no | expand-2.x | T12.1; **A: T2** (hard) | T1.6 (`package.json` exports) |

---

## T20 · Remote config by default (5) — E3.2 (B7)

### Evidence

- **SDK side.**
  - `ConfigService.initialize()` is a no-op (`packages/sdk/src/shared/config/ConfigService.ts:158-185`).
    The fetch, version gate and re-merge are commented out, along with `api`/`userConfig` and the
    `mergeSodaxConfig` import (`:35`, `:84-86`).
  - It was disabled in `ffb3e7e3f` (2026-07-01, #210).
  - `Sodax.initialize()` delegates to it (`Sodax.ts:142-144`).
  - dapp-kit's `SodaxProvider` never calls it (`providers/SodaxProvider.tsx:24`, `new Sodax(config)` only).
    Only the dead `apps/node` calls it.
  - `BackendApiService.getAllConfig()` still targets the **v1** path and type:
    `requestUnvalidated<GetAllConfigApiResponse>('/config/all')` (`BackendApiService.ts:680-681`).
- **Backend side.**
  - `ConfigV2Controller` (`sodax-backend: apps/api/src/api/v2/config/config-v2.controller.ts:75,79-87`)
    returns `{ version: CONFIG_VERSION, config: sodaxConfig }`.
  - Both come from the backend's **installed `@sodax/sdk`**, catalog `2.2.0-rc.8`
    (`sodax-backend: pnpm-workspace.yaml:199`). So the "remote" config is another SDK release's bundled
    config.
  - It is cached forever (`@CacheTTL(0)`). bigint fields are stringified by the global interceptor.
    The wire type is `GetAllConfigResponseV2`, with `SodaxConfigV2` replacing `relay` / `dex` bigint
    fields with strings (`packages/types/src/backend/backendApiV2.ts:840-897`).
- **Live probe B-6** (2026-10-16):

  | URL | Result |
  | --- | --- |
  | `https://api.sodax.com/v2/be/config/all` | 200, `version: 2020008`, keys `chains, swaps, moneyMarket, bridge, dex, leverageYield, hub, api, solver, relay`; 22 chains; 297 KB raw / 74 KB gzip; weak ETag |
  | `/v1/be/config/all` | v1 shape, `version: 27` |
  | `/v1/be/v2/config/all` | 404 |

  Canary is identical.
- **Version gate.** `CONFIG_VERSION` encodes `major*1e6 + minor*1e4 + patch*100 + (rc ?? 99)`
  (`packages/types/src/index.ts:29-33`). The commented gate rejects remote config when
  `response.version < CONFIG_VERSION`. The 2.2.0 stable SDK (2_020_099) would therefore **reject** the
  live config (2_020_008, backend on rc.8), and so would every SDK newer than the backend's pin.

### Approach

1. **Opt-in, 2.x**, by calling `initialize()` as already documented.
   - Add `BackendApiService.getAllConfigV2()` → `GET {v2 base}/be/config/all`. The base needs a v2
     prefix, because `DEFAULT_API_BASE_URL = 'https://api.sodax.com/v1'` (`packages/types/src/common/constants.ts:16`).
   - Validate a minimal valibot schema for the accepted sections.
   - Map `SodaxConfigV2` → `SodaxConfig` (strings → bigint for `relay.relayChainIdMap` and
     `dex.concentratedLiquidityConfig.defaultBitmap`).
   - Apply the version policy (product).
   - Drop chains whose key is unknown to this SDK or has no registered plugin.
   - Re-layer `userConfig` (existing `mergeSodaxConfig`).
   - Rebuild the derived maps atomically (the commented code already does this).
   - Timeout via `AbortSignal`, in-memory cache + ETag, and keep the bundled config on any failure.
2. **dapp-kit** `SodaxProvider` refreshes in the background: render with the bundled config, swap when
   the fetch lands. That is cluster D.
3. **3.0 default-on**. The bundled token lists become an opt-in fallback import
   (`@sodax/types/config-fallback`, which needs A's T14). This is what actually removes token lists from
   bundles.

### What product must decide

1. **Default.** Should remote config be on by default in 3.0? That adds a startup network dependency:
   74 KB gzip, ~1.3–1.8 s observed from here.
2. **Trust boundary.** The payload contains `chains.*.addresses` (asset manager, connection), `relay`
   endpoints and `api` base URLs. Remote values there mean the backend can redirect deposits or API
   traffic. Proposal: allow remote **token lists and display metadata only**, or require a signed config.
3. **Version policy.** Today a client accepts remote only if it is ≥ its own version, so any client
   newer than the backend's pin falls back. Options: accept same major.minor; accept any ≥ minimum;
   or the backend tracks the newest SDK release with an SLA.
4. **Unknown chains or tokens** from a newer backend: drop them (recommended), or fail.
5. **Startup mode**: blocking (`await initialize()`), non-blocking stale-while-revalidate, or explicit
   only. Timeout and retry budget.
6. **Caching**: per instance, or persisted (localStorage / session) with ETag; TTL.
7. **Fallback** on failure: the bundled config (then the bundle keeps the token lists) or an error.
8. **Self-hosted base URLs** (`basePath` / `baseURL` overrides): fetch from the partner's host or from
   SODAX.
9. **SSR / edge**: a module-level cache vs a fetch per request.
10. **Ownership**: who bumps the backend's `@sodax/sdk` pin after each release, and how fast.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T20.1 | `feat(sdk): fetch config v2 in ConfigService.initialize() with version gate, timeout and fallback` | Step 1 (opt-in) | `shared/config/ConfigService.ts`, `backendApi/BackendApiService.ts`, `backendApi/apiConfig.ts`, schemas, tests | 3 | no | expand-2.x | product decisions 2–4; T1.2 (plugin-aware chain filter, optional) | none open |
| T20.2 | `feat(dapp-kit): SodaxProvider refreshes remote config in the background` | Step 2 | `dapp-kit/src/providers/SodaxProvider.tsx` | 1 | no | expand-2.x | T20.1 | cluster D |
| T20.3 | `feat(sdk)!: remote config on by default; bundled token lists become an opt-in fallback` | Step 3 | `ConfigService.ts`, `Sodax.ts`, `@sodax/types` fallback entry | 3 | yes | contract-3.0 | T20.1; A: T14; product decision 1 | — |

---

## T31 (part) · Solana plugin on `@solana/kit` (3, Later) — E4.7

- **Approach.**
  - Inside the extracted `@sodax/chain-solana`, re-implement the spoke on `@solana/kit`: RPC,
    transaction messages, v0 compile.
  - Use Codama-generated clients for `asset_manager` and `connection`, from the IDL fixtures recorded
    in T8.4, plus `@solana-program/{token,token-2022,compute-budget,system}`.
  - Keep the `raw: true` output identical: the base64 serialized v0 tx. Reuse T8.4's byte-for-byte tests.
  - This is plugin-internal per D1. `ISolanaWalletProvider` uses SODAX-owned raw types (`Uint8Array`,
    base64; `packages/types/src/solana/solana.ts:39-53,127-130`), not web3.js types.
  - Wallet side (C): Wallet Standard / `@solana/react`.
- **Dependencies**: `@solana/kit` 8.x (8.5.0 is 3 days old; the 14-day `minimumReleaseAge`,
  `pnpm-workspace.yaml:7`, forces an older 8.x), `@solana-program/*`, and `codama` +
  `@codama/renderers-js` (dev only; generate once, commit). This removes `@solana/web3.js`,
  `@solana/spl-token` and `bn.js` from the plugin.
- **Depends on**: T1.19 (Solana extracted), T8.4. **Size** 13 → B: spoke 5 + codegen and tests 3; C: 3 + 5.

---

## B8 · Chain-specific parts of `@sodax/types` (assumption for A's T14)

- **Keep all chain *types* in `@sodax/types` for 3.0**: keys, the `ChainType` union, per-chain raw-tx,
  receipt and wallet-provider interfaces. They are erased at runtime, and moving them would make core
  depend on plugins. `IWalletProvider`, `TxReturnType` etc. stay unions there. Adding a chain still means
  a types release, which is fine with the lockstep version.
- **Vendored typings.** `near/near-api-js.ts` (170 KB) and `solana/solana-web3.ts` (145 KB) exist only to
  type `RpcTransactionResponse` / `VersionedTransactionResponse` (`near/near.ts:3`,
  `solana/solana.ts:3`). They are not re-exported (`near/index.ts`, `solana/index.ts` export only
  `near.js` / `solana.js`), so they cost `.d.ts` install size and check time, not bundle bytes.
  E4.5 is **re-scoped**: trim them to the used subset under T14. There is no value in moving them into
  plugins.
- **Runtime data.**
  - Plugins read chain config only through `ConfigService.getChainConfig(key)` (kit), never by importing
    `spokeChainConfig` / `sodaxConfig`. Fix the one violation, `entities/solana/utils/utils.ts:79`, in T1.8.
  - Token lists and chain configs stay in `@sodax/types` and reach users through T14's light entries
    (assumed: `@sodax/types/chain-keys` = keys + `getChainType` + guards; a config / fallback entry for
    the token lists).
  - The light runtime helpers per family (`bitcoin/*`: `detectBitcoinAddressType`, `BITCOIN_DUST_SATS`…;
    `sui/*`: `toSui*`) stay in types, behind per-family entries.
- **Ask to cluster A:** make the light entries exist before T1.17–T1.25, so plugin packages import
  `@sodax/types/<light>` and never the root aggregator.

---

## Cross-cluster dependencies

| From | To | Why |
| --- | --- | --- |
| T12.2, T1.6 (B) | **A: T2** (tsc-unbundled ESM) | Root and subpath entries must share module instances |
| T1.17–T1.25 (B) | A: T2, T4 (ESM-only, peers), T14 (light type entries) | Plugin package build, peer ranges, light imports |
| T1.18–T1.26 (B) | **C: T6** (wallet providers into plugin dirs, server-only entry), **C: T3** (react adapters) | `./wallet` and `./react` subpaths of each chain package |
| T1.27 (B) | **D: T13** (dapp-kit per-feature / chain subpaths; 13 chain hook files), **D: T26** (`SodaxProvider` accepts an instance / plugins) | Removing the per-chain getters |
| T1.6 / T1.27 (B) | D: T17 (codemods: `plugins` registration; `@sodax/sdk/chains/x` → `@sodax/chain-x`), D: T16 (skills) | Migration |
| T1.7 (B) | A: E1.4 (`initEccLib` lazy, `BitcoinSpokeService.ts:48`) | Same line; whichever lands second rebases its mental model (merge, not rebase) |
| A: T15 (polyfill-free core) | T1.4 (B) | Codec `Buffer` uses (`shared-utils.ts:167-252`) leave core. What remains: `SpokeService.ts:600`, `selectSolvedIntentPacket.ts:13,16` |
| A: T11 (CI gates) | T12.2, T1.6 (B) | Size scenarios "EVM-only `createSodaxCore` + swap" and "`Sodax` facade" measure the T1, T5 and T8 wins |
| D: T18 (lifecycle, #529/#531/#532) | #534 + T1.3 (B) | After #534 the hook point is `spoke.settle`, not `relayTxAndWaitPacket`. MPC statuses (`pending/submitted/attested/minted/swept`, withdrawal `submitted/burned/attested/released/failed`) need step maps too |
| D: T19 (error model) | T1.2 (B) | New `CHAIN_NOT_ENABLED` code in `errors/codes.ts` |
| C: T8.2 / T6 | T8.1 (B) | Shared ICON JSON-RPC client shape; private-key signing stays on icon-sdk-js until T6 |
| D: T20.2 | T20.1 (B) | Background refresh in `SodaxProvider` |

---

## Corrections to `plan-v3-scope.md` (stale or wrong at cc053fef)

1. **E4.4 "drops anchor, its high `toml` advisory".** Not on its own.
   - `@stellar/stellar-sdk@15.1.0` also depends on `toml ^3.0.0` (CVE-2026-63376, <4.1.2; `npm view`).
   - The repo's `toml: "^4.1.2"` override (`pnpm-workspace.yaml:121-124`) doesn't reach consumers.
   - The advisory leaves consumer installs only when Anchor is gone **and** stellar-sdk is ≥16
     (smol-toml) or Stellar is an opt-in plugin.
2. **E4.4 "2 `Program.fetchIdl` RPC calls per deposit".** That count is right for deposit
   (`SolanaSpokeService.ts:113-114`), but `sendMessage` adds 1 more (`:293`). The 5 Anchor helpers are
   **public root exports**, so dropping the dependency is a contract-phase item. Only the internal use
   can go in 2.x.
3. **Probe 8 / E4.3 "exports all 11 names SODAX imports".** The sdk, wallet-sdk-core and wallet-sdk-react
   now import **20** names across 12 files. Re-probed: all 20 resolve from `/minimal` (probe B-1).
   `/minimal` doesn't change the install footprint (same package dependencies).
4. **E4.1 "sodax-frontend calls `toSignificant` at 7 sites".** Now **12 call sites in 7 files** (the 7
   was probably a file count). The sdk exports no `Price`/`Token` by name; they surface via `PoolData`,
   `ClPositionInfo`, `EnrichedToken`, `TokenWithConversion` and the `priceToTick` params. Only `v3-sdk` +
   `infinity-sdk` carry viem, so the install win doesn't need the `Price`/`Token` break.
5. **E3.1 "Feature dependencies are only backendApi, plus swap from leverageYield / dex / partner".** No
   feature takes another feature instance. The swap dependencies are a type (dex) and two **static helper
   classes** (`SolverApiService`, `EvmSolverService`). Note that `EvmSolverService.ts:45` evaluates a
   PancakeSwap ABI at module load.
6. **E2.1 contract** (`type, createSpoke, codec, rawTxSchema`) is incomplete.
   - It needs a **settlement mode** (#534/#497/#498 MPC relay) and **key-level claims** (Monad is chain
     type EVM with its own spoke).
   - It needs **`encodeRecipient`** and capability hooks for the 10 chain-specific branches left in
     `SpokeService`.
   - `rawTxSchema` belongs in `swaps-api/src/rawTxSchemas.ts`, not in the plugin.
7. **E2.6 "Port Tron (PR 372)".** #372 was closed on 2026-10-16 and superseded by **#534**, which also
   supersedes #388. XRP (#497) and Monad (#498) are additional MPC chains the scope didn't list. Aleo
   (#95) adds a 43 MB WASM dependency.
8. **D1 / E2.4.** sdk 2.x cannot default-register chains that live in separate packages: turbo rejects
   the cycle (probe B-2). 2.x keeps them under `packages/sdk/src/chains/`.
9. **The plugin option can't be named `chains`.** `SodaxDefaultConfig.chains` exists
   (`packages/types/src/sodax-config/sodax-config.ts:153`), and the backend uses `new Sodax({ chains })`
   for chain config.
10. **E4.6 line refs.** `SpokeService.ts:600` (not `:602`); `selectSolvedIntentPacket.ts:13,16` is
    correct.
11. **E2.2 line refs and counts.**
    - Eager construction is `SpokeService.ts:146-155` (ctor `:143`); `getSpokeService` `:158` is correct.
    - Full dispatcher counts add `verifyTxHash` 12, `buildApproveTxs` 4, `estimateGas` 2 and
      `waitForTxReceipt` 1 (87 total).
    - `spoke.bitcoin` 20 and `spoke.stellar` 1 are correct.
    - The plan did not count the **13 dapp-kit hook files** and intents-whitelabel's `getSpokeService`
      use. They make the 2.x getters mandatory.
12. **E3.2.**
    - The SDK's `getAllConfig` still targets the v1 path and type (`BackendApiService.ts:680-681`).
    - The v2 config is live at `/v2/be/config/all`, not under the SDK's `/v1` base.
    - The commented version gate would reject it for any SDK newer than the backend's pinned 2.2.0-rc.8.
    - The decision is not only "startup network dependency"; it also includes the trust boundary (remote
      addresses and URLs).
13. **E4.2.** `IconSpokeService.iconService` is a public field, and the icon-sdk-js receipt is BigNumber
    at runtime while `IconTransactionResult` says `bigint`. Both are handled in T8.1.

---

## Probes run

| # | Command (in `scratchpad/agent-B/`) | Result |
| --- | --- | --- |
| B-1 | `npm i --ignore-scripts @stellar/stellar-sdk@15.1.0 typescript@5.8.3`; `tsc` on a file importing the 20 names (+ namespace) from `@stellar/stellar-sdk/minimal`; `node -e` import check | `TYPECHECK OK`; missing at runtime: `[]` |
| B-2 | npm workspace with `@probe/sdk` → dependency `@probe/chain-solana`, which has peer + devDependency `@probe/sdk`; `npx turbo@2.5.8 run build --dry=text` | `Invalid package dependency graph: Cyclic dependency detected`. With peer-only (no devDependency) turbo is silent, but the plugin then cannot build against the workspace sdk |
| B-3 | `npm pack @pancakeswap/{swap-sdk-core@1.6.0,v3-sdk@3.10.0,infinity-sdk@1.0.8}` + read dist; lockfile snapshots at cc053fef | swap-sdk-core has no viem (deps: @solana/web3.js 1.98.4, big.js, bn.js, decimal.js-light, toformat, tiny-*); `Price`/`Fraction` have private members; vendor set ≈ 350 (math) + 280 (infinity) + 200 (`Price`/`Token`) + ~120 (ABI fragments) lines |
| B-4 | `node -e` sha256(`global:transfer` / `global:send_message`)[0..8] | `163,52,200,231,140,3,69,186` / `57,40,34,178,189,10,65,26`, equal to the vendored IDL types |
| B-5 | `npm pack icon-sdk-js@1.5.3`; read `build/data/Formatter/TransactionResult.d.ts` | `cumulativeStepUsed`/`stepUsed`/`stepPrice: BigNumber`, which contradicts `IconTransactionResult` |
| B-6 | `curl` GET on `api.sodax.com` / `canary-api.sodax.com` config endpoints (read-only) | `/v2/be/config/all` 200, version 2020008, 297 KB / 74 KB gzip; `/v1/be/config/all` version 27 (v1 shape); `/v1/be/v2/config/all` 404 |
| B-7 | `npm view` for toml usage, Solana Kit versions | stellar-sdk 15.1.0 `toml ^3.0.0`, ≥16.0.0 `smol-toml ^1.6.1`; anchor 0.30.1 `toml ^3.0.0`; `@solana/kit` 8.5.0 (2026-10-13) |
