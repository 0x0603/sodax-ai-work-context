---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, research, build, packaging, esm, types, ci, release]
source_commit: cc053fef
---

# GH-519 · Cluster A — build, packaging, types, CI, release model

> **Written by a research agent on 2026-10-16**, against the read-only `origin/main` tree at
> cc053fef. The lead re-checked its load-bearing `path:line` claims (`plan-v3-order.md` §9). Where
> this report and `plan-v3-order.md` / `plan-v3-subissues.md` differ, those files win.
>
> **Reconciled after synthesis**
>
> - **Delivery model:** confirmed in `plan-v3-order.md` §1.
> - **Viem peer:** for wallet-sdk-react it is `>=2.43.0` because of wagmi v3 (cluster C). This report's `^2.29.2` applies to sdk and wallet-sdk-core only.
> - **T15.1 is split.** T15.1 covers the conflict-free `selectSolvedIntentPacket.ts`; T15.3 covers the rest, after T1.4.
> - **T7.0 (TS 5.9 and a current viem) is added to this cluster.**

Research only. No repo was changed and nothing was posted.

- **Source of truth.** `origin/main` at `cc053fef` (2026-10-15), read from the extracted tree. Every
  `path:line` without a prefix is relative to that tree.
  - Other prefixes: `npm:<pkg>@<ver>` is a published tarball; `backend@985959e9:` is
    `sodax-backend` `origin/development`; `#NNN` is an open sodax-sdks PR as of 2026-10-16.
- **Probes.** All ran in `$S/agent-A/` with Node 22.15, esbuild 0.25.10 and TypeScript 5.8.3 / 5.5.4
  (the catalog version). Commands and results are in § Probes.
- **Items.** T2, T4, T10, T11, T14, T15 (score ≥ 6) in depth; T29 (score 4) short; plus A1
  (release model) and `packages/assets`.

---

## 0. Key decisions (one screen)

1. **Delivery: expand, then contract, on `main`. Confirmed, with two preconditions.**
   - The release tooling must learn about a maintenance line before the first breaking merge:
     - stop stable 2.x publishes from taking the npm `latest` tag (A1.1);
     - a `release-2.x` release mode (A1.4).
   - T1 (cluster B) and T3/T6 (cluster C) need non-breaking expand steps. Without them the
     "short" breaking window lasts months.
   - 3.0.0-rc.N can ship through today's flow unchanged.
2. **T10 can drop the `@sodax/types` and near-api-js inlining in *both* builds in 2.x, not only ESM.**
   - The CJS twin already `require()`s ESM-only packages: `@mysten/sui/*` in `npm:@sodax/sdk@2.2.0 dist/index.cjs`.
   - So every CJS consumer already depends on `require(esm)`, and `engines` is `>=22.12.0`. The
     inlining protects nothing.
3. **T2 build template.**
   - `tsc -p tsconfig.build.json` emits ESM into `dist/` next to tsup's `index.cjs` / `index.d.cts`.
   - 3.0 deletes tsup.
   - All four packages have 0 extensionless relative imports, 0 JSON imports, 0 path aliases and
     0 value-import cycles.
   - The `@sodax/libs` Turbopack workarounds are untouched: the sdk keeps importing them through
     the same external subpaths.
