---
type: plan
repo: sodax-sdks
github: 519
updated: 2026-10-17
tags: [v3, order, dependencies, sub-issues, waves, delivery, conflicts]
related_issues: [gh-302, gh-456, gh-505, gh-507, gh-529, gh-531, gh-532, gh-533]
---

# GH-519 · v3 work order: waves, dependencies, conflicts

This plan orders all 36 ranked items (T1–T36, numbered as in `ideas.md` §1), split into 162
sub-issues of one PR each. That count includes sub-issues proposed in §11 and §12 and in
`plan-v3-packages.md`, plus T3.10, a gap the cluster reports left out. For every sub-issue it says what must land first and what it collides
with.

- **Basis.** Four research reports written against `origin/main` **cc053fef** (2026-10-15), one per
  cluster, in `research/`. The lead re-checked their load-bearing claims in code (§9).
- **Precedence.** Where this file and `plan-v3-scope.md` disagree, this file wins. The scope was
  written against 77281f0c, and the research corrected it in about 60 places; each report ends with a
  corrections list.
- **The full table** (162 rows: id, title, points, breaking, tier, depends on, conflicts) is in
  `plan-v3-subissues.md`.
- **Nothing is filed on GitHub.** #519 is R0bi7's board, and R0bi7 said the team will turn it into
  sub-tasks later. The sub-issue titles are ready to use when the team wants them.

## 1. Delivery model: expand, then contract, on `main`

**Recommended. It needs team sign-off.**

**Why not a long-lived v3 branch**
- The release tooling supports exactly one forward line, `main` → `release`. `scripts/release.mjs`
  has four checks:
  - you must be on `release` (`:338-339`);
  - `origin/main` must be fully merged (`:364-366`);
  - the version must advance past the highest tag (`:257-273`);
  - HEAD must contain the last tag (`:380-388`).
- Four open chain PRs edit the exact files v3 restructures: #534 Tron, #497 XRP, #498 Monad, #95 Aleo,
  plus the ton and zcash branches.
- The v2 precedent: `sdk-v2-main` needed five `main` merges in three weeks.

**The model**
- **2.x (expand).** Add the new structure next to the old one: registry, entries, adapters, server
  signers, codemods. Today's behaviour stays the default, and releases continue as normal.
- **Gate G**, before the first breaking merge:
  - A1.1: npm `latest` never moves backwards.
  - A1.4: a `release-2.x` mode for `pnpm release`.
  - Cut the last 2.x minor, branch `release-2.x` from its tag, and announce the chain-PR cutoff.
  - T27.1: pin docs and AI channels to `release`. docs.sodax.com, the skills CLI, the Claude plugin
    and context7 all serve `main` today.
  - T16.1: a v2→v3 mode in skills.
  - T17.4: in-repo apps migrated with the forward-compatible codemods. CI type-checks every app and
    runs `check:ai` on every PR, so this has to happen first.
- **3.0 (contract).** A short window on `main` flips defaults and deletes the old paths. It ships as
  `3.0.0-rc.N` through today's flow under dist-tag `rc`.
- **After 3.0.0 → `latest`.** 2.x maintenance releases come from `release-2.x` under dist-tag `v2`.
  Fixes land on `main` first and are cherry-picked.

**When users see the weight win**

| Area | 2.x | 3.0 |
| --- | --- | --- |
| Build and types | unbundled ESM, types not inlined, `@sodax/types` split | — |
| Heavy dependencies | PancakeSwap math vendored (−6 nested viem copies), ICON over JSON-RPC, Stellar `/minimal`, Anchor-free Solana | — |
| Chain plugins | opt-in only, through `createSodaxCore` | default flips to hub + EVM |
| Wallet layer | — | the legacy `config` prop keeps importing every chain until it is removed |

## 2. Reconciled design decisions

1. **The option is `plugins`, not `chains`.** `SodaxDefaultConfig.chains` already means per-chain
   config (`types/src/sodax-config/sodax-config.ts:153`), and the backend calls `new Sodax({ chains })`.
2. **Core = hub (Sonic) + EVM.**
   - `createSodaxCore()` registers no non-EVM chain.
   - `new Sodax()` keeps every chain in 2.x and becomes EVM-only in 3.0.
   - Dispatch resolves by chain key first, then by chain type. Monad has chain type EVM but its own spoke.
3. **2.x keeps chain code inside `@sodax/sdk`** (`src/chains/<name>/`, behind an import-boundary gate).
   Separate packages that the sdk default-registers form a cycle, and turbo rejects it (B probe B-2).
   In 3.0 each chain is extracted into `@sodax/chain-<name>`.
