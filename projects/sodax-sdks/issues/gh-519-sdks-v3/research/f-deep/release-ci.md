---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, release, ci, docs]
---

# Release, CI and docs channels — deep dive (feasibility, complexity, benefit)

1. Nothing blocks any of the six bullets. Two need a team call first: x-4 (what "Workers support" means, given no demand was found; local tsup builds of the sdk import and construct on Node, Deno, Bun, and on workerd with `nodejs_compat` or an app-side `Buffer` polyfill) and sk-2 (docs stop going live on merge).
2. **Gates are advisory.** `main` requires no status check, so every CI gate only advises unless that changes (`gh api …/branches/main` → `enforcement_level: off`). The one size gate covers only the sdk tarball. It was raised 4 times, +59.5% in 126 days.
3. **Docs run ahead of npm.** docs.sodax.com serves `main` (live probe). Since the docs cutover, 22 feat/fix PRs put docs live before npm `latest` had the code: 19 reached `latest` a median 27.1 days later, and 3 are live today with no release at all (`useSwapLifecycle`, Privy login).
4. **No older line has ever been maintained.** 1.x never had a stable release, and no 1.x was published after 2.0.0-rc.1. Every stable publish moves `latest`, so the first 2.x patch after 3.0 would move it back.
5. **The codemod mostly helps us.** The two known downstream apps have about 40 mechanical sites. The in-repo apps import 427 SDK names (specifiers) through dapp-kit. 4 of 7 external integrators found are still on pre-2.0 versions.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| x-2 | Feasible with caveats / Code-traced | C3 | B3 (B4 combined) | 2.x | Only the sdk tarball is gated, and no check is required to merge. 32 of the 47 advisory IDs in a consumer install (axios 28, toml 2, ws 2) have no vulnerable version in the monorepo lockfile, so its OSV scan does not report them. |
| x-3 | Feasible with caveats / Code-traced | C4 (codemod alone C3) | B3 (codemod alone B2; B4 combined) | 3.0 | The guide is needed by every 3.0 adopter. The codemod mostly pays off in-repo, and each transform waits for its API freeze. |
| x-4 | Needs a decision / Proven | C3 | B2 | 2.x smoke legs; 3.0 matrix | CI does not test the 22.12 floor, while the backend runs 22.18. Local tsup builds of the sdk import and construct on Deno, Bun and workerd (with `nodejs_compat` or an app-side `Buffer` polyfill). No Bun, Deno or Workers demand found. |
| x-5 | Feasible with caveats / Code-traced | C3 | B3 | 2.x guard; 3.0 line | `latest` is set on every stable publish, and `release.mjs` assumes one line in 9 places. About 1.6 published-source fixes a week would be backport candidates. |
| sk-1 | Feasible / Code-traced | C2 | B3 | 2.x | npm `@sodax/skills` is already versioned. The CLI, `sodax.com/skill.md` (25 links to `main`, says 2.1.0) and the docs all follow `main`. The CLI takes a pinned `tree/<ref>` URL, including `@sdks@X.Y.Z` tags. |
| sk-2 | Needs a decision / Proven | C2 | B3 (B4 with x-5) | 2.x, before the first breaking merge | One Mintlify switch covers 4 channels. Pinning to `release` is not enough: it was 6 commits past `@sdks@2.2.0` and holds rc content. |

Labels: **[verified]** is a path:line, a probe or a measurement. **[derived]** is arithmetic on verified numbers. **[judgement]** is a design opinion.

Scratch outputs live under `SCRATCH=/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-release/` (first pass), `WSCRATCH=/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-release/` (finishing pass) and `VSCRATCH=/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-release/` (verification pass).

---

## x-2 · Size, install and consumer-audit budgets in CI
**Bullet:** "Track install size, bundle size and consumer audit results in CI, with regression budgets"  ·  **T-ids:** T11.1–T11.4

### Today
**Gates that exist:**
- `attw` runs in every package (`ci.yml:202-203`) [verified]. The rules differ:
  - `types`: `--ignore-rules=cjs-resolves-to-esm` (`packages/types/package.json:55`);
  - dapp-kit and wallet-sdk-react: `--profile esm-only` (`dapp-kit/package.json:43`, `wallet-sdk-react/package.json:70`);
  - the rest: plain `attw --pack`.
  - No publint.
- **One size gate:** `SDK tarball size check` (`ci.yml:205-211`) [verified].
  - It runs `npm pack --dry-run` on `@sodax/sdk` only (`packages/sdk/scripts/size-check.mjs:15`).
  - It fails when `size > baseline × (1 + tol)` (`:33-34`). Baseline is 1,000,000 B and tolerance 5%, so the ceiling is 1,050,000 B.
  - Its own comment says the tolerance "is noise, not a growth budget" (`ci.yml:206-207`).
- **Not measured anywhere:** install size, bundle size and the consumer audit [verified, by reading `ci.yml` and `security.yml`].
- **OSV-Scanner reads only the monorepo `pnpm-lock.yaml`** [verified]:
  - it blocks a PR only on advisories the PR adds (`security.yml:57-108`);
  - on push and weekly it is advisory (`:121-163`);
  - the lockfile carries 20 `overrides` entries (`pnpm-workspace.yaml:87-133`; counted by YAML parse, same 20 in `pnpm-lock.yaml`). They do not reach consumers: `npm view @sodax/{sdk,libs}@2.2.0 overrides pnpm resolutions` is empty [verified].
- **No status check is required on `main`** [verified, `gh api repos/icon-project/sodax-sdks/branches/main` → `protection.enabled: false`, `required_status_checks.enforcement_level: "off"`; `gh api …/rules/branches/main` lists no `required_status_checks` rule]:
  - the `main` ruleset has deletion, non_fast_forward, required_signatures and pull_request (1 approval, squash) only (`gh api …/rulesets/16101300`);
  - bypass actors are not visible to a non-admin.

**Baseline history.** Command: `git log -G 'SODAX_SDK_TARBALL_BASELINE_BYTES' -- .github/workflows/ci.yml` on `origin/main` [verified]:

| Date | PR | Baseline (B) | Change |
| --- | --- | --- | --- |
| 2026-05-20 | #116 | 627,000 | tol 15% |
| 2026-07-01 | #210 (feature) | 750,000 | +19.6% |
| 2026-09-01 | #414 (CI fix) | 870,000 | +16.0%, tol 15% → 5% |
| 2026-09-15 | #374 (feature) | 950,000 | +9.2% |
| 2026-09-23 | #475 (feature) | 1,000,000 | +5.3% |

- **Totals:** +59.5% over 126 days, and 3 of the 4 raises were made inside the feature PR that caused them [derived].
- **The gate hid a type check.** It runs before `checkTs`, so when it failed on `main` after #311 (2026-09-01), type checking stopped running. Type errors then reached `main` (#414 body; `main` CI runs red at `a8dd39fc`/`4f39f730`, green again at `affdbf1e`) [verified].
- **`main` CI record:** 200 runs since 2026-05-20, of which 181 success, 18 failure and 1 cancelled (`gh run list --workflow ci.yml --branch main --limit 200`) [verified].
- **Published `@sodax/sdk` unpacked size** (`npm view @sodax/sdk@<v> dist.unpackedSize`) [verified]:
  - 2.0.0 (07-27): 4,295,760 B;
  - 2.1.0 (08-21): 4,652,877 B;
  - 2.2.0 (10-12): 5,344,927 B, which is +24.4% in 77 days [derived].

**Consumer-audit gap, re-verified** [verified].
- **Method:** in `SCRATCH/consumer-sdk/`, the 21 third-party deps of published `@sodax/sdk@2.2.0` + `@sodax/libs@2.2.0` (from `npm view …@2.2.0 dependencies`). Then `npm i --package-lock-only --ignore-scripts --before=2026-10-05` (407 lock entries), then `npm audit --omit=dev --json`.
- **npm's per-package counts:** 34 vulnerable packages: 10 high, 13 moderate, 11 low.
- **Unique advisory IDs:** 47: 18 high, 27 moderate, 2 low.
- **axios dominates.** 36 of the IDs are axios. `@stellar/stellar-sdk@15.1.0` exact-pins `axios: 1.15.0`.
- **toml has no fix.** `toml@3.0.0` (via anchor and stellar-sdk; 2 advisories, high) shows `fixAvailable: false`. The monorepo hides it with the `toml: ^4.1.2` override (`pnpm-workspace.yaml:124`).
- `6234137b` "clear the open high-severity advisories (25 high → 1)" changed no published package manifest (`packages/*/package.json`). It touched app and root `package.json` files, `pnpm-workspace.yaml` overrides, the lockfile, `osv-scanner.toml` and tests, so consumers got none of it [verified, `git show --name-only`].
- **What the monorepo scan can see** [derived: `VSCRATCH/probes/consumer-vs-monorepo.cjs` checks each advisory's range with npm's semver against the package versions in `pnpm-lock.yaml` at `0181a053`; output `VSCRATCH/consumer-vs-monorepo.out`]:
  - 15 of the 47 IDs match a version the monorepo lockfile also resolves (axios 1.19.0 is inside 8 axios ranges; stream-json 3; bigint-buffer, bn.js, elliptic and uuid 1 each), so the push and weekly scan can report them;
  - 32 have no vulnerable version there (axios 28, toml 2, ws 2), because overrides replace those versions;
  - none of the 47 IDs is listed in `osv-scanner.toml`.

