---
type: plan
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, packages, architecture, dependencies, install-footprint, migration]
related_issues: [gh-456]
---

# GH-519 · v3 package map: every package, rethought

The user asked to research and rethink all packages. This file is the result: the full v3 package
map, with the reason each package exists (or stops existing), the dependency rules, and what each
kind of integrator installs.

- **Basis.** The four research reports, `measurements.md`, `competitors.md`, and checks run on
  2026-10-16 (cc053fef): manifests, downstream imports, npm downloads.
- **Precedence.** It refines `plan-v3-order.md` §2, §11 and §12; where they differ, this file wins.
- **Status.** Proposed. The package map belongs in the T1.1 ADR, extended to cover every package.

## 1. Today (published 2.2.0)

Downstream imports count source files in each repo: frontend `main`, backend `development`,
whitelabel `main`.

| Package | What it is | Downstream imports (frontend / backend / whitelabel) | npm / week |
| --- | --- | --- | --: |
| `@sodax/types` | chain keys, chain info, token lists, interfaces; 0 dependencies | 3 / 3 / 14 | 803 |
| `@sodax/libs` | 3 pre-bundled Turbopack workarounds (`stacks/core`, `stacks/connect`, `injective/wallet-strategy`); deprecated by hand after every release | 0 / 0 / 0 | 632 (transitive) |
| `@sodax/swaps-api` | swaps HTTP client (valibot + types) | 0 / 0 / 0 | 560 |
| `@sodax/bridge-api` | bridge HTTP client, a near-copy of swaps-api | 0 / 0 / 0 | 234 |
| `@sodax/sdk` | everything on-chain: hub, 10 spokes, every feature, three HTTP stacks; 20 external dependencies | **122 / 97 / 22** | 831 |
| `@sodax/wallet-sdk-core` | signers for 9 chains, browser and private-key modes mixed in each class; 19 external dependencies | 0 / 0 / 0 | 564 |
| `@sodax/wallet-sdk-react` | wallet connection for 9 chains, global store, wagmi v2; 21 external dependencies | **51 / 0 / 26** | 361 |
| `@sodax/dapp-kit` | React hooks for SDK features and the API lanes; hard dependency on `@sodax/sdk` | **42 / 0 / 18** | 418 |
| `@sodax/skills` | AI skills content | — | 250 |
| `@sodax/assets` | logos served by URL; **private, not published** | — | — |

Measured footprints:
- `npm i @sodax/sdk`: 412 packages, 777 MB, 35 advisories.
- dapp-kit + wallet-sdk-react: 1,357 packages, 1.8 GB, 81 advisories.
- swaps-api + bridge-api: 5.2 MB.
- swaps-api + bridge-api + react-query + react: 21 MB, 0 advisories.

**What is wrong with the current shape**
1. **Every chain's libraries are hard dependencies of three packages** (sdk, wallet-sdk-core,
   wallet-sdk-react), so every user installs every chain.
2. **The same thing exists in several places:**
   - `@sodax/types` is inlined into 4 packages (5 token-list copies in one dapp);
   - `http.ts` is duplicated, and the two `rawTxSchemas` copies have drifted;
   - EVM chain definitions ×3, ICON shim ×3, ICONEX queue ×3.
3. **API-only React apps install the whole SDK**, because dapp-kit hard-depends on it and re-exports it.
4. **Responsibilities are mixed:**
   - each wallet-sdk-core class does both browser and private-key signing;
   - the sdk carries the HTTP clients;
   - wallet-sdk-react keeps state in global singletons.
5. **Release overhead:** the package list is hard-coded in 3 places, and `@sodax/libs` needs a manual
   `npm deprecate` after every release.

## 2. Principles

1. **Split packages only along install-weight axes.** These are SDK vs API, chain, wallet libraries
   and framework (React). Everything else, including features, is a subpath.
2. **Each heavy dependency belongs to exactly one package**, the one that uses it. Others reach it
   only as a peer, or not at all. Per-persona CI fixtures enforce this (T11, T28.8).
3. **Layers point down only:** types → api → sdk → chain packages → React. Turbo rejects cycles
   anyway (probe B-2).
4. **One shared version (lockstep).** The release list is derived from the workspace (A1.2), so
   adding or retiring a package needs no hand edits.
5. **Keep the names downstream already imports** (`sdk`, `dapp-kit`, `wallet-sdk-react`, `types`)
   unless a rename buys something real.
6. **Shims keep compatibility for one major;** removal comes in the next.

## 3. The v3 package map

**Core packages**