4. **ESM-only exports must include a `default` (or `require`) condition.**
   - With `import` only, `require()` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` even on Node 22.15 (probe).
   - dapp-kit and wallet-sdk-react ship `import`-only exports today.
5. **T14 is non-breaking and belongs in 2.x (scope says "Must").**
   - Step 1: `"sideEffects": false` on `@sodax/types` (33 → 5 modules for `getChainType`;
     `ChainKeys` costs 0.4 KB).
   - Step 2: split the token-free chain info out of `chains.ts`. Probe: 34.3 → 2.1 KB gzip;
     `SwapsApi` 38.5 → 5.6 KB gzip.
   - The root entry stays an aggregator.
6. **Peers.**
   - viem: API floor 2.28.0 (probe); declare `^2.29.2`, the tested catalog version.
   - `@sodax/types` has no runtime deps, so it gets no peer.
   - react-query is already a `5.x` peer in both React packages.
   - wagmi becomes a peer with T7.
7. **CI gates (T11) land first.** They touch only `ci.yml` and new scripts, and no open PR touches
   those files. attw and an sdk tarball gate already exist. The missing pieces:
   - per-scenario bundle budgets;
   - consumer install footprint and audit;
   - publint.

---

## A1. Release and branching model

### What the tooling does today (verified)

| Step | Evidence |
| --- | --- |
| `pnpm release` → `node scripts/release.mjs` | `package.json` (`"release"` script) |
| Must run on branch `release` | `scripts/release.mjs:338-339` |
| `origin/main` must be fully merged into `release` | `scripts/release.mjs:364-366` |
| `release` must contain the newest `@sdks@` tag | `scripts/release.mjs:380-388` |
| The new version must exceed the current version **and the highest tag of any kind** (`@sdks@*` and backport `@sodax/<pkg>@*`) | `scripts/release.mjs:257-273` |
| Publishable packages are auto-discovered under `packages/*` (one level only, non-private, `@sodax/` name, grammar-valid version) | `scripts/release.mjs:61-87` |
| All publishable versions must already be equal before the bump | `scripts/release.mjs:89-98` |
| Hard-coded package lists must match discovery: `bump-versions.sh:7`, plus **two** `PACKAGES=(…)` arrays in `sdks-publish.yml:30,72`. Checked at release (`release.mjs:229-250`) and on every PR (`scripts/release.test.mjs:306-311`, run by `pnpm test` in `ci.yml:234-235`) | as cited |
| `CONFIG_VERSION` is derived; majors 1..99 are accepted | `scripts/bump-versions.sh:32`, `scripts/config-version.mjs:59-63,71` |
| The tag `@sdks@X` publishes every package in a fixed order | `sdks-publish.yml:5-6,72-77` |
| dist-tag: `-rc.N` → `rc`; **any stable version → `latest`** | `sdks-publish.yml:38-43` |
| The 9 per-package backport workflows (`@sodax/<pkg>@X`) are branch-agnostic, have no concurrency group, and use the same rule (stable → `latest`) | `sodax-sdk-publish.yml:5-6,31-36` (same in the 8 siblings) |
| "the unified flow only moves forward" | `packages/RELEASE_INSTRUCTIONS.md:94-96` |
| Versions on `main` are stale by design (`2.0.0-rc.17`, `CONFIG_VERSION = 2_000_017`); bumps live only on `release` (`2.2.0`) | `packages/*/package.json`, `packages/types/src/index.ts:33`; `git show origin/release:packages/types/package.json` → 2.2.0 |

### Can 3.0.0-rc.N ship while 2.x patches continue?

**3.0.0-rc.N: yes, unchanged.**

- 3.0.0-rc.1 advances past 2.x, so the version guard passes.
- `CONFIG_VERSION` becomes 3_000_001, which is valid.
- `sdks-publish.yml` publishes it under `rc`.

**2.x patches after the first 3.0 tag: not through `pnpm release`.** Four checks refuse:

- branch ≠ `release` (`:339`);
- `main` is not merged (`:366`);
- 2.N.M does not exceed `3.0.0-rc.1` (`:268-271`);
- HEAD does not contain the newest tag (`:387`).

The backport tags still work: they push from any branch, and you bump with `bash scripts/bump-versions.sh 2.N.M`, which has no branch check. Three problems remain:

- **dist-tag.** A stable 2.x published after 3.0.0 becomes `latest` (`sdks-publish.yml:38-43`,
  `sodax-*-publish.yml:31-36`). Every `npm i @sodax/sdk` would silently install 2.x again. This is a
  real hazard and must be fixed before the first post-3.0 maintenance publish.
- **Ordering.** Nine tags start nine concurrent runs. There is no topological order (dapp-kit can
  publish before the sdk version it pins exists), and a partial failure leaves a half-published
  version.
- **Shared prerelease channel.** Both lines share `rc`, and the version grammar allows only
  `-rc.N` (`config-version.mjs:15`, `bump-versions.sh:17`). So no 2.x rcs during the 3.0 rc window.

**New packages (`@sodax/chain-*`, `@sodax/chains-all`, `@sodax/api`, `@sodax/wallet-hw`).** Five constraints:

1. They must live at `packages/<name>`. Both `pnpm-workspace.yaml:3` (`packages/*`) and the
   discovery scan (`release.mjs:65`) go one level deep, so a nested `packages/chains/solana` is
   neither a workspace package nor published.
2. They must appear in three hard-coded arrays, in publish order.
3. Their version has to be aligned by hand when `main` is merged into `release`. A new manifest
   arrives with main's stale version. Precedent: `@sodax/bridge-api` was added at `2.0.0-rc.17`
   (`57ceebdb`) and hand-aligned to `2.2.0-rc.5` inside merge `16fd6f6f` on `release`.
4. They need one backport workflow file each, which means 10+ more copies of the same YAML.
5. `#163` (wallet-hw) shows the failure mode. It declares `"private": false, "version":
   "0.0.1-test"`, which `release.mjs:80-82` rejects, and it updates no list. Its CI is red.

**`CONFIG_VERSION` across two lines.**

- Encoding is fine: 2.5.1 → 2_050_199 and 3.0.0-rc.1 → 3_000_001.
- The runtime comparison is dormant: the commented-out `response.version < CONFIG_VERSION` in
  `packages/sdk/src/shared/config/ConfigService.ts:158-181`.
- If T20 (remote config) revives it, a 2.x client would *accept* a 3.x-shaped config because the
  number is higher. Compare majors, not `<`. This is a note for cluster B / T20.

**`packages/assets`.**

- It is private (`packages/assets/package.json:3`), so release and pack tooling skip it.
- Logos are served from raw `main` URLs: `packages/types/src/chains/chains.ts:74-75`, and
  `TOKEN_LOGO_BASE_URL` in `tokens.ts:41`.
- A 2.x maintenance line keeps pointing at `main`, so treat `packages/assets` as append-only on
  `main`. No packaging impact.

### Recommendation (validate the working assumption, with evidence)

- **Expand-then-contract on `main` is the right model.**
  - Release tooling supports exactly one forward line, from `main` through `release`: the four
    checks above.
  - Four open chain PRs (`#534`, `#497`, `#498`, `#95`), plus the `feat/ton-mpc-integration` and
    `feat/zcash-mpc-integration` branches, all edit the files v3 restructures:
    `types/src/chains/{chain-keys,chains,tokens}.ts`, `types/src/utils/utils.ts`,
    `sdk/.../SpokeService.ts`, `sdk/.../shared-utils.ts`.
  - The v2 precedent (`sdk-v2-main`) needed at least five `main` merges in three weeks
    (merge commits `84a6bd7ff` … `0ab03c8c7`, 2026-04-01 → 04-20). Under the team's
    merge-never-rebase rule, a v3 branch would repeat that.
- **The window stays short only if the big moves are expand-able.**
  - T1 (cluster B): plugin packages exist in 2.x, and the sdk registers all of them by default.
    3.0 then only flips the default and drops the deps.
  - T3/T6 (cluster C): the same pattern.
  - Packaging constraint for B: in 2.x the sdk must not depend on a package that itself
    depends (dep or devDep) on the sdk. Turborepo rejects workspace dependency cycles. Either the
    plugin depends only on `@sodax/types` / `@sodax/libs`, or the plugin re-exports from the sdk and
    the sdk does not depend on it.
- **Timeline.**
  1. *Now (2.x).* Land A1.2 (and optionally A1.3) before any new package ships (T1 E2.4,
     wallet-hw, `@sodax/api`).
  2. *Before the first breaking merge.* Cut the last planned 2.x minor, branch `release-2.x` from
     its tag, land A1.1 and A1.4, and announce a chain-PR cutoff.
  3. *Contract.* 3.0.0-rc.N from `main` through `release`, dist-tag `rc`; no 2.x rcs in this window.
  4. *3.0.0 → `latest`.* 2.x maintenance from `release-2.x`, tag `@sdks@2.N.x`, dist-tag `v2`.
     Bug fixes land on `main` first, then are cherry-picked to `release-2.x`.
- **npm setup for new names** (checklist; cannot be verified from code). The publish token
  (`SODAX_SDKS_NPM_PUBLISH_TOKEN`) must be allowed to *create* packages under `@sodax`: an org-wide
  token, not one limited to specific packages. Each first publish uses `--provenance --access public`.

### A1 sub-issues

| id | title | what | touches | size | breaking | phase | depends on | conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| A1.1 | `ci(publish): never move npm latest backwards` | One `scripts/dist-tag.mjs <pkg> <version>` with `node:test` coverage. Rules: `-rc.N` → `rc`; stable with major < major of the npm `latest` → `v<major>`; otherwise `latest`. Use it in the unified and per-package workflows. | `.github/workflows/sdks-publish.yml`, `sodax-*-publish.yml`, `scripts/dist-tag*.mjs`, `package.json` (`test:release-scripts`) | 2 | no | expand-2.x (before 3.0.0-rc.1) | – | none (no open PR touches workflows or scripts) |
| A1.2 | `build(release): derive publish list and order from the workspace` | Replace the 3 hard-coded `PACKAGES` arrays with `node scripts/release-packages.mjs` (topological order from manifests). Packages with no published version adopt the release version, so the pre-bump alignment check skips them. Keep the live-tree test. | `scripts/release.mjs`, `scripts/bump-versions.sh`, `sdks-publish.yml`, `scripts/release.test.mjs`, `RELEASE_INSTRUCTIONS.md`, `CONTRIBUTING.md` (adding a package) | 3 | no | expand-2.x | – | `#163` (adds a publishable package; would no longer need list edits) |
| A1.3 | `ci(publish): one tag-driven backport workflow for every package` | `sodax-package-publish.yml` on tag `'@sodax/*@*.*.*'`. Resolves the directory from the tag via A1.2. Runs `config-version.mjs --check` only for `@sodax/types` once T10 lands. Delete the 9 per-package files. | `.github/workflows/sodax-*-publish.yml` | 2 | no | expand-2.x | A1.2, A1.1 | none |
| A1.4 | `feat(release): maintenance-line releases from release-<major>.x` | `pnpm release` on `release-2.x`: base tag = highest `@sdks@2.*`; the version must advance within the line; no main-merge check; notes from line commits; prints `gh release create … --target release-2.x`. Document branch protection and the cherry-pick flow. | `scripts/release.mjs`, `scripts/release.test.mjs`, `RELEASE_INSTRUCTIONS.md` | 3 | no | contract prep (before the first breaking merge) | A1.1 | none |

---

## T2 (score 9) — Unbundled ESM via `tsc` + no import-time side effects (E1.1, E1.4)

### Approach

**Expand phase (2.x, non-breaking).** Apply to sdk, wallet-sdk-core, swaps-api and bridge-api.

1. **Add `tsconfig.build.json`** next to each `tsconfig.json`. The base config includes tests,
   because `checkTs` relies on that (`scripts/check-tests-typechecked.mjs`).

   ```jsonc
   {
     "extends": "./tsconfig.json",
     "compilerOptions": { "outDir": "dist", "rootDir": "src", "noEmit": false,
                          "declaration": true, "declarationMap": false, "sourceMap": false },
     "include": ["src"],
     "exclude": ["src/**/*.test.ts", "src/e2e-tests/**", "dist", "node_modules"]
   }
   ```

   - Keep comments. `removeComments` would strip `/* @__PURE__ */` annotations (T2.4) *and* the
     JSDoc in `.d.ts`.
   - There are no test helpers outside `*.test.ts`. Verified: no non-test file imports vitest, and
     there are no `tests/`, `__mocks__/` or `fixtures/` directories under the four `src/`.
2. **Reduce tsup to CJS only.** `format: ['cjs']`, `clean: false`. Remove the `noExternal` /
   `conditions` / `mainFields` hacks (T10.1).
   - Build: `rm -rf dist && tsup && tsc -p tsconfig.build.json && node ../../scripts/verify-dist-exports.mjs`.
   - Dev: `tsc -p tsconfig.build.json --watch`. Apps consume ESM.
   - Layout:

     | Files | Producer |
     | --- | --- |
     | `dist/index.js`, `dist/index.d.ts`, `dist/**` | `tsc` (ESM, one file per source) |
     | `dist/index.cjs`, `dist/index.d.cts` | tsup |

     No filename collides.
3. **Manifest** (sdk shown; the other three are identical):

   ```jsonc
   "main": "./dist/index.cjs", "module": "./dist/index.js", "types": "./dist/index.d.ts",
   "exports": {
     ".": { "import":  { "types": "./dist/index.d.ts",  "default": "./dist/index.js" },
            "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" } },
     "./package.json": "./package.json"
   },
   "sideEffects": false   // already present; becomes operative with per-file output
   ```

   - `.d.ts` for ESM and `.d.cts` for CJS, so attw keeps passing (today `attw --pack`).
   - The bundled `.d.cts` (rollup-dts) stays until 3.0.
   - `scripts/verify-dist-exports.mjs` already handles any `exports` shape (`:32-45`).
4. **Remove import-time side effects** (T2.3) and **annotate pure top-level initializers** (T2.4).
   See the inventory below.
5. **Write the package template once** (in T2.2: tsconfig.build, exports with `default`,
   `sideEffects`, `typesVersions`, check scripts). New packages (T1 plugins, T28 `@sodax/api`) are
   born ESM-only and built with tsc. They are new, so there is no back-compat to keep.
   - Add `check:circular-deps` to wallet-sdk-core; it is the only one of the four without it.
     Today it has 0 cycles (probe P11).

**Contract phase (3.0).** T4.1 deletes the tsup CJS half and the `require` branch.

### Evidence (re-verified at cc053fef)

- **tsup is flat and dual today.**
  - `packages/sdk/tsup.config.ts:4-7` (`entry: ['src/index.ts']`, `format: ['esm','cjs']`,
    `splitting: false`), `:14` (`noExternal: ['near-api-js', '@sodax/types']`), `:18`.
  - The same shape in `wallet-sdk-core/tsup.config.ts:14`, `swaps-api/tsup.config.ts:14-18` and
    `bridge-api/tsup.config.ts:14-18`.
- **The sources are tsc-ready.**
  - All four are `"type": "module"` with `module: NodeNext` (`packages/sdk/tsconfig.json:17-18`; the
    others in their tsconfigs).
  - Relative imports: sdk 928, wallet-sdk-core 57, swaps-api 26, bridge-api 23. **0 extensionless,
    0 JSON imports, 0 `@/` aliases, no `.d.ts` / `.js` / asset files in `src`, no `process.env`, no
    `import.meta`.**
  - For comparison: dapp-kit has 7 `@/` alias imports and wallet-sdk-react has 192, through
    tsconfig `paths` (`packages/dapp-kit/tsconfig.json`, `packages/wallet-sdk-react/tsconfig.json`).
    tsc does not rewrite aliases, so clusters C/D must convert them before switching those packages
    to tsc.
- **Every bare import is a declared dependency.** Under tsup, an undeclared import would have been
  bundled silently; under tsc it would break consumers.
  - sdk: 24 packages (28 specifiers counting subpaths), exactly its 24 entries in
    `packages/sdk/package.json` `dependencies`.
  - wallet-sdk-core: 21 packages, exactly its 21 dependencies. Deep imports
    `bitcoinjs-lib/src/networks.js` and `cosmjs-types/.../tx.js` are already external in today's
    ESM dist.
  - swaps-api / bridge-api: `@sodax/types` and `valibot` only.
- **Bundled-in (`noExternal`) dependencies, and what happens when they are external.**

  | Package | Inlined today | Effect when external |
  | --- | --- | --- |
  | sdk | `@sodax/types` (239 KB of the 1.71 MB `index.mjs`, measurements.md) | Already a dependency (`packages/sdk/package.json:78`), so no install change; one copy. |
  | sdk | `near-api-js` 7.2.0, which drags in `@noble/curves` 2.0.1, `@noble/hashes` 2.0.1, `borsh` 2.0.0 and `@scure/base` 2.0.0 (counted in `npm:@sodax/sdk@2.2.0 dist/index.mjs`: 15 near-api-js, 7 noble-curves, 5 borsh, 5 noble-hashes, 1 scure modules) | near-api-js is already a dep (`:87`); its deps resolve under it. Removes ~97 KB + 68 KB + borsh/scure (unminified). Also fixes a licensing gap: `borsh` is Apache-2.0 and near-api-js is "(MIT AND Apache-2.0)", both redistributed inline with no NOTICE. |
  | wallet-sdk-core | the same two (`npm:@sodax/wallet-sdk-core@2.2.0`: 36 near-api-js, 7 noble-curves, 6 borsh, 5 noble-hashes, 1 scure, 11 types modules) | Both already deps (`wallet-sdk-core/package.json:64-85`). |
  | swaps-api / bridge-api | `@sodax/types` (9 modules; most of the 185 KB `index.mjs`) | Already a dep. |
  | libs | `@stacks/transactions`, `@stacks/network`, `@stacks/connect`, `@injectivelabs/wallet-strategy` (`packages/libs/tsup.config.ts:117`) | Stays bundled; bundling is the point of the package. Only the CJS format goes in T4. |
- **`@sodax/libs` and Turbopack: no re-trigger.**
  - All three bugs live inside third-party packages
    (`apps/example-next-js-16/README.md` § Background; `packages/libs/README.md:18-24`):
    - the `@stacks/transactions` scope-hoisting cycle;
    - `@stacks/connect`, which pulls in that cycle plus `@reown/appkit`;
    - CryptoJS UMD inside `@injectivelabs/wallet-ledger`.
  - The sdk reaches them only through `@sodax/libs/stacks/core`, imported in 3 files
    (`shared/utils/stacks-utils.ts:1`, `shared-utils.ts:28`, `StacksSpokeService.ts:21`). Those
    imports are external today (`npm:@sodax/sdk@2.2.0 dist/index.mjs` imports
    `'@sodax/libs/stacks/core'`) and stay identical when unbundled.
  - The sdk's own graph has 0 value-import cycles (probe P11), guarded by madge in CI
    (`packages/sdk/package.json` `check:circular-deps`, `ci.yml:193-194`).
  - CI already rebuilds the workspace dist through Next 16 / Turbopack (`ci.yml:221-232`).
- **The rest of the existing smoke coverage also exercises the new output.**
  - ESM in Node: `pnpm --filter node test-libs` (`ci.yml:225-226`, tsx → `import` condition).
  - CJS: `apps/node-cjs` (`tsc && node dist/index.js` through `pnpm test`).
  - Vite: `ci.yml:221-223` (apps).
  - attw: `ci.yml:202-203`.
- **Tarball size.**
  - Today: 1,011,426 B (`npm:@sodax/sdk@2.2.0`), against the CI gate of 1,000,000 B ±5% (`ci.yml:205-211`).
  - Probe: the unbundled sdk ESM JS is 1,645 KB raw (1,109 KB without comments) and 351 KB gzipped.
  - Removing the inlined copies (T10) offsets this.
  - Re-baseline `SODAX_SDK_TARBALL_BASELINE_BYTES` in the T2.1 PR.

### A3 — module-level side-effect inventory (all 7 packages)

Method: a TypeScript-AST scan of every top-level statement in non-test `src` (probe P1).

**Totals per package.**

| Package | Files | Hard | Soft calls | Soft reads | Enum IIFE |
| --- | --: | --: | --: | --: | --: |
| sdk | 206 | 1 | 142 (in 28 files) | 3 | 3 |
| wallet-sdk-core | 34 | 2 | 3 | 3 | – |
| wallet-sdk-react | 121 | 2 stores + the `'use client'` directive | 10 | 5 | 3 |
| dapp-kit | 259 | 0 | 1 | – | – |
| types | 60 | 0 (the one hit is a `true satisfies …` no-op, `types/src/backend/sponsoringApi.ts:63`) | 32 (in 6 files) | 37 (in 6 files) | 2 |
| swaps-api | 8 | – | 37 | – | – |
| bridge-api | 8 | – | 29 | – | – |

- No package has a side-effect import (`import 'x'`), a polyfill import, a `globalThis` / `window`
  assignment, a `register*()` call, a decorator, or a static block.
- swaps-api and bridge-api calls are valibot schemas, which are pure: valibot 1.4.2 carries 264
  `@__NO_SIDE_EFFECTS__` annotations (probe P9).

**Classification.**

**1. Global mutation or CPU work at import. Fix now (T2.3).**

- `packages/sdk/src/shared/services/spoke/BitcoinSpokeService.ts:48`: `initEccLib(ecc)` mutates
  bitcoinjs-lib's global ECC slot.
- `packages/wallet-sdk-core/src/wallet-providers/bitcoin/BTCWalletProvider.ts:19`: the same.
- `BTCWalletProvider.ts:20`: `ECPairFactory(ecc)` runs ecpair's ECC self-test at import.
- Fix: move these into a lazy `ensureEcc()` called from the constructor or first use.
  `initEccLib` with the same instance is cheap after the first call.
- Both are used only inside their own module. `btc-utils.ts:92` deliberately avoids `payments.p2tr`
  to stay ECC-free. So `sideEffects: false` does not drop an effect someone else relies on.

**2. Module singletons. Owned by T3 (cluster C), listed for completeness.**

- `packages/wallet-sdk-react/src/useXWalletStore.ts:52`: global zustand `create()` with
  `persist`, which reads storage at creation.
- `useWalletModalStore.ts:46`: another global zustand store.
- `chainRegistry.ts:167`: the eager registry. 9 `defineChain` calls statically import every
  chain's connectors and services.
- Harmless module caches: `warnedChains = new Set()` (`hooks/useWalletProvider.ts:12`,
  `hooks/useXConnectors.ts:10`, `utils/matchConnectorIdentifier.ts:4`), `new WeakSet`
  (`privy/PrivyStartupGuard.tsx:9`), `new WeakMap` (`providers/evm/privySource.ts:30`), and the
  `createContext` calls (`dapp-kit/src/contexts/index.ts:8`, `wallet-sdk-react/src/context/WalletConfigContext.ts:10`).

**3. Derived top-level constants that keep dependency chains alive.**

These are only reached when their module is included. With per-file output plus
`sideEffects: false`, an unused module is dropped wholesale. But esbuild keeps unannotated calls
inside an included module (probe P9).

- **sdk** (fix with `/* @__PURE__ */` or lazy getters, T2.4):

  | Initializer | Where | Keeps alive |
  | --- | --- | --- |
  | `getEvmViemChain(...)` at module scope | `shared/services/Erc4626Service.ts:15`, `Permit2Service.ts:14` | the viem chain table |
  | `defineChain` | `shared/utils/constant-utils.ts:19,45` | – |
  | `parseAbi` ×3 | `leverageYield/LeverageYieldService.ts:131,146,154` | – |
  | `getAbiItem` ×3 | `swap/EvmSolverService.ts:41,43,45` | – |
  | BigNumber constants | `moneyMarket/math-utils/ray.math.ts:4-10`, `constants.ts:3`, `bignumber.ts:5` | bignumber.js |
  | `createInvariant` / `isCodeMember` / `new Set` in each `*/errors.ts` (~80 hits); defined at `errors/invariant.ts:49`, `errors/guards.ts:39` | the error modules | – |
  | `new URL` | `backendApi/apiConfig.ts:137` | – |

  - Annotate the two helper *definitions* with `/* @__NO_SIDE_EFFECTS__ */`. That covers every
    call site without touching the files the user's open PRs edit (`#509`, `#511`, `#512`, `#523`).
