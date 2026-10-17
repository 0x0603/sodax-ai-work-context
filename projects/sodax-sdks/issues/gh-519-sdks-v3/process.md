---
type: process
repo: sodax-sdks
github: 519
updated: 2026-10-17
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### 2026-10-14 — research session (idea capture input)

- Read #519 (R0bi7, idea capture, bullets per package, name prefix). User's v3 priority:
  lightweight; also wants non-weight ideas and competitor references.
- Read-only worktree of `origin/main` `77281f0c` in the session scratchpad (main checkout was on
  `feat/tron-spoke`; not touched).
- Installed the published `@sodax/*@2.2.0` packages in isolated scratch dirs with
  `--ignore-scripts`, bundled entry scenarios with esbuild, attributed bytes per package from the
  metafile, stubbed non-EVM libs for a what-if, timed Node imports, ran `tsc --extendedDiagnostics`
  and `npm audit --omit=dev`. Results → `measurements.md`; scripts → `artifacts/bundle-baseline/`.
- One agent reviewed dapp-kit / wallet-sdk-* / skills / API packages / types / libs; its
  load-bearing claims were re-checked by hand before landing in `ideas.md` (QueryClient shadowing,
  barrel re-export, chain registry imports, raw-tx schema copies, `http.ts` duplication, vendored
  typings, `useBitcoinBalance`, `useMMAllowance` key, zustand store, `isNativeToken`, ICON shim ×3,
  robinhood chain ×3, 52 `refetchInterval`s, snippet-check scope).
- One agent researched competitor SDK architectures → `competitors.md`; key facts re-checked with
  `npm view` / raw GitHub (LI.FI v4 deps + size budgets, Relay peers, anchor rename, Solana Kit
  numbers, web3.js v1 status, wagmi v3 optional connector peers, Node floors of chain libs).
- Cleanup: scratch worktree removed (`git worktree list` back to the original 6 entries), temp
  installs deleted. Re-measure with `artifacts/bundle-baseline/` (see `measurements.md` § Reproduce).

### 2026-10-14 — v3 what-if session ("what do we gain?")

- User asked what the improvements would buy. Measured instead of estimating; results →
  `measurements.md` § Projected v3 gains, scripts → `artifacts/bundle-baseline/` (`measure-src.mjs`,
  `measure-stub-react.mjs`, `install-groups.sh`, `time-import.mjs`, `entries-v3/`).
- Installed every dependency group alone (core, each chain, PancakeSwap, wagmi v2 / v3, v3 dapp set)
  and audited each. Built the sdk from the `77281f0c` source with esbuild (workspace packages →
  `packages/*/src`), stubbing non-EVM libraries, with per-feature entries (swap-only, one helper,
  v3-shaped dapp). Sanity: the source build of `new Sodax()` = 1,196 KB vs 1,266 KB for the published dist.
- Node timing needed two fixes for `platform: node` bundles: a `createRequire` banner (CJS deps call
  `require('buffer')`) and a callable proxy stub whose `getPrototypeOf` returns itself, because esbuild's
  `__toESM` copies only own keys, so named imports from an empty stub become `undefined`.
- Dead end: getting `getChainType` below 34 KB. Marking top-level initializers `@__PURE__`, helpers
  `@__NO_SIDE_EFFECTS__`, and inlining `ChainKeys.X` did not move it, because derived lookups
  (`new Map(Object.entries(...).map(...))`) and property reads keep the token list alive. Needs a data
  split, not annotations.
- Corrections to the earlier baseline: the "PancakeSwap 367 MB" is mostly 6 nested `viem@2.37.13` copies
  (PancakeSwap alone: 131 MB). viem installs 8× (355 MB) with the sdk and 15× (669 MB) with the React layer.
  The React install reports 81 advisories (1 critical: protobufjs via the Stellar wallets kit → Trezor).
- Cleanup: scratch worktree removed, group installs deleted.

### 2026-10-14 — v3 scope session (work, packages, difficulty, points)

- User asked for a scope: difficulty, work, packages, points. Result → `plan-v3-scope.md`.
- Sized the code on `origin/main` `77281f0c` (extracted with `git archive`, no worktree): LOC per
  package and sdk area, the 208 chain-type branches in 14 feature files, chain-lib imports per package,
  dapp-kit hooks (214 files, 126 queries, 210 keys), wallet-react structure, error styles, `Buffer`
  uses, existing raw-tx support, docs / skills / apps size.
- Downstream usage, counted on each repo's default branch: sodax-frontend 132 files, sodax-backend 99
  (CommonJS, Node 22.18, `moduleResolution: node`), intents-whitelabel 42.
