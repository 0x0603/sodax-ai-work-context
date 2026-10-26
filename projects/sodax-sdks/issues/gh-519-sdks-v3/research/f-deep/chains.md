---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, chains]
---

# Chains — deep dive (feasibility, complexity, benefit)

1. sdk-1 is feasible. What remains is design work: the plugin contract the code needs is larger than the earlier draft (in-flight PRs add three capabilities), and four placement decisions are open (Tron, Monad, Sponsoring, how the registry is keyed).
2. Measured gain for sdk-1 alone, on an EVM-only `new Sodax()`: bundle 1,261 → 433 KB gzip; install −291 MB third-party plus 13 MB `@sodax/libs`; 39 of 47 advisories removed; Node CJS import ~680–860 → ~300 ms (two sessions). The install and advisory win reaches only apps that do not also install the SODAX wallet packages: `wallet-sdk-core` depends on almost the same chain libraries, so with them sdk-1 alone saves 4.8 MB and 0 advisories.
3. A React dapp built on `wallet-sdk-react` root gains almost nothing from sdk-1 alone (2,924 → 2,819 KB gzip, React and TanStack Query left external). The big win (→ 962 KB) needs sdk-1 + wsc-3 + wsr-1 together.
4. intents-whitelabel and backend swaps-api/bridge-api need every chain, so they get migration work, not size. sodax-frontend uses 4 of the 8 non-EVM chain types (Solana, Sui, Stellar, ICON). It gains about nothing from sdk-1 alone. With sdk-1 + wsc-3 + wsr-1 its bundle drops 2,936 → 1,809 KB gzip (React and TanStack Query bundled; 2,924 → 1,796 with them external, as in line 3). With sdk-1 + wsc-3 + wsr-2 its install drops by at least 267 MB (wallet-sdk-react depends on the dropped chains' libraries too).
5. wsc-3 is a 3.0 change: it needs sdk-1's chain packages and breaks `wallet-sdk-core` imports. Moving the files has no size win of its own; the folding step reverses two documented dependency rules; a slim `wallet-sdk-core` reaches the same install win without that reversal.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| sdk-1 | Feasible with caveats / Code-traced (benefit Proven) | C5 | B4 | 3.0 (registry + boundary in 2.x) | Large measured bundle, install and advisory win for EVM-only apps that do not use the SODAX wallet packages. It touches every chain's deposit/settle routing, four in-flight chain PRs and downstream construction sites |
| wsc-3 | Feasible with caveats / Code-traced | C4 | B2 (B3 with sdk-1 + wsr-1) | 3.0 | Mechanical move once chain packages exist. Most of its size value can also come from per-chain subpaths. The fold into the sdk is a dependency-direction decision |

Probe scope, read before using numbers:
- **Bundles:** esbuild 0.25.12 over the T2 probe dist (`sodax-sdks-t2probe`, ESM unbundled, lazy ECC), browser, minify, gzip. Stubbed modules simply vanish, and no replacement code (registry, kit) is counted. In the P1 dapp-kit columns React and TanStack Query are external (`EXTERNAL_RE='^(react|react-dom|@tanstack/)'`); in the P2 frontend rows they are bundled.
- **Installs:** npm 11.6.0, `--ignore-scripts --before=2026-10-05`, third-party packages only, at the pins on main. `@sodax/*` 2.2.0 is newer than the cutoff, so our own packages are left out.
- **Node:** timings are for the CJS `dist/index.cjs` that sodax-backend loads. Chain libraries are stubbed with a `Module._load` proxy.
- **Re-run drift (traced in verification):** the P1 dapp-kit columns (1,263 / 434 / 304 and 2,924 / 2,819 / 962 / 828) were measured with React and TanStack Query external. Re-running with the `EXTERNAL_RE` above reproduces all 8 values exactly. Without it the dapp entry gives 2,936 / 2,828 / 973 (+3 packages, about +12 KB gzip), which is the scope of the P2 rows. `new Sodax()` and swap-only import no React, so they reproduce either way (1,261 / 433 / 1,211 / 381). [verified: `wf-verify-chains/bundle/p1-dapp-drift-rerun.txt`, `p1-rerun.txt`]

## sdk-1 · Non-EVM chains as opt-in packages
**Bullet:** "Keep the Sonic hub and EVM support in core. Make non-EVM chains opt-in @sodax/chain-<name> packages, with @sodax/chains-all for full-chain integrations"  ·  **T-ids:** T1.1–T1.30 (plus T12, T2 for the entries)

### Today

**Dependency leaks.** Core imports chain libraries or chain code, which blocks the size gain.
- **20 non-test sdk files import a non-EVM chain library.** [verified: `rg -l "from '(@stellar/stellar-sdk|icon-sdk-js|@solana/…|near-api-js…)'" packages/sdk/src -g '!*.test.ts'`] Libraries involved:
  - `@stellar/stellar-sdk` (6 files)
  - `@solana/web3.js` (4)
  - `@mysten/sui` (4)
  - `@sodax/libs` (3)
  - `bitcoinjs-lib`, `bn.js` and `@injectivelabs/*` (2 each)
  - icon-sdk-js, anchor, spl-token, secp256k1, cosmjs-types and near-api-js (1 each)
- **Only 8 core files reach into the 34 chain-specific modules.** [verified: `scratchpad/deep-chains/scripts/import-graph.mjs`] They make 16 re-export edges, 10 value imports and 3 type-only imports:
  1. `SpokeService.ts:30-39` imports 8 spoke classes, and `:146-155` constructs them eagerly.
  2. `shared-utils.ts:10` imports `btc-utils` (bitcoinjs), and `:25-28` import Sui bcs, Solana `PublicKey`, Stellar `Address/xdr` and Stacks `Cl`, all for the codecs (`encodeAddress :152`, `encodeTokenIdentifier :199`, `reverseEncodeAddress :213`).
  3. `Sodax.ts:19,128-132` imports and eagerly builds `SponsoringService`, which reaches `@stellar/stellar-sdk` through `sponsoring/internal/horizon.ts:1` and `stellarSponsoredCreate.ts:3`.
  4. Barrels: `index.ts` re-exports sponsoring; `shared/entities/index.ts` re-exports 5 chain entity dirs; `spoke/index.ts` re-exports 9 chain modules; `shared/utils/index.ts` re-exports `stacks-utils`.
  5. `guards.ts:4-8` makes one type-only import from `entities/icon`.
- **No chain module imports a feature, error or backendApi module.** [verified: rg over the spoke and entity files] The exception is `sponsoring/*`, which imports 7 error and backendApi modules.
- **`BitcoinSpokeService.ts:48` calls `initEccLib` at module level.** [verified] It is lazy in the T2 probe.

**Knowledge leaks.** Code branches on chain key or type with pure guards and no library import. These stay in core; they do not block size.
- 45 guard calls across 7 feature files [verified: `rg -c "\bis(Bitcoin|…|Near)(ChainKey|ChainKeyType|WalletProviderType)\("`]: MM 13, Swap 9, Bridge 7, Migration 6, LY 6, Staking 2, AssetService 2.
- `guards.ts` imports only viem, `@sodax/types` and that one ICON type. [verified]

**What core calls on non-EVM spokes.** This is the base for the plugin contract.

| Category | Count (command) | Where |
| --- | --- | --- |
| Dispatch switches | **9** `switch` statements, **66** non-EVM case arms [verified: `rg -n "switch \("`, `rg -c "case '(INJECTIVE\|ICON\|SUI\|SOLANA\|STELLAR\|STACKS\|BITCOIN\|NEAR)'"` on `SpokeService.ts`] | `getSpokeService :165`, `estimateGas :507`, `resolveSimulationEncoding :636`, `deposit :720`, `getDeposit :843`, `getWalletBalance :910`, `getWalletBalances :981`, `sendMessage :1071`, `waitForTxReceipt :1290` |
| Other `this.<chain>` refs in `SpokeService` | 85 total: 66 in switch arms, 8 in the constructor, **11** capability branches [verified: `scripts/spoke-refs.mjs`] | Stellar trustline `:234,:431`; Bitcoin effective address `:1053,:1167`; NEAR limits `:1197,:1215`; `verifyTxHash` for Solana, NEAR, Stellar, Sui, Stacks (`:1235-1257`; Solana is lenient, the rest strict) |
| Codecs | 3 functions with 8+3+8 non-EVM arms; **26 call sites in 15 files** [verified: `rg -n "\b(encodeAddress\|reverseEncodeAddress\|encodeTokenIdentifier)\(" -g '!*.test.ts'`] | Includes `EvmHubProvider.ts:78` and `SwapService.ts:2013` (reverse) |
| Settlement | **24** `relayTxAndWaitPacket(` call sites in 8 files (rg finds 25 lines in 9 files; one is the definition at `IntentRelayApiService.ts:515`) [verified: rg] | Split-tx is hard-coded at `IntentRelayApiService.ts:523-524` (Solana, Bitcoin). There is no `settle()` on main; #534 adds it and routes 6 sites (MM 4, swap 1, bridge 1) |
| `spoke.bitcoin.*` from features | **20** code sites in 4 files (MM 9, Swap 5, Bridge 4, LY 2), plus 1 error string at `RadfiProvider.ts:661` [verified: `rg -o "spoke\.bitcoin\.[a-zA-Z.]+"`] | By method: `getEffectiveWalletAddress` 9, `radfi.ensureRadfiAccessToken` 5, `walletMode` reads 4, `getOnDemandRelayIdentity` 2 |
| Stellar via Sponsoring | 1 accessor, `SponsoringService.ts:135` (`spoke.stellar.server`), plus 2 internals that import stellar-sdk | The facade builds it eagerly (`Sodax.ts:128-132`) |
| Radfi signer | `ConfigService.ts:76,122,147,154`; `Sodax.ts:62,76`; read at `BitcoinSpokeService.ts:93-94` [verified] | sodax-backend reads `sodax.config.radfiSigner` at `sodax-backend@985959e9:apps/bridge-api/src/api/bridge/bridge.service.ts:352` and `apps/swaps-api/src/api/swaps/swaps.service.ts:487` |
| Hard-coded chains in the intent relay | 1 site, `IntentRelayApiService.ts:523` | #95 adds Aleo to it |

**Plugin kit surface.** These are the non-chain sdk modules that chain modules import. [verified: `scripts/kit-surface.mjs`] 15 modules, 42 names when `sponsoring/` counts as a chain module; 7 modules, 23 names for the spoke, entity and util chain modules alone (same script with `^sponsoring/` dropped from its chain set). The 7:
- `ConfigService` (type, 8 importers; 9 with Sponsoring);
- 8 spoke param types;
- `balance-utils` (3 names);
- from `shared-utils`: `sleep`, `BigIntToHex`, `hexToBigInt`, `parseToStroops`, `encodeAddress`;
- `RelayExtraData`, `OnDemandRelayData`, `RateLimitConfig`;
- 3 ICON wallet guards.

`errors/*` and `backendApi/*` (7 modules) and the `SpokeService` type are imported only by `sponsoring/`; they make up the other 8 of the 15.

**Publish and consumer surface.**
- **47 root exports come from chain modules** [verified: `scripts/chain-exports.mjs`]. Examples: `SolanaSpokeService`, `RadfiProvider`, `getAssetManagerProgram`, `SponsoringService`.
- **Downstream imports of those names:**
  - `intents-whitelabel@5e1fbba:src/lib/stellar-utils.ts:1` imports one type (`StellarSpokeService`) and calls `getSpokeService(...)` at `:24-26`.
  - sodax-frontend `1b915ec7` has 0 imports.
  - sodax-backend `985959e9` has 0 imports; it only compares the string `'RadfiApiError'`.
- **Package boundary today:** `packages/sdk/package.json` exports only `.` and `./package.json`, and lists every chain library as a direct dependency. [verified]

**What limits users today.**
- Every `new Sodax()` ships and loads every chain (measurements below).
- `npm i @sodax/sdk` installs every chain library and its advisories.
- A new chain lands in core for everyone. Aleo (#95) adds `@provablehq/sdk` to `packages/sdk/package.json`.

### Change

**From:** `SpokeService` holds 10 eager fields and 9 switches, with codecs as all-chain free functions.

**To:** a `ChainRegistry` of plugins, with 3.0 packages around it.
- **Registry.** Hub and EVM are built in. Each plugin supplies:
  - a spoke service (the 7 dispatched methods: `estimateGas`, `deposit`, `getDeposit`, `getWalletBalance`, `getWalletBalances`, `sendMessage`, `waitForTransactionReceipt`);
  - a pure codec (`encodeAddress`, optional `decodeAddress`, `encodeToken`, `encodeRecipient`);
  - a settlement descriptor;
  - capabilities.
- **Capabilities the code needs:**
  1. `allowance` (Stellar);
  2. `simulationEncoding` (ICON, Sui);
  3. `verifyTxHash` (5 chains);
  4. `resolveSrcAddress` (Bitcoin, 9 + 2 sites);
  5. `prepareSigner` (Radfi auth, 5 sites);
  6. a wallet-mode / skip-simulation hint (Bitcoin `walletMode`, 4 sites);
  7. `outboundRelayIdentity` (Bitcoin, 2 sites);
  8. `rateLimits` (NEAR);
  9. MPC settlement (Tron, XRP, Monad);
  10. **new: `depositSimulation: false`** for MPC chains (the #534/#497/#498 deposit arms skip `verifyDepositSimulation`);
  11. **new: `destinationReadiness`** (XRP `checkDestination`, called before the hub burn, #497).
- **Shared code stays in the kit**, not inside any one plugin: the MPC relay REST client (`MpcRelayApiService` free functions, used by Tron, XRP and Monad) and `mpc-message`.
- **3.0 layout:**
  - `@sodax/chain-<name>` exports `.` (plugin), `./wallet` and `./server`, with `@sodax/sdk` as an optional peer;
  - `@sodax/chains-all`;
  - `new Sodax()` registers hub + EVM only;
  - typed access through declaration merging.

Client before and after:

```ts
// 2.x today
const sodax = new Sodax();
// 3.0
import { solanaPlugin } from '@sodax/chain-solana';
const sodax = new Sodax({ plugins: [solanaPlugin()] }); // or allChainPlugins() from @sodax/chains-all
```

The option should not be called `chains`: that key already means per-chain config (`packages/types/src/sodax-config/sodax-config.ts:153`). [verified] `SodaxProvider` passes `config` straight into `new Sodax(config)` (`dapp-kit/src/providers/SodaxProvider.tsx:24`). `SodaxOptions` lives in `@sodax/types` (`sodax-config.ts:142`), which has no plugin type (the contract would live in the sdk), so `plugins` needs its own prop or dk-6's instance prop. [verified, plus judgement]

### Feasibility — Feasible with caveats · Code-traced (benefit Proven)

**Proven:**
- **The 2.x package cycle is real.** turbo 2.9.14 (the version installed in the repo) reports `Cyclic dependency detected` both when the chain package devDepends on the sdk and when it only peers on it. [verified: `scratchpad/deep-chains/cycle-{devdep,peeronly}`; re-run in verification with the same result. Scope: a two-package npm-workspaces probe, not the repo's pnpm workspace] Separate chain packages that the 2.x sdk registers by default therefore need either a third kit package or the 3.0 flip.
- **The benefit numbers** are measured (see Benefit).

**Code-traced:** every dependency leak above maps onto one of the seams (registry, codec, capability, settlement, or Sponsoring as a Stellar capability or lazy getter). No prototype of the registry exists.

**In-flight PRs checked against the contract** (`gh pr diff`, 2026-10-19):

| PR | State | Fit |
| --- | --- | --- |
| #534 Tron (gcranju) | Open, mergeable, updated 2026-10-18 | **Fits with changes.** Adds chain type `TRON`, a viem-only `TronSpokeService` that implements `waitForDeposit`/`waitForWithdrawal`, `SpokeService.settle()` + `getMpcRelayService`, `encodeRecipient`, and a TRON deposit arm without simulation. `sendMessage` throws on `raw`. The contract needs the settlement descriptor, the simulation policy and `encodeRecipient` |
| #497 XRP | Draft, stale since 2026-10-01, carries an old Tron copy | **Fits with changes.** Same MPC memo shape, but adds `checkDestination`, which MoneyMarketService calls before the hub burns funds (diff lines ~1840-1855). The earlier contract has no such hook, and dropping it would lose a fund-safety check |
| #498 Monad | Draft, stacked on #497 | **Fits with changes.** Chain type is EVM; it puts `isMonadChainKeyType` inside the EVM arms of 6 methods plus `settle`. `MonadSpokeService` has no `getWalletBalance(s)` and relies on falling back to the EVM spoke. A key-level registry needs fallback rules (recommend: none; the plugin delegates) |
| #95 Aleo | Open, last commit 2026-03-02, base `fd4f450d` | **Fits with changes.** Intent relay with split-tx; adds itself to `IntentRelayApiService.ts:523`; codec decode throws; lazy `import('@provablehq/sdk')`, but a hard sdk dependency. It is stale: no `getWalletBalance(s)` arms |

None of them breaks the contract. Each needs one contract feature beyond the 7-method interface.

**Open decisions:**

1. **Tron: core or plugin?**
   - Measured weight is small: #534's `TronSpokeService` + `tron-utils` = 9.3 KB min / ~3.9 KB gzip, plus the shared MPC client 2.8 KB min. [verified: `scripts/minsize.mjs` on the PR files]
   - *Core.* Pros: no package, no opt-in. Cons: breaks the user's chain-type rule; every viem-implementable chain then lands in core (XRP's sdk side is viem-only too, and ICON could qualify after sdk-5); the MPC path is not exercised through the plugin seam.
   - **Recommend: plugin.** Register it by default in 2.x, because #534 merges before the registry. [judgement]
2. **Registry keyed by chain type or by chain key?**
   - *Type.* Pros: simple, matches `getChainType`. Cons: Monad does not fit.
   - *Key, then type (hybrid).* Pros: Monad and future EVM-MPC chains fit. Cons: needs fallback rules.
   - **Recommend: hybrid, fail-closed.** A key-level plugin must implement the full interface. A per-method fallback could send a Monad deposit down the EVM asset-manager path. [judgement]
   - *Monad itself:* by the chain-type rule it belongs in core as a key-level built-in (EVM type, viem-only). The earlier plan made it opt-in. Needs a decision.
3. **Separate packages in 2.x or 3.0?**
   - *(a)* 2.x registry and in-package `src/chains/<name>`; extract in 3.0. Earlier plan.
   - *(b)* 2.x packages via a new kit package (7 modules, or 15 if Sponsoring moves wholesale and brings `errors/*` and `backendApi/*`). Still no install win in 2.x, because the sdk depends on every chain.
   - *(c)* 2.x registry only; move files once, in 3.0.
   - **Recommend (a), or (c) if the team wants fewer PRs.** The install win is 3.0-only under every option, because 2.x must keep installing every chain. [judgement, mechanics verified]
4. **Sponsoring.**
   - Move it whole into the Stellar plugin (the kit then grows by `errors/*`, `backendApi/*` and the `SpokeService` type: 8 modules), or
   - keep it in core and delegate the stellar-sdk parts to a Stellar capability. [judgement]

### Complexity — C5

**Why C5:** it changes the architecture across several packages: a kit, ~9–13 chain packages and `chains-all`. It breaks downstream code at:
- backend: 3 `new Sodax(` sites (`sodax-backend@985959e9`: `apps/bridge-api/src/shared/providers/sodax.provider.ts:108`, `apps/swaps-api/src/shared/providers/sodax.provider.ts:120`, `apps/task-executor/src/config/task-executor-config.service.ts:36`) plus 2 `config.radfiSigner` reads;
- frontend: `useStellarTrustlineCheck`, 2 files; plus 1 `SodaxProvider` site (`apps/web/providers/wallet-providers.tsx:10`) that must register 4 plugins;
- whitelabel: 7 Bitcoin/Radfi hooks; plus 2 construction sites (`src/lib/sodax.ts:12`, `src/providers/app-providers.tsx:56`).

It also rewires `deposit`, `sendMessage` and `settle` for every chain, which are paths that move user funds. [verified counts; level is judgement]

**PR breakdown.** LOC are judgements from the counted sites.

*2.x (non-breaking):*
1. ADR: contract, kit, keying, Tron/Monad/Sponsoring placement. Docs only.
2. Registry, lazy spokes, collapse the 9 switches (66 arms), `CHAIN_NOT_ENABLED`. ~+350/−700 LOC, sdk.
3. Capabilities and settlement: 11 `SpokeService` branches, split-tx, MPC simulation policy, readiness hook. ~400 LOC.
4. Codecs through the registry: 26 sites in 15 files, plus `EvmHubProvider`. ~300 LOC.
5. Boundary gate and barrels: 18 feature files' import lines, 16 re-export edges. ~250 LOC.
6. `plugins` option, `defaultPlugins()`, experimental `chains/*` entries (needs sdk-2/sdk-6). ~150 LOC.
7. Per-chain moves ×9, including Tron: mostly `git mv` of 34 files. The Bitcoin PR also carries the 20 feature sites (~400 LOC).

*3.0 (breaking):*

8. Package scaffold and release wiring (`bump-versions.sh:7`, `sdks-publish.yml:30,72`; npm token must be able to create packages).
9. Extract each chain into its package (×9 plus in-flight chains), paired with wsc-3.
10. Default flip, remove getters, typed registry, plus dapp-kit's 13 chain-hook files.
11. `chains-all`.
12. Remove transitional entries and dependencies.
13. Fold `@sodax/libs`.

**Tests:** 13 chain-specific test files (8,935 LOC) move with their chains, and 3 Sponsoring tests (1,761 LOC) follow the Sponsoring decision [verified: `find src -name '*.test.ts'` filtered to the chain-set paths, `xargs cat | wc -l`]. 12 more test files (18,245 LOC: `SpokeService`, MM, Swap, Bridge, LY, Migration, migration-guards, Recovery, IntentRelay, shared-utils, speed-tier, e2e) reference non-EVM chain keys, guards or spoke fields [verified: `rg -l "is(Bitcoin|…|Near)|spoke\.(bitcoin|…)|(BITCOIN|…)_MAINNET" -g '*.test.ts'`]. How many of those need edits is a judgement. An earlier count (17 files / 23,707 LOC) could not be reproduced.

**Docs and skills:** 26 unique source pages show `new Sodax(` with non-EVM use (skills 13, docs 6, sdk docs 6, wallet-react docs 1; 5 more are generated mirrors). The add-chain and add-wallet-provider dev skills (319 lines) need a rewrite. [319 lines verified; the 26 is a first-pass count whose non-EVM filter was not recorded and was not reproduced. `rg -l "new Sodax\("` finds 28 / 76 / 21 / 1 pages in those four places before any filter]

**Apps:** one `SodaxProvider` each in demo, playground, stellar-sponsor-example and example-next-js-16; one `new Sodax()` in node-cjs, which also uses `sdk.spoke.sui.transport`; playground has one more in `chains.test.ts`. [verified: `rg -n "new Sodax\(|<SodaxProvider" apps -g '!*.md'`, with comment hits removed by reading]

**Earlier estimate:** the T1.1–T1.30 rows sum to 70 pts (23 rows in `plan-v3-subissues.md`, summed with awk). That looks ~5–10 pts low for the contract gaps found here (readiness hook, simulation policy, Monad placement, Sponsoring kit). Docs, codemod and downstream work are tracked under T16, T17 and W8. [derived/judgement]

**Coordinate with:**
- #534 first (gcranju);
- #497, #498, #95 (authors);
- the user's #509, #511, #512, #523, which touch the Swap, Bridge and LY files holding the Bitcoin sites.

**Top risks:**
1. Silent mis-routing of funds through registry fallback, or an MPC chain falling through to the intent relay. Mitigate: fail closed, plus #534's `MpcRelayChainMap` assertion.
2. Merge churn on `SpokeService.ts` and `shared-utils.ts` with the in-flight chain PRs.

### Benefit — B4

**P1, EVM-only browser app** [verified, esbuild probes; `scratchpad/deep-chains/bundle/p1-*.txt`]:

| Scenario (gzip) | `new Sodax()` | swap-only (T12) | dapp-kit hooks only | dapp-kit + wallet-sdk-react root |
| --- | --: | --: | --: | --: |
| T2 today | 1,261 | 1,211 | 1,263 | 2,924 |
| sdk-1: chain libs stubbed where the sdk imports them | **433** | 381 | 434 | **2,819** |
| … and the sdk's own chain modules (69 KB min) removed | 414 | 364 | — | — |
| sdk-1 + sdk-4 (PancakeSwap) | 303 | 248 | 304 | — |
| sdk-1 + wsc-3 + wsr-1 (wallet libs scoped out too) | — | — | — | **962** (828 with PancakeSwap) |

- sdk-1 alone is −828 KB (−66%) for apps without the SODAX wallet layer. [derived: 1,261 − 433]
- With `SodaxWalletProvider` it is −105 KB (−4%). [derived]
- `@pancakeswap/swap-sdk-core` imports `@solana/web3.js` and `bn.js` [verified: `scripts/who-imports.mjs`]. Keeping PancakeSwap keeps ~81 KB gzip of Solana code in EVM bundles (433 with scoped stubs vs 352 with global stubs), and keeping only swap-sdk-core still costs 394 vs 303. [derived] So "no non-EVM code in EVM bundles" needs sdk-4.

**Install** (`npm i`, third-party, pinned versions; `scratchpad/deep-chains/npm/install-results.tsv`):
- All sdk third-party deps: **407 packages / 755.1 MB / 34 vulnerable packages / 47 unique advisories**. [verified] The published `@sodax/sdk` install was 412 / 778 MB / 35, which calibrates this.
- Scope: these install numbers reach apps that install `@sodax/sdk` alone or with dapp-kit, which depends only on the sdk and viem. An app that also installs `@sodax/wallet-sdk-react` keeps the other chain libraries through `wallet-sdk-core`. Of the sdk's chain libraries, only `@coral-xyz/anchor` and `bn.js` are not `wallet-sdk-core` deps, and `bn.js` still arrives through `@solana/web3.js`. So for an EVM-only app on the SODAX wallet packages, sdk-1 alone saves 14 packages / 4.8 MB and 0 advisories (sdk + wallet-sdk-core third-party deps: 484 / 854.6 MB with anchor, 470 / 849.8 MB without; the frontend case is under P2). [verified: `packages/dapp-kit/package.json`, `packages/wallet-sdk-core/package.json`; install `wf-verify-chains/npm/union-all-no-anchor`]
- Chains removed, PancakeSwap kept: 179 / 464.2 MB / 20 / 8. So sdk-1 removes **228 packages, 290.9 MB, 14 vulnerable packages and 39 advisories**:
  - 36 axios advisories, because `@stellar/stellar-sdk@15.1.0` pins `axios` exactly at 1.15.0 (vulnerable range 1.0.0–1.19.0; npm reports the fix as stellar-sdk 17.2.1, a major bump);
  - 2 toml;
  - 1 elliptic. [verified: `scripts/audit-ids.mjs`]
- Add **13.2 MB** for `@sodax/libs` 2.2.0 (`npm view dist.unpackedSize` = 13,199,009 bytes, decimal MB; the `du` figures are MiB, so it is ≈12.6 on their scale). Total ≈ 304 MB of 778 MB (39%). [derived]
- Per chain:

  | Chain | Alone: pkgs / MB / vulnerable pkgs | Marginal MB (all − leave-one-out) |
  | --- | --- | --: |
  | Solana | 104 / 70.1 / 9 | 28.6 (PancakeSwap shares its deps) |
  | Sui | 21 / 46.0 / 0 | 13.1 |
  | Stellar | 57 / 30.2 / 3 | 22.0 |
  | ICON | 105 / 46.9 / 7 | 42.2 |
  | Injective | 116 / 176.8 / 7 | 160.2 |
  | Bitcoin | 12 / 15.2 / 0 | 10.7 |
  | NEAR | 66 / 9.1 / 0 | 4.5 |
  | Stacks (`@sodax/libs`) | 1 / 13.2 / 0 | 13.2 |

  The marginals sum to 281.3 MB (+13.2). The chains together are 290.9 MB; the 10 MB gap is deps shared between chains. [derived]
- sdk-1 + sdk-4: 15 packages / 56.7 MB / 2 vulnerable (`ws` via the `viem@2.29.2` pin). [verified]

**P2, multi-chain React app** (sodax-frontend `1b915ec7`, intents-whitelabel `5e1fbba`):

Which chains each app enables. `SodaxWalletConfig` slots that are left out are not mounted (`wallet-sdk-react/src/types/config.ts:188`, `chainRegistry.ts:410-411`). [verified] The sdk side has no way to switch a chain off today: both apps' `chains` config only overrides RPCs (whitelabel also sets the Bitcoin Radfi options).

| App | Wallet slots mounted | Chains the UI offers | Non-EVM chain types it needs |
| --- | --- | --- | --- |
| intents-whitelabel | all 9 chain types (`src/providers/wallet-provider.tsx:16-68`) | Home chains Sonic, NEAR, Stacks, Bitcoin, Kaia (`src/providers/chain-provider.tsx:10-16`); any source chain (`sodax.config.getSupportedSpokeChains()` minus RedBelly: `src/components/assets/deposit-dialog.tsx:74-75`, `src/lib/utils.ts:69,79-80`); Bitcoin Radfi config at `src/lib/sodax-config.ts:21-31` | **8 of 8** |
| sodax-frontend | EVM, SOLANA, SUI, STELLAR, ICON, INJECTIVE (`apps/web/providers/constants.ts:114-138`) | `availableChains`: 15 = 11 EVM + Solana, Sui, Stellar, ICON (`apps/web/constants/chains.ts:44-92`; count: `sed -n '44,92p' \| grep -c "id: "`). Swap tokens are filtered to that list (`app/(apps)/swap/_hooks/useSwapTokens.ts:48`). The Injective wallet group is commented out (`components/shared/wallet-modal/wallet-modal.tsx:48-52`). Bitcoin swap signing throws by design (`lib/swaps-api-sign.ts:128-137`). Its own direct chain dependencies are exactly those four libraries (`apps/web/package.json`) | **4 of 8** (Solana, Sui, Stellar, ICON) |

[verified: `git show origin/main:<path>` in each repo]

- **intents-whitelabel** needs `chains-all`. No bundle or install change. [derived from the table] It pays migration at 2 construction sites (`src/lib/sodax.ts:12` `new Sodax(config)`, `src/providers/app-providers.tsx:56` `SodaxProvider`) plus the Bitcoin/Radfi hooks listed under Complexity.
- **sodax-frontend** could register 4 plugins and drop Injective, Bitcoin, NEAR and Stacks. Measured with `wf-finish-chains/scripts/measure-subset.mjs` (the same script with the stubbed set narrowed to those 4 chains' libraries, `NONEVM_RE` / `WALLETLIBS_RE`). Entry: the P1 dapp entry (4 dapp-kit hooks + 4 wallet-sdk-react exports), not the frontend's own imports. React and TanStack Query are bundled in these rows; with them external, as in the P1 table, the first three rows are 2,924 / 2,903 / 1,796. [verified, same run, `wf-finish-chains/p2-frontend-subset.txt`; both scopes re-run in `wf-verify-chains/bundle/p2-fe-subset-rerun.txt`]

  | Frontend-shaped scenario (gzip KB) | Size | Δ vs today |
  | --- | --: | --: |
  | Today (dapp-kit + wallet-sdk-react root) | 2,936 | — |
  | sdk-1 alone, frontend subset | 2,916 | −20 (−0.7%) |
  | sdk-1 + wsc-3 + wsr-1, frontend subset | **1,809** | **−1,127 (−38%)** |
  | (for scale) same, no non-EVM chain at all | 973 | −1,963 |
  | `new Sodax()` alone, frontend subset | 1,033 vs 1,261 | −228 (−18%) |

  [derived: 2,936 − 1,809 = 1,127; 1,127 / 2,936 = 38%]
  Most of the combined drop is `@sodax/libs` (Injective + Stacks, 3.2 MB minified) and `@injectivelabs/*`, which today reach the bundle through wallet-sdk-core and wallet-sdk-react, not the sdk. [verified: `top:` lines in the output]
- **Install, frontend subset** (third-party, npm 11.6.0, `--ignore-scripts --before=2026-10-05`; `wf-finish-chains/npm/`, `scripts/install-union.sh`):

  | Set | All chains | Frontend subset | Δ |
  | --- | --- | --- | --- |
  | sdk deps only | 407 pkgs / 755.1 MB / 34 vuln pkgs / 47 advisories | 329 / 586.2 MB / 28 / 47 | −78 / −168.9 MB / −6 / 0 |
  | sdk + wallet-sdk-core deps | 484 / 854.6 MB / 40 / 52 | 334 / 587.1 MB / 28 / 47 | **−150 / −267.4 MB / −12 / −5** |

  [verified: `du -sk node_modules`, `npm audit --json`, `audit-ids.mjs`; derived: 875,068 − 601,208 = 273,860 KB = 267.4 MB]
  - sdk-1 alone gives the frontend **0 MB**: every library it drops (`@injectivelabs/sdk-ts`, `@injectivelabs/networks`, `cosmjs-types`, `bitcoinjs-lib`, `@bitcoinerlab/secp256k1`, `near-api-js`, `@sodax/libs`) is also a direct dependency of `wallet-sdk-core` with the same range (`packages/wallet-sdk-core/package.json`). [verified: package.json; the 0 MB is derived, assuming the package manager dedupes equal ranges]
  - The 5 advisories are axios@0.21.4, reached through `@injectivelabs/wallet-core → wallet-base → eip1193-provider → @json-rpc-tools/provider`. [verified: `npm ls axios@0.21.4`] The other 47 stay, because the frontend keeps Stellar (axios 1.15.0 pin; toml), Solana (toml via anchor) and ICON (elliptic via icon-sdk-js). [verified: `npm ls`]
  - Not counted: `@sodax/libs` (13.2 MB) and wallet-sdk-react's own direct deps on the dropped chains (`@injectivelabs/sdk-ts`, `@injectivelabs/wallet-*`, `@hot-labs/near-connect`, `near-api-js`, `sats-connect`, `@sodax/libs`; `packages/wallet-sdk-react/package.json`). [verified] While wallet-sdk-react keeps those as hard dependencies, the frontend still installs them, so the 267 MB needs wsr-2 (optional connector peers) as well. With wsr-2 it is a lower bound. [derived + judgement]
- Both apps pay migration: plugin registration and chain-hook subpaths.
- **Effect on the score:** P2 is now a real, measured beneficiary through one app, but only when sdk-1 ships with wsc-3 + wsr-1 (bundle) and wsr-2 (install). B4 stands; it rests on P1 and on what sdk-1 unblocks. [judgement]

**P3, Node server** (CJS `require` + `new Sodax()`, median of 7 warm runs) [verified: `scratchpad/deep-chains/node/p3-cjs-results.txt`]:

| Mode | Time | RSS | Heap |
| --- | --: | --: | --: |
| As-is | 861 ms | 212 MB | 107 MB |
| Chains stubbed | **303 ms** | 136 MB | 48 MB |
| PancakeSwap stubbed | 561 ms | 195 MB | 95 MB |
| Both | 197 ms | 93 MB | 27 MB |

- Re-run in verification (same dist and script, 3 sets of 7 warm runs, load average ~3): as-is 683–702 ms / 206–207 MB RSS; chains stubbed 299–303 ms / 133–134 MB; heap 107 → 48 MB as above. The stubbed time reproduces; the as-is time is load-sensitive, so the saving is ~0.4–0.56 s. [verified: `wf-verify-chains/node/p3-rerun.txt`]
- The ESM path via loader hooks shows RSS 304–315 → 210 MB. Its timings are too noisy to use (1.4–3.7 s).
- In sodax-backend, swaps-api and bridge-api build raw transactions for any source chain (`raw: true` sites), so they need `chains-all` and gain nothing. task-executor uses only `hubProvider`, the relay config and relay helpers (`getIntentRelayChainId`, `getTransactionPackets`, `HttpRelayError`), so it gains about −0.4 to −0.56 s and −73 to −76 MB RSS per process. [derived from the two P3 sessions]
- It costs the backend 3 `new Sodax` edits. The 2 `config.radfiSigner` reads keep working if the Radfi signer stays on `ConfigService`. [judgement]

**P4, API-only:** unaffected. They do not install the sdk.

**P5, maintainers:**
- Fewer advisories to triage on the sdk.
- New chains stop landing in everyone's install.
- Cost: ~10 more packages in the lockstep release, and more release lists to keep in sync.

**P6, AI agents:** about 26 pages to update (first-pass count, see Complexity). Generated guidance must show `plugins`.

**What it unblocks:** wsc-3, wsr-1's install win, dk-1 chain subpaths, the payoff of sdk-6 (swap-only alone: 1,261 → 1,211), and x-2 budgets.

**Not B5:** it does not gate most non-size bullets. Of the three known integrators, only sodax-frontend gets a size win, and only together with wsc-3 + wsr-1.

### Recommendation
3.0 for the packages and the default flip. In 2.x, build the registry, the capability seams and the boundary gate after #534 merges.

Corrected wording: "Keep the Sonic hub and EVM chains in core. Make every other chain type an opt-in @sodax/chain-<name> plugin, with @sodax/chains-all for full-chain integrations".

This keeps the user's rule and rejects the first pass's "viem-based chains in core".

### Corrections to earlier research
- **`b-sdk-core-chains.md` probe B-2:** "peer-only is silent". With turbo 2.9.14, peer-only also fails with a cycle.
- **First pass, revised sdk-1 wording "viem-based chains in core":**
  - This would put Tron and XRP in core (XRP's sdk side is viem-only too, per #497).
  - The rule would also shift as sdk-5 replaces libraries.
  - Measured Tron weight is ~4 KB gzip, so weight is not a reason either way.
- **B1 contract draft is incomplete.** It is missing:
  - XRP `checkDestination` (fund safety);
  - the MPC deposit-simulation skip;
  - Bitcoin `walletMode` reads (4 sites);
  - Sponsoring placement;
  - the Radfi config passthrough.
- **First pass, Corrections table** ("MPC REST client goes in the plugin kit" → "TronSpokeService implements settlement itself"): both are true. The spoke implements `MpcRelaySettlement`, but the REST client is free functions shared by Tron, XRP and Monad, so it still belongs in the kit.
- **The exit criterion "EVM-only bundle has no non-EVM chain code"** (T1 draft) cannot hold while PancakeSwap's swap-sdk-core stays: it imports `@solana/web3.js`. [verified: `who-imports.mjs`; probe 394 vs 303 KB gzip]
- **The 2.x install win is zero under every layout option**, not just the in-package one.
- **Earlier draft of this report:** "the three known downstream apps are all-chain integrators". sodax-frontend mounts 6 wallet chain types and its UI offers only 4 non-EVM chain types (Solana, Sui, Stellar, ICON). intents-whitelabel and the backend APIs are all-chain.

## wsc-3 · Signers into chain packages; base + EVM into `@sodax/sdk/wallet`
**Bullet:** "Move non-EVM signers into the chain packages and fold the shared base and EVM signers into @sodax/sdk/wallet, with a migration shim"  ·  **T-ids:** T6.5.*, T6.7 (prep: T6.1–T6.4)

### Today

**Layout.**
- `packages/wallet-sdk-core` exports only `.`, has `sideEffects: false`, and has 21 dependencies: viem, `@sodax/types`, `@sodax/libs`, and 18 non-EVM chain or wallet libraries, including `secp256k1@5` (a native addon, `gypfile: true`), ecpair and bip322-js. [verified: `package.json`]
- tsup inlines `near-api-js` and `@sodax/types` (`tsup.config.ts:14`). [verified]
- Source LOC [verified: wc]:

  | Part | LOC |
  | --- | --: |
  | EVM | 385 |
  | Base + utils + types | 138 |
  | Bitcoin | 276 |
  | ICON | 378 |
  | Injective | 355 |
  | NEAR | 168 |
  | Solana | 280 |
  | Stacks | 240 |
  | Stellar | 303 |
  | Sui | 273 |
  | Non-EVM total | 2,273 |
  | Tests (10 files) | 2,825 |

  All non-test source is 2,796 LOC (`find src -name '*.ts' ! -name '*.test.ts' | xargs cat | wc -l`), so base + utils + types = 2,796 − 385 − 2,273 = 138. [derived]

- The root exports **47 runtime names** [verified: esbuild metafile on the dist]: 9 provider classes, ~25 guards, `Networks` (Stellar), `PostConditionMode` (Stacks), `getEvmViemChain` / `hyper` / `robinhoodChain`, and more. It also re-exports chain-library types (`types/library-exports.ts`).

**Install** (third-party, pinned, `scratchpad/deep-chains/npm-wsc/install-results.tsv`):
- Everything: 396 packages / 493.2 MB / 30 vulnerable packages / 51 advisories.
- viem only (base + EVM): 12 / 54.5 MB / 2.
- The non-EVM signer libraries account for **384 packages / 438.7 MB / 28 vulnerable packages**. [derived]

**Who imports it.** [verified: rg and `git grep`]
- In-repo:
  - wallet-sdk-react, 13 files: 9 provider classes or their `*Defaults` types, plus `isIconAddress`;
  - `apps/node`, 19 files (dead code);
  - `apps/node-cjs`, 1;
  - `apps/example-next-js-16`, 1.
- Downstream source imports: **0 / 0 / 0** (frontend `1b915ec7`, whitelabel `5e1fbba`, backend `985959e9`). Whitelabel still declares the package at `package.json:26`, version 2.0.0-rc.12.
- Docs and skills: 45 docs pages and 49 skills pages mention it. The wallet-sdk-core skill is 54 files / 4,659 lines.

**Dependency rules.**
- `AGENTS.md:47-49`: the sdk depends on types, swaps-api and bridge-api (no wallet package); wallet-sdk-core on types; wallet-sdk-react on types + wallet-sdk-core.
- `AGENTS.md:53`: "If a change seems to need a reverse dependency, stop".
- `packages/sdk/AGENTS.md:15`: wallet "Implementations live outside this package".
- No `instanceof` checks on wallet providers in sdk, dapp-kit or wallet-sdk-react, so providers are structural. [verified: rg]

**Today's limit.** wallet-sdk-react's `chainRegistry.ts:1-42` statically imports every chain's XService and connectors and constructs 5 signer classes (`:274-397`). Any root import therefore pulls every chain, whichever package the signers live in. [verified]

### Change

**From:** one `@sodax/wallet-sdk-core` with every signer.

**To:**
- `@sodax/chain-<name>/wallet` holds the browser signer, and `./server` the private-key signer (after wsc-1).
- `@sodax/sdk/wallet` (and `/wallet/server`) holds `BaseWalletProvider`, the EVM signer and the guards.
- `@sodax/wallet-sdk-core@3` becomes a shim: it re-exports all 47 runtime names and the types from those places, so it depends on the sdk **and on every chain package**.
- wallet-sdk-react imports `@sodax/sdk/wallet` (new sdk peer), with `chain-*` as optional peers.

Client imports:

```ts
// before
import { EvmWalletProvider, SolanaWalletProvider } from '@sodax/wallet-sdk-core';
// after
import { EvmWalletProvider } from '@sodax/sdk/wallet';
import { SolanaWalletProvider } from '@sodax/chain-solana/wallet';
```

### Feasibility — Feasible with caveats · Code-traced

**No cycle** in 3.0: sdk ← chain-* (peer); wallet-sdk-react → sdk, chain-*; shim → sdk + chain-*. [derived from the 3.0 graph] It requires:
- sdk-1's packages;
- sdk-2 + sdk-6, so that `@sodax/sdk/wallet` does not pull in the facade. This needs an isolation gate like `check-privy-isolation`.

Under the recommended sdk-1 plan it is not additive in 2.x, because the chain packages appear only in 3.0. [judgement]

**Caveats:**
1. It reverses two written rules (`AGENTS.md:47-49,53`; `sdk/AGENTS.md:15`).
2. API-only React apps would install the sdk. `apps/swap-api-example` depends on swaps-api, types and wallet-sdk-react, but not the sdk. [verified] With the 3.0 slim sdk plus sdk-4 that is under ~10 MB: the sdk core deps (15 packages / 56.7 MB) add ~2 MB beyond viem (54.5 MB), which wallet-sdk-react already installs, and `@sodax/sdk` 2.2.0 itself is 5.3 MB unpacked (`npm view`). With PancakeSwap still in, it is ~408 MB more (464.2 − 56.7). Without sdk-1 it is the full install. [derived from `npm/install-results.tsv` and `npm-wsc/install-results.tsv`]
3. The shim keeps the full install weight. [derived]

**Alternative to decide:** keep a slim `wallet-sdk-core` (base + EVM, viem only, 54.5 MB with viem, which the app already has).
- Same install win.
- No direction change.
- No EVM shim needed.
- Providers are structural, so a version skew between it and the sdk is harmless at runtime. [verified no `instanceof`; judgement]

### Complexity — C4

**Why C4:** it refactors across packages, is a 3.0 break that needs a shim and a codemod, and has many doc call sites. It is not C5: no downstream source imports wallet-sdk-core, and the signer logic does not change. [judgement]

**PRs** (all 3.0, after sdk-1's scaffold and wsc-1):
1. Per chain ×8 (+Tron): move `wallet-providers/<chain>` (2,273 LOC + 9 test files) into `chain-<name>/src/wallet`. Same PR as sdk-1's extraction for that chain.
2. Fold base + EVM (~523 LOC) into `sdk/wallet`, plus the isolation gate.
3. The shim (47 runtime re-exports plus library re-exports).
4. wallet-sdk-react: 13 files plus `package.json` peers, plus AGENTS.md edits.
5. Skills and docs: 49 + 45 pages, plus codemod import rewrites.

**Earlier estimate:** 15 pts (T6.5.* 12 + T6.7 3). Code-wise it looks plausible; skills and docs (T16) and the shim design (+1–2) are extra. [judgement]

**Risks:**
1. `sdk/wallet` drags the facade into API-only bundles if the gate is missing.
2. The shim hides the win from anyone who does not migrate imports.

### Benefit — B2

**Standalone ≈ 0 size for every persona.**
- wallet-sdk-react root still imports every chain signer (`chainRegistry.ts`).
- The per-chain size win can also come from T6.1 subpaths with optional peers, without moving packages. [judgement backed by code]

**Its own value:**
- P2 gets one install axis per chain (`npm i @sodax/chain-solana` brings spoke and signer libraries) instead of declaring optional peer ranges twice.
- P5 drops one EVM chain-definition copy (`getEvmViemChain` exists in both the sdk and wallet-sdk-core).

**Combined with sdk-1 + wsr-1 (+ wsr-2):**
- P1 React dapp bundle: 2,924 → 962 KB gzip. [verified probe, scoped stubs; upper bound, because wallet-sdk-core's dist still inlines near-api-js and types]
- P1 install: wallet-sdk-core's non-EVM signer libraries are 438.7 MB on their own. For the sdk and wallet-sdk-core third-party deps together, the drop is 854.6 → 464.2 MB (−390 MB, PancakeSwap kept, wallet-sdk-react's own deps not counted). [derived: `wf-finish-chains/npm` `union-all` vs `deep-chains/npm` `core-pancake`, which already includes viem]
- P2 sodax-frontend (4 of 8 non-EVM chain types): bundle 2,936 → 1,809 KB gzip (with wsr-1), and sdk + wallet-sdk-core install −267.4 MB and −5 advisories (with wsr-2). Without wsc-3 (or the slim-core alternative) the frontend's sdk-1 install gain is 0 MB, because wallet-sdk-core depends on every library sdk-1 drops. [verified probes; see sdk-1 Benefit, P2] This is wsc-3's largest measured value for a known app. Under the slim-core alternative the same gain needs per-chain wallet subpaths with optional peers. [judgement]

**P3 signing servers:** EVM-only servers that install wallet-sdk-core without the sdk stop installing non-EVM signer libraries (same 438.7 MB). sodax-backend does not use wallet-sdk-core.

**P4 with React:** cost of +sdk install under the fold option.

**P6:** the wallet-sdk-core skill (54 files) must be restructured.

### Recommendation
3.0, paired per chain with sdk-1's extraction.

Recommended wording: "Move non-EVM signers into the chain packages and slim @sodax/wallet-sdk-core down to the shared base and EVM signers".

If the team keeps the fold, add an isolation gate for `@sodax/sdk/wallet` and update the two AGENTS.md rules.

### Corrections to earlier research
- **`plan-v3-packages.md` §4.2**, "chain packages … two [peers] that must stay aligned": wallet providers are structural (no `instanceof` anywhere), so a version skew is harmless at runtime, and lockstep releases already align versions.
- **First pass:** wsc-3 also reverses `packages/sdk/AGENTS.md:15`, not only root `AGENTS.md`.
- **Same section:** "No downstream repo imports wallet-sdk-core (0/0/0)" is correct. Whitelabel still declares it as a dependency.
- **The win attributed to moving signers needs wsr-1.** Without it, `chainRegistry.ts` keeps every signer in the bundle.

## Dependencies between these bullets
- **sdk-1 needs:**
  - #534 merged (pre-v3 #541);
  - sdk-2 (unbundled ESM; lazy `initEccLib`), for any 2.x bundle win and the subpath entries;
  - sdk-6 (`createSodaxCore`, `./plugin`, `./wallet` entries);
  - sdk-3 (ESM-only/peers) for the package scaffold;
  - x-1 (light `@sodax/types` entries) before the packages import types;
  - x-5 (release lists) for the new packages.
- **sdk-1 + sdk-4:** the "no non-EVM code in EVM bundles" goal needs PancakeSwap's swap-sdk-core gone. It pulls `@solana/web3.js`, worth 81–91 KB gzip.
- **sdk-1 → dk-1** (13 dapp-kit chain hooks move to chain subpaths), **dk-6** (`SodaxProvider` takes `plugins` or an instance), **x-3** (codemod: register plugins; 47 export moves), **x-2** (EVM-only bundle budget), **sk-*/x-3** (26 doc pages, add-chain skill).
- **sdk-5** (ICON/Stellar/Solana lighter libraries) shrinks the opt-in plugins. The Stellar `axios` advisories leave EVM installs only through sdk-1 or a stellar-sdk ≥17.2.1 bump.
- **sdk-9 / #543** (remote config): config can carry chains with no plugin. That is harmless if the registry fails closed with `CHAIN_NOT_ENABLED`.
- **wsc-3 needs:** sdk-1's packages, wsc-1 (`./server`), sdk-2 + sdk-6 (isolated `sdk/wallet`). Its size value needs **wsr-1** (opt-in adapters) and **wsr-2** (optional connector peers).
- **wsc-3 ↔ api-1/api-2:** API-only React apps install the sdk under the fold option.
- **dk-2 lifecycle:** after #534 the hook point is `spoke.settle`. 18 `relayTxAndWaitPacket` sites remain outside it.

## Not verified
- **The frontend's real bundle:** the P2 frontend rows use the 8-export P1 dapp entry with the frontend's chain subset, not the frontend's own imports or its Next.js build.
- **wallet-sdk-react's own dependencies** in the P2 install numbers: only sdk and wallet-sdk-core third-party deps were installed.
- **Probes after 2026-10-19 ~19:20:** the `sodax-sdks-t2probe` and `sodax-sdks-v3feas` worktrees were removed during verification. Re-running any bundle or Node probe needs them recreated (a worktree, so ask the user); code citations can still be read with `git -C sodax-sdks show 0181a053:<path>`.
- **ESM import timings:** loader-hook noise. Only RSS is usable.
- **A registry prototype:** none was built, so the LOC per PR are judgements.
- **Tron/XRP/Monad/Aleo behaviour inside a real registry:** only their diffs were read.
- **Install of `@sodax/*` packages themselves** (newer than `--before`): only the third-party deps were measured. `@sodax/libs` comes from `npm view`.
- **Bundle numbers count stubbed code as zero.** The kit and registry code that sdk-1 would add is not counted.
- **The npm token's ability to create new `@sodax/*` packages:** not checked.

## Resume notes
Scratch root: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-chains/`

**Scripts** (`scripts/`):

| Script | What it does |
| --- | --- |
| `measure-chains.mjs` | Bundles with modes `chains-scoped`, `chains-global`, `pancake`, `pancake-keep-core`, `chain-modules`, `wsc-scoped`, `wsr-scoped`, `wallet-global`, `bignumber`; env `EXTERNAL_RE` |
| `who-imports.mjs` | Shows who imports a package after stubbing |
| `p3-cjs.cjs` + `p3-runner.sh` | CJS import timing (`STUB=none\|chains\|pancake\|both`) |
| `esm-stub-hooks.mjs` + `esm-register.mjs` + `p3-esm.mjs` + `p3-esm-runner.sh` | ESM import timing via loader hooks |
| `install-groups.sh` | sdk third-party install groups |
| `install-wsc.sh` | wallet-sdk-core install groups |
| `audit-ids.mjs`, `audit-list.mjs` | Advisory attribution |
| `import-graph.mjs` | Core → chain module imports |
| `kit-surface.mjs` | Plugin-kit surface |
| `spoke-refs.mjs` | Chain refs in `SpokeService` |
| `chain-exports.mjs`, `dist-exports.mjs` | Export lists |
| `minsize.mjs` | Minified size of PR files |

**Outputs:**
- `bundle/p1-results.txt`, `bundle/p1-dapp-results.txt`, `bundle/p1-dappkit-results.txt`
- `node/p3-cjs-results.txt`, `node/p3-esm-results*.txt`
- `npm/install-results.tsv` and `npm/*/audit.json`
- `npm-wsc/install-results.tsv` and `npm-wsc/*/audit.json`
- `prs/pr{534,497,498,95}.diff` and `prs/pr534-files/`
- `cycle-{devdep,peeronly}/`
- `chain-exports.json`

esbuild path: `/Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks-t2probe/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild` (gone since the t2probe worktree was removed on 2026-10-19). For the P1 dapp-kit columns set `EXTERNAL_RE='^(react|react-dom|@tanstack/)'`.

Second scratch root (P2 subsets, 2026-10-19): `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-chains/`
- `scripts/measure-subset.mjs`: `measure-chains.mjs` plus `NONEVM_RE` / `WALLETLIBS_RE` env overrides for chain-subset runs.
- `scripts/install-union.sh`: sdk + wallet-sdk-core third-party install, all chains vs the frontend subset.
- Outputs: `p2-frontend-subset.txt`, `npm/results.tsv`, `npm/{fe-subset,wsc-fe-subset,union-all,union-fe}/audit.json`.
- Subset regexes (reconstructed; they reproduce the recorded rows exactly): `NONEVM_RE='^(@injectivelabs/|bitcoinjs-lib|@bitcoinerlab/|@sodax/libs|cosmjs-types|near-api-js|@near-js/)'`, `WALLETLIBS_RE='^(@hot-labs/|sats-connect|ecpair|bip322-js|secp256k1)'`.

Third scratch root (verification, 2026-10-19): `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-chains/`
- `scripts/measure-dump.mjs` (`measure-subset.mjs` plus `DUMP=<file>` for the per-package byte map), `scripts/kit-surface-nosponsor.mjs`.
- Outputs: `bundle/p1-rerun.txt`, `bundle/p1-dapp-drift-rerun.txt` (the drift trace), `bundle/p2-fe-subset-rerun.txt`, `bundle/*.json` package dumps, `node/p3-rerun.txt`, `npm/union-all-no-anchor/` (sdk + wallet-sdk-core deps without anchor and bn.js), `import-graph.txt`, `test-union.txt`, `test-feature.txt`, `cycle-{devdep,peeronly}/`.

**sdk-1 next steps:**
1. Done: P2 chain subsets (frontend 4 of 8 non-EVM types, whitelabel 8 of 8), measured above.
2. Optional: prototype the registry on a throwaway copy to firm up PR LOC. This needs a worktree, so ask the user first.
3. Optional: bundle the frontend's real import set instead of the P1 dapp entry.

**wsc-3 next steps:**
1. Measure the slim-wallet-core alternative's bundle once T6.1 subpaths exist. Today the wallet-sdk-core dist is a single file, so import stubbing cannot separate its non-EVM code.
2. Optional: count the codemod import rewrites in the wallet-sdk-core skill: `rg -c "@sodax/wallet-sdk-core" packages/skills`.

## Verification (2026-10-19)

Adversarial pass over the whole report, including the finisher's P2 additions. Code at `0181a053`; consumers at frontend `1b915ec7`, whitelabel `5e1fbba`, backend `985959e9`. Scratch: `wf-verify-chains/`.

**What I checked**
- **Citations:** 74 path:line citations opened (55 sdk, 19 consumer via `git show`). 73 match. One is off by one: `AGENTS.md:48-50` should be `47-49`, because the sdk rule is line 47.
- **Bundles, re-run with the same scripts and dists:** 19 recorded values, and all reproduce exactly once the scope is right:
  - `new Sodax()`: 1,261 / 433 / 352 / 303;
  - swap-only: 1,211 / 381;
  - dapp-kit only: 1,263 / 434 / 304;
  - dapp entry: 2,924 / 2,819 / 962 / 828, and 2,936 / 2,828 / 973;
  - frontend subset: 2,916 / 1,809 / 1,033, with the reconstructed subset regexes.
- **Installs and advisories:** checked 30 MB and package values and 8 advisory counts from `du`, the lockfiles, `npm audit` and `audit-ids.mjs`. The MiB conversions and differences all hold. `npm ls` traced the axios@0.21.4, toml and elliptic paths. One new install ran in scratch: sdk + wallet-sdk-core deps without anchor and bn.js.
- **Node CJS:** 3 sets of 7 warm runs.
- **Code and consumer counts:** 40 rechecked with rg, find or wc. Examples: 20 importing files, the 34/8/16/10/3 import graph, 9 switches with 66 arms, 85 refs, 26/15 codec sites, 20 `spoke.bitcoin` sites, 45 guard calls, the kit surface, 47 + 47 exports, wsc LOC, T1 = 70 and T6.5/T6.7 = 15 pts, #534's 6 settle sites, 15 `availableChains`, 7 whitelabel hooks, and 3 + 2 backend sites.
- **Also re-run:** the turbo cycle probes on a scratch copy (both still cycle) and the PR metadata via `gh pr view`.
- **Scores:** checked against the rubric. Both C ratings match their PR breakdowns. No breaking step is timed 2.x. sdk-1's B4 has a stated prerequisite role. wsc-3's 3.0 timing matches its shim break.

**What I changed, and why**
1. **Drift traced.** The P1 dapp-kit columns were measured with React and TanStack Query external. `EXTERNAL_RE='^(react|react-dom|@tanstack/)'` reproduces all 8 values; without it the 2,936-scope numbers appear. I labelled the scope in Probe scope, summary lines 3–4 and the P2 table, and added the P2 rows in the P1 scope (2,924 / 2,903 / 1,796).
2. **sdk-1 install scope.** The −291 MB / −39 advisories reach only apps that install the sdk without the SODAX wallet packages, since `wallet-sdk-core` lists every sdk chain library except anchor and bn.js. With the wallet packages, sdk-1 alone saves 14 packages / 4.8 MB and 0 advisories (measured). Edited summary line 2, the table "Why" and the P1 install bullets.
3. **Node timing.** The as-is time did not reproduce: 683–702 ms against the recorded 861. The stubbed time did reproduce (299–303 ms). Summary line 2 and the task-executor saving are now ranges.
4. **Count fixes:**
   - `relayTxAndWaitPacket`: 8 files, not 9 (the 9th holds the definition).
   - Sponsoring imports 7 error/backendApi modules, not 6.
   - The kit is 7 modules / 23 names without Sponsoring and 15 / 42 with it. Option (b) had double-counted `errors/*`.
   - wallet-sdk-core base + utils + types is 138 LOC, not 168, so the fold is ~523 LOC.
   - App construction sites: demo has 1 code site, not 2; example-next-js-16 was missing.
   - Tests: the earlier 17 files / 23,707 LOC could not be reproduced. Replaced with 13 + 3 + 12 files and the commands.
5. **Explanations:**
   - The 47 frontend advisories stay through Solana's toml and ICON's elliptic as well as Stellar.
   - wsc-3 caveat 2: "a few MB" is now "under ~10 MB", which holds only with sdk-4 (the `@sodax/sdk` package itself is 5.3 MB); with PancakeSwap it is ~408 MB more.
   - wsc-3 P1 install: for sdk + wallet-sdk-core together the drop is −390 MB, not 438.7 MB.
   - `@sodax/libs` 13.2 MB is decimal (≈12.6 MiB).
6. **Absolutes** reworded or tagged: "cannot be called `chains`", "cannot type plugin objects", "Not possible additively in 2.x", "feasible in 3.0 only", "cannot be simulated". The PancakeSwap "cannot hold" stays, now tagged with its probe.
7. **Added evidence:**
   - whitelabel's source-chain list (`deposit-dialog.tsx:74-75`, `utils.ts:69,79-80`);
   - the frontend's direct chain deps, exactly the 4 kept chains (`apps/web/package.json`);
   - whitelabel's Radfi chain options;
   - the task-executor imports;
   - the cycle-probe scope.

No verdict, C, B or timing changed.

**What remains judgement**
- B4 for sdk-1. The measured standalone win reaches only sdk-only installs (EVM apps on dapp-kit without wallet-sdk-react, Node scripts); among the known integrators only task-executor gets a runtime win alone. B4 rests on the prerequisite role for wsc-3, wsr-1's install win, dk-1, sdk-6's payoff and x-2.
- "B3 with sdk-1 + wsr-1" for wsc-3.
- All PR LOC estimates.
- Tron as a plugin, hybrid fail-closed keying, and Monad's placement.
- How many of the 12 chain-referencing feature tests need edits.
- The "at least 267 MB" lower bound for the frontend. It assumes wallet-sdk-react's extra deps do not change dedupe in a way that shrinks it.

**Residual doubts**
- The `sodax-sdks-t2probe` and `sodax-sdks-v3feas` worktrees disappeared at ~19:20, during this pass. Every re-run above finished before then. `who-imports.mjs` could not be re-run; its claim is backed only by the 433 vs 352 and 394 vs 303 probes.
- Not reproduced:
  - "26 doc pages with non-EVM use": the filter was not recorded.
  - "18 feature files' import lines" in PR 5: no command recorded.
  - "17 test files": replaced.
- The as-is Node time depends on load. 861 ms and ~690 ms come from different sessions, and neither controlled for load.
- The P2 bundle rows still use the P1 dapp entry, not the frontend's real imports or its Next.js build.
- "4 of 8" for the frontend rests on `availableChains`, the mounted wallet slots and its direct deps. A hidden flow using NEAR, Stacks, Bitcoin or Injective at runtime was not ruled out beyond the rg searches. Those found only filters that exclude them and a generic signing dispatcher.