- **types** (fix with the module split, T14.2):
  - `chain-keys.ts:43-44`;
  - `chains.ts:63,65` (`IntentRelayChainIdToChainKey = new Map(Object.entries(…).map(…))`), `:79`
    (`baseChainInfo` with 22 `chainLogo()` calls), `:415-438` (9 `filterChainKeysByType`
    families and 11 `new Set`), `:685` (`spokeChainConfig`, built from 22 token lists),
    `:1278-1307` (bnUSD lists, `hubConfig`);
  - `utils/utils.ts:110` (`EVM_CHAIN_ID_TO_KEY`);
  - `swap/swap.ts:7,454`;
  - `moneyMarket/moneyMarket.ts:8,41,266`;
  - `leverageYield/leverageYield.ts:86`;
  - `hooks/hooks.ts:45`;
  - `index.ts:101` (`SDK_VERSION`, trivial).
- **wallet-sdk-core / wallet-sdk-react:** `defineChain` at
  `wallet-sdk-core/src/wallet-providers/evm/EvmWalletProvider.ts:60,72` and
  `wallet-sdk-react/src/xchains/evm/EvmXService.ts:50,76`. These are duplicated chain definitions,
  deduped under T23 (E6.3).

**4. TS enums emitted as IIFEs.** esbuild keeps them even when unused (probe P9). Each costs about
100 B and pulls nothing in.