4. **Chain package exports.**
   - `.` is the spoke; `./wallet` is the browser signer; `./server` is the private-key signer.
   - **There is no `./react`.** React adapters stay in `@sodax/wallet-sdk-react/xchains/<chain>`, with
     that chain's React libraries as optional peers. The adapter code imports 10+ wallet-sdk-react
     internals (C §C1.2), which would otherwise become cross-package API.
   - This overrides `./react` in the scope's D1 and in B's T1.17 template.
5. **The plugin contract models settlement, because the in-flight chains need it.**
   - Modes: intent relay, optionally split-tx (Solana, Bitcoin, Aleo), or MPC relay in memo mode
     (Tron, XRP) or address mode (Monad).
   - It also covers key-level claims, a codec with `encodeRecipient`, and capability hooks for the 10
     chain branches still in `SpokeService`.
   - `rawTxSchema` stays in the API packages, not in the plugin.
6. **One `WalletProviderSource` interface, in `@sodax/types`.**
   - T22.1 defines it: `getWalletProvider(key)` plus `subscribe(onChange)`.
   - T3.7 produces it. dapp-kit and wallet-sdk-react never import each other.
7. **Peer ranges.**
   - sdk and wallet-sdk-core: `viem ^2.29.2` (API floor 2.28.0).
   - wallet-sdk-react: `wagmi ^3` and `viem >=2.43.0`, because wagmi 3.7 imports `viem/tempo` and
     `sendCallsSync`, and viem 2.42 has no `tempo` export.
   - The catalog moves to a current viem and TS 5.9 in 2.x (T7.0).
8a. **CJS consumers use only the root entry in 2.x.**
    - The new subpaths are ESM; under `require()` the root resolves to the CJS twin, so one process
      would load two copies of every class.
    - sodax-backend (CJS) adopts subpaths with 3.0's ESM-only build.
8. **ESM-only exports carry a `default` condition** plus `typesVersions`. With `import` only,
   `require()` fails even on Node 22.15; dapp-kit and wallet-sdk-react ship `import`-only exports today.
9. **Query keys: export a factory and keep today's shapes.** sodax-frontend hand-writes 10 dapp-kit
   keys, and a shape change would break their invalidation silently.
10. **No SDK lifecycle engine now; decision 0003 stands.**
    - Instead: one shared lifecycle core in dapp-kit (T18.2), done inside the user's #531, and a public
      relay-status read (T18.1).
    - After #534, T18.1 covers the MPC relay too.
11. **The correlation id is never sent to the relay.** The relay's CORS allow-list rejects
    `x-request-id`; swaps accepts it. Both were checked by preflight on 2026-10-16.
12. **No third MCP server.** Tool schemas generated from valibot (T33.1) serve the two that exist.
13. **Codemods ship in 2.x** as `@sodax/codemod`, on ts-morph. B and C transforms were missing from
    every estimate and are added as T17.3 and T17.7.

## 3. Waves

A wave opens when its gate is met. W2–W5 have independent gates and can run in any order.

| Wave | Opens when | Sub-issues | Pts |
| --- | --- | --- | --: |
| **W1** | now | **A:** A1.1, A1.2, A1.3, T2.1, T2.2, T2.3, T2.4 (definitions), T7.0, T10.1, T11.1–T11.4, T14.1, T15.1 · **B:** T1.1 (write the ADR), T5.1, T5.2, T8.1–T8.4 · **C:** T3.10, T6.1, T6.2, T6.3, T6.6, T9.1, T23.3, T23.4, T23.5 · **D:** T13.1, T17.1, T19.5, T21.1, T24.1, T25.1, T26.2 | 79 |
| **W2** | the user's #509, #511, #512, #523 (and #488) merge | **C:** T23.1 · **D:** T13.2, T17.2, T19.2, T19.3, T19.4, T19.6 (backend), T21.2, T21.5, T22.1, T22.3, T26.1, T27.2 | 34 |
| **W3** | #534 merges, or the T1.1 ADR is accepted (the chain-PR cutoff) | **A:** T14.2 → T14.3 → T14.4, T15.3 · **B:** T1.2 → T1.3, T1.4, T1.5 → T1.7–T1.15 (parallel, one dev per chain) → T1.16 (PR authors); T12.1 → T12.2 → T1.6; T20.1/T20.2 (after product) · **C:** T3.1 → T3.2 → T3.8 (§12) → T3.3 → T3.4 (per chain) → T3.9 (§12), T3.5, T3.7 · **D:** T13.4, T13.5, T17.3, T18.1, T28.1 → T24.2, T28.4 (§11) | 106 |
| **W4** | #483 is resolved (merged, or redone after a team call) | **D:** T19.1, T22.5, T28.2 | 9 |
| **W5** | the user's lifecycle issues #529, #531, #532 land | **D:** T18.2 (inside or just before #531) → T18.3 → T18.4–T18.7; T28.5 → T28.6, T28.7 (§11, before T21.4 and T22.2), T21.3, T21.4, T22.2, T24.3 · **A:** T28.8 | 44 |
| **G** | all 2.x prerequisites done | **A:** A1.4 · **D:** T27.1, T16.1, T17.4; cut the last 2.x minor; branch `release-2.x`; announce the cutoff | 10 |
| **W6** | the 3.0 window opens | T7.1 first, then T4.1 → T4.2 → T13.3, T4.3 · T23.2 → T6.4 → T1.17 → **per chain, one PR each and in parallel: T1.18–25 + T6.5.<chain>**, T1.26 → T3.6 → T1.27 → T1.28, T1.29 · T5.3 → T5.4 · T8.5 · T22.6 · T26.3 · T28.3 · T17.7 · T15.2 · T29.1 · T13.10 (§11) · T6.7, T1.30 (`plan-v3-packages.md`) · T20.3 (only if product agrees) | 84 |
| **W7** | API freeze | T16.2, T16.3, T17.5 → **3.0.0-rc.1** | 15 |
| **W8** | rc.1 is out | T17.6a (sodax-frontend), T17.6b (sodax-backend), T17.6c (intents-whitelabel), T16.4, each under one cross-repo parent issue → **3.0.0** | 12 |
| **L** | 3.x | T3.11, T3.12, T30.1, T31.1–T31.6, T32.1, T33.1, T33.2, T34.1, T34.2, T35.1, T35.2, T36.1 | 60 |

