---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, dapp-kit]
---

# dapp-kit API surface — deep dive (feasibility, complexity, benefit)

1. dk-1: per-feature subpaths save **0 KB** on their own when the app bundles the SDK: esbuild already drops unused hooks from today's barrel. (With `@sodax/sdk` kept external, `export *` makes esbuild keep all of dapp-kit, 17.4 KB gzip.) The value is elsewhere: no duplicate SDK copy (+165 KB when versions skew), and per-chain subpaths once chain packages become optional.
2. dk-3: there are 214 inline key literals (131 that define a query, 83 inside invalidations). Consumers hand-write 12 SODAX keys, so the key shapes must not change. Two allowance hooks leave inputs out of their keys today.
3. dk-5: the 128 query hooks fail in 4 different ways. sodax-frontend sorts errors with 43 message regexes. Typed code unions are possible only where the SDK types its errors (145 of 333 `Result` returns).
4. dk-6: 30 of 202 feature hooks carry no feature token. The `SodaxProvider` instance prop shrinks the bundle only if the provider stops importing the `Sodax` facade: −43 to −48 KB measured, on top of sdk-6.
5. sk-3: `hooks-index.md` misses 14 of 217 hooks, 13 of them from one PR (#374). No `check:ai` script checks that the docs are complete (the key gate only checks docs against source), so nothing caught it. A generator and a `--check` mode are about 400 LOC.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| dk-1 | Feasible with caveats / Proven | C3 | B2 (combined B2) | 2.x build + subpaths; 3.0 peer + no `export *` | Bundle gain is 0 KB alone when the SDK is bundled. Real value: dedupe, a clean API boundary, and per-chain subpaths once sdk-1 lands. |
| dk-3 | Feasible / Code-traced (gate impact Proven) | C3 | B2 | 2.x | Mechanical across 128 queries and 85 invalidations; the shapes must stay; fix 2 key bugs now. |
| dk-5 | Feasible with caveats / Code-traced | C4 | B3 | 2.x (all `SodaxError`) + 3.0 (Result-as-data, swallow) | 4 failure paths today; consumers regex-match messages; per-code types need SDK typing work. |
| dk-6 | Feasible with caveats / Code-traced (size Proven) | C3 | B2 (combined B3) | 2.x aliases + instance prop; 3.0 remove aliases | Renames are cheap in code, but about 570 doc and app mentions must change; the instance prop pays off only facade-free. |
| sk-3 | Feasible / Code-traced | C2 | B2 | 2.x (now) | One PR silently dropped 13 index rows; completeness is not enforced anywhere. |

**Sources and scope.**
- **Code:** sodax-sdks `0181a053` (the `sodax-sdks-v3feas` worktree).
- **Builds:** dists and node_modules from `sodax-sdks-t2probe`, the same commit plus the T2 probe.
- **Consumers:** sodax-frontend@`1b915ec7` (origin/main), intents-whitelabel@`5e1fbba` (origin/main), sodax-backend@`985959e9` (origin/development).
- **Bundles:** esbuild 0.25.12, minify, ESM, browser, es2022. react, react-dom, react/jsx-runtime and @tanstack/react-query are external; Node builtins are external.
- **"T2 sdk":** the t2probe unbundled `dist/esm` build.
- **"Flat sdk":** T2's `dist/esm` re-bundled by me into one ESM file, the way tsup does it on main. It is validated against main: `SodaxError` alone measures 826.4 KB here versus 825 KB in `artifacts/t2-probe/README.md`; `new Sodax()` measures 1,258.8 KB versus 1,258 KB.
- **Probe scripts and outputs:** under `$S` = `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-dk-surface/probes/`.

---

## dk-1 · Per-feature subpaths, the SDK as a peer, no `export *`

**Bullet:** "Add per-feature subpaths, make the SDK a peer, and stop re-exporting the entire SDK"  ·  **T-ids:** T13.1, T13.2, T13.3, T13.4 (T13.5 and T13.10 are adjacent)

### Today
- **Build and exports.** dapp-kit is one tsup bundle (`packages/dapp-kit/tsup.config.ts`, `entry: ['./src/index.ts']`) with a single `.` export (`packages/dapp-kit/package.json`, `exports`). The package has `"sideEffects": false`. [verified]
- **SDK is a dependency with exact pins.**
  - The source declares `"@sodax/sdk": "workspace:*"` and `viem: catalog:` in `dependencies`.
  - Published `@sodax/dapp-kit@2.2.0` pins `"@sodax/sdk": "2.2.0"` and `"viem": "2.29.2"` exactly. [verified: `npm view @sodax/dapp-kit@2.2.0 dependencies`]
- **The barrel re-exports the whole SDK.** `src/index.ts:5` is `export * from '@sodax/sdk'`. Apart from that, the dist does a runtime import of only 18 SDK names. [verified: `grep "from '@sodax/sdk'" dist/index.mjs`]
- **Cross-folder imports between hook folders:** 4 folder pairs, 7 import lines. [verified: ``rg "from '\.\./(?!shared/)[a-zA-Z]+/" --pcre2 hooks``]
  - `mm → bitcoin` ×3: `resolveBtcReadAddress` in `mm/useATokensBalances.ts:5`, `mm/useUserFormattedSummary.ts:5` and `mm/useUserReservesData.ts:5`.
    - It reads `loadRadfiSession` from `bitcoin/useRadfiAuth.ts:32-39`, a localStorage read.
    - That file also imports `RadfiApiError` from the SDK at runtime (`useRadfiAuth.ts:2`).
  - `shared → bitcoin` ×1: `shared/useGetUserHubWalletAddress.ts:4`.
  - `shared → sponsoring` ×2: `shared/useStellarGate.ts:9-10`.
  - `leverageYieldApi → swapsApi` ×1: `leverageYieldApi/useLeverageYieldApiStatus.ts:9` imports `isTerminalSwapIntentStatus`, a pure function.
  - The `utils/dex-utils.ts ↔ hooks/dex` "cycle" is **type-only**: it is an `import type` at `dex-utils.ts:1-7`.
  - whitelabel imports `loadRadfiSession` from the dapp-kit root. Any move must keep it exported.
- **`@/` path aliases.** There are 7 `@/` import lines; 6 survive `tsc` emit. A `tsc -p packages/dapp-kit/tsconfig.json` emit into scratch (TS 5.5.4) gave these results. [verified]
  - 259 non-test `.js` files (299 with tests);
  - **0 files import `tslib`**, so the `importHelpers` risk raised in earlier research does not materialise at ES2023;
  - 6 files keep `@/` imports, which `tsc` does not rewrite: the four dex param hooks, `SodaxProvider.tsx` and `useSodaxContext.ts`.
- **Duplicate SDK copies today.** Each consumer has exactly one `@sodax/sdk` because it pins every `@sodax/*` package to the same version. [verified: lockfiles]
  - frontend: everything at `2.2.0-rc.8`; the dapp-kit snapshot depends on `@sodax/sdk 2.2.0-rc.8`.
  - whitelabel: everything at `2.0.0-rc.12`.
- **Who relies on `export *`.** Counts are names imported from `@sodax/dapp-kit` that dapp-kit does not own (dapp-kit owns 467 names). [verified: `python3 -I $S/barrel_deps.py <t2probe dapp-kit dist/index.d.ts> <roots>`]

  | Root | Files importing dapp-kit | Specifiers | SDK names via barrel (specifiers / unique / files) |
  | --- | --: | --: | --- |
  | apps/demo | 84 | 510 | 290 / 124 / 80 |
  | apps/playground | 32 | 123 | 109 / 36 / 32 |
  | apps/stellar-sponsor-example | 17 | 46 | 28 / 15 / 16 |
  | apps/example-next-js-16 | 1 | 1 | 0 |
  | wallet-modal, swap-api-example, node, node-cjs, docs/ | 0–5 | — | 0 |
  | packages/skills | 29 | 165 | 14 / 7 / 7 (one is the v1 name `useSpokeProvider` in migration docs) |
  | sodax-frontend@1b915ec7 | 42 | 101 | **0** |
  | intents-whitelabel@5e1fbba | 18 | 40 | **0** |

### Change
- **From:** one bundle, `.` only, a hard SDK dependency, and `export * from '@sodax/sdk'`.
- **To:**
  - 2.x: unbundled tsc ESM; subpaths `./swap`, `./money-market` and so on, plus `./bitcoin` and `./sponsoring`; the root stays a superset.
  - 3.0: `@sodax/sdk` becomes a peer (`workspace:^`), and `index.ts:5` is deleted.

```ts
// before
import { useQuote, useSwap, ChainKeys } from '@sodax/dapp-kit';
// after (3.0)
import { useQuote, useSwap } from '@sodax/dapp-kit/swap'; // or the root
import { ChainKeys } from '@sodax/sdk';                    // the app lists @sodax/sdk itself
```

### Feasibility — Feasible with caveats · Proven
- **Proven by bundle probes** (`$S/dk1-*.mjs`; outputs in `$S/dk1-results.txt`, `dk1-bundled.txt`, `combined.txt`, `dk1-dup.txt`). All numbers are gzip.

  | Consumer code | Today's dist (barrel) | Per-feature entry (src subpath) |
  | --- | --: | --: |
  | Swap: `SodaxProvider` + `useQuote`/`useSwap`, T2 sdk | 1,262.4 KB | 1,262.4 KB |
  | Swap, same, flat sdk (today's published shape) | 1,259.5 KB | 1,259.7 KB |
  | MM: provider + 8 hooks, T2 sdk | 1,262.7 KB | 1,262.7 KB |
  | Swap hooks only (no provider), T2 sdk | 0.9 KB | 0.8 KB |
  | Swap hooks only (no provider), flat sdk | **827.2 KB** | **0.8 KB** |
  | MM 8 hooks only, flat sdk | 827.5 KB | 828.2 KB |
  | `new Sodax()` alone (T2 / flat) | 1,261.5 / 1,258.8 KB | — |

  - **dapp-kit's own code** in these bundles is 1.8–2.0 KB minified for swap and 4.5–5.1 KB minified for MM. The SDK plus the chain libraries are everything else. [verified: metafile]
  - **Whole dapp-kit, sdk external:** 93.6 KB min, 17.4 KB gzip. This bounds what subpaths could save against today's dist. [verified]
  - **An unbundled root barrel that keeps `export *`** gives the same numbers as the subpaths: 0.8, 828.1 and 1,259.7 KB with the flat sdk; 0.8, 1.5 and 1,262.3 KB with T2. The single-file layout causes the 827 KB in the provider-less case: dapp-kit's one-file dist together with a flat SDK. Unbundling either side removes it (0.9 KB with T2; 0.8 KB from an unbundled root). Neither `export *` nor the missing subpaths causes it. Removing only the `export *` line still measured 827.2 KB. [verified]
  - **Scope: the SDK bundled.** With `@sodax/sdk` and viem external (a library or server build), the `export *` from an external module makes esbuild keep all of dapp-kit for any import. Today's dist keeps 93.6 KB min / 17.4 KB gzip for `useQuote`+`useSwap` (A2 = A1), and an unbundled root keeps 104.9 KB / 19.3 KB. A subpath (1.8 KB min) avoids it, and so does a copy of the dist without the `export *` line (2.3 KB min / 1.2 KB gzip). [verified: `wf-verify-dk-surface/scripts/ext-probe.mjs` and `ext-probe-src.mjs`; esbuild 0.25.12 only]
  - **rollup 4.60.4 agrees** on dapp-kit's own code: it renders 2.9 KB of dapp-kit's 165.4 KB for `useQuote`/`useSwap`. Its SDK numbers are not representative, because my resolver ignores `sideEffects`. [verified]
- **Why subpaths become structurally needed after sdk-1.** If the root barrel re-exports a module that imports a package which is not installed, esbuild fails with `Could not resolve "@sodax/chain-bitcoin"` even when only `useSwap` is imported. The `./swap` subpath builds. [verified: `$S/optional-peer/`, a three-file model, esbuild only]
  - So per-chain hooks (13 bitcoin files and 5 Stellar sponsoring files, each count including `index.ts`) need their own subpaths, kept out of the root barrel, once chain packages are optional peers. This holds **if** those hooks import runtime values from the chain package. Today they import chain-specific runtime values from the SDK: `normalizePsbtToBase64` and `RadfiApiError` in `bitcoin/`, `STELLAR_TRUSTLINE_MIN_XLM_STROOPS` and `SPONSOR_CONFIG_TTL_MS` in `sponsoring/`. Reaching them through the injected instance instead would avoid the need. [derived]
- **The peer move removes a real failure mode.**
  - **Bundle cost:** two SDK copies that share chain libraries cost +164.6 KB gzip (1,258.8 → 1,423.4). [verified]
  - **Type error:** TS 5.5.4 rejects passing the app's instance into a prop typed from the other copy, with TS2322 "separate declarations of a private property". [verified on a minimal model: `$S/ts-nominal/`; the real case is `SwapService.ts:321`, a private field]
- **Blockers and decisions.**
  - (a) Where the Bitcoin read helper lives. Moving `resolveBtcReadAddress` and `loadRadfiSession` into `shared` keeps a Bitcoin special case on the MM path; that is fine for sdk-1, because it is only a string compare plus localStorage.
  - (b) `useStellarGate` (shared) pulls in two sponsoring hooks. Keep them reachable from the core, or move the gate.
  - (c) The peer range must be lockstep (`workspace:^`) so an older SDK is never accepted. [judgement]

### Complexity — C3
- **PR breakdown.**

  | PR | Scope | Production code | Release |
  | --- | --- | --- | --- |
  | 1. tsc unbundled build | `tsconfig.build.json`, scripts, `exports`; rewrite 6 `@/` imports | ~60 LOC | 2.x |
  | 2. Subpath entries | ~14 entry files and the `exports` map; move 3 helpers to `shared`; knip and attw updates | ~250 LOC | 2.x |
  | 3. Contract | delete `export *`; peer + devDependency; add `@sodax/sdk` to the demo and playground `package.json`; codemod the in-repo apps (427 specifiers in 128 app files, plus 14 in 7 skill files) | ~1 LOC plus mechanical churn | 3.0 |
  | 4. SDK feature entries (T13.4) | internal imports → `@sodax/sdk/<feature>`; context typed structurally; waits on sdk-6 | not sized here | 2.x |

- **Tests:** verify-dist-exports per entry, attw `esm-only`, and the Next example verify. Add a probe that each subpath builds without optional chain packages.
- **Coordination:** subpath entry files only re-export the folder barrels, so #511, #512 and #488, which edit `hooks/*/index.ts`, do not conflict. PR 3 shares `package.json` with sdk-3's viem-peer change.
- **Breaks:** in 3.0, any import of SDK names from dapp-kit. Known downstream impact is 0; the in-repo apps and 6 skill names need the codemod.
- **Top risks.**
  1. The dist layout change (one file → many) trips a consumer bundler or a deep import. None is known; the Next example and attw cover the common paths.
  2. Peer drift: a dapp-kit release whose peer range admits an SDK that lacks a new method fails at runtime.
- **Versus the earlier estimate:** 9 pts (T13.1 2 + T13.2 3 + T13.3 2 + T13.4 2). That matches. T13.4 still waits on sdk-6.

### Benefit — B2
- **P1 and P2 (React dapps).**
  - **Bundle, standalone:** 0 KB when the SDK is bundled (table above). Builds that keep `@sodax/sdk` external save 16.2–18.5 KB gzip for two swap hooks, from a subpath or from deleting `export *` [derived: 17.4 − 1.2; 19.3 − 0.8]. No known consumer builds that way. [verified, esbuild]
  - **Duplicate avoidance:** +164.6 KB avoided when versions skew. The incidence in known consumers is 0 today, because both pin in lockstep. [verified]
  - **IDE:** auto-import stops offering SDK names from dapp-kit. The demo imports 124 SDK names through the barrel, which suggests it does. [judgement]
- **Combined with sdk-1 + sdk-4 + sdk-6 + dk-6's facade-free provider:** a swap app goes from 1,262.4 to 249.2 KB. [verified with stubs, which overstate the saving]
  - About 967 KB of that comes from sdk-1 and sdk-4. With the chains stubbed, today's provider plus the two hooks is 295.1 KB, and `new Sodax()` alone is 294.4 KB. [verified: re-run 2026-10-19; 1,262.4 − 295.1 = 967.3]
  - The provider avoiding the facade adds 43 KB (292.6 → 249.2, given sdk-6's swap core).
  - **dk-1's subpaths add 0 KB** on top of an unbundled root. So the combined benefit for dk-1 itself stays B2. The sdk-1 prerequisite is conditional (see Feasibility), so it does not lift dk-1 to B4. [judgement]
- **P3 and P4:** none; dk-1 is React only. P4 React apps still construct the facade, so they need api-2.
- **P5 (maintainers):** dapp-kit's API becomes its 467 own names instead of those plus every SDK export. Per-chain subpaths unblock sdk-1 for React apps, under the condition in Feasibility. [verified on a minimal esbuild model]
- **P6 (AI agents):** the skills stop teaching SDK names through dapp-kit (6 names).

### Recommendation
Do it in two halves:
- **2.x:** unbundled build plus subpaths. Treat the per-chain subpaths as the part that matters, because sdk-1 likely needs them (see the condition in Feasibility).
- **3.0:** peer plus no `export *`.
- **Drop** "smaller bundles" as a selling point for subpaths, for apps that bundle the SDK.

Wording: "Ship dapp-kit as unbundled ESM with per-feature and per-chain subpaths, make the SDK a peer, and stop re-exporting the entire SDK".

### Corrections to earlier research
- `client-usage.md` T13 says "React apps load only the hook groups they use". **Tree-shaking already does that** when the app bundles the SDK. Subpaths measured 0 KB difference there.
- `d-dappkit…` T13 counted 7 `@/` imports. It is 6 runtime imports plus 1 type-only. The "dex-utils cycle" is type-only. The tslib risk does not occur (0 imports).
- Counts: demo 124 unique names / 290 specifiers / 80 files (was 121/287/83); skills 7/14, one of them a v1 name (was 8/16).

---

## dk-3 · Export query keys and `queryOptions` builders

**Bullet:** "Export query keys and queryOptions builders"  ·  **T-ids:** T21.1–T21.5

### Today
- **Hooks:** 217 exported, made up of 127 `useQuery`, 1 `useQueries`, 73 `useSafeMutation`, and 16 others (15 composites plus `useSafeMutation` itself). [verified: `python3 -I $S/hook_inventory.py`; ``rg -o '\buseQuery(\(|<)' hooks | wc -l`` = 127]
- **Key literals:** 214 `queryKey: [` literals in total. [verified: ``rg -o -g '!*.test.ts' 'queryKey:\s*\[' src | wc -l``]
  - 131 define a query and 83 sit inside invalidations.
  - There are also 73 `mutationKey` literals and 85 `invalidateQueries(` calls; the 2 non-literal ones are at `shared/useEstablishTrustline.ts:58-65`.
  - dapp-kit has 0 `setQueryData` or `refetchQueries` calls.
- **Builders:** 8 exist (`useQuote.ts:51`, `useLeverageYieldQuote.ts:58`, `useXBalances.ts:24`, `useBalances.ts:29` positional, `useStellarTrustlineCheck.ts:21`, and the three sponsoring ones).
  - They live inside the hook files, which import `useSodaxContext`, so they are not server-safe. [judgement; not run in an RSC]
- **Invalidations inside dapp-kit:** all 83 literal keys match a defined key prefix; there are 0 dead invalidations. [verified: `$S/key_match.py`]
- **Hand-written SODAX keys in consumers.** All 12 match today's hook keys. [verified: `$S/key-match-consumers.txt`]
  - sodax-frontend@1b915ec7 has 11:
    - `save/_components/deposit-dialog/deposit-dialog-footer.tsx:93-95`;
    - `withdraw-dialog/withdraw-dialog-footer.tsx:94-96` (mm aTokensBalances, userReservesData, reservesUsdFormat);
    - `pool/_components/manage-dialog/manage-position-dialog.tsx:347-348` (invalidate) and `:351-352` (refetch);
    - `pool/_components/supply-dialog/supply-dialog-footer.tsx:372`, `setQueryData(['dex','poolData', fixedPoolKey])`. This **writes** into the cache and depends on the exact shape (`dex/usePoolData.ts:17`).
  - whitelabel@5e1fbba has 1: `src/lib/query-client.ts:31`, `["mm","userFormattedSummary"]`.
  - In-repo apps: the demo has 13 keys in dapp-kit namespaces. Three are demo-owned queries placed under `leverageYield` (`useLegQuote.ts:51,132`, `PendingOperationControl.tsx:61`).
- **Key-shape inconsistencies.**
  - `useEModes` is keyed `['moneyMarket','eModes']` (`mm/useEModes.ts:27`), against the `'mm'` rule (`querykey-conventions.md:7-22`). **It breaks nothing today:** the data changes only by governance, no mutation needs to refresh it, and nothing in dapp-kit, the apps or the consumers uses a `moneyMarket` key. [verified for the key use by rg and git grep; "changes only by governance" is judgement]
  - **Real bug.** `useMMAllowance` keys on `[srcChainKey, token, action]` (`mm/useMMAllowance.ts:37`), but the query sends the whole payload, including `amount` and `srcAddress` (`:48`; the fields are at `MoneyMarketService.ts:115-123`). After an amount or account change the hook can return the old answer until the next 5 s poll (`:53`). Every other allowance hook keys on the amount. [verified by reading; UX impact not reproduced]
  - **Real bug, new.** `useDexAllowance` leaves `srcAddress` out of its key (`dex/useDexAllowance.ts:27` against `AssetService.ts:57-64`).
  - **Past drift.** `shared/invalidateBalances.ts:4-14` documents an earlier stale-balance drift between two key families.
- **The key gate.** `check-ai-keys.py` finds `queryKey|mutationKey: [` literals (`:33`), and only in `src/hooks/**/*.ts` (`:116`). It also counts backticked arrays (`:36`, `:98`) as source keys, and 11 sit in hook comments today, so a key named only in a comment satisfies it. [verified: reading `:86-122`; rg count] It checks docs against source in one direction (`:186-197`). If its source set is empty it exits 2 (`:177-179`). It passes today, with 184 integration claims and 10 migration claims. [verified: ran it read-only]
  - **Simulation.** I turned every `queryKey: [` into a factory call in a scratch copy. The gate then failed **123 of 184** claims, and **184 of 184** once the `mutationKey` literals moved too. It reported failures instead of exiting 2 because the 11 comment arrays kept its source set non-empty. [verified: `$S/hooks-factory-sim/`; both states re-run 2026-10-19]

### Change
- **From:** inline literals and 8 builders.
- **To:**
  - a `sodaxKeys` factory that reproduces today's arrays exactly, with `.all` prefixes;
  - `get<X>QueryOptions({ sodax, ...params })` for all 128 queries;
  - the 85 invalidations moved onto the factory;
  - a server-safe `./query` entry with no React import. This one is a decision: builders have to take `sodax` as an argument.

```ts
// before (sodax-frontend)
await queryClient.invalidateQueries({ queryKey: ['mm', 'aTokensBalances'] });
// after
await queryClient.invalidateQueries({ queryKey: sodaxKeys.mm.aTokensBalances.all });
```

### Feasibility — Feasible · Code-traced (gate impact Proven)
- **The pattern exists:** see `sponsoring/useSponsorConfig.ts:10-31`.
- **Constraints:**
  - keep the shapes byte-identical (consumers write 12 keys, one of them a cache write);
  - keep keys JSON-safe (the bigint pattern in `useQuote.ts:16-49`);
  - keep `refetchInterval` closures that hold React state inside the hook (`useDetailedStatus`, `useStatus`);
  - teach `check-ai-keys.py` the factory in the same PR.
- **Decisions:**
  - (a) whether to fix the two allowance keys as 2.x bug fixes (appending segments keeps prefix invalidation working); recommended yes;
  - (b) whether to add an optional `queryKeyScope`. The demo works around unscoped keys (`apps/demo/src/providers.tsx:191-197`).

### Complexity — C3
- **PR breakdown.**

  | PR | Scope | Size |
  | --- | --- | --- |
  | 1. Factory | `query/keys.ts` (~300 LOC), key-shape snapshot test (~200), gate update (~60) | ~560 LOC |
  | 2–4. Builders | 120 more builders at ~10 net lines each, plus 85 invalidation rewrites, split by feature group | ~1.2k LOC |
  | 0. Allowance key fix | the two key bugs | ~10 LOC; can ship first |

- **Tests:** a snapshot of every hook key against the factory.
- **Migration:** none; it is additive.
- **Coordination:** #511 and #512 add hooks to the same folders; #529, #531 and #532 add lifecycle hooks; #540 adds `*WithApproval` hooks; #488 touches migrate.
- **Breaks:** nothing, if the shapes are kept.
- **Top risks.**
  1. A silent shape change breaks consumer keys with no compile error. The frontend's `setQueryData` would write to an orphan entry.
  2. Builders that import React context are likely unusable for RSC prefetch. [judgement; not run]
- **Size:** at the top edge of C3, about 2k LOC and ~210 call sites.
- **Versus the earlier estimate:** 13 pts (T21.1–T21.5). That matches.

### Benefit — B2
- **P1 and P2:**
  - typed keys for the 12 hand-written consumer sites;
  - prefetch, hydration and Suspense for every query, against 8 builders today;
  - the stale-allowance key class fixed.
  - No size impact.
- **P5:** one source for keys, so drift between a key and its invalidations becomes a type or snapshot failure instead of a silent miss (today: 0 dead invalidations of 83). It does not stop a key from leaving out an input, as the two allowance bugs do. [judgement]
- **P6:** agents import keys instead of guessing literals. That combines with sk-3.
- **P3 and P4:** none.

### Recommendation
- **2.x.** Ship the two allowance key fixes now, then the factory, then the builders.
- **Wording:** "Export a query-key factory that keeps today's key shapes, plus queryOptions builders for every query".

### Corrections to earlier research
- "214 inline key literals" includes the 83 invalidation keys. Queries define 131.
- The frontend hand-writes **11** keys, including one `setQueryData`; it was counted as 10. Whitelabel has 1.
- `useEModes`' `moneyMarket` prefix is an inconsistency, **not a live bug**.
- New: `useDexAllowance` also leaves an input out of its key.

---

## dk-5 · Consistent typed errors across query and mutation hooks

**Bullet:** "Use consistent typed errors across query and mutation hooks"  ·  **T-ids:** T22.5, T22.6

### Today
- **How a query failure reaches the consumer** (128 query hooks). [verified: `python3 -I $S/error_classes.py`, with spot checks]
  - **A — 98 throw the SDK `Result` error**, via `unwrapResult` or `throw result.error`.
  - **B — 18 pass through raw library errors** from non-`Result` calls: the script's 14, plus the 4 it labels "other", which I read. These include 9 MM `data` reads (`MoneyMarketDataService.ts:72-233` returns plain promises), `getUserHubWalletAddress` (`EvmHubProvider.ts:41`), the Stellar and NEAR checks, viem `readContract` and Radfi reads.
  - **C — 6 return the `Result` as data:**
    - `useQuote` (`swap/useQuote.ts:64`);
    - `useStatus` (`useStatus.ts:39`);
    - `useDetailedStatus` (`:56`);
    - `useBridgeDetailedStatus` (`:65`);
    - `useLeverageYieldDetailedStatus` (`:69`);
    - `useLeverageYieldQuote` (`:70`).
  - **D — 6 swallow errors into a default:**
    - `useBackendIntentByHash` (`backend/useBackendIntentByHash.ts:31`) and `useBackendIntentByTxHash` (`:35`) return `undefined`;
    - `useSwapAllowance` (`:45`), `useBridgeAllowance` (`:42`) and `useMigrationAllowance` (`:70`) return `false`;
    - `useBitcoinBalance` (`:34`) returns `0n`.
- **Mutations:** 66 use `unwrapResult`. Seven throw natively: 5 Bitcoin/Bound hooks (`_mutationContract.test.ts:9-20`), `useEstablishTrustline` and `useRegisterNearStorage`.
- **dapp-kit's own error code:** [verified: rg counts]
  - 53 plain `throw new Error(` guards in 51 hook files, plus the wrap at `unwrapResult.ts:16` (54 in 52 files under `hooks/`). Most are defensive guards in query functions that `enabled` already gates.
  - 0 `new SodaxError(`.
  - `unwrapResult` wraps errors that are not `Error` instances into a plain `Error` (`shared/unwrapResult.ts:14-16`). Open #483 edits the same lines.
- **What the SDK types.** `Result<T, E = Error | unknown>` (`types/src/common/common.ts:80`). Of 333 `Promise<Result<…>>` return annotations, 145 type `E` and 188 do not. [verified: `$S/result_typing.py`]
  - Typed: bridge 9/9, leverageYield 51/51, migration 11/11, moneyMarket 11/11, staking 20/20, sponsoring 7/7, swap 23/36, partner 5/10. Most are `SodaxError<code-union>` aliases (10 spot-checked); 8 declare `SolverErrorResponse` (swap and leverage-yield quote and status). [verified: rg]
  - Untyped: dex 0/21, recovery 0/2, shared 1/60, backendApi 7/95.
  - **The 88 untyped backendApi methods still return `SodaxError<'EXTERNAL_API_ERROR'>` at runtime** (`api-utils.ts:240-254`; `SwapsApiService.ts:156`). [code-traced through the services' shared `toResult`/`toExternalApiError` helpers; a few of the 88 are internal interface signatures; not every method traced]
  - Swap quote and status return `SolverErrorResponse`, which is not an `Error` (`SwapService.ts:388,435-437`). The execute path converts the solver code into `SodaxError` `context.solverCode` (`:672`).
- **How consumers branch on errors** (files that import `@sodax/*`). [verified]
  - **sodax-frontend:**
    - 0 uses of `isSodaxError` or `instanceof SodaxError`, and no branch on a SODAX code by name;
    - it classifies errors with `apps/web/lib/wallet-error.ts`: 209 lines, **43 regexes in 8 pattern arrays** (one of them `/relay_timeout/i`), recursing into `cause`. It is imported by 10 files: 20 `getWalletErrorMessage` calls and 9 calls to its own `isUserRejectedError`;
    - it reads wallet codes (`wallet-error.ts:44-46`) and folds every `code` string into the text it matches (`:127`). That is how `/relay_timeout/i` matches the SDK's `RELAY_TIMEOUT` code;
    - `mutateAsyncSafe` and `.ok` on 3 swaps-API mutations (`swap-confirm-dialog.tsx:105-143`, `:221,253,278`).
  - **whitelabel:**
    - merges two error channels and loses the solver detail: `error ?? (quoteResult && !quoteResult.ok ? new Error('Quote failed') : null)` (`src/hooks/use-swap-quote.ts:39-43`);
    - reads `.ok` inside `refetchInterval` (`use-swap-status.ts:16-18,25`);
    - shows `error.message` raw (`supply-dialog.tsx:212` and 3 more MM dialogs, plus 2 asset dialogs through its bridge wrapper);
    - `mutateAsyncSafe` ×6.

### Change
- **2.x (additive):**
  - every hook error becomes a `SodaxError`: guards become `VALIDATION_FAILED`, wraps that are not `Error`s become `UNKNOWN` with `cause`, B-class reads become `LOOKUP_FAILED` with `cause`, and Radfi becomes `EXTERNAL_API_ERROR`, which needs `'radfi'` in the `context.api` union;
  - `TError` per hook becomes the SDK's `E` where it is typed;
  - the SDK declares `SodaxError<'EXTERNAL_API_ERROR'>` on the 88 backendApi methods;
  - every wrap keeps the original `message` and sets `cause`, so 2.x stays non-breaking. The frontend classifier walks `cause`, and no known consumer runs `instanceof` on a hook error. [verified: git grep on both consumers]
- **3.0:**
  - the 6 C-class hooks throw. dapp-kit converts `SolverErrorResponse` into `SodaxError` with `context.solverCode`.
  - The D-class hooks throw, or document their default (a decision).

```ts
// whitelabel today
error: (error as Error | null) ?? (quoteResult && !quoteResult.ok ? new Error('Quote failed') : null)
// after (3.0)
const { data: quote, error } = useQuote(...); // error: SodaxError, error.context?.solverCode
```

### Feasibility — Feasible with caveats · Code-traced
- **Caveats:**
  - per-code unions are possible only where the SDK types `E`: 145 of 333 today, and not dex or most of shared;
  - the API-lane hooks need an SDK declaration change first, which is sdk-8's area;
  - B-class wraps change `error.message`/`name` unless the message is kept. The frontend regexes match on message text, but they also walk `cause` (`wallet-error.ts:121-136`), so a wrap that keeps `cause` still matches.
- **Decisions:**
  - (a) the D-class hooks: keep the default or throw. An allowance that comes back `false` after an RPC error prompts a needless approve.
  - (b) convert solver errors in dapp-kit (keeps the SDK stable) or in the SDK (breaks code that reads `detail.code`, which #483 documents).
  - (c) where `feature` tags come from for dapp-kit guard errors.

### Complexity — C4
- **PR breakdown.**

  | PR | Scope | Size | Release |
  | --- | --- | --- | --- |
  | 1. Everything a `SodaxError` | ~80 hook files and `unwrapResult`; lands after #483 | ~500 LOC | 2.x |
  | 2. Typed `TError` | 201 hook signatures; SDK backendApi return types (cross-package) | ~400 LOC | 2.x |
  | 3. C-class hooks throw | 6 hooks plus `useSwapLifecycle`, `solverStatusPolicy` and refetch policies; codemod report rule; 143 skill mentions | — | 3.0 |
  | 4. D-class decision | 6 hooks | — | — |

- **Coordination:** #483 (`unwrapResult.ts`); #529, #531 and #532, whose lifecycle hooks read status `data`; #540.
- **Breaks (3.0):** whitelabel's 2 wrappers, 4 in-repo app call sites, and dapp-kit's own `useSwapLifecycle`. [verified: rg]
- **Top risks.**
  1. Status hooks drive lifecycle state machines on paths that move funds. Changing their error channel could make a transient status error look like a failed swap, and a resubmit could follow. [judgement]
  2. Changed messages silently change what consumers show or match. The frontend's 43 regexes also read `cause`, so they survive a wrap that keeps it; whitelabel shows the top-level `message` as is.
- **Why not C5:** no signing or submit code changes. The funds-path risk (risk 1) is indirect, and PR 3 moves dapp-kit's own lifecycle hook and status policies in the same change. [judgement]
- **Versus the earlier estimate:** 6 pts (T22.5 3 + T22.6 3). **That is too low.** It leaves out the 18 B-class hooks, the 6 D-class hooks, the SDK-side typing and the solver conversion.

### Benefit — B3
- **P1 and P2:**
  - one error channel instead of 4;
  - branching on `code` instead of message regexes for rejection, timeout and relay. Raw wallet gas, nonce and balance errors still sit in `cause`, so only part of the regex set goes.
  - Swallow-to-default reads stop hiding failures.
  - This removes a recurring class of bug and support question. [judgement on recurrence; the evidence is the two consumer workarounds above]
- **P6:** one error model to teach.
- **P5:** one contract to test.
- **P3 and P4:** none.

### Recommendation
- **2.x:** every error a `SodaxError`, plus typed `TError` where the SDK types it.
- **3.0:** C-class hooks throw; decide the D-class.
- **Wording:** "Every hook error is a SodaxError with typed codes where the SDK types them; quote and status reads throw instead of returning Result, and reads stop swallowing errors".

### Corrections to earlier research
- "5 that swallow errors" should be **6** (list above).
- A fourth class was not counted: **18 hooks pass through raw library errors**.
- "DEX: 0 of 21" is correct. However, the untyped backendApi results are `SodaxError` at runtime, so typing them is a declaration fix, not a behaviour change.

---

## dk-6 · Standard names, and `SodaxProvider` accepts an instance

**Bullet:** "Standardize hook and parameter names, and let SodaxProvider accept an existing Sodax instance"  ·  **T-ids:** T26.1, T26.2, T26.3

### Today
- **Naming inconsistencies** (from `$S/hooks.tsv`). [verified: script. Which name parts count as a feature token is judgement, and the token list was not saved. Every folder outside the five below was counted 0, so recovery's `useHubAssetBalances` and bitcoin's `useRenewUtxos` were treated as carrying one.]

  | Pattern | Count | Names |
  | --- | --: | --- |
  | Feature-folder hooks with no feature token | 30 of 202 | mm 13 (incl. `useSupply`, `useBorrow`, `useWithdraw`, `useRepay`, `useReservesData`, `useEModes`); partner 7; swap 5 (`useQuote`, `useStatus`, `useDetailedStatus`, limit orders); dex 3; staking 2 (`useClaim`, `useConvertedAssets`) |
  | `useMM*` against the rest of MM | 2 against 13 | `useMMAllowance` and `useMMApprove` against `useSupply` and others |
  | `useGet*` | 6 | `useGetAutoSwapPreferences`, `useGetBridgeableAmount`, `useGetBridgeableTokens`, `useGetIntentDetails`, `useGetUserHubWalletAddress`, `useGetUserIntent` |
  | `useFetch*` / `useIs*` | 1 / 1 | `useFetchAssetsBalances` / `useIsTokenApproved` |
  | Casing | 1 | `useMigratebnUSD` |
  | Two balance hooks | 2 | `useXBalances` and `useBalances` |

- **Parameter tokens in dapp-kit src** (non-test; occurrences / files). [verified: rg]
  - `xChainId` 10/3, `chainId` 20/7, `spokeChainKey` 44/5, `chainKey` 75/17;
  - `userAddress` 65/10, `spokeAddress` 25/3;
  - 8 hook files expose a chain field other than `chainKey`/`srcChainKey` in their public params type (10 counting the two API-lane hooks whose REST body carries the API's own `chainId`). [verified: rg plus reading]
  - The consumers' `xChainId` use (frontend 93 in files that import `@sodax/*`, 145 in the whole app; whitelabel 58) is mostly **wallet-sdk-react** (`useXAccount`, `useWalletProvider`, `useEvmSwitchChain`), not dapp-kit.
- **Renames that downstream code would feel** (import sites). [verified]
  - **frontend:** `useXBalances` ×9, `useGetUserHubWalletAddress` ×2, and `useClaim`, `useSupply`, `useWithdraw`, `useMigratebnUSD` ×1 each.
  - **whitelabel:** `useQuote`, `useStatus`, `useSupply`, `useBorrow`, `useWithdraw`, `useRepay` and `useXBalances` ×1 each. It also renames 2 dapp-kit hooks on import to avoid clashes: `useXBalances as useDappKitXBalances` and `useBridge as useDappKitBridge`.
  - The 18-name rename table from earlier research has **374 mentions in skills, 54 in apps and about 145 in docs**. [verified: `rg -ow`. The docs scope is unstated: `docs/` has 86 and the dapp-kit README 55, 141 together.]
- **How `SodaxProvider` builds the instance.**
  - It always runs `useMemo(() => new Sodax(config), [config])` (`providers/SodaxProvider.tsx:23-28`). A new `config` identity rebuilds every service.
  - `SodaxContext` is **not public**: the dist export list has `SodaxProvider`, `createSodaxQueryClient` and `useSodaxContext` only. So the only way in is `config`.
  - dapp-kit never calls `initialize()` (0 calls in `src`, by rg). That is currently a no-op anyway (`ConfigService.ts:158-164`, until #543).
- **whitelabel's two instances.** [verified]
  - A fee-free module singleton, initialized (`src/lib/sodax.ts:7-27`, `initialize()` at `:13`), used by server routes and client reads.
  - A fee-bearing instance built by `SodaxProvider` from `makeSodaxConfig({ activeChain, fee })` (`src/providers/app-providers.tsx:53-56`). It is not initialized.

### Change
- **2.x:**
  - new names with `@deprecated` aliases;
  - the params accept both the old and the canonical names;
  - `SodaxProvider` takes `sodax?:`, mutually exclusive with `config`;
  - plus a provider path that does **not** import the `Sodax` facade, such as a context-only provider or an exported context.
- **3.0:** remove the aliases and the old parameter names.

```tsx
const sodax = useState(() => new Sodax(config))[0]; // or a core instance (sdk-6)
<SodaxProvider sodax={sodax}>{children}</SodaxProvider>
```

### Feasibility — Feasible with caveats · Code-traced (size Proven)
- **Size, proven** with stubs for sdk-1 and sdk-4, a swap-only core (sdk-6) and `useQuote`/`useSwap` (`$S/combined/`):

  | Provider | Chains and PancakeSwap stubbed | Nothing stubbed |
  | --- | --: | --: |
  | Still imports `Sodax` and falls back to `new Sodax(config)` | 292.6 KB | 1,260.4 KB |
  | Context-only, no facade import | 249.2 KB | 1,212.0 KB |

  - **An instance prop alone is not enough** for the size win: the facade import costs 43–48 KB. [verified]
- **Caveats on SSR and RSC.**
  - A `Sodax` instance is not serializable, so passing it from a Server Component as a prop should fail. It has to be created in a client module. [judgement; Next behaviour not run]
  - A module-level instance on the server is shared across requests. `RadfiProvider` holds mutable tokens (`RadfiProvider.ts:161-162,251-259`), so build the instance per tree (`useState`), or keep server instances read-only like whitelabel's. [verified fields; judgement on the risk]
- **Skew:** the instance prop is reliable when the app and dapp-kit resolve the same SDK copy. That is true today under lockstep pins and becomes robust with dk-1's peer move (TS2322 shown above).
- **Decisions:**
  - (a) the naming convention: fix only the outliers (~18 names) or apply full feature prefixes (~30 names);
  - (b) the shape of the facade-free provider;
  - (c) agree on names before #540 adds the MM, staking, migration and DEX `*WithApproval` hooks, so they are not renamed twice.

### Complexity — C3
- **PR breakdown.**

  | PR | Scope | Size | Release |
  | --- | --- | --- | --- |
  | 1. Aliases + params | 18–30 aliases (~80 LOC), parameter dual-accept in 8 files (~150 LOC), skills and docs sweep (~570 mentions, mechanical) | ~230 LOC plus docs | 2.x |
  | 2. Instance prop | instance prop plus facade-free provider plus tests | ~80 LOC | 2.x |
  | 3. Removal | aliases and old params, via codemod | — | 3.0 |

- **Coordination:**
  - #540 (new hook names);
  - dk-4 and T21.5, which touch the same provider file;
  - #511 and #512 (the index files).
- **Top risks.**
  1. Docs drift across about 570 mentions. sk-3 mitigates it.
  2. Instance identity: an injected instance that changes identity resets every consumer. Document it like `config` (`SodaxProvider.tsx:7-18`).
- **Versus the earlier estimate:** 5 pts (T26.1 3 + T26.2 1 + T26.3 1). The code is fine, but the estimate leaves out the docs sweep and the facade-free provider design.

### Benefit — B2
- **P1 and P2:**
  - names you can predict;
  - fewer clashes with app hooks (whitelabel aliases 2);
  - the app controls `initialize()`, which matters once #543 makes it do something;
  - tests can inject a fake, which today needs module mocks.
- **Combined with sdk-6 (+ sdk-1 and sdk-4): B3, at the threshold.** In the probes, the facade-free provider is what lets React apps get sdk-6's size win.
  - The provider alone saves 43–48 KB gzip.
  - sdk-6's core plus the provider saves 46–50 KB against today's provider. [derived: 295.1 → 249.2 stubbed, 1,262.4 → 1,212.0 unstubbed]
  - The size alone sits just under the 50 KB B3 line. B3 also rests on the provider letting sdk-9's live config reach dapp-kit apps. [judgement]
- **P6:** consistent names are easier for agents to guess.
- **P3 and P4:** none.

### Recommendation
- **2.x:** the instance prop **and** the facade-free provider now; aliases agreed before #540.
- **3.0:** remove the aliases.
- **Wording:** "Standardize hook and parameter names (deprecated aliases until 3.0), and let SodaxProvider take an existing Sodax or core instance without importing the full facade".

### Corrections to earlier research
- "The instance prop is reliable only after the dk-1 peer move" overstates it. It works today with lockstep pins, which both consumers use. The peer move makes it robust to skew.
- Parameter counts: `chainId` and `userAddress` appear in 7 and 10 files (was 7 and 7).
- `xChainId` is largely a wallet-sdk-react parameter (wsr-4), not dapp-kit's.

---

## sk-3 · Generate the hook index and query-key reference

**Bullet:** "Generate the hook index and query-key reference from source"  ·  **T-ids:** T27.2

### Today
- **`hooks-index.md` drift** (342 lines). [verified: `python3 -I $S/doc_drift.py`]
  - 203 rows name a hook, there are 0 stale rows, and **14 of 217 hooks are missing**: 12 leverage-position hooks, `useEModes` and `useBitcoinTradingSetup`.
  - 13 of the 14 do appear in `sodax-dapp-kit/leverage-yield/SKILL.md` and its feature and recipe docs. `useBitcoinTradingSetup` is mentioned in no skill file at all.
- **`querykey-conventions.md`** (295 lines) is partial by design.
  - It has tables for 7 of 17 key namespaces; backend is prose only (`:159-161`); there is a "see source" catch-all (`:266-268`).
  - 53 of 197 distinct source key prefixes never appear in it.
  - The `useQuote` row (`:109`) documents `{ ...payload, amount: … }`. The source is `quoteKeyPart(payload, partnerFee)` (`useQuote.ts:38-49,59`). This drift in the variable part is invisible to the gate.
- **History.** [verified: git log]
  - 16 of the 18 commits that added hook source files since the index was created (`74c81f56b`, 2026-05-24) also edited it by hand. The count is 20 if two commits that added only `use*.test.ts` files are included.
  - The two that did not: #374 (`a10e50b4b`) added 13 hooks with no rows. #366 (`1809f6278`) added `useLeverageYieldQuote` with no row, and #496 added the row 7 weeks later.
  - Every open hook-adding PR edits `hooks-index.md` by hand: #511, #512 and #488. #511 and #512 also edit `querykey-conventions.md`. (#504 did both and merged on 2026-10-15.) [verified: `gh pr view --json files`]
- **JSDoc coverage:** 206 of 217 hooks have an adjacent JSDoc block and 100 have `@example`; 11 have none (listed in `$S/jsdoc-cov.txt`). [verified]
- **`check:ai`** chains 7 scripts (`packages/skills/package.json`). It runs on every PR that changes a file outside `docs/` (`.github/workflows/ci.yml:141`, `:219`). No script checks that the docs are complete.
- **How the skills are consumed (P6).**
  - `SKILL.md:59` routes lookups to `hooks-index.md` and `querykey-conventions.md`.
  - The skills CLI installs from GitHub `main` (`docs/ai-integration-guide.md:23,39`).
  - `packages/skills/.claude-plugin/plugin.json` registers 5 skills (the root `.claude-plugin/plugin.json` lists 4, without `sodax-build`), and sodax.com's `skill.md` links the tree.
  - npm downloads from 2026-09-17 to 10-16: `@sodax/skills` 1,052, `@sodax/dapp-kit` 2,163, `@sodax/sdk` 3,730. These include CI and bots. [verified: api.npmjs.org]

### Change
- **From:** two hand-maintained tables.
- **To:**
  - a generator that writes the hook table (name, Query/Mutation/Composite, the first JSDoc sentence, key prefix, subpath) and the per-feature key tables between markers;
  - the prose rules stay hand-written;
  - `--check` runs in `check:ai`.
  - Once dk-3 lands, the generator reads the factory instead of literals.

### Feasibility — Feasible · Code-traced
- **Everything the generator needs is parseable today.** `check-ai-keys.py` already extracts literal key prefixes, and the inventory scripts above extract name, kind and JSDoc.
- **No ts-morph needed.** A Python script in the style of the existing checks, or Node with the TS compiler API (`typescript` is already a skills devDependency), works.
- **Decision:** whether the "Purpose" column comes from JSDoc. If it does, curated text moves into JSDoc, which also improves IDE hovers.

### Complexity — C2
- **One PR, ~300–400 LOC:** the generator, the markers, a `check:ai-generated` step, and JSDoc for the 11 hooks.
- **A follow-up after dk-3** teaches the generator the factory, ~100 LOC.
- **Tests:** generator fixtures.
- **Breaks:** nothing.
- **Top risks.**
  1. Generated purpose text is thinner than hand-written text.
  2. Rework when dk-3 changes where keys live.
- **Versus the earlier estimate:** 3 pts. That matches. Its dependency on T21.1 and T17.1 is unnecessary for a first version.

### Benefit — B2
- **P5:** removes 2 hand edits per hook-adding PR and the class of PRs that skip the index (it happened twice: #374 and #366).
- **P6:** agents that look a hook up in the index find all of them. The 13 missing hooks are only partly hidden, since the leverage-yield skill lists them.
- **Combined with sk-1 (versioned skills) and dk-3:** it becomes the versioned source of truth for keys.
- **P1–P4:** none directly.

### Recommendation
- **2.x, now,** against today's literals.
- **Wording:** "Generate the hook index and query-key reference from source, and fail check:ai when they drift".

### Corrections to earlier research
- T27.2 depends on T21.1 and T17.1: **not required.**
- "check-ai-keys.py has the parser" is true for literal prefixes only. It has no completeness check and no variable-part check.

---

## Dependencies between these bullets
- **sdk-1** needs **dk-1**'s per-chain subpaths if dapp-kit's chain hooks import runtime values from optional chain packages. A chain package that is not installed then breaks a root barrel that re-exports those hooks (esbuild, minimal model).
- **sdk-2:** with an unbundled SDK, provider-less hook imports drop from 827 KB to 0.8–0.9 KB. A real app gains only together with sdk-1, sdk-4 and sdk-6.
- **sdk-6 + dk-6:** in the probes, React apps get sdk-6's size win only through a provider that does not import the facade (−43–48 KB). The bulk of the saving (~967 KB) is sdk-1 + sdk-4, not dapp-kit.
- **sdk-3 ↔ dk-1:** the same `package.json` change (SDK and viem peers).
- **sdk-8 ↔ dk-5:** typed backendApi results and error metadata.
- **sdk-9 / #543 ↔ dk-6:** an instance is needed so `initialize()` can run in dapp-kit apps.
- **sdk-10 ↔ dk-6:** injected fakes for tests.
- **dk-2 (#529, #531, #532) ↔ dk-5:** lifecycle hooks read status `data`. dk-5's 3.0 change must land with them or after them.
- **dk-3 ↔ dk-7:** builders carry `refetchInterval` presets.
- **dk-3 ↔ wsr-3:** a shared QueryClient makes unscoped keys matter.
- **dk-4 ↔ dk-6:** the same provider file.
- **dk-6 ↔ wsr-4:** `xChainId` naming lives mostly in wallet-sdk-react.
- **sk-3 ↔ dk-3 / dk-6:** the generator follows the factory and the deprecated aliases.
- **sk-3 ↔ sk-1 / sk-2:** versioned, generated references.
- **api-2:** P4 React apps need `@sodax/api/react`. dk-1's `./api` subpath still constructs the facade.
- **x-2:** add per-entry size budgets after dk-1.
- **x-3:** codemods for the SDK imports (~430 specifiers), the renames and the Result-as-data report rule.
- **x-1:** `@sodax/types` adds 0.6 KB min to the provider-less MM hook bundles (B5/B6, 5.2–5.4 KB min). It does not dominate them; dapp-kit's own code is 4.5–4.8 KB.
- **In-flight:** #483 (`unwrapResult`), #488, #511, #512, #540 (new hook names).

## Not verified
- webpack, Turbopack and Vite production tree-shaking of today's dapp-kit dist. Only esbuild was used for full bundles, and rollup for dapp-kit's own code.
- Next.js RSC behaviour: builders that import React context in a server component, and passing a `Sodax` across the RSC boundary. Both are judgement; not run.
- Dev-server cost of the barrel, in Vite and in Next dev.
- MM-only combined bundle with sdk-1, sdk-4 and sdk-6. Only swap-only was measured.
- That pnpm publishes `workspace:^` as `^x.y.z`, and how each package manager handles peers (auto-install, ERESOLVE).
- The TS2322 nominal error on the real SDK types. It is proven only on a minimal model.
- The UX impact of the `useMMAllowance` and `useDexAllowance` key gaps. Bounded by refetching; not reproduced.
- The runtime error type of every SDK method. Only declarations, plus the dex and shared `ok:false` expressions, were counted.
- Whether external integrators import SDK names through dapp-kit.
- Whether the frontend regexes still match after dk-5 message changes.
- How often agents actually open `hooks-index.md`. The npm counts include CI and bots.
- The SDK-external `export *` effect in webpack, Turbopack, Vite or rollup. Only esbuild was run.
- Whether sdk-1 will make dapp-kit's chain hooks import from optional chain packages, which is what makes per-chain subpaths necessary.
- The token list behind "30 of 202" in dk-6. It was not saved, so the count is not reproducible from the scratch files.

## Resume notes
All outputs are under `$S` = `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-dk-surface/probes/`. Consumer file extracts are in `…/deep-dk-surface/consumers/{frontend,whitelabel,frontend-all,whitelabel-all}`, and lockfiles in `…/deep-dk-surface/*-pnpm-lock.yaml`.

**dk-1**
- **Outputs:**
  - `dk1-results.txt` (A/B cases), `dk1-bundled.txt` (flat-sdk C cases, no-`export *`, unbundled root), `combined.txt`, `dk1-dup.txt`, `barrel-deps-inrepo.txt`;
  - `dk-tsc-out/`, `optional-peer/`, `ts-nominal/`.
- **Scripts:** `dk1-measure.mjs`, `dk1-bundled-sdk.mjs`, `dk1-bundled-src.mjs`, `dk1-noexportstar.mjs`, `dk1-unbundled-root.mjs`, `dk1-rollup.mjs`, `dk1-dup.mjs`, `combined/measure-combined.mjs`, `barrel_deps.py`.
- **Next:**
  - an MM-only combined probe: copy `combined/swap-core-dapp.mjs`, construct `MoneyMarketService`, and import the mm hooks;
  - a webpack/Turbopack check in a scratch copy of `artifacts/t2-probe/t2-next-probe`, not inside t2probe.

**dk-3**
- **Outputs:** `hook-inventory.txt`, `hooks.tsv`, `key-match-dappkit.txt`, `key-match-consumers.txt`, `hooks-factory-sim/`.
- **Scripts:** `hook_inventory.py`, `key_match.py`.
- **Next:** list the full key of each of the 12 consumer sites against the factory design, to draft the snapshot test.

**dk-5**
- **Outputs:** `error-classes.txt`, `result-typing.txt`.
- **Scripts:** `error_classes.py`, `result_typing.py`.
- **Next:** map each of the 98 A-class hooks to its SDK method's `E` to get the exact per-hook `TError` coverage. Check the runtime `ok:false` expressions in `swap/`, `partner/` and `recovery/`.

**dk-6**
- **Outputs:** `combined.txt` (facade cost), `ts-nominal/`, and the naming table from `hooks.tsv`. The script is inline in this session; re-derive it from `hooks.tsv` with the token map in this file.
- **Next:** draft the convention (outliers only vs full prefix) and list the names #540 will add.

**sk-3**
- **Outputs:** `doc-drift.txt`, `jsdoc-cov.txt`.
- **Scripts:** `doc_drift.py`, `jsdoc_cov.py`.
- **Next:** prototype the generator against `hooks.tsv` and diff its output with `hooks-index.md`.

## Verification (2026-10-19)

An adversarial pass on this file used the same sources: `sodax-sdks-v3feas` at `0181a053`, the `sodax-sdks-t2probe` dists, and the consumers through `git show` / `git grep` (frontend `1b915ec7`, whitelabel `5e1fbba`). GitHub was read only. My scripts and outputs are in `$V` = `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-dk-surface/`.

**What I checked**
- **Citations:** I opened 87 path:line references: 70 in sodax-sdks and 17 in the two consumers. 82 matched.
  - Wrong: the 3 demo key lines (`useLegQuote.ts:37,106`, `PendingOperationControl.tsx:36`).
  - Loose: `MoneyMarketDataService.ts:85-217` covered 6 of the 9 MM reads. Whitelabel's `sodax.ts:19-27` missed the `initialize()` call.
  - The counts are by hand, from my checklist.
- **Numbers re-run** (identical unless "What I changed" says otherwise):
  - **Bundles:**
    - `dk1-measure.mjs`, all 17 cases A1–B9;
    - `dk1-bundled-sdk.mjs`, V1, V2 and C1–C4;
    - `dk1-dup.mjs`, 1,258.8 → 1,423.4;
    - `combined/measure-combined.mjs`: 248.5, 249.2 and 292.6 KB stubbed with the packaging stub regex, and 1,212.0 and 1,260.4 KB unstubbed;
    - the optional-peer and ts-nominal models.
  - **Counts:**
    - `hook_inventory.py`: its `hooks.tsv` diffs clean;
    - `barrel_deps.py` on fresh consumer extracts;
    - `error_classes.py`, `result_typing.py`, `doc_drift.py` and `jsdoc_cov.py`: their outputs diff clean;
    - the key gate, plus both factory-sim states;
    - the consumer keys, by `git grep`;
    - 6 parameter-token counts, 3 npm download counts and the `npm view` pins.
  - **Commands behind the changed counts:**
    - guards: `rg -o -g '!*.test.ts' -g '!*.test.tsx' -g '!**/unwrapResult.ts' 'throw new Error\(' hooks | wc -l` = 53, in 51 files;
    - history: `git log --format=%h --diff-filter=A 74c81f56b..HEAD -- 'packages/dapp-kit/src/hooks/*/use*.ts' 'packages/dapp-kit/src/hooks/*/use*.tsx'` gives 20 commits. 2 of them add only `*.test.ts` files, and 16 of the other 18 touch `hooks-index.md`;
    - wallet-error use: `git grep -o -wE "getWalletErrorMessage|isUserRejectedError" origin/main -- '*.ts' '*.tsx' ':!apps/web/lib/wallet-error.ts'` finds 29 and 13 identifiers, which are 20 and 9 calls;
    - chain-field params: rg for `^\s+(xChainId|chainId|spokeChainKey)\??:` in `hooks/`, then reading, gives 8 files.
- **New probes:**
  - `$V/scripts/ext-probe.mjs` and `ext-probe-src.mjs` keep the SDK external (esbuild only).
  - Two stubbed builds: `new Sodax()` alone is 294.4 KB, and today's provider plus `useQuote`/`useSwap` is 295.1 KB.
- **Scores:** I checked each ID's verdict, confidence, C, B and timing against the rubric. No score changed. With the dk-5 condition below, no breaking change is timed 2.x. No B4 or B5 is claimed.

**What I changed, and why**
1. **dk-1 bundle scope.** I scoped "0 KB" to builds that bundle the SDK, in the summary, the table, Benefit, Recommendation and Corrections. With `@sodax/sdk` external, `export *` keeps all of dapp-kit (17.4–19.3 KB gzip). The old wording went beyond its probes.
2. **dk-1 Feasibility.**
   - The need for per-chain subpaths depends on the chain hooks importing optional packages. I stated that condition and the probe's scope (a three-file model, esbuild).
   - I updated the Dependencies line to match.
   - I added why the prerequisite does not lift dk-1 to B4.
3. **dk-1 numbers.**
   - The MM own-code range is 4.5–5.1 KB.
   - 259 `.js` is the non-test count.
   - The codemod scope is 427 specifiers in 128 app files plus 14 in 7 skill files.
   - T13.4 is now PR 4, so the PR table covers all 9 estimated points.
   - The 967 KB uses the measured 295.1 KB.
4. **dk-3.**
   - I corrected the demo citations.
   - The key gate also counts backticked arrays in source comments (11 today). That is why the full simulation failed 184 of 184 claims instead of exiting.
   - I softened "cannot" and "can no longer" and tagged them judgement.
5. **dk-5.**
   - B-class is the script's 14 plus 4 "other" hooks. That includes 9 MM reads, at `:72-233`.
   - The guards are 53 in 51 files, plus 1 wrap.
   - "Almost all" became "most"; 8 typed results declare `SolverErrorResponse`.
   - The frontend folds `code` strings into its regex text and walks `cause`.
   - Its usage is 20 + 9 calls; the old "29" mixed imports with calls.
   - Whitelabel has 4 + 2 dialogs.
   - I added the 2.x condition: keep `message` and `cause`.
   - I wrote down why C4 and not C5.
6. **dk-6.**
   - The files with a non-standard chain field are 8, not 9.
   - I stated the scope of the `xChainId` count and of the docs mentions.
   - I flagged the token list as judgement.
   - The combined B3 now says the size alone (43–50 KB) is just under the 50 KB line.
   - I softened the RSC "cannot" and widened the whitelabel citation.
7. **sk-3.**
   - The history count is 16 of 18 (20 with the test-only commits), and #366 is a second index skip.
   - #504 is merged, and #488 edits only the index.
   - `check:ai` is skipped on PRs that change only `docs/`.
   - I corrected the `plugin.json` path and the summary line's cause-and-effect.
8. **x-1.** "Dominates" was wrong: the types are 0.6 KB of 5.2–5.4 KB.

**What remains judgement**
- dk-5's B3 rests on how often the error class recurs.
- dk-6's combined B3 sits at the 50 KB line plus the sdk-9 path.
- dk-1 stays B2 although it may be an sdk-1 prerequisite.
- dk-5 is C4, not C5, although the 3.0 status-channel change sits next to a funds path.
- All LOC sizes, the RSC claims, and the token list behind "30 of 202".

**Residual doubts**
- Every bundle number comes from esbuild 0.25.12. In webpack, Turbopack or Vite, the SDK-external `export *` effect and the 0 KB result may differ.
- The +164.6 KB duplicate cost uses two byte-identical SDK copies. Real version skew duplicates different code.
- I did not re-run the tsc emit or rollup. I checked their saved outputs only.
- I did not reproduce "about 145" docs mentions; with a stated scope I found 141.
- The runtime claim for the 88 backendApi methods is traced through shared helpers, not method by method.