- `sdk/src/shared/types/intent-types.ts:105`, `sdk/src/migration/BalnSwapService.ts:24,35`
- `types/src/common/common.ts:147,155`
- `wallet-sdk-react/src/xchains/icon/IconXService.ts:15`, `xchains/icon/iconex/index.tsx:4,12`

Leave them. Converting numeric enums to `as const` objects drops the reverse mapping, which would be
a breaking change for nothing.

### Feasibility verdict: feasible, low risk

| Probe | What it showed |
| --- | --- |
| P10 | tsc 5.5.4 builds `@sodax/types` + swaps-api ESM. The output imports in Node ESM (12 ms) and through CJS `require(esm)` (14 ms). |
| P2 | Unbundled sdk (third-party externals excluded): `SodaxError` 0.6 KB gzip (today: the whole 832 KB bundle); `getChainType` 34.3 KB (T14 then takes it to 2.1 KB); `new Sodax()`, SODAX's own code, 136.5 KB gzip. |
| P4 | wallet-sdk-core `import { EvmWalletProvider }`: published flat ESM = 153.8 KB own code plus 15 external chain libraries (bitcoinjs, solana, stellar, injective, icon, sui, …); unbundled = 5.8 KB plus `viem` only. |

### T2 sub-issues

| id | title | what | touches | size | breaking | phase | depends on | conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T2.1 | `build(sdk): emit unbundled ESM with tsc, keep tsup for CJS` | Add `tsconfig.build.json`; tsup → CJS only; new build/dev scripts; `module` / `exports` as above; re-baseline the tarball gate. | `packages/sdk/{package.json,tsup.config.ts,tsconfig.build.json}`, `.github/workflows/ci.yml:209` | 3 | no | expand-2.x | T10.1 (do first, so CJS and ESM stop inlining together), T11.2 (to see the delta) | `#95` (`packages/sdk/package.json`, different fields; trivial) |
| T2.2 | `build(wallet-sdk-core,swaps-api,bridge-api): emit unbundled ESM with tsc` | Same change ×3. Add `check:circular-deps` to wallet-sdk-core. Document the package template in `CONTRIBUTING.md`. | `packages/{wallet-sdk-core,swaps-api,bridge-api}/{package.json,tsup.config.ts,tsconfig.build.json}`, `CONTRIBUTING.md` | 2 | no | expand-2.x | T2.1 | `#497`, `#95` (`wallet-sdk-core/package.json`, trivial) |
| T2.3 | `fix(sdk,wallet-sdk-core): initialise the bitcoin ECC library lazily` | Move `initEccLib` / `ECPairFactory` out of module scope (lazy, idempotent). | `sdk/src/shared/services/spoke/BitcoinSpokeService.ts`, `wallet-sdk-core/src/wallet-providers/bitcoin/BTCWalletProvider.ts` | 1 | no | expand-2.x | – | none open. Must precede T1's Bitcoin move (E2.3) and T6. |
| T2.4 | `perf(sdk): mark pure top-level initializers` | `@__NO_SIDE_EFFECTS__` on `createInvariant` / `isCodeMember` / `getEvmViemChain`; `@__PURE__` on the `defineChain` / `parseAbi` / `getAbiItem` / BigNumber constants (or make them lazy). | `sdk/src/errors/{invariant,guards}.ts`, `shared/utils/constant-utils.ts`, `leverageYield/LeverageYieldService.ts`, `swap/EvmSolverService.ts`, `moneyMarket/math-utils/*` | 1 | no | expand-2.x | T2.1 | call sites only: `LeverageYieldService.ts` (`#509`, `#512`, `#523`), `EvmSolverService.ts` (`#534`, `#498`), `constant-utils.ts` (`#498`). Do the definitions now and the call sites after those merge. |

---

## T4 (score 8) — ESM-only; viem / wagmi / react-query as peers with ranges (E1.2, E1.6)

### Approach

**Contract phase. Both parts are breaking.**

1. **ESM-only** for sdk, wallet-sdk-core, swaps-api, bridge-api and libs.
   - Drop the tsup CJS half (libs keeps tsup but only `format: ['esm']`).
   - Exports: `{ "types": "./dist/index.d.ts", "default": "./dist/index.js" }` per entry. Add a
     `typesVersions` row for every subpath (T12 entries, chain-plugin subpaths), so TS
     `moduleResolution: node` consumers (sodax-backend) resolve them.
   - Add `default` to the already-ESM-only dapp-kit and wallet-sdk-react exports. Today they are
     `import`-only and cannot be `require()`d.
   - `check-exports` becomes `attw --pack --ignore-rules cjs-resolves-to-esm`, as `@sodax/types`
     does today. Not `--profile esm-only`, which skips the node10 checks that catch a missing
     `typesVersions`.
   - Keep `apps/node-cjs` as the CJS smoke. It is CJS + `moduleResolution: node` and runs in CI
     through `pnpm test`.
2. **Peers.**
   - viem: `"viem": "^2.29.2"` in sdk, wallet-sdk-core, dapp-kit and wallet-sdk-react. Keep
     `viem: catalog:` as a devDependency for the build and tests.
   - wagmi: `"wagmi": "^3"` in wallet-sdk-react, together with T7 (until then `^2.16.9`).
   - react-query: already a `5.x` peer (`dapp-kit/package.json:61-63`,
     `wallet-sdk-react/package.json:118-121`). Tighten it to the tested floor `^5.87.4`.
   - dapp-kit → `@sodax/sdk` peer is owned by T13: `workspace:^` in peerDependencies, which
     publishes as a caret range.
   - Write peer ranges explicitly, never as `catalog:`. pnpm publishes the catalog specifier
     verbatim, and today that is an exact pin (`pnpm-workspace.yaml:36-39`: react-query `5.87.4`,
     TS `5.5.4`, viem `2.29.2`, wagmi `2.16.9`).
   - `@sodax/types`: no peer. It has no runtime dependency at all (`packages/types/package.json`
     has no `dependencies`); viem is only a devDependency for one test
     (`types/src/chains/config-address-checksum.test.ts:2`).
   - swaps-api / bridge-api: no viem. They import only `@sodax/types` and `valibot`.
3. **CI on min and latest peers** (T4.3). This is a matrix leg in T11.1's consumer job.

   | Leg | Installs |
   | --- | --- |
   | min | `viem@2.29.2` (or 2.28.0 once it runs green), `wagmi@<floor>`, `@tanstack/react-query@5.87.4`, `react@19.0.0` |
   | latest | `npm i --before="$(date -u -d '14 days ago' +%F)" viem@^2 wagmi@^3 @tanstack/react-query@^5 react@^19`. This keeps the repo's 14-day supply-chain cooldown. |

   Each leg:
   - typechecks a consumer fixture under `moduleResolution: bundler` and under
     `module: commonjs` + `moduleResolution: node` (catches a missing `typesVersions`);
   - runs the Node smoke (ESM import, CJS `require`, `new Sodax()`, pure helpers);
   - the latest leg also runs the bundle scenarios.

### Evidence

- **The CJS twin is already `require(esm)`-dependent.**
  - `npm:@sodax/sdk@2.2.0 dist/index.cjs` contains `require('@mysten/sui/grpc')`,
    `require('@mysten/sui/transactions')` and `require('@mysten/sui/bcs')`.
  - `@mysten/sui@2.23.2` is `"type":"module"` with `.mjs`-only exports (`npm view`).
  - `apps/node-cjs/src/index.ts:33-41` asserts this path explicitly.
  - `engines.node >=22.12.0` is set in every package (e.g. `packages/sdk/package.json:41-42`).
- **Probe P6 (Node 22.15).**
  - `exports {types, import}` → `require()` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `exports {types, import, default}` → works, with no ExperimentalWarning.
  - Top-level await anywhere in the graph → `ERR_REQUIRE_ASYNC_MODULE`. Our sources have none
    (grep over all 8 packages).
- **Probe P7 (TS 5.8.3).**

  | Consumer setting | Root import | Subpath import |
  | --- | --- | --- |
  | `module: commonjs` + `moduleResolution: node` (sodax-backend: `backend@985959e9:tsconfig.json` with TS 5.8.2 and Node 22.18; `apps/node-cjs/tsconfig.json`) | resolves through `types` | TS2307 without `typesVersions`; resolves with it |
  | `node16` | TS1479 for every ESM-only import from a CJS file | same |
  | `nodenext` / `bundler` | OK | OK |

  - `node16` CJS consumers must move to `nodenext` (TS ≥ 5.8) or `bundler`. Put this in the
    migration notes (T17).
- **sodax-backend.**
  - Runtime: `nest start` runs compiled CJS, so `require('@sodax/sdk')` works on Node 22.18 *if*
    the exports carry `default`.
  - Tests use vitest (`apps/{api,swaps-api}/package.json`), not Jest, so there is no Jest
    `require(esm)` gap.
  - `packages/hub-assets` already uses `await import('@sodax/types')`
    (`backend@985959e9:packages/hub-assets/src/hub-asset-registry.ts:234`).
  - Its catalog `viem: 2.45.1` satisfies `^2.29.2`.