- Public-API checks that decide "breaking":
  - ABIs, `BigNumber` math utils and PancakeSwap `Price<Token, Token>` / `Token` are all exported from
    the sdk root.
  - `useSwapLifecycle` and EIP-5792 batching are not on main yet (PR 504).
- wagmi v3 breaking changes (context7, wagmi docs): `useAccount` → `useConnection`, `mutate` API,
  connector SDKs as optional peers.
- The New World project's `Estimate` field is unused (4 of 372 items), so the points use a proposed
  Fibonacci scale.

### 2026-10-14 — scope revision (approach + feasibility per item)

- The user rejected the size-based scope: an item should be shown only once its approach is worked out
  and checked for feasibility. Every item was reworked with an approach checked in code (`77281f0c`,
  via `git archive`).
- Probes:
  - CommonJS `require()` of the sdk ESM build + `new Sodax()` (Node 22.15) ✓;
  - an ESM-only `package.json` ✓;
  - TS 5.8 `commonjs` + `node` typechecks the root import ✓; subpaths need `typesVersions` ✓ or
    `nodenext` ✓;
  - PancakeSwap ABIs-only import pulls 447 KB (incl. `@solana/web3.js`);
  - stellar `/minimal` covers all 11 imported names;
  - Privy has no wagmi peer; `@privy-io/wagmi` 4 peers `wagmi >=2`.
- Things the code reading changed:
  - features reach chains through the `SpokeService` dispatcher (direct access is only bitcoin ×20 and
    stellar ×1);
  - chain libs sit in 20 sdk files;
  - wallet-sdk-react already has a per-chain `chainRegistry.ts`;
  - raw (unsigned) tx already exists everywhere;
  - `SodaxError` already has 26 codes;
  - Anchor builds only 3 instructions and fetches the IDL on-chain twice per call;
  - `@sodax/types` is inlined only for the CJS build;
  - the backend v2 config endpoint exists (sdk fetch disabled in `ffb3e7e3f`);
  - the backend has tested Swagger specs.
- Result: 260 points (P0 116, P1 92, P2 52), down from 348. Dropped: unsigned-tx-first (exists),
  viem-style actions, bigint, Injective trim, ABI fragments. ~18 points ship non-breaking in 2.x.

### 2026-10-16 — align the paste-ready input with the scope

- #519 checked: no comments, body still the template, no sub-issues, last update 2026-10-13.
- `ideas.md` §1 predated the verified scope and still carried dropped ideas (unsigned-tx first,
  ABI fragments, bigint, Injective trim, viem-style actions, OpenAPI client, one hook family,
  tsup → tsdown, retiring `@sodax/libs`). At the user's request it is now one table (package · what ·
  when), every row mapped to a `plan-v3-scope.md` item. Unscoped ideas were removed too (`@sodax/widget`,
  agent-framework adapters, snippet typecheck for all packages, env id in query keys).
- PR 504 merged (`5ee56ff8`, 2026-10-15). The user's 2.x issues #505 / #507 / #529 / #531 / #532 cover
  part of E5.1 / E5.4; the lifecycle and batching rows say so. `plan-v3-scope.md` updated to match.
- Then, at the user's request, rows numbered and ranked by an importance score /10 (weight impact first,
  then correctness / security, then DX; breaking items nudged up because 3.0 is their window).

### 2026-10-16 — per-item research, work order and sub-issues

- **The request:** research how each of the 36 items is done; order them so nobody steps on anyone
  and every dependency is explicit; split the big ones into sub-issues.
- **Fan-out.** Four background research agents, one per cluster, all read-only:
  - each worked on an extracted `git archive cc053fef` tree in the scratchpad;
  - each probed only in its own scratch dir, with npm `--ignore-scripts` and never pnpm;
  - no GitHub writes.

  The checkout and the worktrees were not touched; the main clone stayed on `main` at cc053fef.
- **In-flight work mapped from `gh pr diff --name-only`:**
  - #534 Tron + MPC settle; it replaced #372;
  - drafts #497 XRP and #498 Monad (stacked on #497); #95 Aleo; #163 wallet-hw;
  - #483 (`!`, conflicting); #488; #501;
  - the user's #509, #511, #512, #523; issues #529, #531, #532, #533.
- **Release flow read.** One forward line, `main` → `release`, with the four checks in `release.mjs`.
  The `PACKAGES` list is hard-coded in three places.
- **Verification.** About 40 load-bearing claims re-checked by hand (`plan-v3-order.md` §9). Two
  probes went to live endpoints:
  - CORS preflight: the relay allow-list excludes `x-request-id`; swaps echoes it;
  - `GET /v2/be/config/all`: 200, version 2020008.

  Corrections found: `spoke.bitcoin` 21 (not 20); `walletProvider` in 55 hook files (not ~70); Aleo
  WASM 55 MB (not 43).