| Package | Role in v3 | Depends on | Peers | Verdict |
| --- | --- | --- | --- | --- |
| `@sodax/types` | Shared vocabulary: chain keys and guards, chain info, token lists, wallet and raw-tx interfaces. Light subpaths `./chains`, `./tokens`, `./config`. | — | — | **Keep**, split into light entries (T14) |
| `@sodax/api` | Every SODAX HTTP API, viem-free. Subpaths: `./swaps`, `./bridge`, `./leverage-yield`, `./backend`, `./react` (sdk-free hooks), `./tools` (MCP tool schemas). | types, valibot | `react`, `@tanstack/react-query` (optional; `./react` only) | **New.** Merges swaps-api, bridge-api and the API clients the sdk owns today (T28) |
| `@sodax/sdk` | On-chain orchestration. Hub + EVM core; features as subpaths (`./swap`, `./money-market`, …); the plugin kit (`./plugin`); the wallet base and EVM signers (`./wallet`, `./wallet/server`); the `Sodax` facade. | types, api | `viem` | **Keep, slimmed:** no chain libraries (T1), no PancakeSwap (T5). Absorbs wallet-sdk-core's EVM part (T6.7, new) |
| `@sodax/chain-<name>` | One non-EVM chain each (bitcoin, solana, stellar, sui, icon, injective, stacks, near, tron, …). `.` is the plugin (spoke), `./wallet` the browser signer, `./server` the private-key signer. | that chain's libraries | `@sodax/sdk` | **New** (T1, T6) |
| `@sodax/chains-all` | Every chain plugin, for backends and all-chain apps | all `chain-*` | `@sodax/sdk` | **New** (T1.28) |

**React packages**

| Package | Role in v3 | Depends on | Peers | Verdict |
| --- | --- | --- | --- | --- |
| `@sodax/wallet-sdk-react` | Wallet connection: headless `createSodaxWallets`, hooks, lazy per-chain adapters (`./xchains/<chain>`), `./privy` | types, zustand, immer | `react`, `@tanstack/react-query`, `wagmi`, `viem`, `@sodax/sdk`. Optional: `chain-*`, each chain's React wallet libraries, Privy | **Keep**: adapters, lazy loading, headless config (T3, §12 of the order plan) |
| `@sodax/dapp-kit` | React hooks for SDK features: per-feature subpaths, chain-specific subpaths; re-exports `@sodax/api/react` | api | `@sodax/sdk`, `react`, `@tanstack/react-query`. Optional: `chain-*` for chain subpaths | **Keep** (T13) |

**Tooling and content**

| Package | Role in v3 | Depends on | Verdict |
| --- | --- | --- | --- |
| `@sodax/skills` | AI skills, versioned with the SDK | — | **Keep** (T16) |
| `@sodax/codemod` | v2 → v3 migration CLI | ts-morph | **New** (T17) |

**Transitional**

- `@sodax/swaps-api`, `@sodax/bridge-api`: re-export shims of `@sodax/api/swaps` and
  `@sodax/api/bridge` through 3.x; removed in 4.0.
- `@sodax/wallet-sdk-core`: a shim through 3.x that re-exports the base and the EVM signers from
  `@sodax/sdk/wallet`. Non-EVM signer imports move to the chain packages; the codemod rewrites them.
  Removed in 4.0.
- `@sodax/libs`: folded into `chain-stacks` and `chain-injective` (their pre-bundled build step stays
  inside those packages). No longer published after 3.0 (T1.30, new), which also removes the manual
  `npm deprecate` release step.
- `@sodax/assets`: unchanged; private, not published.

**Count.** 9 core packages plus about 9 chain packages. That is more packages than today's 9, but
each new one sits on a real install axis, and the release list is derived (A1.2).

### Dependency picture (3.0)

```
                    @sodax/types              (no deps)
                         ▲
                    @sodax/api                (valibot; ./react: react + react-query, optional peers)
                         ▲
                    @sodax/sdk                (peer: viem) — core, features, plugin kit, wallet base, EVM signers
                ▲ peer          ▲ peer
   @sodax/chain-<name> ×N    @sodax/dapp-kit  (peers: sdk, react, react-query; re-exports @sodax/api/react)
   (that chain's libs)
          ▲ optional peer
   @sodax/wallet-sdk-react   (peers: sdk, wagmi, viem, react, react-query; chain-* and their React libs optional)
   @sodax/chains-all → every chain-*
```

## 4. Decisions that changed while rethinking

1. **API hooks go to `@sodax/api/react`, not a new `@sodax/dapp-kit-api` package.** This revises
   `plan-v3-order.md` §11.
   - React and react-query are optional peers, so Node users install nothing extra.
   - There is precedent: wallet-sdk-react's `./privy` subpath behind an isolation gate.
   - It means one package fewer, and the name says what it is.
   - The sub-issues are renumbered T13.6–T13.9 → **T28.5–T28.8**.