- **viem API floor (probe P8).** `WaitForCallsStatusTimeoutError`
  (`wallet-sdk-core/src/wallet-providers/evm/EvmWalletProvider.ts:277`), `GetCapabilitiesReturnType`
  and `WaitForCallsStatusParameters` are first exported in **2.28.0** (absent in 2.27.0).
  - The other used names (atomicity errors, the `hedera`, `kaia`, `redbellyMainnet`,
    `lightlinkPhoenix` and `sonic` chains, `fallback`, `maxUint48` / `maxUint160`) are already in 2.28.0.
- **Why peers matter: duplicate wagmi.**
  - wallet-sdk-react pins `wagmi` and `viem` as dependencies (`wallet-sdk-react/package.json:98-99`).
  - An app with its own wagmi version gets two wagmi copies and two React contexts.
  - The monorepo papers over the same class of bug for react-query with an override
    (`pnpm-workspace.yaml:125-131`), and overrides do not ship to consumers.

### Feasibility verdict

Feasible.

- `require(esm)` and node10 typing are verified (P6, P7, P10).
- Remaining risk: consumers on Node < 20.19 / 22.12, or Jest in CJS mode, cannot `require()` the
  package. Both already fail today on the `@mysten/sui` path. Document it.

### T4 sub-issues

| id | title | what | touches | size | breaking | phase | depends on | conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T4.1 | `build!: ship ESM only` | Remove the tsup CJS half and `.d.cts` (sdk, wallet-sdk-core, swaps-api, bridge-api; libs → esm only). Exports with `default`; `typesVersions` for subpaths; add `default` in dapp-kit and wallet-sdk-react; attw `--ignore-rules cjs-resolves-to-esm`; migration note. | `packages/*/package.json`, `packages/*/tsup.config.ts`, `packages/libs/tsup.config.ts:83`, docs | 3 | yes | contract-3.0 | T2.1, T2.2, T10.1, T11.1 (CJS / node10 smoke), T12 (entries exist, B), T13 (dapp-kit exports, D) | every `package.json` edited by T1 / T6 / T13. Land after their manifests settle, or have them follow the template. `#95`, `#497` if still open. |
| T4.2 | `build!: viem, wagmi and react-query as peer dependencies with ranges` | Move viem and wagmi to peers with explicit ranges; keep catalog devDeps; tighten the react-query floor. | `packages/{sdk,wallet-sdk-core,dapp-kit,wallet-sdk-react}/package.json` | 2 | yes | contract-3.0 | T7 (wagmi v3, C), T13 (sdk peer, D), T9 (QueryClient, C) | the same manifests as T4.1, T7, T13 |
| T4.3 | `ci: test peers at the floor and at the latest cooled-down release` | A min / latest matrix in the consumer job: fixture typecheck (bundler + node10) and Node smoke. | `.github/workflows/ci.yml`, `scripts/consumer/*` | 2 | no | contract-3.0 (can start in 2.x by overriding deps) | T11.1, T4.2 | T11.x (same files, same owner) |

---

## T10 (score 7) — Stop inlining `@sodax/types` (E1.3)

### Approach

**One small PR, non-breaking, 2.x.**

- Delete `noExternal` from the four tsup configs: sdk `:14` and wallet-sdk-core `:14`
  (`['near-api-js','@sodax/types']`); swaps-api `:18` and bridge-api `:18` (`['@sodax/types']`).
- Delete the now-pointless `options.conditions = ['import']` and `mainFields` lines (sdk `:16-18`, etc.).
- Rewrite the stale comments:
  - `swaps-api/tsup.config.ts:14-17` cites "Node range (<20.19)", but engines is `>=22.12.0`;
  - `sodax-sdk-publish.yml:45-48` says "This tarball inlines @sodax/types".
- Do it for **both** formats now. CJS consumers already need `require(esm)` (see T4 evidence), so
  externalizing in CJS adds no new requirement.
- It also unifies the backend's process on one `@sodax/types` instance.
- Verify with the existing smokes: `apps/node-cjs`, `test-libs`, Next 16, attw. Re-baseline the
  tarball gate (`ci.yml:209`); the tarball shrinks.

### Evidence

- **The scope's premise is stale.** It says the inlining is "only for the CJS build", but the tsup
  config is shared by both formats (`packages/sdk/tsup.config.ts:5,14`).
  `npm:@sodax/sdk@2.2.0 dist/index.mjs` has no `from '@sodax/types'` import.
- **The `.d.ts` already references `@sodax/types` externally** (three imports plus
  `export * from '@sodax/types'` in `npm:@sodax/sdk@2.2.0 dist/index.d.ts`). Only runtime JS is
  inlined, so types and values can come from different copies today.
- **Copies counted** (measurements.md § Why tree-shaking fails, item 5): the token list appears
  3× in `new Sodax()` and 5× in a minimal swap dapp. The source build with one copy measured
  1,196 KB vs 1,266 KB gzip.

### A6 — behaviour change when de-duplicated

None found.

- `@sodax/types` exports no classes, no `Symbol()`, no WeakMap / WeakSet (grep over
  `types/src`, non-test). Identity-based checks (`instanceof`, symbol brands) cannot change.
- No package mutates imported `@sodax/types` data in place.
  - Grep for push / sort / splice / … on the imported names over sdk, wallet-*, dapp-kit and the
    API packages: 0 hits.
  - `mergeSodaxConfig` → `deepMerge` never mutates its target (`sdk/src/shared/utils/deepMerge.ts:10-13`).
- The only observable difference: config objects become *shared*, e.g.
  `spokeChainConfig === sdk-internal` could now be true. Only a consumer that mutates them would
  notice, and that is already unsupported. near-api-js de-dupe only removes cross-copy class
  identity issues; there is no `instanceof` on near-api-js classes in our code.

### T10 sub-issues

| id | title | what | touches | size | breaking | phase | depends on | conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T10.1 | `build(sdk,wallet-sdk-core,swaps-api,bridge-api): stop inlining @sodax/types and near-api-js` | Remove `noExternal`, the resolver hacks and the stale comments; re-baseline the tarball gate. | the four `tsup.config.ts`; comments in `sodax-{sdk,swaps-api,wallet-core,bridge-api}-publish.yml`; `ci.yml:209` | 1 | no | expand-2.x | T11.2 (to record the before/after) | none open. A1.3 replaces the workflow files, so land T10.1 first or fold it in. |

---

## T11 (score 7) — CI gates: bundle size, install size, consumer audit, attw (E1.5)

### Approach (land first; all non-breaking)

**1. New `consumer` job in `ci.yml`.**

- **Isolation.** Read-only `permissions` and no secrets: it executes a dependency tree the repo does
  not pin, like the `docs` job (`ci.yml:92-94`).
  - The `build` job runs `pnpm pack:local --version 0.0.0-ci.<run>`. This reuses
    `scripts/pack-local.mjs`, which already rewrites `@sodax/*` deps to absolute `file:` tarballs
    (`:94-105`, `:349`).
  - It uploads the tarballs.
  - `consumer` downloads them and runs `npm i --ignore-scripts` into clean fixture dirs: `sdk`,
    `api` (swaps-api + bridge-api), `react` (dapp-kit + wallet-sdk-react + react / react-query).
- **Footprint.** Package count and MB per fixture, against the budgets in
  `scripts/consumer/budgets.json`.
- **Audit.** OSV-Scanner on the fixture `package-lock.json`, with a separate
  `osv-scanner.consumer.toml` using the same `ignoreUntil` discipline as `osv-scanner.toml`.
  - It fails on advisories *new relative to the base branch*, like the existing "new in PR" job
    (`security.yml:58-114`).
  - It runs only on PRs that change `packages/*/package.json` or the catalog, plus weekly. This
    keeps PRs from going red when an advisory is merely published.
  - Also print `npm audit --omit=dev` counts as a headline number.
- **Report.** Upload `consumer-report.md` as an artifact.

**2. Bundle budgets** (`scripts/consumer/check-bundle-size.mjs`, based on
`artifacts/bundle-baseline/measure.mjs`).

- esbuild runs over the scenario entries:
  - `sdk-new-sodax`, `sdk-one-helper`, `sdk-error-only`;
  - `types-one-helper`;
  - `swaps-api`, `bridge-api`;
  - `dapp-kit-swap`;
  - `wallet-react-provider`, `wallet-react-evm-subpath`;
  - `full-dapp-swap`.
- Per scenario, gate two numbers:

  | Number | Budget | Why |
  | --- | --- | --- |
  | SODAX's own bytes (third-party externalized, as in probe P2) | tight, +1% | stable; moves only with our code |
  | Total gzip | loose, +5% | catches a new heavy dependency without flaking on upstream patch drift |

- Budgets live in `scripts/consumer/budgets.json`, set from the first CI run.
- Any PR that shrinks a number lowers the budget in the same PR (a ratchet; note it in the PR template).
- Pin `esbuild` as a root devDependency at the version tsup already locks, so the lockfile adds no
  new package.

**3. Package lint.**

- Add `publint` to every `check-exports`.
- Align attw rules: `--ignore-rules cjs-resolves-to-esm` for ESM-only packages, after T4.1 adds `default`.
- attw itself already runs (`ci.yml:202-203`; patched core, `pnpm-workspace.yaml:133-139`).

**4. Node smoke on the engines floor.**

- Add Node `22.12.0` next to `24.x`. Today CI runs only 24.x (`ci.yml:152`).
- Run ESM import, CJS `require`, and import time against a budget.
- This seeds T29.

### Should it land before the big refactors? Yes.

