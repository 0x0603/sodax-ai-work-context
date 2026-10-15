---
type: process
repo: sodax-sdks
github: 519
updated: 2026-10-14
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

- The user rejected the size-based scope: "bạn phải suy nghĩ được cách làm và khả thi thì mới show lên
  cho tôi chứ?". Every item was reworked with an approach checked in code (`77281f0c`, via `git archive`).
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