**Tooling past the 14-day cooldown** (cut-off 2026-10-05). Commands: `npm view <pkg> time`; transitive counts from lockfile-only installs in `SCRATCH/dep-weight/`; provenance from `npm view <pkg>@<v> dist.attestations` [verified]:

| Tool | Version passing cooldown | Packages | Provenance | Note |
| --- | --- | --- | --- | --- |
| esbuild | 0.28.0 already in lockfile (via tsx/vite); 0.25.12 via tsup | 0 new | yes | the measurement scripts in `artifacts/bundle-baseline/` already use it |
| size-limit + @size-limit/esbuild + file | 14.1.0 (2026-09-27); 14.2.0 (10-07) is inside the cooldown | 7 + 26 optional esbuild binaries | yes | needs esbuild `^0.28.2` (new to the lockfile) and Node `^22.19 \|\| ^24.5` |
| publint | 0.3.25 (2026-10-01) | 7 | yes | |
| pkg-size | 2.4.0 (2021-08-06) | — | — | unmaintained |
| `pnpm pack:local` | in repo (`package.json:40`, `scripts/pack-local.mjs`) | 0 | — | already rewrites `@sodax/*` deps to tarballs |

**CI cost** [verified]:
- **Repo is public**, so hosted minutes are free (`gh api repos/icon-project/sodax-sdks --jq .visibility`).
- **Volume:** 226 CI runs in 30 days: 186 PR, 40 push.
- **`Build and Test` duration:**
  - 3.0–3.3 min on 4 cache-hit runs;
  - 10.8 min on 1 cold run: Build Packages 88 s, attw 21 s, checkTs 71 s, Build Apps 135 s, Tests 158 s.
  - `AI docs validation` costs 93–99 s on each of the 5 sampled runs.
- Source: `gh run view <id> --json jobs`, ids in `SCRATCH/run-*.json`.

### Change
- **From:** one tarball gate with manual baseline bumps, and an audit that only sees the monorepo lockfile.
- **To:**
  - a `consumer` job that packs, `npm i`s three fixtures (sdk, api, react) and checks package count and MB against budgets;
  - OSV on each fixture lockfile, failing only on advisories new against the base;
  - esbuild bundle budgets per scenario (SODAX-own bytes tight, total gzip loose) with a ratchet;
  - publint in `check-exports`.

### Feasibility — Feasible with caveats · Code-traced
- **Proven:** the tools pass the cooldown and carry provenance. The repo already has the fixture packer and the esbuild measurement scripts. The consumer gap is real (32 of 47 advisory IDs have no vulnerable version in the monorepo lockfile).
- **Caveat 1:** with no required check on `main`, a budget can be ignored at merge, as #311 showed. Making `Build and Test` or `consumer` required is an owner (admin) call [judgement].
- **Caveat 2:** fixture installs resolve third-party ranges at run time. An absolute audit or total-gzip budget would go red on upstream drift, so audit must be new-versus-base, as `.github/ci.md:5` already requires for OSV [judgement].
- **Decisions:**
  - (a) require the checks or keep them advisory;
  - (b) budget levels (tight own-bytes plus loose totals is recommended);
  - (c) run the consumer job on every PR, or only on dependency-changing PRs plus weekly.

### Complexity — C3
- **PRs:**
  1. consumer job, fixtures and audit (~250 LOC script + YAML);
  2. bundle scenarios and budgets JSON with a ratchet (~200 LOC);
  3. publint plus aligned attw rules (~20 LOC).
- **Tests:** `node:test` for the budget comparator. Fixture snapshots come from the first run.
- **Breaks:** nothing.
- **Top risks:**
  - flaky totals from upstream drift;
  - a gate that becomes ceremony while checks stay unrequired.
- **Versus earlier points:** T11 = 3+3+1+1 = 8. Agreed [judgement].
- **CI time:** +1 parallel job, about 3–5 min. It extends the critical path only if it waits for build artifacts [judgement; install time not measured].

### Benefit — B3
- **P5 (maintainers):**
  - removes a recurring class of problem: 4 manual raises (+59.5%); only #414 and #475 say why in the PR body [verified, `gh pr view`];
  - stops a size failure from hiding `checkTs`;
  - makes consumer advisories visible: 32 of the 47 consumer advisory IDs have no vulnerable version in the monorepo lockfile, so no current scan reports them [derived, see the consumer-audit gap].
- **P1/P2/P3:** indirect. Regressions get caught before release. The published sdk's unpacked size grew +24.4% between 2.0.0 and 2.2.0; the only gate measures tarball bytes, and its baseline was raised 3 times in that window (#414, #374, #475) [derived].
- **P4:** an `api` fixture keeps swaps-api/bridge-api at 4 packages / 5.2 MB (measurements.md).
- **Rating:** B3 rests on "removes a recurring class of problem", not on a measured size gain [judgement].
- **Combined — B4.** This is the measuring stick for sdk-1/2/4/5/6, x-1 and wsr-1/2. Without it, their gains are claims [judgement].

### Recommendation
- **Timing:** 2.x, first.
- **Wording:** Track install size, bundle size and consumer audit results in CI, failing a pull request only on regressions against its base

### Corrections to earlier research
- **measurements.md "35 advisories: 11 high":** these are npm's per-package counts (`metadata.vulnerabilities`), not advisories. Re-run: 34 packages (10 high); 47 advisory IDs (18 high), of which 36 are axios.
- **measurements.md cites the overrides at `pnpm-workspace.yaml:117-130`:** they are now at `:87-133`.
- **e-519 x-2 "size-limit is inside the cooldown":** 14.1.0 passes. Only 14.2.0 is inside. It still adds esbuild 0.28.2 to the lockfile.
- **#414's body says #116 set 750,000:** git shows 627,000, raised to 750,000 in #210.
- **This report, before verification, "24 `overrides` entries" and "34 vulnerable packages the monorepo OSV scan never sees":** there are 20 entries. The gap is 32 of 47 advisory IDs; the other 15 match versions the monorepo lockfile also has.

---

## x-3 · v2 → v3 codemod and manual-migration guide
**Bullet:** "Provide a v2 → v3 codemod and a guide for changes that need manual migration"  ·  **T-ids:** T17.1–T17.7

### Today
**There is no codemod tooling** [verified]:
- `ts-morph` and `jscodeshift` appear nowhere in the lockfile;
- the v1→v2 migration shipped as docs and skills only:
  - 71 files / 453 KB of content (576 KB on disk by `du`) in `packages/skills/skills/*/migration-v1-to-v2`;
  - `packages/sdk/docs/MIGRATION.md` (755 lines);
  - its "codemods" are `sed` one-liners in prose (`sodax-dapp-kit/migration-v1-to-v2/knowledge/checklist.md:18`, `…/reference/deleted-hooks.md:99`).
- **Counting method:** script `SCRATCH/probes/codemod-counts.py`; it reads trees with `git show`.
  - Param keys: `WSCRATCH/probes/param-rename-counts.py` (output `WSCRATCH/param-rename-counts.out`). Scope: hooks imported by name from the `@sodax/dapp-kit` root in each non-test file; a call's argument text is the balanced `(...)` after the hook name; a key counts only in key position (`{` or `,` before it, `:`/`,`/`}` after it), so values such as `dstChainKey: chainId` are not counted. dk-6 names no canonical address key; dropping `userAddress` from the list leaves the call counts unchanged (frontend 18, whitelabel 4; `VSCRATCH/param-rename-counts-no-userAddress.out`).
  - wagmi: `git grep -n -E "['\"]wagmi(/[a-z]+)?['\"]|@wagmi/" origin/main` in each app; the only hits are `pnpm-lock.yaml`, docs and dependabot config.
  - Consumer heads: frontend `1b915ec7`, whitelabel `5e1fbba`, backend `985959e9`, sdks `0181a053`.
  - The "own export" set is 521 names, regex-collected from `packages/dapp-kit/src`. A name imported from the dapp-kit root that is not in this set counts as an SDK name. The top hits (`SpokeChainKey`, `XToken`, `ChainKeys`) are SDK/types names.

**Mechanical changes and hit counts** [verified]:

| v3 change (bullet) | sodax-frontend | intents-whitelabel | sodax-backend | in-repo apps |
| --- | --- | --- | --- | --- |
| SDK names via the dapp-kit root (dk-1) | 0 (42 files import the root) | 0 (18 files) | n/a | demo 290 specifiers / 124 names / 80 files; playground 109/36/32; stellar-sponsor-example 28/15/16 |
| Hook renames, research-D T26 table (dk-6, proposal only) | 17 call sites: `useXBalances` 11, `useGetUserHubWalletAddress` 2, `useSupply`, `useWithdraw`, `useClaim`, `useMigratebnUSD` 1 each | 7: `useQuote`, `useStatus`, `useSupply`, `useBorrow`, `useWithdraw`, `useRepay`, `useXBalances` (one adapter call, imported as `useDappKitXBalances`, `src/hooks/use-x-balances.ts:31`) | 0 | demo 24 |
| Non-canonical param keys (`xChainId`, `chainId`, `spokeChainKey`, `userAddress`) passed to dapp-kit hooks (dk-6 params) | 18 of 94 hook calls, in 12 files: `useXBalances` 11, `useStellarTrustlineCheck` 2, `useUserReservesData` 2, `useATokensBalances` 2, `usePoolBalances` 1. 11 of the 18 are `useXBalances` calls already in the rename row, so 7 are new | 4 of 39, in 4 files: `useUserFormattedSummary` 3, `useXBalances` 1. 3 are new | n/a | demo 12 of 215 calls / 9 files; playground 0 of 11 |
| `walletProvider` lines in dapp-kit files (dk-4) | 86 in 14 files | 58 in 9 | 0 | demo 169 / 27 files |
| `new Sodax(` construction (sdk-1 → plugins or `chains-all`) | 0 (uses `<SodaxProvider>`, 1: `apps/web/providers/wallet-providers.tsx:10`) | 1 (`src/lib/sodax.ts`), plus `<SodaxProvider>` 1 (`src/providers/app-providers.tsx:56`) | 3 (`bridge-api/…/sodax.provider.ts:108`, `swaps-api/…/sodax.provider.ts:120`, `task-executor/…/task-executor-config.service.ts:36`) | demo 0 (its 1 regex hit is a comment, `src/lib/analytics.ts:28`), node-cjs 1; apps/node 38 (dead code) |
| `@sodax/wallet-sdk-core` imports (wsc-3) | 0 | 0 | 0 | apps/node 23 files, node-cjs 1 |
| swaps-api / bridge-api imports (api-1) | 0 | 0 | 0 | demo 1, swap-api-example 2 |
| Wallet provider config, for adapters (wsr-1) | 1 `<SodaxWalletProvider config>` site (`wallet-providers.tsx:11`; 2 lines name it) | 1 site (`src/providers/wallet-provider.tsx:74`; 4 lines) | n/a | — |
| Wallet hooks touched by wsc/wsr | `useXAccount(`/`useXAccounts(` 50 (40 + 10), `getXChainType(` 26, `useWalletProvider(` 13, `useEvmSwitchChain(` 12 | 21 / 17 / 10 / 8 | n/a | — |
| Direct `wagmi` imports (wsr-2 app code) | 0 | 0 | n/a | — |

**External integrators** (`gh search code '"@sodax/sdk" filename:package.json'`, public repos only, a lower bound) [verified]:
- 7 integrator repos found:
  - balancednetwork/balanced-network-interface: sdk `0.0.1-rc.45`, pushed 2026-10-14;
  - amped-openclaw: `1.2.3-beta`;
  - defindex privy guide and base-to-defindex: `1.2.7-beta`;
  - kaankacar/sodax-demo: `2.0.0-rc.1`;
  - lydialabs/radfi-be: `^2.0.0-rc.1`;
  - wayside-labs/ash: `2.1.0`.
- **4 of 7 are on pre-2.0 versions, and the same 4 list `@sodax/wallet-sdk-core` as a dependency** (versions re-read with `gh api repos/<repo>/contents/<package.json>`; imports not checked).

**Tooling** [verified]:
- ts-morph 28.0.0 (2026-04-12): 10 packages, with provenance;
- jscodeshift 17.4.0 (2026-07-15): 95 packages, no provenance.

### Change
- **From:** prose migration plus `sed` hints.
- **To:**
  - a ts-morph CLI with fixture-tested transforms for the mechanical moves: SDK imports off the dapp-kit barrel, hook and param renames, plugin registration at `new Sodax(`, and wallet-sdk-core / API package import paths;
  - report-only rules for semantic changes;
  - a v2→v3 guide for everything manual.

**Manual-only, for the guide:**
- `Result`-as-data hooks that start throwing (dk-5);
- error shapes (sdk-8);
- receipt waits and balance reads moving off wallets to chain clients (wsc-2; frontend `swaps-api-sign.ts:173-179`);
- choosing which chain adapters to load (wsr-1);
- wagmi v3 app code (wsr-2);
- ESM-only module settings for CJS backends (sdk-3);
- remote-config defaults (sdk-9);
- lifecycle-hook adoption (dk-2).

### Feasibility — Feasible with caveats · Code-traced
- **Proven:** the tooling is available, and the target sites are countable and mostly import- or name-level.
- **Caveat:** each transform can be written only after its API freezes, and param renames need type information (ts-morph, not regex) [judgement].
- **Decision:** a published `@sodax/codemod` package (adds a publishable package, so it needs A1.2 or list edits) versus a repo script plus a skill [judgement].

### Complexity — C4
- **Codemod alone — C3:**
  - harness + first transform (~400 LOC + fixtures);
  - renames + report rules (~250);
  - plugin and wallet transforms (~300);
  - 3.0-only rewrites (~200);
  - about 1,150 LOC plus fixtures [derived: 400 + 250 + 300 + 200].
- **Guide:** about 25 pages to update after API freeze (T17.5) and the skills migration tree (T16.2) [judgement, from earlier research].
- **Why C4 and not C3:** the code alone is under C4's ~1.5k LOC; C4 rests on the guide and the coordination with every breaking bullet [judgement].
- **Coordination:** every breaking bullet.
- **Breaks:** nothing itself.
- **Top risks:**
  - transforms written against an API that still moves;
  - false rewrites in apps that shadow names.
- **Versus earlier points:** T17.1–T17.7 total about 15 + T17.5 (5). Agreed [judgement].

### Benefit — B3
- **P5:** the in-repo apps carry most of the mechanical load (427 dapp-kit SDK specifiers, plus renames). Skills snippets are type-checked against source, so migrating them is ours.
- **P1/P2:** the two known apps have about 40 mechanical sites: 24 hook-rename call sites, 10 calls that pass an old param key and are not already rename sites (frontend 18 − 11, whitelabel 4 − 1), 3 `new Sodax(` or `<SodaxProvider config>` sites (frontend 1, whitelabel 2), 2 `<SodaxWalletProvider config>` sites [derived: 24 + 10 + 3 + 2 = 39]. Too few to justify a codemod alone (B2); the guide is what they need. Neither app imports `wagmi` directly, so wsr-2's wagmi v3 changes reach them only through wallet-sdk-react [verified].
- **P3:** backend, 3 construction sites.
- **External:** 4 of 7 integrators are pre-2.0, so a v2→v3 codemod does not reach them [judgement].
- **Combined with dk-1/dk-6/sdk-1:** the guide is a prerequisite for 3.0 adoption (B4) [judgement].

### Recommendation
- **Timing:** 3.0. Build the harness in 2.x with the dk-1/dk-6 transforms, and run them on the in-repo apps.
- **Wording:** Provide a v2 → v3 migration guide covering every breaking change, and a codemod for the mechanical import and rename changes

### Corrections to earlier research
- **d-dappkit T17 table "intents-whitelabel … Vite":** whitelabel is Next 16.2.1 (`package.json` `"next": "16.2.1"`, `next.config.ts`, `serverExternalPackages: ['@sodax/sdk']`).
- **d-dappkit T16 "71 files / 576 KB":** 576 KB is `du`. The content is 453 KB.
- **d-dappkit T17 table frontend counts** (`useXAccount` 30, `getXChainType` 16): now 50 (`useXAccount(` 40 + `useXAccounts(` 10) and 26 call lines at `1b915ec7`.
- **This report's first pass, "about 30 mechanical sites":** about 40 once param-key renames are counted (see the table).
- **This report's finishing pass, "4 constructions, 2–4 provider configs" and "demo 1" `new Sodax(`:** 3 construction or provider-config sites and 2 wallet-provider configs; the demo hit is a comment. The total is 39, still about 40.

---

## x-4 · Runtime matrix: Node, Bun, Deno, Workers
**Bullet:** "Test supported entry points on Node, Bun, Deno and Workers, and publish the runtime support matrix"  ·  **T-ids:** T29.1, T11.4

### Today
**CI runs Node 24.x only** [verified]:
- `ci.yml:112` (docs), `:152` (build), `:271` (e2e);
- `sdks-publish.yml:49`, `sodax-*-publish.yml:42`.