2. **wallet-sdk-core folds into `@sodax/sdk/wallet` in 3.0** (T6.7).
   - Once non-EVM signers move to the chain packages, what is left is the base (51 lines) and the EVM
     signer. Both need only viem, which the sdk already peers on, so a separate package adds no
     install benefit.
   - Chain packages then depend on one internal peer (the sdk) instead of two that must stay aligned.
   - No downstream repo imports wallet-sdk-core directly (0 / 0 / 0).
   - Trade-off: an API-mode React app that uses SODAX's wallet layer now also installs the light 3.0
     sdk, a few MB on top of the viem it already has.
3. **`@sodax/libs` is retired** (T1.30). Its three subpaths belong to Stacks and Injective, which
   become packages that can carry their own pre-bundled build.
4. **Kept on purpose:**
   - `@sodax/dapp-kit` stays separate from `@sodax/wallet-sdk-react`. Both are heavily used
     downstream (42 + 51 files in the frontend). Merging buys no install benefit, and the separation
     lets an app with its own wallet stack use dapp-kit through `WalletProviderSource`.
   - `@sodax/types` stays separate from `@sodax/api`: the sdk, the wallets and the chain packages all
     need it without the HTTP clients.
   - `@sodax/api` stays separate from the sdk: an API-mode server stays at 5 MB without viem.
5. **Not added:**
   - A `@sodax/widget`, a separate MCP package, or a framework-agnostic wallet core: none has a
     consumer today.
   - Per-feature packages: subpaths do the same at no install cost.

## 5. Who installs what (3.0)

| Integrator | Install | Footprint |
| --- | --- | --- |
| Server, API mode | `@sodax/api` | 5.2 MB (measured, swaps + bridge) |
| Server, API mode, signs EVM itself | `@sodax/api` + `viem`, or `@sodax/sdk/wallet/server` | + viem |
| Server, SDK, EVM-only | `@sodax/sdk` + `viem` | about 85 MB with viem; 5 MB if viem is already there (what-if) |
| Server, SDK, all chains | `@sodax/sdk` + `@sodax/chains-all` + `viem` | close to today, by choice |
| React, API mode | `@sodax/api` (`./react`) + react-query + react, plus a wallet stack | 21 MB before the wallet stack (measured) |
| React, SDK, EVM-only | `@sodax/sdk` + `@sodax/dapp-kit` + `@sodax/wallet-sdk-react` + wagmi + viem + react-query | 29 packages / 108 MB / 0 advisories (what-if) |
| React, SDK, several chains | the row above + `@sodax/chain-<x>` + that chain's React wallet libraries | plus that chain's share. With lazy adapters, the first load stays near the EVM size |

## 6. Peer comparison

| SDK | Shape |
| --- | --- |
| LI.FI v4 | `@lifi/sdk` core, one `@lifi/sdk-provider-*` per VM, `@lifi/types`, widget packages |
| Wormhole | connect core, one package per platform, a meta package |
| Relay | sdk, one adapter per VM, a UI kit |
| wagmi | core, React bindings, connectors |
| Aave | a client with per-wallet-library subpaths, and a separate React package |

SODAX v3 follows the common shape: a core, one package per chain, React separate. It differs in two
deliberate ways:
- **API mode is a first-class package** (`@sodax/api`), not hidden inside the core.
- **The API's React hooks are a subpath** behind optional peers, not another package.

## 7. Timeline

| Phase | Packages |
| --- | --- |
| 2.x (additive) | `@sodax/api` with swaps-api and bridge-api as shims (T28.1), its leverage-yield and backend modules (T28.4), `@sodax/api/react` (T28.5–T28.8), `@sodax/codemod` (T17.1), light `@sodax/types` entries (T14), subpaths everywhere |
| 3.0 | `@sodax/chain-*` and `@sodax/chains-all` (T1.17–T1.28); the sdk without chain libraries; wallet-sdk-core folded into the sdk and the chain packages, with a shim (T6.4, T6.5, T6.7); libs folded (T1.30); dapp-kit with the sdk as a peer (T13.3); ESM-only and peers (T4) |
| 4.0 | Shims removed: `@sodax/swaps-api`, `@sodax/bridge-api`, `@sodax/wallet-sdk-core` |

## 8. Risks

- **About 18 packages published per release in lockstep**, unchanged chain packages included.
  Prerequisites: A1.2 (derived lists) and an npm token that can create `@sodax/*` packages.
- **React code inside `@sodax/api`.** An isolation gate keeps React imports under `./react` (T28.8).
- **Docs and skills grow per package.** Mitigation: one install-matrix page (T24.3), and README
  headers generated from the package map.