## 4. Who waits for whom, per track

The tracks can be staffed separately; arrows are hard dependencies.

- **A · build and release:**
  - T11.1 → T11.2 → T10.1 → T2.1 → T2.2 → T13.1.
  - T2.1 is a hard prerequisite of T12.2 (feature entries) and T1.6. Without it, the root bundle and
    the subpaths load two copies of every class.
  - A1.2 must land before any new package (T17.1 codemod, T28.1 api, T1.17 chain packages).
  - G needs A1.1 and A1.4.
  - In W6: T4.1 → T1.17.
- **B · core and chains:**
  - T1.1 (now) → [#534 or cutoff] → T1.2 → T1.3, T1.4, T1.5 → T1.7–T1.15.
  - Each chain move waits for its own trim: T1.8 after T8.4, T1.9 after T8.3, T1.11 after T8.1. T1.7
    waits for T2.3 and for W2.
  - T12.1 → T12.2 → T1.6.
  - In W6: T1.17 → T1.18–25 (+ T6.5) → T1.27, which also needs T13.5 and T26.2 → T1.28 / T1.29.
- **C · wallet:**
  - Now: T9.1, T23.3–T23.5, T6.1 → T6.2 → T6.3 → T6.6. T6.6 waits for T23.4 and T8.1 (same ICON file).
  - [#534] → T3.1 → T3.2 → T3.3 (after T9.1, same file) → T3.4, T3.5, T3.7.
  - In W6: T7.1 → T23.2 → T6.4 → T6.5 → T3.6.
- **D1 · dapp-kit:**
  - Now: T21.1, T26.2, T13.1.
  - [W2] T13.2, T26.1, T21.2, T22.1, T22.3, T17.2.
  - [W3] T13.4 (needs T12.2), T13.5 (needs T1.2).
  - [W4] T22.5. [W5] T21.3, T21.4, T22.2, T18.2+.
  - In W6: T13.3, T22.6, T26.3.
- **D2 · API, AI, migration:**
  - Now: T25.1, T24.1, T19.5, T17.1.
  - [#512] T19.2, T19.3, T19.4.
  - T28.1 (needs T2.2, T10.1, T19.2, T25.1) → T28.2 (needs T19.1).
  - G: T27.1, T16.1, T17.4. Then W7, then W8.

**Critical path.**
- By points: T11.1 → T11.2 → T10.1 → T2.1 → T13.1 → T13.2 → T4.1 → T1.17 → T1.18–25 → T1.27 → T1.29
  → T17.5. That is 39 pts serial, about 31 once the per-chain extraction fans out.
- By calendar: the chain-plugin track. It waits on two outside events: #534 merging, and the team
  accepting the T1.1 ADR.

## 5. Hot files — serialize these

| File or area | Who edits it | Order |
| --- | --- | --- |
| `sdk/src/shared/services/spoke/SpokeService.ts` | #534, #497, #498, #95; T1.2, T1.3; T15.3; T18.1; T19.3 | #534 → T1.2 → T1.3 → the rest |
| `sdk/src/shared/utils/shared-utils.ts` (codecs) | chain PRs; T1.4; T15.3; T19.3 | #534 → T1.4 → T15.3 |
| `types/src/chains/*`, `types/src/utils/utils.ts` | every chain PR; T14.2 | #534 → T14.2, with a short freeze; other chain PRs then merge `main` |
| Feature services (`SwapService`, `BridgeService`, `LeverageYieldService`) | the user's #509, #511, #512, #523; T19.4; T23.1; T1.7 (bitcoin sites); T2.4 call sites | the user's PRs first |
| `sdk/.../IntentRelayApiService.ts` | #512; T1.3; T19.2; T19.3 | #512 first |
| `wallet-sdk-react/src/providers/evm/EvmProvider.tsx` | #163; T9.1; T3.3; T7.1 | T9.1 → T3.3 → T7.1 |
| `wallet-sdk-react/src/{chainRegistry.ts,SodaxWalletProvider.tsx,types/config.ts}` | #534, #497, #95; T3.1–T3.4 | #534 → T3.x; later chains arrive as adapters |
| `wallet-sdk-core/src/wallet-providers/icon/*` | T8.2; T23.4; T6.6 | T23.4 → T8.2 → T6.6 |
| `dapp-kit/src/hooks/*/index.ts` | #511, #512, #488; T13.2; T26.1; T21.x; T22.x | the user's PRs first; then dapp-kit PRs split by hook folder |
| `dapp-kit/src/providers/SodaxProvider.tsx` | T26.2; T22.1; T21.5; T20.2 | in that order |
| `packages/*/package.json`, `tsup.config.ts` | T2.x; T6.1; T12.2; T1.6; T13.2; T4.x; T7.1; T3.6 | new packages and subpaths follow the T2.2 template (ESM, `default`, `typesVersions`); T4.1 after the manifests settle |
| `scripts/bump-versions.sh`, `sdks-publish.yml` | T17.1; T28.1; T1.17; #163 | A1.2 first (derives the lists), so nobody hand-edits them |
| `apps/demo/**` | #501, #512, #483; T17.4; T18.4+ | #501 → #512 → T17.4 |
| `packages/skills/**` | every PR (CI `check:ai`) | each PR updates the skills it changes |

## 6. In-flight PRs — coordination asks

These are for the user to raise with the team. Agents do not post on other people's PRs.

| PR | Owner | Ask | Why |
| --- | --- | --- | --- |
| #509, #511, #512, #523 | 0x0603 | Merge first | They share feature services and dapp-kit hooks with T19.x, T22.x, T21.x and T23.1. B confirms they touch no registry file. |
| #529, #531, #532, #533 | 0x0603 | Fold T18.2 (shared lifecycle core) into #531 | Otherwise #531 and #532 each copy the swap state union again. |
| #534 Tron + MPC settle | gcranju | Merge before T1.2; cutoff when the T1.1 ADR is accepted | Its `SpokeService.settle` is the seam the registry needs. Porting it afterwards means rewriting 8 switch cases. It replaced #372. |
| #497 XRP, #498 Monad (also the `feat/ton-mpc-integration` and `feat/zcash-mpc-integration` branches, not yet PRs) | gcranju | Rebuild as opt-in plugins after T1.3–T1.6 (T1.16) | Both are drafts carrying a stale copy of the Tron work, and #498 is stacked on #497. Monad needs key-level dispatch in the registry, not `if (isMonad…)` in every EVM branch. |
| #95 Aleo | Prabinbaral77 | Same: an opt-in plugin, never merged into core in v2 shape | `@provablehq/sdk` pulls `@provablehq/wasm` (55 MB unpacked at 0.12.1) into every `@sodax/sdk` install. |
| #483 solver codes (`!`, conflicting, idle since 2026-09-23) | R0bi7 | Decide whether it ships in 2.x or waits for the window | T19.1 builds on its retry classifier; T22.5 edits the same `unwrapResult.ts`. |
| #488 ICX migration gate | AntonAndell | Merge any time | Trivial overlap with T21.2, T22.3, T26.1, T18.6. |
| #501 demo rebuild (conflicting) | R0bi7 | Merge before T17.4 | 54 demo files. |
| #163 wallet-hw (conflicting) | 0xmilktea | Not ours to edit; raise only if it blocks us | It collides with T9.1, T3.3 and T7.1 (`EvmProvider.tsx`), peers on wagmi 2.x (the same v3 `withCapabilities` break), and fails the release gates (`0.0.1-test`, not in the package lists). |

## 7. Decisions needed

Each item gives a recommendation. Items 2, 3, 6, 7 and 9 belong to the team or product.

1. **Delivery model** (§1). Recommend expand → contract on `main`, with `release-2.x` for maintenance.
2. **Chain-PR cutoff.** The cutoff is acceptance of the T1.1 ADR. #534 merges before it; XRP, Monad
   and Aleo return as opt-in plugins. Needs agreement from gcranju and Prabinbaral77.
3. **#483:** 2.x or the 3.0 window. Earlier `!` commits have shipped in 2.x minors (`c2519166`,
   `e57a4a4b`), so 2.x is possible.
4. **Wallet boundary:** decided as variant H (§2.4) on C's evidence.
5. **PancakeSwap `Price` / `Token` swap (T5.3):** 3.0. The install win (the vendored math and dropped
   SDKs) is already non-breaking in 2.x.
6. **Remote config (T20).** Product must answer 10 questions (`research/b-sdk-core-chains.md` § T20).
   My recommendation:
   - opt-in in 2.x;
   - in 3.0, default-on for token lists and display metadata only, never contract addresses or API
     URLs (the backend could otherwise redirect deposits);
   - accept configs of the same major;
   - drop unknown chains;
   - non-blocking with the bundled fallback.

   The backend endpoint is live (`/v2/be/config/all`, version 2020008 = 2.2.0-rc.8). Today's gate would
   reject it for every newer SDK.
7. **Docs stop going live on merge (T27.1).** This is a process change, required before the window.
8. **npm token.** Confirm `SODAX_SDKS_NPM_PUBLISH_TOKEN` can *create* `@sodax/*` packages before the
   first new package (codemod, api, chain-*). Not verifiable from code.
9. **Relay owner:** allow `x-request-id` in the relay's CORS allow-list. Until then the SDK never sends
   it there.
10. **Cross-repo trackers.** Open one parent issue in sodax-sdks with native sub-issues before
    starting T17.6a/b/c, T16.4, T19.6 and T34.2. The user creates them.

## 8. Totals

| Tier | Pts | Notes |
| --- | --: | --- |
| Now (2.x quick wins) | 35 | non-breaking, W1 |
| Must (3.0 core), plus Should items it depends on (T26.2, T27.1) | 216 | includes A1 release tooling, T7.0, and the downstream migrations (12) |
| Should (recommended for 3.0, never gating) | 134 | lifecycle 25, signals and errors 17, the sdk-free API path (§11) 17, headless and lazy wallets (§12) 8, dapp-kit DX, API merge, docs |
| In-flight ports (T1.16) | 8 | owned by the chain PR authors |
| Later (3.x) | 60 | includes T33.2 (5, conditional) |
| **Total** | **453** | 162 sub-issues; 19 breaking (67 pts); cross-repo 14 pts |

- **Required for 3.0.0** (Now + Must, without downstream): **239 pts**, roughly 30 dev-weeks at the
  scope's 0.65 day/pt. That rate is uncalibrated; the team has no velocity data.
- **Why the total rose from 260** (`plan-v3-scope.md`), before the §11 and §12 additions:
  - Expand-phase compatibility work: C's T3 roughly doubles; B splits capabilities, boundary and
    extraction into separate steps.
  - Items the scope missed: release tooling (A1, 10), the codemods package and transforms (10),
    settlement modelling, the cross-repo PRs.
  - Work that turned out larger in code:
    - lifecycle: 25 vs 13;
    - signals and correlation id: 14 vs 3;
    - dapp-kit subpaths: 9 vs 2;
    - query builders: 13 vs 8;
    - skills: 14 vs 8;
    - signer split: 9 mixed-mode classes.
- **Skipping the expand phase** (breaking directly in 3.0) saves about 15–20 pts. It turns the window
  into months of a breaking branch against the in-flight PRs, so it is not recommended.

## 9. Verification log (lead, 2026-10-16, against cc053fef)

**Confirmed in code or by probe:**
- dapp-kit `index.ts:5` re-exports `@sodax/sdk`.
- `SwapsApiService.ts:152-200` already maps `SwapsApiError` to `SodaxError`.
- 14 error codes, not 26.
- swaps-api raw-tx dispatch has no BITCOIN branch; bridge-api has one.
- `resolveDeliveredPacket` is internal.
- The `useMMAllowance` and `useEModes` key drift.
- `check-ai-keys.py` reads `queryKey:` literals.
- Docs go live from `main`.
- `PACKAGES` is repeated in three places.
- tsup `noExternal` applies to both ESM and CJS.
- The `node-cjs` app asserts that `require('@mysten/sui/grpc')` resolves.
- `release.mjs` has the four forward-only checks.
- `getChainType` → `baseChainInfo`, and `types/package.json` has no `sideEffects`.
- dapp-kit exports are `import`-only.
- The bitcoin ECC calls run at import time.
- `EvmProvider` creates its own QueryClient.
- 9 `getInstance()` singletons.
- `useEvmSwitchChain` imports Injective.
- Catalog TS 5.5.4 vs wagmi 3.7's peer `>=5.9.3`.
- viem 2.43 (not 2.42) exports `tempo`.
- Receipt wait at `LeverageYieldService.ts:3168`.
- `near-api-js` is used only by `NearWalletProvider`.
- 10 eager spoke constructions at `SpokeService.ts:146-155`.
- `spoke.stellar` is used once (`SponsoringService.ts:135`).
- The `chains` config key exists.
- PancakeSwap ABI is evaluated at module load (`EvmSolverService.ts:45`).
- `fetchIdl` helpers.
- The toml override.
- 12 `toSignificant` calls in sodax-frontend's pool pages.
- 13 dapp-kit files read `sodax.spoke.<chain>`.
- 10 hand-written dapp-kit keys in sodax-frontend.
- The relay and swaps CORS preflights.
- Remote config v2 is live, at version 2020008.

**Corrected while verifying:**
- `spoke.bitcoin` has 21 matches (B said 20).
- `walletProvider` appears in 55 non-test hook files (D said ~70; the scope said 27).
- Aleo's WASM is 55 MB unpacked at 0.12.1 (B said 43 MB).

**Not verified:**
- That TS 5.9.3 compiles the whole repo. C checked `@sodax/types` only; T7.0 should start with a trial
  `tsc`.
- The npm token's create permission.
- Velocity.

## 10. Feasibility (asked by the user, 2026-10-16)

**Verdict.** It is technically feasible. The risk is capacity and coordination, not code.

**Proven by a probe**
- Unbundled `tsc` output: one helper import goes from 832 KB to 0.6 KB.
- Type split: `getChainType` goes from 34 KB to 2 KB.
- `require()` fails on `import`-only exports.
- viem floors: 2.28 for the SDK API, 2.43 for wagmi v3 (the `tempo` export).
- wagmi v3 typecheck: 1 error before the fix, 0 after.
- The adapter and per-provider store types compile.
- Stellar `/minimal` covers all 20 imported names.
- Solana instruction discriminators match.
- turbo rejects an sdk ↔ chain-package cycle.
- A ts-morph codemod rewrote 82 demo files in 0.85 s.
- CORS: the relay rejects `x-request-id`.
- Remote config v2 is live.
- Earlier probes: `require(esm)` of the sdk on Node 22; backend TS settings with `typesVersions`; a
  swap-only source build at 169 KB gzip.
- Downstream repos construct `SpokeService` / `EvmHubProvider` directly **0** times (2026-10-16,
  backend `development`, frontend and whitelabel `main`). So T1.2's constructor change is
  non-breaking in practice.

**Feasible by code reading only, not prototyped**
- The registry, and the 9 chain moves into `src/chains/`.
- The wallet store and adapter refactor.
- The 3.0 extraction into `@sodax/chain-*`.
- The ESM-only flip.
- The shared lifecycle core.
- Typed `getSpokeService` through declaration merging.

The first registry PR (T1.2) and the hardest chain move (T1.7 Bitcoin, 20+ feature sites) are the
real test. Re-estimate after them.

**Not verified, or depends on someone else**
- TS 5.9 across the whole repo (only `@sodax/types` was checked).
- That the npm token can create packages.
- Behaviour on chain, needing a testnet smoke before release:
  - Solana transactions built without Anchor;
  - the vendored PancakeSwap calldata.

  Byte-for-byte and golden tests are planned, but on-chain execution has not been run.
- wagmi v3 in a real browser with Privy and WalletConnect (only typecheck and import probes so far).
- The relay's CORS change (another team).
- The remote config policy (product).

**Capacity.**
- Throughput today: `main` received 135 non-merge (squash) commits in the last 90 days, almost all
  from three people.
- The plan is about 150 sdks PRs, roughly the team's entire throughput for three months.
- With feature work continuing, 3.0.0 is a 5–8 month effort unless people are dedicated to it.
- Points are uncalibrated: ±50%.

**Coordination.**
- W3 and G need other people to change course:
  - gcranju: five MPC chains in the pipeline (Tron, XRP, Monad, plus the ton and zcash branches);
  - Prabinbaral77: Aleo;
  - R0bi7: #483, the #519 board, the release process;
  - product: remote config;
  - the docs owners: pinning to `release`.
- If the cutoff is not agreed, each new v2-shape chain adds port cost.
- That argues for landing T1.1–T1.5 early.

**De-risking order**
1. Start W1. It needs nobody's agreement, delivers the 2.x wins on its own, and T11.1 measures every
   later step.
2. Ask for the §7 decisions 1–3 now; they gate W3 and G.
3. Re-estimate after T1.2 and T1.7.
4. Run a testnet smoke for T8.4 and T5.2 before G.

## 11. Packaging: install only what you need

> **Revised by `plan-v3-packages.md`** (the full package map). The API hooks now go to
> `@sodax/api/react` instead of a new `@sodax/dapp-kit-api` package, and are renumbered T28.5–T28.8.
> The text below is kept as the original reasoning.

**Proposed 2026-10-16.** The user asked two things: should dapp-kit be split into many packages, and
how can users of the API or of the SDK install only what they need?

**Rule: split packages only along axes that change install weight.** Everything else is a subpath.

| Axis | Why it matters at install | Mechanism |
| --- | --- | --- |
| SDK vs API | `@sodax/sdk` is 777 MB / 35 advisories today; the API clients are 5.2 MB | separate packages |
| Chain | chain libraries | plugins (T1) |
| Wallet | per-chain React wallet libraries, wagmi connector SDKs | optional peers of `wallet-sdk-react/xchains/<chain>` (T3.6); wagmi v3 optional connector peers (T7.1) |
| Feature (swap, MM, bridge…) | none; it only changes the bundle | subpaths (T12.2, T13.2) |

Splitting dapp-kit per feature buys nothing at install, because every feature package would still
depend on the sdk. It multiplies release, docs and skills overhead.

**dapp-kit today (cc053fef)**
- Its manifest has `dependencies: { "@sodax/sdk", "viem" }`.
- 88 of its hook files are API-lane: swapsApi 24, bridgeApi 13, leverageYieldApi 35, backend 16.
- They call:
  - `sodax.api.leverageYield` (68), `sodax.api.swaps` (44), `sodax.api.bridge` (22);
  - `sodax.backendApi.*` (12 methods);
  - `sodax.bridge.*` (3).
- 81 of them import types, and `isAuthFailure`, from `@sodax/sdk`.
- So a React app that only talks to the API must install the whole sdk and run `new Sodax()`.
- The leverage-yield and backend clients exist only inside the sdk: `LeverageYieldApiService` is 813
  lines and `BackendApiService` 857 lines.

**Proposal.** I recommend it; the package name goes in an ADR.

1. **`@sodax/api` covers all four API families:** swaps and bridge (T28.1), plus leverage-yield and
   backend (T28.4, moved out of the sdk, which then wraps them).
2. **A new sdk-free React package for the API hooks** (working name `@sodax/dapp-kit-api`), built on
   `@sodax/api` with its own small provider (T13.6–T13.8).
   - `@sodax/dapp-kit` depends on it and re-exports the hooks, so nothing breaks in 2.x or 3.0.
   - #511's EVM approval and batch helpers move to a viem-only module it can import.
   - The 3 hooks that call `sodax.bridge.*` stay in dapp-kit unless the API has an equivalent.
3. **Chain-specific dapp-kit hooks move to per-chain subpaths in 3.0** (T13.10), with the chain
   package as an optional peer: bitcoin (13 files) and Stellar sponsoring (5). This is the same
   pattern as `wallet-sdk-react/xchains/<chain>`.
4. **CI enforces the promise** (T13.9, on T11.1):
   - an isolation gate keeps `@sodax/sdk` out of the API package;
   - per-persona install fixtures carry footprint budgets, so a PR that drags the sdk or a chain
     library into the API persona fails.
5. **Docs:** an install matrix (T24.3).

**Why a separate package, not an `./api` subpath with the sdk as an optional peer**
- The install win arrives in 2.x. A subpath can drop the sdk only after it becomes a peer in 3.0.
- The root entry stays complete.
- Users who don't install the sdk never hit unresolved `@sodax/sdk` type references.
- The cost is one more package, which is cheap after A1.2.

**Install matrix, 3.0 target.** Measured numbers are marked; the rest are directions.

| Persona | Install | Footprint |
| --- | --- | --- |
| Server, API mode (quote and build tx; signing happens elsewhere) | `@sodax/api` | **5.2 MB** today for swaps-api + bridge-api (measured 2026-10-16) |
| Server, API mode, signs with a private key | `@sodax/api` + `@sodax/chain-<name>/server` (or `wallet-sdk-core/server` with per-chain optional peers) for the chains it signs | only those chains. In 2.x, wallet-sdk-core still hard-depends on every chain library (T6.4 is 3.0) |
| React, API mode (the app's wallet signs the raw tx) | `@sodax/api` + the API hooks package + `@tanstack/react-query` + react, plus a wallet stack | **21 MB, 0 advisories** for the API clients, react-query and react (measured). The wallet stack is extra; wagmi v3 + viem + react + react-query measured **102 MB** |
| React, SDK mode, EVM-only | `@sodax/sdk` + `@sodax/dapp-kit` + `@sodax/wallet-sdk-react` + wagmi + viem + react-query | **29 packages, 108 MB, 0 advisories** (measured what-if, `measurements.md`) |
| React, SDK mode, more chains | the row above + `@sodax/chain-solana` (etc.) + that chain's React wallet libraries | plus that chain's share; Solana on today's libraries is 104 packages / 70 MB |
| Node, SDK, all chains (the backend) | `@sodax/sdk` + `@sodax/chains-all` | close to today's install, by choice |

## 12. wallet-sdk-react: a better design than plain adapters

**Proposed 2026-10-16.** The user asked whether there is a better approach, with wallet-sdk-react as
the example.

**What the code says (cc053fef)**
- Every chain is statically imported:
  - `SodaxWalletProvider.tsx:5-10` imports the EVM, Solana and Sui providers;
  - `chainRegistry.ts` imports every service and connector;
  - the package hard-depends on every chain's wallet libraries.
- Only EVM (wagmi), Solana (`@solana/wallet-adapter-react`) and Sui (`@mysten/dapp-kit-react`) need a
  React provider. Bitcoin (sats-connect), Stellar (wallets-kit), ICON, Injective, NEAR and Stacks are
  driven without React.
- The two main consumers go 100% through SODAX's hooks: sodax-frontend (54 files import
  wallet-sdk-react) and intents-whitelabel (27). Neither imports wagmi, `@solana/wallet-adapter-react`
  or `@mysten/dapp-kit` directly, so the chain providers do not have to wrap the app.
- Measured on published 2.2.0: `SodaxWalletProvider` costs **2,596 KB gzip**; the EVM subpath alone
  **124 KB**.
- C's adapter plan (T3.1–T3.6) only helps apps that drop chains at build time. **SODAX's own apps
  support every chain, so they would still ship all 2.6 MB.**

**Recommended upgrades**

1. **Lazy chain adapters (T3.9, the main win).**
   - `solana()` and the other adapters become small descriptors. The chain implementation loads with
     `import()`:
     - when the user first picks that chain;
     - at startup, if persisted state says that chain was connected, so reconnect still works;
     - or when the wallet modal opens, as a preload.
   - Solana and Sui providers mount lazily as siblings inside the provider. App code never uses their
     contexts, so nothing breaks.
   - Expected for an all-chain app: initial wallet JS close to the EVM size (≈124 KB) instead of
     2.6 MB, with the other chains as on-demand chunks. This is an estimate from the measured entry
     sizes; the code split is not prototyped.
   - Cost: hooks such as `useXService` and connector lists return a loading state until their chain
     has loaded. So it is opt-in in 2.x (`adapters` with lazy chains), and sodax-frontend adopts it
     with a small change to its wallet modal.
   - Needs per-file ESM output for wallet-sdk-react (T3.10, a gap now added: 192 `@/` aliases to
     rewrite).
2. **A headless config, wagmi-style (T3.8).**

   ```ts
   const wallets = createSodaxWallets({ adapters: [evm(evmOptions), solana()] });
   ```

   - It is created once, outside React, then passed to both `<SodaxWalletProvider wallets={wallets}>`
     and dapp-kit's `<SodaxProvider wallets={wallets}>`. It *is* the `WalletProviderSource`, so no
     glue hook is needed.
   - Non-React code uses actions such as `connect(wallets, …)` and `getWalletProvider(wallets, key)`.
     These replace `getXService()`, the static `getInstance()` singletons, and the "outside-provider
     fallback store" that T3.1 needed.
   - It follows wagmi's `createConfig`, which the team already knows.
   - The `adapters` prop stays as sugar that builds one internally.
3. **Later:**
   - T3.11: SSR initial state from cookies for every chain. EVM already has `tryCookieToInitialState`;
     sodax-frontend is Next.js.
   - T3.12: mock adapters for tests.

**Not recommended now**
- **Bridges from other wallet stacks** (`fromWagmi(config)`, Solana wallet-adapter, Sui dapp-kit) so
  partners can keep RainbowKit or AppKit. The `WalletProviderSource` contract (T22.1) and
  `fromWalletClient` (T32) make them cheap to add, but no consumer needs them today, and an API for a
  hypothetical caller is not shipped. Revisit when a partner asks.
- **Reown AppKit as the multi-chain layer.** The `@reown/*` packages are about 220 MB today; the
  opposite of lightweight.
- **Rewriting Solana and Sui on Wallet Standard now.** Lazy sibling mounting gets the bundle win
  without it. The rewrite stays in T31 and T32.

**The same idea on the SDK side (not in the plan, not verified)**
- Chain plugins could also be lazy, in the Wormhole style of dynamic platform imports.
- Address codecs must stay synchronous, so they would need light encoders (e.g. `@scure/base`)
  while only the spoke services load lazily.
- Check the codec call paths before planning it.