- No file overlap with any open PR. The only PR touching `.github/` is `#483` (PR template).
- It turns each later PR into a measured delta:

  | PR | Expected change |
  | --- | --- |
  | T10.1 | −2 token-list copies |
  | T2.1 | `sdk-error-only` 832 → ~1 KB own |
  | T14.2 | `types-one-helper` 34 → ~2 KB |
  | T1 | `new Sodax()` EVM-only |

### Starting numbers (published 2.2.0, measurements.md)

| Scenario | Value |
| --- | --- |
| `new Sodax()` | 1,266 KB gzip |
| One helper | 832 KB gzip |
| types helper | 38 KB gzip |
| SwapsApi | 41 KB gzip |
| Full dapp | 2,994 KB gzip |
| `npm i @sodax/sdk` | 412 packages · 777 MB · 35 advisories (11 high) |
| React group | 1,357 packages · 1.8 GB · 81 advisories (1 critical) |

CI baselines come from the workspace build at T11 merge time.

### T11 sub-issues

| id | title | what | touches | size | breaking | phase | depends on | conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T11.1 | `ci: consumer install job with footprint and dependency audit` | Pack → npm install fixtures → footprint budgets; OSV on the consumer lockfile, new-vs-base on dependency-changing PRs; weekly schedule; report artifact. | `.github/workflows/ci.yml`, `scripts/consumer/*`, `osv-scanner.consumer.toml` | 3 | no | expand-2.x (first) | – | none |
| T11.2 | `ci: bundle-size budgets per consumer scenario` | esbuild scenarios on the T11.1 install; own-bytes and total budgets with a ratchet. | `scripts/consumer/check-bundle-size.mjs`, `scripts/consumer/entries/*`, `scripts/consumer/budgets.json`, root `package.json` (esbuild devDep) | 3 | no | expand-2.x | T11.1 | none |
| T11.3 | `ci: publint and consistent attw rules` | publint in `check-exports`; attw rule alignment, applied to dapp-kit / wallet-sdk-react together with T4.1. | `packages/*/package.json` (scripts) | 1 | no | expand-2.x | – (rule alignment: T4.1) | trivial script-line edits in manifests also touched by `#95` / `#497` |
| T11.4 | `ci: Node engines-floor smoke` | A 22.12.0 leg: ESM import, `require(esm)`, import-time budget. | `.github/workflows/ci.yml` | 1 | no | expand-2.x | T11.1 | none |

---

## T14 (score 7) — Split `@sodax/types` into light entries (E3.3)

### Why the token list stays alive (file:line)

1. **`getChainType` reads a module that also holds the token config.**
   - `getChainType` (`types/src/utils/utils.ts:99-107`) reads `baseChainInfo`
     (`types/src/chains/chains.ts:79`).
   - That module imports 22 `*SupportedTokens` lists (`chains.ts:7-31`) to build
     `spokeChainConfig` (`:685`).
   - Its other top-level initializers are not provably pure: 22 `chainLogo()` calls (`:79`),
     `filterChainKeysByType` + `new Set` ×20 (`:415-438`), `new Map(Object.entries(...))`
     (`:65-67`), and `ChainKeys.*` property reads everywhere.
   - So bundlers keep `chains.ts`, and with it `tokens.ts`, which is 128 KB of source.
2. **`utils.ts` itself.** It imports from `chains.ts` (`:1-39`) and has its own top-level
   `EVM_CHAIN_ID_TO_KEY = new Map(EVM_CHAIN_KEYS.map(...))` (`:110`).
3. **No `sideEffects` field.** `packages/types/package.json` declares none, so even unused modules
   (`swap/swap.ts`, `moneyMarket.ts`, …) are kept. Probe P2: 33 modules for one helper.
4. **Other token-bearing derived lookups:** `swap/swap.ts:7,454`;
   `moneyMarket/moneyMarket.ts:8,41,266`; `leverageYield/leverageYield.ts:86`;
   `hooks/hooks.ts:45`; `chains.ts:1278-1307` (bnUSD lists, `hubConfig`); `dex/dex.ts:2`
   (`StatATokenAddresses`).

### Who imports what (value imports from `@sodax/types`, non-test files)

| Consumer | Value imports | Token-free after T14.2? |
| --- | --- | --- |
| sdk | 57 names: `ChainKeys` (21 files), `getIntentRelayChainId` (20), `isNativeToken` (11), the `DEFAULT_*` constants, `isHubChainKey` / `isEvmChainKey` / …, `spokeChainConfig`, `sodaxConfig`, `hubConfig`, `SodaTokens`; plus **`export * from '@sodax/types'`** (`sdk/src/index.ts:15`), which is public API the backend relies on | no (core needs config until T20) |
| wallet-sdk-core | `ChainKeys`, `detectBitcoinAddressType`, `toSuiExecutionResult`, `toSuiPaginatedCoins` | yes |
| wallet-sdk-react | `ChainKeys`, `ChainTypeArr`, `baseChainInfo`, `detectBitcoinAddressType`, `getEvmChainKeyByChainId`, `usesBip322MessageSigning`, `CHAIN_KEYS`, `EVM_CHAIN_KEYS` | yes (today they pull `chains.ts` and therefore the tokens) |
| dapp-kit | none directly (everything comes through the sdk re-export) | – |
| swaps-api / bridge-api | `getChainType` only (`swaps-api/src/rawTxSchemas.ts`, `bridge-api/src/rawTxSchemas.ts:11`) | yes |
| apps | `stellar-sponsor-example` (`ChainKeys`, `spokeChainConfig`, `baseChainInfo`), `swap-api-example`, `wallet-modal-example`; `apps/node` imports removed `*_CHAIN_ID` names (dead code) | mixed |
| sodax-backend | Mostly through `@sodax/sdk` (swaps-api 44 files, bridge-api 31, sponsoring-api 10, …). `@sodax/types` directly in apps/api (2), the dashboard (1), `packages/hub-assets` (dynamic import). apps/api pins `@sodax/types@1.3.1-beta-rc1` on purpose (`backend@985959e9:pnpm-workspace.yaml:86-95`). | root aggregator unchanged, so unaffected |

### Approach (all non-breaking, 2.x)

1. **T14.1 `sideEffects: false`.** Safe: the side-effect scan found no import-time effects in
   `types` (§ A3).
2. **T14.2 split by concern, not by chain.**
   - `chains/chain-info.ts`: everything from `chains.ts:36-438` that does not touch tokens —
     `RelayChainIdMap`, `INTENT_CHAIN_IDS`, `IntentRelayChainIdToChainKey`,
     `CHAIN_LOGO_BASE_URL`, `chainLogo`, `baseChainInfo`, `HUB_CHAIN_KEY`, the 9 families and
     sets, and the chain-key types.
   - `utils/chain-guards.ts`: `utils.ts:46-126` (the `is*ChainKey` guards, `getChainType`,
     `EVM_CHAIN_ID_TO_KEY`, `getEvmChainKeyByChainId`) and `:203-213` (`getIntentRelayChainId`,
     `getChainKeyFromRelayChainId`).
   - `chains.ts` keeps `spokeChainConfig`, the bnUSD lists and `hubConfig`, and does
     `export * from './chain-info.js'`.
   - `common/constants.ts:1` switches its import to `chain-info.js`, which makes the `DEFAULT_*`
     constants token-free.
   - Root exports are unchanged.
3. **T14.3 subpath entries.**
   - `@sodax/types/chains`: chain-keys, chain-info, chain-guards, `bitcoin` helpers, constants. Token-free.
   - `@sodax/types/tokens`.
   - `@sodax/types/config`: `spokeChainConfig`, `sodaxConfig`, swap / moneyMarket / leverage /
     dex / hooks configs.
   - The existing `./dex`. Optionally `./backend`, which is type-only.
   - Each gets an `exports` entry with `default` plus a `typesVersions` row (the package already
     does this for `dex`, `packages/types/package.json:26-45`).
   - Add the new barrels to `knip.json` `entry`.
   - Root `.` stays the aggregator.
4. **T14.4** Switch swaps-api and bridge-api to `@sodax/types/chains`. wallet-sdk-react switches
   inside T3 (cluster C) rather than as a separate PR.

### T1 coordination (stated assumption)

- **Stays in `@sodax/types` in v3:** chain keys, chain info (name / id / type / logo / explorer),
  `RelayChainIdMap`, token lists and configs for *all* chains.
  - Core and hub logic decode intents from any chain.
  - The backend routes on the full registry.
  - T20 (remote config) can later replace the token / config entry wholesale.
- **Moves to `@sodax/chain-*` (T1 / E4.5):** chain-library-shaped types, i.e. the vendored
  `solana/solana-web3.ts` (145 KB) and `near/near-api-js.ts` (170 KB) typings, plus
  wallet-provider / raw-tx interfaces. That move is breaking: names leave the root, so contract phase.
- T14's split is concern-based and does not depend on T1's plugin layout.

### Feasibility verdict: feasible, non-breaking

| Probe | Import | Result (gzip) |
| --- | --- | --- |
| P2 | `getChainType` with `sideEffects: false` | 34.3 KB (5 modules; 33 without the flag) |
| P2 | `ChainKeys` | 0.4 KB |
| P2 | `CONFIG_VERSION` | 0.2 KB |
| P3 | the 2.x split as a JS simulation: `getChainType` + `isEvmChainKey` + `getIntentRelayChainId` from a token-free `chain-info` | 8.4 KB min · 2.1 KB (vs 117 KB · 34.3 KB) |
| P3 | `SwapsApi` with the token-free `getChainType` | 5.6 KB own (vs 38.5 KB) |

### T14 sub-issues