**`engines` is `>=22.12.0`** in the root `package.json:6-7` and every package (e.g. `packages/sdk/package.json:41-43`) [verified].

**Runtimes in use** [verified]:
- **Backend:** `FROM node:22.18-alpine3.22` (`Dockerfile:2`), `.nvmrc` `v22.18.0`, `engines` `22.18.x` (`package.json:6`).
- **Frontend:**
  - Next 15.5.24, sdks `2.2.0-rc.8`;
  - edge runtime only in `app/glossary/opengraph-image.tsx:3` and `app/news/opengraph-image.tsx:3`, which import only `next/og`;
  - no route handler or `middleware.ts` imports `@sodax/*`;
  - CI Node 24.x.
- **Whitelabel:** Next 16.2.1 with `serverExternalPackages: ['@sodax/sdk']`. The comment says "native bigint bindings that aren't available in the worker processes during build-time page collection".

**Demand** [verified]:
- `gh search issues --owner icon-project --include-prs` for "cloudflare workers", "workerd", "bun", "deno", "nodejs_compat", "edge runtime", "vercel edge": 0 SDK requests. #457 mentions a Worker only as an HTTP proxy.
- 4 external integrator repos have no `bun.lock`, `wrangler.*` or `deno.json`.

**Probes.** Deno 2.9.7 and Node 22.15.0 are installed; bun, wrangler and workerd are not [verified]. For the finishing pass, Bun 1.4.2 and miniflare 4.20260730.0 (bundles workerd 2026-07-30) were installed with `npm i --ignore-scripts --before=2026-10-05` into `WSCRATCH/tools/{bun,mf}/`; nothing was installed into a repo.
- **First-pass Deno probe, re-run** with `--node-modules-dir=manual --no-lock --deny-net`: all 5 entries OK, including `new Sodax()`. But it imports `sdk/dist/esm/index.js`, the **T2 experimental build** in `sodax-sdks-t2probe`:
  - tsc ESM output;
  - lazy `initEccLib`;
  - `git -C sodax-sdks-t2probe diff --stat` shows the changes.
- **New probe** `SCRATCH/probes/deno-main-bundle.mjs`, on **tsup bundles (the format that ships, but local builds, not the npm tarball)**, network denied: `new Sodax()` constructs, 510 exports, on Deno and Node, for both
  - the CJS bundle in t2probe (`t2probe/packages/sdk/dist/index.cjs`). It is `0181a053` **plus the T2 lazy-`initEccLib` patch**: it was written at 11:35:43, 1 s after the patched `BitcoinSpokeService.ts`, and contains `eccLibReady` 3 times [verified, `git -C sodax-sdks-t2probe diff`, `stat`, `grep -c`];
  - the ESM bundle (`sodax-sdks/packages/sdk/dist/index.mjs`, built 2026-10-12 15:56). The main checkout's reflog puts it on `feat/302-swap-lifecycle` (`fc1e46a9`) at that time, and the bundle has 9 `swapWithApproval` hits that `@sdks@2.2.0` source lacks, so it is a pre-merge build of the #504 code [verified].
  - **Unpatched CJS (verification pass):** `sodax-sdks/packages/sdk/dist/index.cjs` from the same 10-12 build (eager `initEccLib`) also imports and constructs on Node 22.15, Bun 1.4.2 and Deno 2.9.7, under `sandbox-exec` with network denied (`VSCRATCH/runtime-probe.out`) [verified].
  - **Scope:** import + construct only. No RPC, no signing, no chain paths.
- **Workers static scan** (`SCRATCH/probes/workers-scan2.mjs`, esbuild `conditions: workerd,worker,browser`):
  - types, swaps-api, bridge-api: 0 Node builtins;
  - sdk (main ESM): only `buffer` and `crypto`.
    - `crypto` comes from `@noble/secp256k1` v1 inside our libs stacks bundle, as `{node: crypto, web: self.crypto}`.
    - The 4 `new Function` hits are guarded `globalThis` shims.
    - The 2 `WebAssembly` hits are string literals.
  - wallet-sdk-core: 7 builtins.
- **Bun probe** (same `SCRATCH/probes/deno-main-bundle.mjs`, Bun 1.4.2, run under `sandbox-exec` with `(deny network*)`; the profile was checked to block `curl`). Output `WSCRATCH/bun-probe.out` [verified]:
  - CJS bundle (`t2probe/packages/sdk/dist/index.cjs`, T2-patched): OK, 510 exports, `new Sodax()` constructs;
  - ESM bundle (`sodax-sdks/packages/sdk/dist/index.mjs`): OK, same;
  - both print `bigint: Failed to load bindings, pure JS will be used`, the same native-binding gap whitelabel works around.
  - **Scope:** import + construct only, as for Deno.
- **workerd probe** (`WSCRATCH/probes/workers-bundle-compat.mjs` + `WSCRATCH/probes/workerd-run.mjs`, output `WSCRATCH/workerd-run.out`) [verified]:
  - **Build:** esbuild with `conditions: workerd,worker,browser`, Node builtins external as `node:*`, and `require()` of a builtin turned into a virtual module `import lib from 'node:x'; module.exports = lib` — the same shape as wrangler's nodejs_compat plugin. Wrangler itself was not run. The first-pass bundle (`SCRATCH/out-workers/sdk_main_esm.worker.js`) has 7 `require("buffer")` calls left in esbuild's require shim, so it fails at load in both modes (`No such module "buffer"`; `Dynamic require of "buffer" is not supported`).
  - **Run:** miniflare, `compatibilityDate: 2026-07-30`, `new Sodax()` inside `fetch()`, outbound fetches intercepted and counted.
  - **Without `nodejs_compat`:** both bundles fail at load: `No such module "node:buffer"`, because this build keeps builtins external as `node:*`.
  - **With `nodejs_compat`:** both bundles (ESM from the main checkout, T2-patched CJS) load; 510 exports; `new Sodax()` constructs in 8–17 ms; 0 outbound fetches. The verification pass rebuilt both byte-identically and added the unpatched CJS, with the same result (`VSCRATCH/workerd-run.out`) [verified].
  - **Without `nodejs_compat`, browser-style build** (verification pass, `VSCRATCH/probes/workers-bundle-polyfill.mjs`, output `VSCRATCH/workerd-run-polyfill*.out`) [verified]:
    - build: `buffer` resolves to the npm `buffer@6.0.3` polyfill, free `Buffer` gets that polyfill through esbuild `inject`, and `crypto` is an empty stub. The bundled `@noble/secp256k1` v1 code then picks `self.crypto`, which workerd has (`packages/libs/dist/chunk-LGBAM5XX.mjs:2758` in the main checkout). The build meets no other builtin (`buffer` 11 imports, `crypto` 1);
    - result: the ESM and the unpatched CJS bundles load and construct with no compatibility flags; 0 outbound fetches;
    - without the `Buffer` inject, both fail at load: `ReferenceError: Buffer is not defined`;
    - browser apps already configure this polyfill: `apps/playground/vite.config.ts:12` says `new Sodax()` "needs Buffer in both dev and build".
  - **Size:** the ESM bundle is 4,846,647 B raw, 1,274,016 B gzip -9; the T2-patched CJS one is 11,548,368 B raw, 2,387,998 B gzip -9; the unpatched CJS one 11,546,704 B and 2,387,782 B; the ESM polyfill build 4,881,357 B and 1,283,336 B (`wc -c`, `gzip -9 -c | wc -c`).
  - **Scope:** import + construct only. No RPC, no signing, no chain paths.

### Change
- **From:** Node 24 only.
- **To:** a matrix on the T11 consumer fixtures:
  - Node 22.12.0 + 24 (ESM import, `require`, construct);
  - Deno and Bun (import + construct);
  - a Workers leg (bundle with workerd conditions; run in workerd with or without `nodejs_compat`);
  - a published matrix page.

### Feasibility — Needs a decision · Proven
- **Proven:** Node, Deno, Bun and workerd run import + construct of local tsup builds. workerd needs `nodejs_compat` or an app-side `Buffer` polyfill; with neither, it fails at load (`node:buffer` missing, or `Buffer is not defined`).
- **Not proven:** any path past construction (RPC, signing, chain clients) on a non-Node runtime. The npm `@sodax/sdk@2.2.0` tarball itself was not run.
- **Decisions:**
  - (a) does "Workers supported" mean with `nodejs_compat` or with an app-side `Buffer` polyfill (both pass import + construct now), or with neither (after sdk-7 and sdk-1)?
  - (b) commit to Bun and Deno with zero measured demand, or list them as "tested, best effort"?
  - (c) which entries are in scope: wallet-sdk-react is bundler-only.