- **Reconciliation across clusters:**
  - wallet boundary H (no `./react` in chain packages);
  - one `WalletProviderSource`: D's T22.1 defines it, with C's `subscribe()`;
  - viem peers: sdk `^2.29.2`, wallet-sdk-react `>=2.43` (wagmi v3);
  - the T4.2 ↔ T13.3 cycle broken: T4.2 first, then T13.3.
- **Lead-added gaps:**
  - T13.5: dapp-kit chain hooks use the spoke getters;
  - T17.3 and T17.7: B/C codemod transforms;
  - T19.6: backend log capture;
  - T7.0: TS 5.9 and a current viem.
- **Synthesis data.** `artifacts/v3-probes/subissues.psv`, validated by `check.py`: no unknown
  dependencies, no backwards waves, no cycles. `gen.py` produces the critical path and the totals.
- **Totals.** 413 pts across 148 sub-issues; 229 required for 3.0.0; 17 breaking (62 pts).
- **Files:**
  - `plan-v3-order.md`, `plan-v3-subissues.md`;
  - `research/*.md` (the agent reports, with reconciliation headers);
  - `artifacts/v3-probes/`.
- **Not done.** Nothing filed on GitHub: #519 is R0bi7's board. Nothing posted, no icon-project code
  changed.

### 2026-10-16 — feasibility check

- **Question:** the user asked whether the plan is feasible.
- **New facts:**
  - downstream repos construct `SpokeService` / `EvmHubProvider` directly 0 times;
  - sdks `main` received 135 non-merge commits in 90 days, mostly from three people;
  - remote branches `feat/ton-mpc-integration` and `feat/zcash-mpc-integration` exist besides the
    open chain PRs.
- **Written up in `plan-v3-order.md` §10:** proven vs code-read vs unverified, capacity (5–8 months
  alongside feature work), coordination risk, and a de-risking order.
- **Added rule:** CJS consumers use only the root entry in 2.x, to avoid the dual-package hazard.

### 2026-10-16 — dapp-kit packaging and install matrix

- **Question:** should dapp-kit be split into many packages, and how can users of the API or of the
  SDK install only what they need?
- **dapp-kit at cc053fef:**
  - dependencies are `@sodax/sdk` and viem;
  - 88 API-lane hook files go through `sodax.api.*` / `sodax.backendApi.*`;
  - 81 of them import types (and `isAuthFailure`) from `@sodax/sdk`;
  - the leverage-yield and backend clients exist only inside the sdk.
- **Measured (npm, `--ignore-scripts`):**
  - swaps-api + bridge-api: 5.2 MB;
  - the same plus react-query, react and react-dom: 21 MB, 0 advisories.
- **Recommendation** (`plan-v3-order.md` §11):
  - split only along install-weight axes (SDK vs API, chain, wallet); features stay subpaths;
  - add an sdk-free API-hooks package on `@sodax/api`, re-exported by dapp-kit, so nothing breaks;
  - move chain-specific dapp-kit hooks to per-chain subpaths in 3.0;
  - per-persona install fixtures in CI;
  - an install matrix in the docs.
- **New sub-issues (proposed):** T28.4, T13.6–T13.10, T24.3. Totals are now 432 / 155; 231 are
  required for 3.0.

### 2026-10-16 — parent issues

- **Request:** the user asked for the parent issues.
- **Result:** 30 parents (items with two or more sub-issues) and 7 single-PR items, generated from
  `subissues.psv`.
- **Parent-level "waits on":** derived from the sub-issue dependencies, each with the first
  sub-issue pair.
- **Paste-ready drafts:** titles and bodies in `parent-issues.md`, with no context-repo paths.
- **Not filed:** #519 is R0bi7's board; filing waits for the user.
- **Later the same day:** at the user's request, a **Why it matters** benefit line for all 37 issues
  (30 parents + 7 single PRs), a summary table, and paste-ready drafts for the single-PR items.

### 2026-10-16 — client usage per issue

- **Request:** the user asked, for every issue, what users get once it lands and how a client uses it.
- **Before examples:** checked against cc053fef — `SodaxProvider({ config })`,
  `SodaxWalletProvider({ config })`, `useQuote({ params: { payload } })`,
  `useSwap()({ params, walletProvider })`, `useWalletProvider({ xChainId })`,
  `getSwapQuoteQueryOptions({ sodax, payload })`, `useSwapLifecycle(...)`,
  `new SwapsApi({ baseUrl, timeout, apiKey })`, `PrivateKeyEvmWalletConfig`, `sodax.initialize()`,
  `ChainKeys.SOLANA_MAINNET`, `privy(options)`.