| id | title | what | touches | size | breaking | phase | depends on | conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T14.1 | `perf(types): mark @sodax/types side-effect free` | `"sideEffects": false`. | `packages/types/package.json` | 1 | no | expand-2.x (now) | – | none |
| T14.2 | `refactor(types): split token-free chain info from token-bearing config` | `chain-info.ts` and `chain-guards.ts` as above; `chains.ts` / `utils.ts` re-export; root unchanged; move tests accordingly. | `packages/types/src/chains/{chains,chain-info}.ts`, `src/utils/{utils,chain-guards,index}.ts`, `src/common/constants.ts` | 3 | no | expand-2.x | T14.1 | **`#534` (Tron), `#497` (XRP), `#498` (Monad), `#95` (Aleo)**, `feat/ton-mpc-integration`, `feat/zcash-mpc-integration`: all edit `chain-keys.ts`, `chains.ts` (`baseChainInfo` / `RelayChainIdMap` rows), `utils.ts`, `index.ts`. Land right after `#534` merges, then the others merge `main` and move their rows into `chain-info.ts`. Coordinate with T1 (B). |
| T14.3 | `feat(types): light subpath entries` | `./chains`, `./tokens`, `./config` (+ `./backend`) with `default` and `typesVersions`; knip entries; attw. | `packages/types/package.json`, `packages/types/src/*/index.ts` barrels, `packages/types/knip.json` | 2 | no | expand-2.x | T14.2 | none |
| T14.4 | `refactor(swaps-api,bridge-api): import chain helpers from @sodax/types/chains` | 2 files. | `swaps-api/src/rawTxSchemas.ts`, `bridge-api/src/rawTxSchemas.ts:11` | 1 | no | expand-2.x | T14.3 | none (T28 / `@sodax/api` later absorbs both) |

---

## T15 (score 6) — Polyfill-free core, no `Buffer` (E4.6)

### Re-count at cc053fef

Lines matching `\bBuffer\b` in `packages/sdk/src`, non-test.

| File | Lines | After T1 |
| --- | --: | --- |
| `shared/services/spoke/BitcoinSpokeService.ts` | 9 | plugin |
| `shared/services/spoke/SolanaSpokeService.ts` | 8 | plugin |
| `shared/entities/solana/pda/pda.ts` | 7 | plugin |
| `shared/services/spoke/StellarSpokeService.ts` | 5 | plugin |
| `shared/services/spoke/NearSpokeService.ts` | 2 | plugin |
| `shared/entities/solana/utils/utils.ts` | 2 | plugin |
| `shared/entities/btc/btc-utils.ts` | 2 | plugin |
| `sponsoring/internal/stellarSponsoredCreate.ts` | 1 | plugin |
| `shared/services/spoke/IconSpokeService.ts` | 1 | plugin |
| `shared/entities/icon/utils.ts` | 1 | plugin |
| **`shared/utils/shared-utils.ts`** | 8 (`:161` comment, `:167,172,179,182,185,204,252`) | ICON / SOLANA / BITCOIN / NEAR / INJECTIVE codec branches → plugins only if E2.2's codec delegation also covers `encodeTokenIdentifier` (`:199`) and `reverseEncodeAddress` (`:213-258`) |
| **`swap/selectSolvedIntentPacket.ts`** | 2 (`:13,16`) | **stays in core** |
| **`shared/services/spoke/SpokeService.ts`** | 1 (`:600`; scope said `:602`) | **stays in core** |

- No `node:` imports and no builtin modules in sdk `src`.
- `crypto` is used only as Web Crypto (`shared-utils.ts:69-72`). `TextEncoder` is used in
  `SuiSpokeService.ts:128`. Both are universal.
- The `buffer` / `crypto` polyfills that measurements.md lists come from chain libraries.

### Approach

1. **T15.1 (2.x, non-breaking).**
   - `selectSolvedIntentPacket.ts:13,16` → viem `hexToBytes` / `bytesToHex`.
   - `SpokeService.ts:600` → `bytesToHex(rlpEncodedData)`.
   - The shared-utils utf-8 branches (`:179,182,185,204,252`) → viem `stringToHex` / `hexToString`.
   - ICON (`:167`) → `toHex(hexToBytes(...))`.
   - SOLANA (`:172`) → `toHex(new PublicKey(address).toBytes())`, dropping the `Buffer.from` wrapper.
   - The existing shared-utils tests cover the byte equality.
2. **T15.2 (contract, after T1).**
   - Ban `Buffer` in core directories with Biome `noRestrictedGlobals`, scoped by an override.
   - Add a consumer smoke that deletes `globalThis.Buffer` and then imports the core entry (in T11 / T29).
   - Plugins keep `Buffer` internally. `@solana/web3.js` v1 needs it anyway, and apps that opt in
     to those plugins pay for it.

### Feasibility verdict

Feasible; small. The only real dependency is T1's codec delegation (cluster B).

### T15 sub-issues

| id | title | what | touches | size | breaking | phase | depends on | conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T15.1 | `refactor(sdk): replace Buffer in core and codec paths with viem byte helpers` | As above. | `sdk/src/swap/selectSolvedIntentPacket.ts`, `sdk/src/shared/services/spoke/SpokeService.ts`, `sdk/src/shared/utils/shared-utils.ts` | 1 | no | expand-2.x | – | `shared-utils.ts` and `SpokeService.ts`: **`#534`, `#498`, `#497`, `#95`** (new codec cases, spoke wiring). Land after `#534`, or split off `selectSolvedIntentPacket.ts` (no conflicts) now. |
| T15.2 | `ci(sdk): forbid Buffer in the core` | Biome rule with a core-path override, plus a no-Buffer smoke. | `biome.json` (or `packages/sdk/biome.json`), `scripts/consumer/*` | 1 | no | contract-3.0 | T1 (E2.2 / E2.3, B), T11.1 | none |

---

## T29 (score 4) — Runtime matrix in CI (E11.1), short

- **Approach.** Extend T11's consumer job into a matrix. Every leg runs the same smoke: import, a
  pure helper, `new Sodax()` with no network.

  | Leg | How |
  | --- | --- |
  | Node 22.12.0 and 24 | T11.4 |
  | Bun | `oven-sh/setup-bun`, pinned |
  | Deno | `denoland/setup-deno`, node_modules mode |
  | Cloudflare Workers | esbuild bundle with `conditions: ['workerd','worker','browser']`; fail on Node builtins / `Buffer` |
  | Vite / Next / Turbopack | already covered (`ci.yml:221-232`) |
  | React Native (Metro bundle) | later |

- **Depends on:** T11.1; T15 (Workers and RN need polyfill-free core); T4.1 (ESM-only exports);
  T1 (EVM-only core for a meaningful Workers leg).
- **Touches:** `.github/workflows/ci.yml`, `scripts/consumer/*`. Size 5 (as in scope). Phase:
  contract-3.0 (the Node legs land in 2.x through T11.4).

---

## Order that avoids the collisions

1. **Now, conflict-free.**
   - T11.1 → T11.2, T11.3, T11.4.
   - A1.2 (+ A1.3).
   - T14.1, T2.3.
   - T2.4: the helper-definition annotations only.
2. **Next (2.x).**
   - T10.1 (budgets drop) → T2.1 → T2.2. These collide only with trivial JSON lines in `#95` / `#497`.
   - T15.1, the `selectSolvedIntentPacket.ts` part.
3. **Right after `#534` merges.**
   - T14.2 → T14.3 → T14.4.
   - The rest of T15.1.
   - Announce a short freeze on `types/src/chains/*` during T14.2. In-flight chain PRs merge
     `main` (never rebase) and move their rows into `chain-info.ts`.
4. **Contract prep.** A1.1 + A1.4, cut the last 2.x minor, branch `release-2.x`.
5. **Contract (3.0.0-rc.N).**
   - T4.1 after T12 / T13 entries exist.
   - T4.2 with T7 / T13.
   - T4.3.
   - T15.2 after T1.
   - T29.

**Collisions with other clusters.**

- **Every `package.json` / `tsup.config.ts`.**
  - T1 plugins (E2.4) and T28 (`@sodax/api`) should *start* from the T2.2 template, ESM-only, so
    they never need T2 / T4 edits.
  - T13 (dapp-kit subpaths) and T6 (the wallet-sdk-core server entry) add subpaths. They must add
    `default` + `typesVersions` per the template, or T4.1 has to revisit them.
- **T14.2 vs T1 E2.2.** The registry should read `baseChainInfo` / chain types from the new
  `chain-info` module. Agree the module names in the T1 ADR (E2.1).
- **T15.2 vs T1.** It waits for the codec delegation.
- **T2.4 vs the user's own PRs.** Call-site annotations wait for `#509`, `#511`, `#512` and `#523`.

---

## Cross-cluster dependencies

| Direction | Dependency |
| --- | --- |
| Mine → others | T2.1 / T2.2 template → T1 (E2.4 / E2.5 plugin packages), T12 (per-feature entries are free with tsc: one file plus one `exports` row), T28 (`@sodax/api`), `#163` (wallet-hw) |
| Mine → others | A1.2 → T1 E2.4, T28, `#163` (new publishable packages) |
| Mine → others | A1.1 + A1.4 → the whole contract phase (before the first breaking merge) |
| Mine → others | T14.2 / T14.3 → T1 (registry reads `chain-info`), T3 (wallet-sdk-react becomes token-free), T20 (the config entry is what remote config replaces) |
| Mine → others | T4.1 → T13, T16 (skills), T17 (migration: ESM-only and `node16` notes) |
| Mine → others | T11 → every T-id (gates) |
| Others → mine | T4.2 needs T7 (wagmi v3), T9 (QueryClient), T13 (sdk peer) |
| Others → mine | T4.1 needs T12 entries (B) and T13 exports (D) to settle |
| Others → mine | T15.2 needs T1 codec delegation (E2.2) and the chain moves (E2.3) |
| Others → mine | Vendored-type removal from `@sodax/types` is T1 / E4.5 |
| Others → mine | T20 must compare `CONFIG_VERSION` majors (see A1) |
| Constraint for B | No sdk ↔ plugin dependency cycle in 2.x (Turborepo rejects cycles) |