### Complexity — C3
- **PRs:**
  1. Node 22.12 leg (~40 LOC YAML + smoke);
  2. Deno + Bun legs (~120);
  3. Workers leg with miniflare/workerd (~150; the probe scripts are ~60 LOC) + matrix doc.
- **Needs:** the x-2 fixtures.
- **Top risks:**
  - flaky third-party behaviour in non-Node runtimes;
  - promising support for paths never exercised (signing, RPC).
- **Versus earlier points:** T29.1 was 5. C3 is lower because import + construct smoke is cheap [judgement].

### Benefit — B2
- **P3:** the only measured runtime gap. The backend runs Node 22.18, `engines` promises ≥22.12, and CI tests neither. The Node-floor leg alone would rate B3 [judgement: no gain was measured].
- **P1/P2:** frontends run on Node SSR; no SODAX import on edge was found.
- **P4:** API packages already have 0 builtins.
- **P6:** no data.
- **Bun/Deno/Workers:** B1 until demand appears [judgement].

### Recommendation
- **Timing:**
  - Node 22.12 leg: 2.x now;
  - Deno/Bun smoke and a Workers (`nodejs_compat`) smoke: 2.x, since all three pass today and the legs only guard against regressions;
  - a Workers leg with neither `nodejs_compat` nor a `Buffer` polyfill, and the published matrix: 3.0, after sdk-7.
- **Wording:** Test the supported entry points on the Node engines floor and current Node, Deno, Bun and Workers (nodejs_compat), and publish the results as a support matrix

### Corrections to earlier research
- **e-519 x-4 "Deno runs `new Sodax()` today":** the first-pass probe ran the T2 experimental build, not what ships. Later passes confirm it for tsup builds (the format that ships; local builds, not the npm tarball), within import + construct scope.
- **This report's first pass, "Workers: static scan only":** workerd now runs import + construct with `nodejs_compat`, or without it when the app polyfills `Buffer`; it fails with neither. A raw esbuild bundle is not enough: the `require("buffer")` calls need wrangler-style handling or a polyfill.
- **This report's finishing pass, "the shipped tsup bundle" and "CJS bundle built from `0181a053` source":** the t2probe CJS carries the T2 lazy-`initEccLib` patch, and the ESM is a 10-12 feature-branch build; neither is the npm tarball. The unpatched CJS from the same 10-12 build passes too, so the result holds for tsup builds of current code, within import + construct.

---

## x-5 · `release-2.x` maintenance line
**Bullet:** "Support a release-2.x maintenance line alongside v3 releases"  ·  **T-ids:** A1.1–A1.4

### Today
**dist-tags** [verified]:
- `sdks-publish.yml:38-43`: a prerelease publishes under its id up to the first dot (`rc`); a stable publishes under `latest`.
- All 9 per-package workflows set `TAG="latest"` at line 35. They have no `concurrency` group; the unified workflow has `concurrency: sdks-publish` (`:8-10`).
- Both lines would share `rc`, because `VERSION_PATTERN` allows only `-rc.N` (`scripts/config-version.mjs:15`, `scripts/bump-versions.sh:17`).

**npm refuses semver-range tags** [verified, npm 11.6.0 local]:
- the check is in `lib/commands/publish.js:80-81` and `lib/commands/dist-tag.js:101-102`;
- pnpm 10.32.1 `publish` packs, then runs `npm publish --ignore-scripts <tarball> …args` (corepack `pnpm.cjs`, `runNpm(["publish", …])`);
- with npm's bundled semver, `v2`, `2.x`, `v2.x` and `2` are ranges, so they are refused; `v2-latest`, `maint-2` and `legacy` are not.

**`release.mjs` assumes one line in 9 places** [verified]:
1. `:339` the branch must be `release`;
2. `:350-362` `origin/release` freshness and containment;
3. `:364-366` `origin/main` fully merged;
4. `:377` the base tag is the newest stable `@sdks@` across all lines;
5. `:378,380-388` HEAD must contain the newest tag of any line;
6. `:390-403` notes come from `main`'s first-parent range;
7. `:268-271` (called via `:436-443`) the version must exceed the highest `@sdks@` or `@sodax/*@` tag of any line;
8. `:200` notes print `rc`/`latest`;
9. `:484-488` the next steps push `release` and `gh release create --target release`.

The package lists are also hard-coded: `bump-versions.sh:7`, `sdks-publish.yml:30,72`.

**CONFIG_VERSION** [verified]:
- the formula is `major·1e6 + minor·1e4 + patch·100 + (rc ?? 99)` (`config-version.mjs:67-72`), and `:60-62` rejects a minor or patch above 99 and an rc above 98, so 2.x and 3.x values cannot collide;
- the runtime comparison is commented out (`packages/sdk/src/shared/config/ConfigService.ts:158-185`);
- the "≥ vs same major" rule is #543 Q1, still open.

**GitHub settings** [verified via `gh api`]:
- ruleset "release branch (owner only)" covers only `refs/heads/release`;
- tag creation for `@sdks@*` and `@sodax/*@*` is owner-only;
- the `npm-publish` environment requires reviewer R0bi7 and allows only tags `@sdks@*` and `@sodax/*@*`.

**Backport volume and precedent** [verified]:
- `git log --since=2026-07-21 origin/main` gives 141 commits, all squash merges. 38 subjects start with `fix`; 20 of them change published package source (`packages/{sdk,types,wallet-sdk-*,dapp-kit,*-api,libs}/src`, non-test). That is about 1.56 a week [derived].
- Backport tags were used once: 5 `@sodax/*@2.0.0-rc.1` tags, 2026-05-12.
- No 1.x was published after 2.0.0-rc.1 (2026-05-11), and 1.x never had a stable release: 49 prereleases (`npm view @sodax/sdk time`). No 0.x was published after the first 1.x either (47 versions, the last on 2025-11-05).
- **npm downloads last week** (`api.npmjs.org/versions/@sodax%2Fsdk/last-week`):
  - 1,298 total; `2.2.0` 272; `2.1.0` 140; 1.x 327;
  - 79% are not on `latest` [derived; noisy proxy].

### Change
- **From:** one forward line; any stable publish moves `latest`.
- **To:**
  - `release-2.x` cut from the last 2.x tag, with branch protection;
  - a dist-tag rule: a stable publish whose major is below `latest`'s major goes to `v2-latest`, and a 2.x rc to `v2-rc`;
  - `pnpm release` in maintenance mode on `release-<major>.x`;
  - fixes land on `main`, then are cherry-picked;
  - a documented support window.

### Feasibility — Feasible with caveats · Code-traced
- **Proven:** the tag rule and environment allow `@sdks@2.N.M`, and `v2-latest` is a legal tag.
- **Caveats:**
  - the dist-tag guard must land before any post-3.0 2.x publish;
  - per-package backports stay unordered: 9 concurrent runs, each needing its own approval.
- **Decisions:**
  - (1) patch releases at all, or "security fixes only";
  - (2) tag names `v2-latest`/`v2-rc`;
  - (3) how long to keep 2.x (e.g. until 3.0 + N months);
  - (4) the #543 version rule.

### Complexity — C3
- **PRs:**
  1. `scripts/dist-tag.mjs` + tests, used by 10 workflows (~120 LOC);
  2. maintenance mode in `release.mjs` + git-fixture tests (~250);
  3. RELEASE_INSTRUCTIONS + ruleset/environment changes (admin).
- **Breaks:** nothing.
- **Top risks:**
  - a mis-set `latest` on the first 2.x patch;
  - cherry-pick conflicts once sdk-1/wsc-3 move files.
- **Versus earlier points:** A1.1 + A1.4 = 5. Agreed [judgement].

### Benefit — B3
- **P1–P4:** the dist-tag guard protects every `npm i` after 3.0, so it is a prerequisite [judgement].
- **2.x maintenance helps users who cannot move fast:**
  - the backend pins exact versions;
  - integrators lag: 4 of 7 are pre-2.0, and 79% of downloads are not on `latest`.
- **P5:** cost is about 1.6 published-source fixes a week to triage for backport [derived].
- **No precedent:** this would be the first maintained older line.

### Recommendation
- **Timing:** dist-tag guard in 2.x now; the line itself at 3.0.0.
- **Wording:** Support a release-2.x maintenance line with its own npm dist-tag, so latest never moves back to 2.x

### Corrections to earlier research
- **e-519 "8 places":** the itemised count is 9. The number depends on how sites are grouped.
- **A1:** backport tags have been used only once, for 2.0.0-rc.1, never as a real backport.

---

## sk-1 · Skills versioned with the SDK
**Bullet:** "Version skills with the SDK so 2.x users keep receiving compatible guidance"  ·  **T-ids:** T27.1, T16.4