- **After examples:** the names the research proposes, marked *(proposed)* until the ADRs.
- **Written to** `client-usage.md`: an index (auto / opt-in / 3.0 / internal / later) and one section
  per issue.

### 2026-10-16 — a better wallet-sdk-react

- **Question:** is there a better approach than plain adapters, e.g. for wallet-sdk-react?
- **Code facts:**
  - `SodaxWalletProvider.tsx:5-10` statically imports the EVM, Solana and Sui providers, and
    `chainRegistry.ts` imports every chain;
  - only EVM, Solana and Sui need React providers;
  - sodax-frontend (54 files) and intents-whitelabel (27) use only SODAX hooks, with 0 direct imports
    of wagmi, `@solana/wallet-adapter-react` or `@mysten/dapp-kit`.
- **Recommendation** (`plan-v3-order.md` §12):
  - lazy chain adapters (T3.9): all-chain apps start near the EVM size (124 KB vs 2.6 MB, an estimate
    from measured entries; not prototyped);
  - a headless `createSodaxWallets()` (T3.8): wagmi-style; the object is the `WalletProviderSource`
    and replaces the singletons and fallback store;
  - later: SSR cookies for every chain (T3.11) and mock adapters (T3.12);
  - not now: bridges from other wallet stacks (no consumer yet), Reown AppKit (weight), a Wallet
    Standard rewrite (stays in T31/T32).
- **Gap found:** wallet-sdk-react's build switch was not covered by any sub-issue; added as T3.10
  (192 `@/` aliases).
- **Totals:** 448 pts / 160 sub-issues; 234 required for 3.0.

### 2026-10-16 — every package rethought

- **Request:** research and rethink all packages.
- **Facts gathered:**
  - workspace manifests and dependency graph;
  - `@sodax/assets` is private and unpublished;
  - `@sodax/libs` has 3 Turbopack-workaround subpaths, imported by the sdk, wallet-sdk-core and
    wallet-sdk-react (3 files each);
  - downstream imports: sdk 122/97/22, dapp-kit 42/0/18, wallet-sdk-react 51/0/26, types 3/3/14, and
    0 for wallet-sdk-core, swaps-api, bridge-api and libs;
  - npm weekly downloads (some transitive);
  - wallet-sdk-react builds each chain's signer from wallet-sdk-core.
- **Result:** `plan-v3-packages.md` — principles, the target map, dependency picture, persona
  matrix, peer comparison, timeline, risks.
- **Changed decisions:**
  - the API hooks go to `@sodax/api/react` (renumbered T13.6–T13.9 → T28.5–T28.8);
  - wallet-sdk-core folds into `@sodax/sdk/wallet` with a shim (T6.7, new);
  - `@sodax/libs` is retired into chain-stacks and chain-injective (T1.30, new);
  - kept separate on purpose: dapp-kit vs wallet-sdk-react, types vs api, api vs sdk.
- **Totals:** 453 pts / 162 sub-issues; 239 required for 3.0; 19 breaking.

### 2026-10-16 — final plan

- **Request:** the user asked for the final plan.
- **Result:** `plan-v3-final.md`, one entry point:
  - outcome numbers;
  - the package map and its rules;
  - delivery model;
  - roadmap by wave;
  - the issue table generated from `subissues.psv` (30 parents + 7 singles, with outcomes);
  - decisions with recommendations;
  - coordination asks;
  - totals and capacity, feasibility, next steps.
- **Router:** `brief.md` now points to it first. The other plan files remain the detail.

## Findings

- Tree-shaking is effectively broken: one helper import = 832 KB gzip. Causes, all verified:
  import-time `initEccLib`, single flat dist with 142 impure top-level initializers, eager `Sodax`
  constructor, `@sodax/types` without `sideEffects`, `@sodax/types` inlined into 4 packages.
- Non-EVM chain libraries are ~70% of `new Sodax()` gzip (stub what-if).
- `@sodax/libs` injective bundle carries its own viem + ethers + axios.
- wallet-sdk-react `EvmProvider` shadows the app's QueryClient (v2 bug; see `ideas.md` §3).
- The monorepo's `pnpm` overrides do not protect consumers: a fresh consumer install reports 35
  advisories (11 high).
- v3 what-if for an EVM-only app: swap dapp 2,994 → 186 KB gzip (582 KB with WalletConnect);
  `npm i @sodax/sdk` 778 MB / 35 advisories → ~85 MB / 0; dapp install 1.8 GB / 81 → 108 MB / 0; Node
  import + `new Sodax()` 888 ms / 268 MB → ~92 ms / 74 MB.

## Changes During Work

- None in any icon-project repo. Nothing posted on GitHub.