---

## Corrections to `plan-v3-scope.md` (stale or wrong at cc053fef)

1. **E1.3.** "Inlined only for the CJS build … externalize it in the ESM build now and drop the
   inlining with CJS" is wrong twice.
   - `noExternal` applies to both formats (`packages/sdk/tsup.config.ts:5,14`). The published
     `index.mjs` has no `@sodax/types` import.
   - The CJS reason is moot: `index.cjs` already requires the ESM-only `@mysten/sui/*`.
   - So externalize in both builds in 2.x. The same holds for near-api-js, which also inlines
     `@noble/*`, Apache-2.0 `borsh` and `@scure/base`.
2. **E1.4.** "The only module-level side effects found" is true only for global mutation in
   sdk / wallet-core.
   - Line references are confirmed (`BitcoinSpokeService.ts:48`, `BTCWalletProvider.ts:19-20`).
   - Also present:
     - wallet-sdk-react global zustand stores (`useXWalletStore.ts:52` with persist,
       `useWalletModalStore.ts:46`) and the eager `chainRegistry.ts:167`;
     - 142 soft top-level calls in the sdk across 28 files;
     - 32 calls + 37 property-read initializers in types;
     - 8 enum IIFEs.
   - See § A3 for which matter.
3. **E1.5.** "Scripts already in `artifacts/bundle-baseline`" understates what exists. attw already
   gates CI (`ci.yml:202-203`), and so does an sdk tarball gate (`ci.yml:205-211`). What is missing:
   per-scenario budgets, consumer footprint and audit, publint.
   - Those scripts measure *published* packages. The gate must measure packed workspace tarballs
     (reuse `scripts/pack-local.mjs`).
4. **E1.2.** It must also require a `default` (or `require`) condition. With `import` only,
   `require()` fails (probe P6). dapp-kit and wallet-sdk-react ship `import`-only exports today.
5. **E1.6.**
   - The viem floor is verified at **2.28.0** (probe P8). `^2.29` is fine, but declare the tested
     `^2.29.2`.
   - react-query is *already* a peer (`5.x`) in both React packages.
   - `@sodax/types` has no viem dependency, so it needs no peer.
6. **E3.3 tier.** Listed as P0 / Must (3.0). It is fully additive (`sideEffects` flag, module
   split, new subpaths, root unchanged), so it ships in 2.x. Measured gain:
   `getChainType` 34.3 → 2.1 KB gzip.
7. **E4.6.** `SpokeService.ts:602` is now `:600`. "Only 3 `Buffer` uses remain after E2.3" also
   needs E2.2 to delegate `encodeTokenIdentifier` / `reverseEncodeAddress`, not just
   `encodeAddress`. `shared-utils.ts` holds 7 code lines of `Buffer` (`:167-252`). Its utf-8
   branches can go to viem in 2.x already.
8. **E2.4 (1 pt).** Underestimated. Adding packages requires:
   - three hard-coded lists (`bump-versions.sh:7`, `sdks-publish.yml:30,72`), enforced in PR CI
     by `release.test.mjs:306-311`;
   - a flat `packages/<name>` directory (`release.mjs:65`, `pnpm-workspace.yaml:3`);
   - a grammar-valid version (`release.mjs:80-82`);
   - manual version alignment when `main` merges into `release` (precedent `16fd6f6f`);
   - one backport workflow per package.

   Budget A1.2 / A1.3 (5 pts), or accept the manual steps.
9. **D3.** Confirmed, and it extends to wallet-sdk-core, swaps-api and bridge-api: 0
   extensionless relative imports, 0 JSON imports, 0 path aliases, 0 cycles.
   - dapp-kit (7) and wallet-sdk-react (192) use `@/` aliases. tsc there needs alias conversion
     first; this belongs to clusters C / D.
10. **"Ships in 2.x first."** Add T14.1–T14.4 (≈7 pts) and the T15.1 part. E1.1 is 5 pts, not 3:
    T2.1 = 3 and T2.2 = 2 across four packages, plus the side-effect fixes in T2.3 / T2.4.
11. **Remaining risks, ESM-only.**
    - sodax-backend works with *either* `typesVersions` *or* `nodenext`. Confirmed (P7).
    - But TS `module: node16` CJS consumers get TS1479 on every ESM-only import. Document it.
    - Jest is not a concern for the backend, which uses vitest.

---

## Probes run (commands → results)

All under `$S/agent-A/` (`$S` is the session scratchpad). Tool installs used
`npm i --ignore-scripts`; nothing was installed in the tree or in any clone.

| # | Command (abridged) | Result |
| --- | --- | --- |
| P1 | `node scripts/scan-side-effects.mjs <ts> packages/<pkg>/src --list all` (TS AST, top-level statements) | the counts and lines in § A3 |
| P2 | `node scripts/transpile-pkg.mjs` (per-file `ts.transpileModule`, which with `isolatedModules` + `verbatimModuleSyntax` matches tsc's JS emit) for types, sdk, swaps-api, bridge-api; then `node scripts/measure-entry.mjs` (esbuild 0.25.10, minify, browser, third-party external) | unbundled sdk: `getChainType` 34.3 KB gzip, `SodaxError` 0.6, `new Sodax()` own code 136.5. types without `sideEffects`: `getChainType` 37.7 KB / 33 modules; with the flag: 34.3 KB / 5. `ChainKeys` 0.4, `CONFIG_VERSION` 0.2. `SwapsApi` 41.9 → 38.5. |
| P3 | Simulated split: `chain-info.js` = `chains.js` lines 9–375 (token-free) plus a `guards.js` | `getChainType` + `isEvmChainKey` + `getIntentRelayChainId`: 8.4 KB min / 2.1 KB gzip (was 117 / 34.3). `SwapsApi` with the split `getChainType`: 5.6 KB own. |
| P4 | `node scripts/externals-of.mjs` on `import { EvmWalletProvider }`: published `@sodax/wallet-sdk-core@2.2.0` vs unbundled transpile | flat: 153.8 KB own + 15 external chain libraries; unbundled: 5.8 KB + viem only |
| P5 | `npm pack @sodax/{sdk,swaps-api,wallet-sdk-core}@2.2.0`, then grep the dists | `index.cjs` requires `@mysten/sui/{grpc,transactions,bcs}`. `index.mjs` has no `@sodax/types` import and bundles near-api-js / `@noble/*` / borsh / `@scure/base`. `index.d.ts` imports `@sodax/types`. Tarball 1,011,426 B. |
| P6 | Fake ESM-only packages in `node_modules`; `require()` from CJS (Node 22.15) | `import`-only → `ERR_PACKAGE_PATH_NOT_EXPORTED`; with `default` → OK, no warning; top-level await → `ERR_REQUIRE_ASYNC_MODULE` |
| P7 | `tsc --noEmit` (5.8.3) with commonjs+node10, node16, nodenext, bundler against ESM-only fixtures with and without `typesVersions` | node10: root OK, subpath needs `typesVersions` (TS2307 otherwise); node16: TS1479; nodenext / bundler: OK |
| P8 | `npm pack viem@{2.27.0,2.28.0,2.29.0}`, grep `_types/index.d.ts` and the chains | `WaitForCallsStatusTimeoutError`, `GetCapabilitiesReturnType`, `WaitForCallsStatusParameters`: absent in 2.27.0, present in 2.28.0. viem 2.29.0 pins `ws` 8.18.1 exactly (the reason for the consumer advisory). |
| P9 | `npm pack valibot@1.4.2`; esbuild on a fixture module | valibot has 264 `@__NO_SIDE_EFFECTS__`. esbuild keeps a tsc enum IIFE and an unannotated top-level call when the module is used, and drops the `@__PURE__` one. |
| P10 | `npm i typescript@5.5.4 valibot@1.4.2 @types/node@22.18.1`; tsc on copies of `packages/types` and `packages/swaps-api` (with a `tsconfig.build.json`); ESM-only manifest | both build (exit 0, no test files emitted); ESM import 12 ms; CJS `require(esm)` 14 ms; TS node10 root import OK |
| P11 | `node scripts/cycles.mjs` (value-import graph) | 0 cycles in sdk (206 files), wallet-sdk-core (34), swaps-api (8), bridge-api (8), types (60) |
| P12 | `attw` 0.17.4 / 0.18.2 on the published tarballs | blocked by the known tarball-extraction bug (the repo patches core 0.17.4: `pnpm-workspace.yaml:133-139`); not used for conclusions |
| – | `gh pr diff <n> --name-only` for the 11 open code PRs | the overlap lists in the tables above |
| – | `git log` / `git show` on `origin/release`, tags, `sdk-v2-main` | bridge-api version alignment `16fd6f6f`; v2-branch merges `84a6bd7ff` … `0ab03c8c7` |

The scripts used are in `$S/agent-A/scripts/` (`scan-side-effects.mjs`, `scan-imports.mjs`,
`transpile-pkg.mjs`, `measure-entry.mjs`, `externals-of.mjs`, `module-exports.mjs`, `cycles.mjs`).