### Today
**Channels and what they point at** [verified]:
- **skills CLI:** `npx skills@latest add icon-project/sodax-sdks/packages/skills`, which resolves the default branch (`main`). It appears in:
  - `docs/ai-integration-guide.md:23,39,108`;
  - `packages/skills/README.md:13`;
  - `docs/builders-mcp.mdx:75`;
  - `docs/developers/packages/experience/skills.md:17`;
  - `packages/skills/AGENTS.md:185`.
- The guide says the CLI "does not follow a `@sodax/skills` entry in package.json" (`:42`).
- **npm `@sodax/skills`:** published with every `@sdks@` tag; `latest` 2.2.0, `rc` 2.2.0-rc.8. This channel is already versioned.
- **`www.sodax.com/skill.md`** (sodax-frontend `apps/web/content/skill.md`):
  - `version: '2.1.0'` (`:23`), stale since 2.2.0;
  - 23 `raw.githubusercontent…/main` links + 2 `tree/main` links + 28 docs.sodax.com links;
  - last changed 2026-09-07 (#1693).
- **Plugin registry:** `.claude-plugin/plugin.json` (root, 4 skills) and `packages/skills/.claude-plugin/plugin.json` (5 skills). Root lists 4, package lists 5.

### Change
- **From:** every non-npm channel follows `main`.
- **To:** the CLI command, skill.md links and plugin refs point at a released ref, with a documented 2.x ref for 2.x users (tied to x-5).

### Feasibility — Feasible · Code-traced
Checked in `skills@1.7.0` (the newest version past the cooldown; 1.7.2 is not), installed with `--ignore-scripts` into `WSCRATCH/tools/skills/`. The CLI was read, not run against GitHub. In 1.7.2, which `npx skills@latest` runs today, `parseFragmentRef`, `parseSource`, `cloneRepo`, `addSkillToLock` and `fetchRepoTree` are textually identical, and the blob-path guard, lock write and update calls are the same (1.7.2 `dist/cli.mjs` fetched from jsdelivr and read as text, not run; `VSCRATCH/fn-17{0,2}-*.txt`) [verified].
- **Tag refs with `@` parse** [verified]:
  - `parseSource` (`dist/cli.mjs:198`) matches `github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)` (`:235`). The ref group is `[^/]+`, so `https://github.com/icon-project/sodax-sdks/tree/@sdks@2.2.0/packages/skills` gives ref `@sdks@2.2.0` and subpath `packages/skills` (regex run in Node).
  - A set ref skips the blob fast path (`tryBlobInstall` returns `null` when `options.ref` is set, `:4102`) and goes to `cloneRepo`, which runs `git clone --depth 1 --branch <ref>` (`:918-926`).
  - The `#<ref>` shorthand is different: `parseFragmentRef` splits the fragment at its first `@` (`:163-181`), so `icon-project/sodax-sdks/packages/skills#@sdks@2.2.0` gives no ref and a skill filter `sdks@2.2.0`. Use the tree URL, or encode the tag as `#%40sdks%402.2.0` [verified, logic run in Node].
  - `git clone --depth 1 --branch '@sdks@2.2.0'` works on a local test repo with that tag (`WSCRATCH/gitref/`), and `git ls-remote` shows `refs/tags/@sdks@2.2.0` on GitHub (`ed770019`).
- **`skills update` on a pinned install** [verified, code read]: the lock stores `ref: parsed.ref` (`dist/cli.mjs:5644-5652`, through `addSkillToLock` at `:3773-3782`; `:5207` and `:5695` are the blob-install options and the `--json` output). Update fetches the tree at that ref (`:7362`) and falls back to cloning the same ref (`:7377-7379`). A tag pin therefore stays on the tagged commit unless the tag moves; a branch pin (`docs-stable`, `release-2.x`) follows the branch. That is the behaviour sk-1 wants, so the choice of tag or branch is a policy call, not a technical limit [judgement].
- **Cross-repo:** a sodax-frontend PR for skill.md.

### Complexity — C2
- **PRs:**
  1. update the install command (18 lines in 14 files mention `skills@latest add`: `git grep -n "skills@latest add" 0181a053`) + plugin refs (~50 LOC);
  2. sodax-frontend skill.md (25 links + version).
- **Breaks:** nothing.
- **Risks:**
  - a later skills CLI release changing ref parsing (the CLI is third-party and unpinned in `npx skills@latest`);
  - the frontend copy drifting again (no automation).

### Benefit — B3
- **P6:** since 2026-09-03, 17 feat/fix PRs changed skills before npm `latest` had the code: 14 reached `latest` a median 29.5 days later, and 3 are in no release [derived: rows of `SCRATCH/docs-lag.json` with skills > 0].
- **After 3.0:** the first breaking merge to `main` would hand v3 guidance to 2.x CLI users.
- **P5:** removes the hand-maintained `version:` field drift.

### Recommendation
- **Timing:** 2.x, before the first contract-phase merge.
- **Wording:** Pin every non-npm skills channel (skills CLI, sodax.com/skill.md, doc links) to the latest stable release, with a 2.x ref for 2.x users

### Corrections to earlier research
- **d-dappkit T27.1 "pin … the context7 branch":** there is no repo-indexed library. `/icon-project/sodax-sdks` returns "not found" (context7 MCP, 2026-10-19), although `context7.json` exists at the repo root. The SODAX entry `/websites/sodax` is a crawl of docs.sodax.com, so it follows sk-2.
- **This report's finishing pass, lock at `cli.mjs:5207`/`:5695`:** those lines are the blob-install options and the `--json` output; the lock write is `:5644-5652`.
- **This report, before verification, "17 PRs … a median 27.1 days":** 27.1 is the median of the 19 docs PRs that reached `latest`. The skills subset is 14 of 17 at 29.5 days.

---

## sk-2 · Docs and AI guidance from released versions
**Bullet:** "Publish docs and AI guidance from released versions rather than main"  ·  **T-ids:** T27.1

### Today
**docs.sodax.com serves `main`:**
- `docs/README.md:3-6` says so;
- `mintlify[bot]` deployments are on ref `main` at each merge (`gh api …/deployments?environment=staging%20-%20docs`);
- live pages, fetched 2026-10-19, document `useSwapLifecycle` (#504, merged 2026-10-15) and `@sodax/wallet-sdk-react/privy` (#486, merged 10-13);
- npm `@sodax/dapp-kit@2.2.0` `index.d.ts` has 0 `useSwapLifecycle`, and `wallet-sdk-react@2.2.0` exports only `.` and `./xchains/*`;
- no newer prerelease exists [verified].

**Downstream channels** [verified]:
- `llms.txt`/`llms-full.txt` are generated from the site;
- the Builders MCP's "6 documentation tools — search and full-page fetch over docs.sodax.com" (`docs/builders-mcp.mdx:63`);
- the context7 `/websites/sodax` crawl.
- So one Mintlify switch covers 4 channels [derived].

**Unreleased behaviour, counted** (`SCRATCH/probes/docs-lag.py`, output `SCRATCH/docs-lag.json`) [verified]:
- **Window:** first-parent commits on `main`, 2026-09-03 (after the docs cutover, #391/#415) to 2026-10-19: 82.
- **Release lookup:** first `@sdks@` tag containing each, via `git tag --contains`.
- **Results:**
  - 22 feat/fix PRs changed package source together with published docs (all 22) and skills (17);
  - 19 reached `latest` (2.2.0) after 11.2–38.7 days, median 27.1;
  - 3 (#503, #486, #504) are in no release;
  - the first rc tag came at a median of 1.3 days.
- Example: Leverage Yield docs (#264) were live for 38.7 days while `npm i @sodax/sdk` gave 2.1.0, which has no Leverage Yield.

**Hand-written caveats** [verified]:
- 7 pages say "2.1.0 does not include them … on `main` for the next release" (`docs/robinhood-chain/{index,swaps,faq,quickstart,money-market,networks-and-assets}.mdx`, `docs/resources/blog/oracle-candles-api.mdx:124`);
- they have been stale since 2.2.0 shipped them: `git tag --contains` puts #419/#470/#473/#412 in `@sdks@2.2.0`.

**Not fixed by sk-2:** #543's class, docs wrong on both `main` and the release (`initialize()` "fetches", `docs/developers/faq.md:26`, while `ConfigService.ts:158-185` is a no-op).

### Change
- **From:** live on merge to `main`.
- **To:**
  - Mintlify production branch `docs-stable`, which the stable publish moves to the `@sdks@X.Y.Z` commit;
  - `main` stays the preview;
  - docs-only fixes reach production by a PR to `docs-stable`, merged back to `main`.

### Feasibility — Needs a decision · Proven
- **Proven:** the current behaviour.
- **Feasible:** the switch is Mintlify's deployment-branch setting ("you can set any branch as your deployment branch", mintlify/docs `guides/git-concepts.mdx`, read via context7 2026-10-19; this project's dashboard value was not read) plus about 20 lines in `sdks-publish.yml`.
- **Option comparison** [judgement]:
  - Pinning to `release` (research D) is cheaper but not "released". `release` was 6 commits past `@sdks@2.2.0` within 65 minutes of the tag (12:07 → 13:12 on 2026-10-12; `git log @sdks@2.2.0..origin/release`, with `origin/release` `e0e51e39` matching `git ls-remote`). It also carried rc content for 49 days of the 2.2.0 cycle.
  - Mintlify versioned navigation is an alternative, but it doubles pages.
- **Decisions:**
  - (a) docs stop going live on merge;
  - (b) the hotfix path;
  - (c) who moves `docs-stable`;
  - (d) the auto-merge of marketing docs (#416) targets which branch.

### Complexity — C2
- **PRs:**
  1. workflow step + `docs/README.md` + `.github/ci.md` (~80 LOC);
  2. the Mintlify setting (dashboard).
- **Process cost:** 25 docs-only commits in 46 days (about 3.8 a week) would need the hotfix path or wait for the next stable [derived].
- **Risks:**
  - urgent fixes delayed;
  - `main`/`docs-stable` drift.

### Benefit — B3
- **P1–P4, P6:** removes a measured, recurring gap. Docs ran a median 27.1 days ahead of `latest` for 19 of 22 behaviour changes, and the hand-written caveats rotted.
- **P5:** no more manual "not in 2.1.0" notes.
- **Combined with x-5/sk-1 — B4.** Without sk-2, the first breaking merge flips the docs to 3.0 for the whole rc window, while `latest` is 2.x [judgement].

### Recommendation
- **Timing:** 2.x, decided before the first contract-phase merge.
- **Wording:** Serve docs.sodax.com and the AI guidance built from it from the latest stable release, with main as a preview and a hotfix path for docs-only fixes

### Corrections to earlier research
- **d-dappkit T27.1 "set Mintlify's production branch to `release`":** `release` is not "released" (6 commits past the tag; rc content between stables). Use a branch moved by the stable publish.
- **This report's summary, before verification, "22 feat/fix PRs … a median 27.1 days":** the median covers the 19 that reached `latest`; 3 have no release.

---

## Dependencies between these bullets
- **x-2:**
  - measures sdk-1, sdk-2, sdk-4, sdk-5, sdk-6, x-1, wsr-1, wsr-2 and api-1 (API fixture);
  - its consumer audit drops only through sdk-4 (PancakeSwap), sdk-5 (Stellar `/minimal` removes the axios 1.15.0 pin, 36 IDs) and dependency bumps;
  - x-4 reuses its fixtures.
- **x-3:**
  - transforms follow the API freezes of dk-1, dk-6, sdk-1, wsr-1, wsc-3, api-1 and x-1;
  - the guide covers dk-5, sdk-3, sdk-8, sdk-9, wsc-2, wsr-2 and dk-2;
  - the skills migration tree (sk-3 helps) must match it.
- **x-4:** needs x-2 (fixtures), sdk-3 (ESM-only/`require(esm)`), and sdk-7 + sdk-1 for Workers with neither `nodejs_compat` nor an app-side `Buffer` polyfill.
- **x-5:**
  - the dist-tag guard gates 3.0.0;
  - sk-1 and sk-2 need its 2.x ref names;
  - sdk-9/#543 must use a major-aware `CONFIG_VERSION` rule;
  - x-2 gates must also run on PRs into `release-2.x` (they do: `ci.yml:8-9` has no base filter).
- **sk-1:** follows the x-5 ref names and the sk-2 decision. sk-3 (generated index) cuts drift. sk-4 is unrelated.
- **sk-2:** decide before the first breaking merge of sdk-1, dk-1, wsc-3 or wsr-1. It pins the Builders MCP and llms.txt channels that api-3 docs feed.

## Not verified
- **Mintlify:** the dashboard production-branch setting (inferred from README + deployments + live content).
- **skills CLI:** an end-to-end `skills add` against GitHub was not run (third-party code with network access); the `@` tag ref is verified by code read, a regex run and a local `git clone --branch` test. 1.7.0 was installed and read; 1.7.2 (inside the cooldown, and what `npx skills@latest` runs) was compared as text only. Whether the GitHub trees API accepts the URL-encoded `%40sdks%402.2.0` ref used by `skills update`'s fast check is not tested; if it does not, update falls back to a clone of the same ref (`:7377-7379`).
- **Runtimes:**
  - wrangler itself was not run; the workerd probe uses a build plugin of the same shape. The Workers bundle-size limit was not checked against Cloudflare's current plan limits.
  - Every runtime probe stops at import + construct. RPC, signing and chain-client paths on Deno, Bun and workerd are untested.
  - The probes ran local tsup builds (see x-4), not the npm `@sodax/sdk@2.2.0` tarball.
  - The workerd runs relied on miniflare's `outboundService` to catch fetches; the OS sandbox profile used for them did not block network (a `curl` check got through). The Node, Bun and Deno runs used a profile that did block it.
  - The Vercel Node version for the frontend.
- **npm:** the version on GitHub runners (the tag check is verified on local npm 11.6.0).
- **CI:** consumer-fixture install time, so the job's CI duration is judgement. Branch-ruleset bypass actors (not visible to a non-admin).
- **x-2 budget numbers:** `artifacts/bundle-baseline/measure.mjs` needs `pnpm pack:local` output, which needs a build. The hard rules forbid `pnpm build`.
- **x-2 React-fixture audit re-count:** skipped as optional; measurements.md has 81 from 2026-10-14. No score depends on it.
- **External repos:** private integrators. Code search is a lower bound; 3 hits were skill collections vendoring Amped's own skill, not SODAX skills.
- **Releases:**
  - whether Robinhood money-market support is in 2.2.0 (stock tokens and oracle are);
  - whether jsdelivr's 2.2.0 `index.d.ts` equals the npm tarball (assumed).
- **x-3:** the param-key count matches only literal object arguments; a hook called with a prebuilt params variable is missed, so 22 downstream calls is a lower bound.

## Resume notes
All six bullets have verdicts and scores, and no item is pending. Done in the finishing pass: the Bun probe, the workerd run (with and without `nodejs_compat`), the x-3 param-key and wagmi counts, and the sk-1 tag-ref and `skills update` check.

**Scratch outputs:**
- `SCRATCH` (first pass):
  - `consumer-sdk/{package.json,package-lock.json,audit.json}`
  - `dep-weight/*` (lockfile-only tool weights)
  - `probes/{deno-main-bundle.mjs,workers-scan2.mjs,docs-lag.py,codemod-counts.py}`, `npmtime.py`
  - `out-workers/*.worker.js`
  - `docs-lag.json`
  - `ci-main-runs.json`, `ci-last20.json`, `ci-30d.json`, `run-*.json`, `merged-prs.json`
  - `dl-live/*.md` (live docs pages), `dl-npm/dapp-kit-2.2.0-index.d.ts`, `dl-npmstats/*.json`
  - `sdk-meta.json`, `ext-paths.txt`, `issue519.md`
- `WSCRATCH` (finishing pass):
  - `probes/{param-rename-counts.py,workers-bundle-compat.mjs,workerd-run.mjs}`
  - `param-rename-counts.out`, `bun-probe.out`, `workerd-run.out`
  - `out-workers/*.compat.worker.js`
  - `tools/{bun,mf,skills}/` (npm installs, `--ignore-scripts`), `gitref/` (local tag-clone test)
- `VSCRATCH` (verification pass):
  - `probes/{runtime-probe.mjs,workers-bundle-compat2.mjs,workers-bundle-polyfill.mjs,workerd-run.mjs,consumer-vs-monorepo.cjs,param-rename-counts-no-userAddress.py,extract-fn.py}`
  - `runtime-probe.out`, `workerd-run.out`, `workerd-run-polyfill.out`, `workerd-run-polyfill-noinject.out`, `consumer-vs-monorepo.out`, `codemod-counts.rerun.out`, `param-rename-counts.rerun.out`, `param-rename-counts-no-userAddress.out`, `workers-scan2.rerun.out`, `sdk-time.json`
  - `out/*.worker.js`, `out-noinject/`, `dl-skills-1.7.2/cli.mjs` (read as text only), `fn-17{0,2}-*.txt`, `dl-live/` (docs re-fetch), `gitref/`

**Still open (none changes a score):**
- **x-2:**
  - React fixture: same method as `consumer-sdk/` in a new `consumer-react/` with the third-party deps of wallet-sdk-react, wallet-sdk-core, dapp-kit, sdk and libs @2.2.0, plus react 19 and react-query 5; `npm i --package-lock-only --ignore-scripts --legacy-peer-deps --before=<today-14d>`, then `npm audit --omit=dev --json`.
  - budget numbers: `node artifacts/bundle-baseline/measure.mjs` against `pack:local` output (needs a build; ask first).
- **x-4:** ask for the Vercel project Node version. To go past construction, extend `WSCRATCH/probes/workerd-run.mjs` with a read-only call, with outbound fetch allowed only to a stub.
- **x-5:**
  - read the npm version in a recent publish log (`gh run view <sdks-publish run> --log | grep "npm"`);
  - ask an admin for the bypass actors on rulesets 16101300 and 25343590.
- **sk-1:** with approval, an end-to-end `skills add https://github.com/icon-project/sodax-sdks/tree/@sdks@2.2.0/packages/skills --list` in an empty scratch dir.
- **sk-2:** confirm the Mintlify production branch in the dashboard. Re-run `python3 -I SCRATCH/probes/docs-lag.py 2026-09-03 <today> out.json` after the next release.

## Verification (2026-10-19)

A separate agent tried to refute this report. Code at `0181a053` (`sodax-sdks-v3feas`); consumers at frontend `1b915ec7`, whitelabel `5e1fbbaa`, backend `985959e9`. Outputs are in `VSCRATCH`. No install, build, worktree or GitHub write was done.

**Checked**
- **73 citations opened.**
  - 53 in the sdks repo at `0181a053`: `ci.yml:8-9,112,152,202-203,205-211,206-207,271`; `size-check.mjs:15,33-34`; `security.yml:57-108,121-163`; `.github/ci.md:5`; `pnpm-workspace.yaml:87-133,124`; `sdks-publish.yml:8-10,30/72,38-43,49`; the 9 per-package workflows at `:35` and `:42`; `config-version.mjs:15,67-72`; `bump-versions.sh:7,17`; the 9 `release.mjs` sites; `ConfigService.ts:158-185`; `package.json:6-7,40`; `packages/sdk/package.json:41-43`; the 3 `check-exports` rules; both `plugin.json` files; `docs/README.md:3-6`; `faq.md:26`; `builders-mcp.mdx:63,75`; `ai-integration-guide.md:23/39/108,42`; `packages/skills/README.md:13`; `skills.md:17`; `AGENTS.md:185`; `checklist.md:18`; `deleted-hooks.md:99`.
  - 12 in consumers, with `git show`: backend `Dockerfile:2`, `.nvmrc`, `package.json:6` and the 3 `new Sodax(` sites; frontend `opengraph-image.tsx:3` (2 files), `skill.md:23`, `swaps-api-sign.ts:173-179`; whitelabel `next.config.ts` and `src/lib/sodax.ts`.
  - 8 in tools: npm 11.6.0 `publish.js:80-81` and `dist-tag.js:101-102`; pnpm 10.32.1 `pnpm.cjs:188753`; skills 1.7.0 `cli.mjs:198,5207,5695,7362,7379`.
  - All held except these: the override count at `pnpm-workspace.yaml:87-133` (the range is right, the count is 20, not 24); `cli.mjs:5207` and `:5695`, which are not the lock write; and `config-version.mjs:67-72`, which proves "no collision" only together with the range caps at `:60-62`.
- **32 numbers re-derived:**
  - re-run: the baseline history and +59.5% / 126 days (`git log -G`); unpacked sizes and +24.4% / 77 days (`npm view`); 1.x and 0.x publish history; the consumer audit (21 deps, 407 entries, 34 packages 10/13/11, 47 IDs 18/27/2, 36 axios, toml 3.0.0); the override count (YAML parse); the main CI record and 30-day volume; job and step durations; every docs-lag figure; the backport count (141 / 38 / 20, 1.56 a week over 90 days); downloads and 79%; all x-3 table counts (`codemod-counts.py` and `param-rename-counts.py` re-run, output identical); the wallet-hook counts (`git grep -h | wc -l`); skill.md links and version; the migration tree (71 files, 453,044 B, 576 KB `du`, 755 lines); install-command lines; the 6 commits on `release`; integrator versions (`gh api …/contents`); the Workers bundle sizes and the 7 `require("buffer")` calls (`grep -o`);
  - checked by arithmetic only: the T11 sum (3 + 3 + 1 + 1 = 8). The other point totals come from earlier research and were not re-checked.
- **Finisher results, re-run:**
  - Bun and workerd: reproduced, with byte-identical rebuilds. But the "CJS from `0181a053`" bundle carries the T2 lazy-`initEccLib` patch, and the ESM bundle is a 10-12 feature-branch build. The unpatched CJS from the main checkout passes on Node 22.15, Bun 1.4.2, Deno 2.9.7 and workerd with `nodejs_compat`.
  - Workers without `nodejs_compat`: the "fails at load" result holds only for a build that keeps builtins external. A browser-style build with a `Buffer` polyfill loads and constructs with no flags; without the `Buffer` inject it fails.
  - x-3 param keys: the script output is identical on re-run. Two hits checked by hand (`migrate-button.tsx:177-184` `chainId`; `liquidity-inputs.tsx:62-69` `spokeChainKey`, `userAddress`). The counts do not depend on treating `userAddress` as non-canonical. The "4 constructions, 2–4 provider configs" breakdown was wrong; the total of about 40 holds (39).
  - sk-1: the regex result and the local `git clone --depth 1 --branch '@sdks@2.2.0'` reproduce (git 2.39.5); `git ls-remote` shows the tag at `ed770019`. The lock citation was wrong and is fixed. 1.7.2's ref-handling functions are textually identical to 1.7.0's. The `#<ref>` shorthand splits at `@`, so tags need the tree URL or `%40`.

**Changed, and why**
- **Summary and table:**
  - x-4 "shipped sdk" became "local tsup builds", because neither probed bundle is the npm tarball;
  - Workers now passes "with `nodejs_compat` or an app-side `Buffer` polyfill", per the polyfill run;
  - docs lag: the median 27.1 applies to the 19 PRs that reached `latest`, not to all 22;
  - x-2: the gap is 32 of 47 advisory IDs, not "34 packages never seen". 15 IDs match versions the monorepo lockfile also has;
  - x-3: the benefit cell now shows B4 combined, as its section does;
  - "CI never tests" became "does not test".
- **x-2:**
  - overrides: 20, not 24;
  - only 2 of the 4 baseline raises were unexplained (#414 and #475 explain theirs);
  - `6234137b` did touch app and root manifests, but no published one;
  - "nothing flagging" the +24.4% became "a gate raised 3 times in that window";
  - B3 is labelled judgement.
- **x-3:** construction and config sites are 3 + 2, not 4 + 2–4; demo has 0 `new Sodax(` calls; `useXAccount(` 50 is 40 plus 10 `useXAccounts(`; the 4 pre-2.0 integrators depend on wallet-sdk-core (imports not checked); C4 now shows its arithmetic.
- **x-4:**
  - probe provenance stated: the CJS is T2-patched and the ESM is a feature-branch build;
  - unpatched CJS and polyfill results added;
  - decision (a) now has three options;
  - the 3.0 Workers leg means "neither `nodejs_compat` nor a polyfill"; the dependency note matches;
  - the Node-floor B3 tag went from [derived] to [judgement].
- **x-5:** "never collide" now cites the range caps; 0.x history added in support of "no older line has ever been maintained".
- **sk-1:** lock citation fixed; "never updates" became "stays on the tagged commit unless the tag moves"; 1.7.2 check and the `#` shorthand note added; "about 6 install sites" became 18 lines in 14 files; the P6 lag is 29.5 days for 14 of 17 PRs, not 27.1 for 17.
- **sk-2:** the deployment-branch setting is documented by Mintlify (this project's value still not read); "within an hour" became 65 minutes.

**Scores after verification:** no verdict, confidence, C, B or timing changed.
- No bullet is a breaking change, so 2.x timings stand.
- Each C matches its PR list: x-2, x-4 and x-5 have 3 PRs (C3); sk-1 and sk-2 have 2 (C2); x-3 is C4 on coordination and the guide.
- Every B4 is "combined" and rests on a stated prerequisite role.
- sk-1 stays Feasible, because the version users run (1.7.2) has the same ref code.

**Still judgement:**
- every B rating;
- x-3's C4;
- all LOC and point estimates;
- the consumer job's CI time;
- "one Mintlify switch covers 4 channels";
- B1 for Bun, Deno and Workers;
- B2 for the codemod alone.

**Residual doubts**
- The npm `@sodax/sdk@2.2.0` tarball was never run. All runtime results come from local tsup builds and stop at import + construct.
- The polyfill Workers build is one plausible app setup (alias, inject, empty `crypto`). Wrangler was not run. Paths that need Node `crypto` were not exercised.
- The 15/32 advisory split uses npm audit ranges against `pnpm-lock.yaml` package keys. OSV-Scanner's own matching and the weekly scan's output were not read.
- The x-3 param-key counts are a lower bound (literal object arguments only), and dk-6 has not fixed the canonical names.
- "4 external integrator repos have no `bun.lock`…" does not say which 4, and it was not re-checked.
- The workerd runs relied on miniflare's fetch interception, not an OS network block.
