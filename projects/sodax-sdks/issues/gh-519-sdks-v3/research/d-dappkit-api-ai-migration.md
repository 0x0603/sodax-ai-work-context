---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, research, dapp-kit, lifecycle, errors, abort-signal, query-keys, api, skills, codemods, migration]
source_commit: cc053fef
---

# GH-519 · Cluster D — dapp-kit, execution model, API packages, AI surface, migration

> **Written by a research agent on 2026-10-16**, against the read-only `origin/main` tree at
> cc053fef. The lead re-checked its load-bearing `path:line` claims (`plan-v3-order.md` §9). Where
> this report and `plan-v3-order.md` / `plan-v3-subissues.md` differ, those files win.
>
> **Reconciled after synthesis**
>
> - **Lead-added sub-issues:**
>   - T13.5: 13 dapp-kit hooks read `sodax.spoke.<chain>`.
>   - T17.3 and T17.7: the B and C codemod transforms.
>   - T19.6: the sodax-backend log capture.
> - **Wave moves:**
>   - T21.3, T21.4 and T22.2 wait for the user's lifecycle issues (#529, #531, #532).
>   - T19.2 waits for #512.
>   - T18.1 waits for #534 as well as #523.
> - **`walletProvider` appears in 55 non-test hook files at cc053fef** (this report: ~70).

Research for icon-project/sodax-sdks#519 (SDKs v3). Planning only: no repo was changed and nothing was posted.

- **Source of truth:** extracted `origin/main` at `cc053fef` (2026-10-15). Every `path:line` without a repo prefix is relative to that tree.
- **Other repos (read-only `git grep`/`git archive` on the local default-branch refs):**
  - `sodax-backend@985959e9` (`origin/development`, 2026-10-08; the remote was pushed 2026-10-12, so it may be slightly behind);
  - `sodax-frontend@6623d817` (= remote `main` head);
  - `intents-whitelabel@5e1fbba` (= remote `main` head, last push 2026-08-07).
- **Open PRs:** read with `gh pr view` / `gh pr diff --name-only` on 2026-10-16.
- **Probes:** listed in the appendix. All ran under `$S/agent-D/`, used `npm i --ignore-scripts`, and touched no clone.

---

## 0. Headline decisions

1. **Expand-then-contract holds for cluster D, and the contract set is small.** Only three of my sub-issues have to break:
   - **T13.3** drops `export * from '@sodax/sdk'` and makes the sdk a peer;
   - **T22.6** makes six Result-as-data queries throw;
   - **T26.3** removes the deprecated aliases.

   Everything else in T13/T18/T19/T21/T22/T24/T25/T26/T28 can ship as additive 2.x work. That includes three items the scope marked breaking:
   - E7.3, wallet from context (the argument becomes optional);
   - E5.2, API errors (the SDK already maps them);
   - E7.2, key shapes (I recommend not changing them; see T21).
2. **Two preconditions before the breaking window opens on `main`.** Without both, the window is either user-hostile or CI-red.
   - **(a) Pin every AI and docs channel to the `release` branch (T27.1).** Today these channels serve `main`:
     - docs.sodax.com builds from `main` (`docs/README.md:3-5`);
     - the skills CLI install (`docs/ai-integration-guide.md:23,39`), the Claude plugin (`.claude-plugin/plugin.json`) and context7 all read `main`;
     - www.sodax.com/skill.md links `tree/main` (`sodax-frontend@6623d817:apps/web/content/skill.md:49`).

     During the window, 2.x users would get v3 instructions.
   - **(b) Codemods ship in 2.x and run on the in-repo apps there (T17.1, T17.4).** CI type-checks every app, builds demo, next-js-16 and wallet-modal, and runs `check:ai` on every PR (`.github/workflows/ci.yml:214,218-219,223`). A breaking PR must therefore migrate apps and skills in the same PR. Most of my codemods are forward-compatible: importing SDK names from `@sodax/sdk`, or using new hook names that exist as aliases in 2.x. Running them early turns the contract PRs into small deletions.
3. **Lifecycle (T18): no SDK-level engine now.** Decision 0003 stands. The state machines are already pure functions in dapp-kit (`packages/dapp-kit/src/utils/swapLifecycle.ts:143`). The SDK needs two primitives only:
   - a public relay-delivery read keyed by `(srcChainKey, srcTxHash)` (T18.1);
   - per-feature `getApprovalStrategy`/`*WithApproval` methods (T31).

   Before the user's #531 copies the state union a third time, extract a generic lifecycle core once (T18.2).
4. **Wallet from context goes through a contract type in `@sodax/types`:** `WalletProviderSource.getWalletProvider(chainKey)`. dapp-kit consumes it and wallet-sdk-react produces it (cluster C, T3), so neither React package depends on the other. Today ~70 hook files need a wallet provider, not 27.
5. **Do not send a correlation header to the relay.** The production relay's CORS allow-list is pinned and excludes `x-request-id`, so a browser preflight would fail (probe P3). The swaps, bridge, `/v1/be` and solver hosts all accept it.
6. **Query keys: export a factory and keep today's shapes.** sodax-frontend hand-writes 10 dapp-kit keys. A prefix change would silently stop those invalidations, with no compile error.

---

## T13 · dapp-kit per-feature subpaths; sdk as a peer; no `export *` (score 7, Must)

### Approach

1. **Build: unbundled ESM with `tsc`** (expand). Follow cluster A's T2 recipe.
   - **Today:** dapp-kit is one tsup bundle (`packages/dapp-kit/tsup.config.ts`, `entry: ['./src/index.ts']`, `splitting: true`). The only `exports` key is `.` (`packages/dapp-kit/package.json`).
   - **Path aliases:** `tsc` does not rewrite them. Replace the 7 `@/` imports with relative ones:
     - `providers/SodaxProvider.tsx:3`;
     - `hooks/shared/useSodaxContext.ts:1`;
     - `utils/dex-utils.ts:7`;
     - `hooks/dex/useCreate{Withdraw,Deposit,SupplyLiquidity,DecreaseLiquidity}Params.ts`.

     The `utils/dex-utils.ts` ↔ `hooks/dex` imports form a cycle; break it in the same change.
2. **Subpath entries** (expand). `exports` gets:
   - `.` — core: provider, context, `createSodaxQueryClient`, shared hooks, gates;
   - `./swap`, `./money-market`, `./bridge`, `./staking`, `./dex`, `./migration`, `./partner`, `./recovery`, `./leverage-yield`, `./bitcoin`, `./sponsoring`;
   - `./api` — `swapsApi` + `bridgeApi` + `leverageYieldApi` + `backend` REST pass-through hooks, the split E7.7 already assumes;
   - `./query` — keys + builders (T21), server-safe.

   Each entry is a small `src/<feature>/index.ts` re-export of `hooks/<folder>/index.js`. Hook files do not move, so open PRs do not conflict.
   - **Feature-folder dependencies:** every hook folder depends only on `shared`, with four exceptions:
     - `mm → bitcoin`, 3 imports of `resolveBtcReadAddress`;
     - `shared → bitcoin`, 1 import (`hooks/shared/useGetUserHubWalletAddress.ts:4`);
     - `shared → sponsoring`, 2 imports (`hooks/shared/useStellarGate.ts:9-10`);
     - `leverageYieldApi → swapsApi`, 1 import (`hooks/leverageYieldApi/useLeverageYieldApiStatus.ts:9`).
   - **Fix:** move `resolveBtcReadAddress` into `shared`, and keep the two Stellar sponsoring hooks in the core.
   - **Tooling:** update `knip.json` entries, `scripts/verify-dist-exports.mjs` and `check-exports` (attw `--profile esm-only`).
3. **`'use client'` on the hook and provider entry modules only** (expand). Do not add it to the 231 hook files. With unbundled output, every export of a `'use client'` entry becomes a client reference, which is what Next.js needs. `./query` carries no directive, so builders can be used for RSC prefetch. Consumers wrap dapp-kit themselves today (`apps/example-next-js-16/app/providers.tsx:1`); there are 0 `use client` hits in `packages/dapp-kit/src`.
4. **The root stays a superset in 2.x.** It re-exports every subpath plus `export * from '@sodax/sdk'` (`packages/dapp-kit/src/index.ts:5`), and the barrel is documented as deprecated.
5. **Migrate in-repo consumers early** (expand, via T17.1/T17.4). The `dapp-kit-sdk-imports` codemod moves SDK names to `@sodax/sdk` imports; that is valid on 2.x already. Add `@sodax/sdk` to the apps that lack it: demo and playground list only dapp-kit + wallet-sdk-react (`apps/demo/package.json`, `apps/playground/package.json`).
6. **Contract:**
   - delete `index.ts:5`;
   - move `@sodax/sdk` from `dependencies` (`packages/dapp-kit/package.json`, `"@sodax/sdk": "workspace:*"`) to `peerDependencies` as `workspace:^`, kept in devDependencies;
   - keep the root re-exporting every dapp-kit-owned hook.

   Downstream is unaffected:
   - **sodax-frontend:** imports 57 dapp-kit names, 0 of them SDK names, and already depends on `@sodax/sdk` (`apps/web/package.json`, 2.2.0-rc.8);
   - **intents-whitelabel:** imports 26 dapp-kit names, 0 of them SDK names, and depends on `@sodax/sdk` 2.0.0-rc.12.
7. **After T12:** dapp-kit imports `@sodax/sdk/<feature>`. `SodaxProvider` accepts a core instance (T26.2). A `useSodaxFeature('swaps')` accessor throws a clear `SodaxError` when the feature is not registered. The hooks already type against structural readers (`SwapQuoteReader`, `hooks/swap/useQuote.ts:14`), so a core object fits.

### Evidence

- **Barrels:** `packages/dapp-kit/src/index.ts:1-5`, `hooks/index.ts:1-17`. The sdk re-exports all of `@sodax/types` (`packages/sdk/src/index.ts:15`).
- **Barrel dependence, measured by resolving dapp-kit's own exports and comparing named imports:**

  | Consumer | SDK names via the dapp-kit barrel | Specifiers | Files |
  | --- | --: | --: | --: |
  | demo | 121 | 287 | 83 |
  | playground | 36 | 109 | 32 |
  | stellar-sponsor-example | 15 | 28 | 17 |
  | skills (dapp-kit skill) | 8 | 16 | — |
  | sodax-frontend, intents-whitelabel | 0 | 0 | — |

- **Shared test file:** `_mutationContract.test.ts` reads hook files by path (`hooks/_mutationContract.test.ts:13`). It keeps working because no hook file moves.

### Feasibility

**High.** Probe P1: the ts-morph transform resolved 467 dapp-kit-owned exports through `src/index.ts`. It rewrote 82 demo files in 0.85 s:
- 286 specifiers → `@sodax/sdk`;
- 153 → feature subpaths;
- 66 → root.

The output is correct apart from formatting (`biome format` fixes it).

**Remaining risk:** if `importHelpers: true` (`packages/dapp-kit/tsconfig.json`) makes `tsc` emit `tslib` imports at ES2023, `tslib` must become a runtime dependency. Check the emitted output once.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T13.1 | `build(dapp-kit): emit unbundled ESM with tsc` | Replace tsup with `tsc` per T2. Rewrite the 7 `@/` aliases and break the dex-utils cycle. Same `.` export; verify-dist-exports and attw still pass | `packages/dapp-kit/{package.json,tsup.config.ts,tsconfig.json}`, the 7 alias files, `utils/dex-utils.ts` | 2 | no | expand-2.x | T2 (build recipe) | none of the open PRs edit these files |
| T13.2 | `feat(dapp-kit): per-feature subpath entries and client entry modules` | Add ~14 entry files, `exports` map, `'use client'` on hook/provider entries, server-safe `./query`. Move `resolveBtcReadAddress` into shared. knip/attw updates | `packages/dapp-kit/package.json`, `src/<feature>/index.ts` (new), `hooks/bitcoin/resolveBtcReadAddress.ts`, `hooks/mm/{useUserFormattedSummary,useUserReservesData,useATokensBalances}.ts`, `knip.json` | 3 | no | expand-2.x | T13.1 | reads `hooks/*/index.ts` edited by #511, #512, #488 — land those first or re-run |
| T13.3 | `feat(dapp-kit)!: stop re-exporting @sodax/sdk; the sdk becomes a peer` | Delete `index.ts:5`; sdk dependency → peer (`workspace:^`). Apps must already import from `@sodax/sdk` (T17.4) | `packages/dapp-kit/src/index.ts`, `packages/dapp-kit/package.json`, app `package.json`s | 2 | **yes** | contract-3.0 | T17.1, T17.4, T27.1, T4 (same package.json; viem → peer) | T4's dapp-kit package.json edit — do in one PR or back to back |
| T13.4 | `refactor(dapp-kit): import sdk feature entries; accept a core instance` | Internal imports → `@sodax/sdk/<feature>`; `useSodaxFeature` invariant; context typed structurally | `packages/dapp-kit/src/**` imports, `contexts/index.ts`, `hooks/shared/useSodaxContext.ts` | 2 | no | expand (when T12 lands) | T12 (cluster B), T26.2 | T22.1 (same context file) |

---

## T21 · dapp-kit `queryOptions` builders + key factory (score 5, Should)

### Approach

1. **`src/query/keys.ts`**, exported from `./query` and the root. `sodaxKeys` has one function per query and reproduces today's exact arrays:
   - feature prefixes `sodaxKeys.<feature>.all` for invalidation;
   - JSON-safe parts only (bigint → string, an allow-list per input, as `quoteKeyPart` does at `hooks/swap/useQuote.ts:38-49`).

   All 85 `invalidateQueries` sites move onto the factory, so hook keys and invalidation keys cannot drift apart.
2. **Builders** `get<Name>QueryOptions({ sodax, ...params })` for all 127 `useQuery` hooks, using TanStack `queryOptions()` for typed `DataTag` keys (peer `@tanstack/react-query: 5.x`). Each hook becomes:

   ```ts
   useQuery({ ...getXQueryOptions({ sodax, ...params }), ...queryOptions })
   ```

   - Seven of the eight existing builders use the object form. The outlier is `getBalancesQueryOptions(sodax, {...})` (`hooks/shared/useBalances.ts:29`): add an object overload now and drop the positional form in T26.3.
   - Hooks that keep polling state in React keep that part in the hook: `useDetailedStatus` holds `notFoundStreakRef` (`hooks/swap/useDetailedStatus.ts:48-66`), and `useStatus` does the same. The builder takes an optional `refetchInterval`.
3. **Fix drift as 2.x bugs:**
   - **`useMMAllowance`:** the key omits amount and user (`hooks/mm/useMMAllowance.ts:37`) while the query reads the whole payload (`:48`). Appending segments keeps prefix invalidation working.
   - **`useEModes`:** keyed `['moneyMarket','eModes']` (`hooks/mm/useEModes.ts:27`) against the `'mm'` convention. No in-repo or downstream code uses a `'moneyMarket'` key (rg over apps, frontend, whitelabel).
4. **Gate:** `check-ai-keys.py` scans `queryKey:`/`mutationKey:` literals in hook source (`packages/skills/scripts/check-ai-keys.py:33,114`). After the move it finds none and fails with "no queryKey/mutationKey literals found". Teach it to read `query/keys.ts`, or the generated table from T27.2.
5. **Optional `queryKeyScope` on `SodaxProvider`** (additive). When set, the scope segment is prepended. It replaces the demo's per-config QueryClient workaround (`apps/demo/src/providers.tsx:194-197`: "query keys carry no env/endpoint segment").
6. **No forced key-shape change in 3.0.**
   - sodax-frontend invalidates dapp-kit keys by hand 10 times:
     - `app/(apps)/save/_components/withdraw-dialog/withdraw-dialog-footer.tsx:94-96`;
     - `app/(apps)/save/_components/deposit-dialog/deposit-dialog-footer.tsx:93-95`;
     - `app/(apps)/pool/_components/manage-dialog/manage-position-dialog.tsx:347-352`.
   - In-repo apps have 18 such literals. The demo even defines its own keys under dapp-kit's `'leverageYield'` namespace (`apps/demo/src/pages/leverage-positions/useLegQuote.ts:51`).
   - A `['sodax', …]` prefix would make all of these silently stale.

   Instead, export the factory and have T17.2 add a report-only rule for literal dapp-kit keys.

### Evidence

- 217 exported hooks: 127 `useQuery`, 1 `useQueries` (`hooks/leverageYield/useLeverageYieldShareBalances.ts:56`), 74 `useSafeMutation`.
- 8 builders exist:
  - `swap/useQuote.ts:51`;
  - `leverageYield/useLeverageYieldQuote.ts:58`;
  - `shared/useXBalances.ts:24`, `shared/useBalances.ts:29`, `shared/useStellarTrustlineCheck.ts:21`;
  - `sponsoring/useSponsorConfig.ts:10`, `sponsoring/useStellarAccountActive.ts:15`, `sponsoring/useStellarAccountStatus.ts:15`.
- 214 `queryKey: [` literals in hooks.
- First segments seen: `staking`, `leverageYieldApi`, `mm`, `leverageYield`, `dex`, `swapsApi`, `shared`, `backend`, `partner`, `bitcoin`, `bridgeApi`, `swap`, `sponsoring`, `migrate`, `bridge`, `recovery`, plus 1 `moneyMarket`.
- `useQuery` per folder:

  | Folder | `useQuery` |
  | --- | --: |
  | backend | 12 |
  | bitcoin | 3 |
  | bridge | 4 |
  | bridgeApi | 7 |
  | dex | 5 |
  | leverageYield | 13 |
  | leverageYieldApi | 27 |
  | migrate | 1 |
  | mm | 10 |
  | partner | 5 |
  | recovery | 1 |
  | shared | 6 |
  | sponsoring | 3 |
  | staking | 10 |
  | swap | 5 |
  | swapsApi | 15 |

### Feasibility

**High.** The work is mechanical and follows a pattern that already exists. The real costs are the `refetchInterval` closures and keeping keys JSON-safe.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T21.1 | `feat(dapp-kit): query key factory and server-safe query entry` | `query/keys.ts` for all 17 folders, reproducing today's shapes; export it; adapt `check-ai-keys.py` | `packages/dapp-kit/src/query/keys.ts` (new), `src/index.ts`, `packages/skills/scripts/check-ai-keys.{py,sh}` | 3 | no | expand-2.x | — (T13.2 for the `./query` subpath; root export first) | none |
| T21.2 | `feat(dapp-kit): queryOptions builders for swap, shared, sponsoring, mm, staking and migration` | 35 queries → builders + factory keys + invalidations; useMMAllowance and useEModes fixes | `hooks/{swap,shared,sponsoring,mm,staking,migrate}/**` | 3 | no (drift fixes are bug fixes) | expand-2.x | T21.1 | #488 (`hooks/migrate/index.ts`, new `useIcxReverseMigrationEnabled.ts`) |
| T21.3 | `feat(dapp-kit): queryOptions builders for bridge, dex, leverage yield, partner, recovery and bitcoin` | 31 queries | `hooks/{bridge,dex,leverageYield,partner,recovery,bitcoin}/**` | 3 | no | expand-2.x | T21.1 | #512 (new `useBridgeApprovalStrategy.ts`, `useLeverageYieldApprovalStrategy.ts` queries), #532 |
| T21.4 | `feat(dapp-kit): queryOptions builders for the API-lane hooks` | 61 REST pass-through queries; uniform | `hooks/{swapsApi,bridgeApi,leverageYieldApi,backend}/**` | 3 | no | expand-2.x | T21.1 | #511 (`hooks/swapsApi/index.ts`), #529 |
| T21.5 | `feat(dapp-kit): optional queryKeyScope on SodaxProvider` | Opt-in scope segment; the demo drops its per-config QueryClient | `query/keys.ts`, `providers/SodaxProvider.tsx`, `apps/demo/src/providers.tsx` | 1 | no | expand-2.x | T21.1 | T22.1, T26.2 (same provider file) |

---

## T22 · dapp-kit wallet from context; one error style (score 5, Should)

### Assumption on cluster C (T3)

wallet-sdk-react, built per `SodaxWalletProvider` instance with no global store, exposes a `useSodaxWalletSource(): WalletProviderSource` hook. Its identity changes whenever a connection changes. The pieces already exist: the zustand store's `state.getWalletProvider(chainType)`, read by `useWalletProvider` (`packages/wallet-sdk-react/src/hooks/useWalletProvider.ts:40-55`).

### Approach

1. **Contract type in `@sodax/types`.** Neither React package depends on the other.

   ```ts
   export interface WalletProviderSource {
     getWalletProvider<K extends SpokeChainKey>(chainKey: K): GetWalletProviderType<K> | undefined;
   }
   ```

   dapp-kit wiring:

   ```tsx
   <SodaxProvider config={config} wallets={useSodaxWalletSource()}>
   ```

   - New hook `useSodaxWallet(chainKey)`.
   - Hooks read the source through a latest-value ref, so `mutate()` never sees a stale closure.
   - Every resolved provider is checked with `isValidWalletProviderForChainKey` (`packages/types/src/utils/utils.ts:215`).
2. **Optional `walletProvider` everywhere.**
   - **Mutation vars:** `Omit<XActionParams<K,false>, 'raw' | 'walletProvider'> & { walletProvider?: GetWalletProviderType<K> }`. Today the field is required through `WalletProviderSlot` (`packages/types/src/common/common.ts:432-434`, used by `SpokeExecActionParams` `:446-451`).
   - **Resolution order:** explicit argument → `wallets.getWalletProvider(chainKeyOf(vars))` → `SodaxError('VALIDATION_FAILED', …, { context: { field: 'walletProvider' } })`.
   - **Read hooks** with `params.walletProvider` resolve the same way:
     - `hooks/swap/useSwapAllowance.ts:23`, `hooks/swap/useSwapApprovalStrategy.ts:32`;
     - `hooks/bridge/useBridgeAllowance.ts:20`;
     - `hooks/bitcoin/useTradingWalletBalance.ts:19`, `hooks/bitcoin/useExpiredUtxos.ts:19`.
   - **Lifecycle:** `useSwapLifecycle`'s `srcWalletProvider` and `dstWalletProvider` (`hooks/swap/useSwapLifecycle.ts:32-37`) become optional too.
   - **Compatibility:** callers that keep passing `walletProvider` are unaffected. The only type-level change is that `variables.walletProvider` becomes optional when read in callbacks; call this out in the PR, but it is not a semver break in practice.
3. **One error style.**
   - **Expand:**
     - the 54 guard `throw new Error(...)` calls in 52 hook files become `SodaxError('VALIDATION_FAILED')` with `context.field`; messages stay the same;
     - `unwrapResult` wraps non-`Error` rejections into `SodaxError('UNKNOWN', { cause })`, not a plain `Error` (`hooks/shared/unwrapResult.ts:14-16`).

     After this, `isSodaxError(error)` is true for every hook error. The Bound/Radfi hooks are the exception: they throw natively (`nativeThrow` at `hooks/_mutationContract.test.ts:14-18`). Wrap them as `EXTERNAL_API_ERROR`; that adds `'radfi'` to the `context.api` union (`packages/sdk/src/errors/codes.ts:132`).
   - **Typed errors (expand):** `TError` per hook = the `SodaxError<Code>` union from the SDK method's `Result`, the same derivation `useQuote` uses for data (`hooks/swap/useQuote.ts:10`).
   - **Contract:** the six queries that return the SDK `Result` as `data` start throwing like the other 121:
     - `useQuote` (`hooks/swap/useQuote.ts:87`);
     - `useStatus` (`hooks/swap/useStatus.ts:27-30`);
     - `useDetailedStatus` (`hooks/swap/useDetailedStatus.ts:41`);
     - `useBridgeDetailedStatus` (`hooks/bridge/useBridgeDetailedStatus.ts:49`);
     - `useLeverageYieldDetailedStatus` (`hooks/leverageYield/useLeverageYieldDetailedStatus.ts:53`);
     - `useLeverageYieldQuote` (`hooks/leverageYield/useLeverageYieldQuote.ts:114`).

     Solver detail survives on `error.context.solverCode` (set at `packages/sdk/src/swap/SwapService.ts:672`). `useSwapLifecycle.ts:130-131` and `hooks/shared/solverStatusPolicy.ts` adapt. `mutateAsyncSafe` stays: it is the deliberate Result escape hatch (`hooks/shared/useSafeMutation.ts:10-33`).

### Evidence

- **~70 hook files need a provider:**
  - 44 spread `raw: false` into SDK actions whose params require `walletProvider`;
  - 26 more reference `walletProvider` directly — bitcoin ×9, the API approve-and-broadcast hooks ×3, gates, allowance reads, `useSwapLifecycle`.
- **By folder:**
  - swap 9, bridge 3, bridgeApi 1, leverageYield 7, leverageYieldApi 1, swapsApi 1;
  - mm 5, staking 11, migrate 6, dex 7, partner 5, recovery 1, bitcoin 9, shared gates 4.
- **Demo:** 28 `useWalletProvider(` calls in 21 files and 182 `walletProvider` tokens. sodax-frontend has 109 tokens and 12 `useWalletProvider`; intents-whitelabel 61 and 9.
- **Error styles:**
  - `unwrapResult` (throw) in 127 files;
  - 96 `throw` (54 plain-`Error` guards, 38 `throw x.error`);
  - 68 `.ok`;
  - 14 `mutateAsyncSafe` references;
  - 0 `new SodaxError` in dapp-kit.

### Feasibility

**High.** The contract is a single-method interface. The rest is a mechanical change across ~70 files with one shared helper.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T22.1 | `feat(types,dapp-kit): WalletProviderSource contract and SodaxProvider wallets prop` | Interface in types; provider prop + context; `useSodaxWallet`; `resolveWalletProvider` helper + tests | `packages/types/src/wallet/providers.ts`, `packages/dapp-kit/src/{providers/SodaxProvider.tsx,contexts/index.ts,hooks/shared/*}` | 2 | no | expand-2.x | — (producer is T22.4/T3) | T21.5, T26.2 (provider file) |
| T22.2 | `feat(dapp-kit): resolve walletProvider from context in swap, bridge, leverage-yield and API-lane hooks` | ~22 files plus the hooks #511/#512 add | `hooks/{swap,bridge,bridgeApi,leverageYield,leverageYieldApi,swapsApi}/**` | 3 | no | expand-2.x | T22.1 | #511, #512 (new `*WithApproval` hooks), #529, #531, #532 |
| T22.3 | `feat(dapp-kit): resolve walletProvider from context in mm, staking, migration, dex, partner, recovery, bitcoin and gate hooks` | ~48 files | `hooks/{mm,staking,migrate,dex,partner,recovery,bitcoin,shared}/**` | 3 | no | expand-2.x | T22.1 | #488 (migrate) |
| T22.4 (C) | `feat(wallet-sdk-react): useSodaxWalletSource` | Producer of the contract, per provider instance | `packages/wallet-sdk-react/src/**` | 1 | no | expand-2.x | T3 (cluster C), T22.1 | owned by cluster C |
| T22.5 | `feat(dapp-kit): every hook error is a SodaxError; typed errors per hook` | Guard throws → VALIDATION_FAILED; unwrapResult → UNKNOWN wrap; Radfi wrap; typed `TError` | `hooks/**` (52 files with guards), `hooks/shared/unwrapResult.ts`, `hooks/shared/types.ts`, `packages/sdk/src/errors/codes.ts` (`api` union) | 3 | no | expand-2.x | #483 (edits `unwrapResult.ts`) | #483 |
| T22.6 | `feat(dapp-kit)!: status and quote queries throw instead of returning Result` | The 6 hooks above; lifecycle hooks adapt; codemod report rule (T17.2); skills | the 6 hook files, `utils/swapLifecycle.ts`, `hooks/shared/solverStatusPolicy.ts`, `hooks/bridge/getBridgeDetailedStatusRefetchInterval.ts` | 3 | **yes** | contract-3.0 | T22.5, T17.2, #529/#531/#532 merged (they read status `data`) | #529, #531, #532 |

---

## T26 · consistent names; `'use client'`; SodaxProvider accepts an instance (score 4, Should)

**Approach.**

- **Renames.** Add the new names in 2.x and keep the old ones as `@deprecated` aliases. Remove the aliases in 3.0. The codemod table lives in T17.2.

  | Today | New name |
  | --- | --- |
  | `useQuote` | `useSwapQuote` |
  | `useStatus` | `useSwapIntentStatus` |
  | `useDetailedStatus` | `useSwapStatus` (the recommended read since #504) |
  | `useSupply` / `useBorrow` / `useWithdraw` / `useRepay` | `useMMSupply` / `useMMBorrow` / `useMMWithdraw` / `useMMRepay` (match `useMMAllowance` / `useMMApprove`) |
  | `useClaim` | `useStakingClaim` |
  | `useMigratebnUSD` | `useMigrateBnUSD` |
  | `useGetBridgeableAmount` / `useGetBridgeableTokens` | `useBridgeableAmount` / `useBridgeableTokens` |
  | `useGetUserHubWalletAddress` | `useHubWalletAddress` |
  | `useApproveToken` / `useIsTokenApproved` | `usePartnerApprove` / `usePartnerAllowance` |
  | `useGetAutoSwapPreferences` / `useGetIntentDetails` / `useGetUserIntent` | `usePartner…` |
  | `useXBalances` | deprecated in favour of `useBalances` |

- **Param renames:** `xChainId` (3 files), `chainId` (7) and `spokeChainKey` (5) → `chainKey`; `userAddress` (7) → `address`. 2.x accepts both names.
- **`'use client'`:** handled in T13.2.
- **`SodaxProvider`** gets `sodax?: Sodax | SodaxCore`, mutually exclusive with `config`. Today it always runs `new Sodax(config)` (`providers/SodaxProvider.tsx:23-28`). intents-whitelabel also builds its own `new Sodax(` once, so it ends up with two instances.

**Downstream use of renamed hooks:**
- **sodax-frontend:** `useSupply`, `useWithdraw`, `useClaim`, `useXBalances` (×9);
- **intents-whitelabel:** `useQuote`, `useStatus`, `useSwap`, `useSupply`, `useBorrow`, `useRepay`, `useWithdraw`.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T26.1 | `feat(dapp-kit): consistent hook and param names with deprecated aliases` | `hooks/{swap,mm,staking,migrate,bridge,partner,shared}/**`, index files | 3 | no | expand-2.x | — | #488, #511, #512 (index files) |
| T26.2 | `feat(dapp-kit): SodaxProvider accepts a sodax instance` | `providers/SodaxProvider.tsx` | 1 | no | expand-2.x | — (T12 benefits) | T21.5, T22.1 |
| T26.3 | `feat(dapp-kit)!: remove deprecated hook aliases, param names and the positional getBalancesQueryOptions` | hook files, `hooks/shared/useBalances.ts` | 1 | **yes** | contract-3.0 | T26.1, T17.2, T17.4 | — |

---

## T35 · `transport` option; polling presets (score 2, Later)

**Approach.**

- **Polling presets:**
  - a `query/polling.ts` module of named intervals replaces the 52 `refetchInterval` literals (most common: `5_000` ×8, `5000` ×5, `60_000`/`30_000`/`10_000` ×4 each, 7 functions);
  - `SodaxProvider polling={{…}}` overrides them;
  - `check-ai-consistency.py` currently reads the literal `refetchInterval: <ms>` values in hooks, so it must change too.
- **`transport: 'sdk' | 'api'`** on quote/swap/status/allowance/approve. This needs mappers from the REST DTOs (`QuoteResponseV2`) to the SDK types (`SwapQuote`); the 22 swapsApi hooks are REST-level.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T35.1 | `feat(dapp-kit): named polling presets with provider overrides` | `query/polling.ts`, 52 hook sites, `packages/skills/scripts/check-ai-consistency.{py,sh}` | 2 | no | later | T21.2–T21.4 | — |
| T35.2 | `feat(dapp-kit): transport option on the five high-level swap hooks` | `hooks/swap/**`, mappers | 5 | no | later | T28, T21, T22.6 | — |

---

## T18 · Lifecycle / progress / resume for every flow (score 6, Should)

### What PR 504 built on main (5ee56ff8)

- **SDK:**
  - `SwapService.getDetailedStatus` (`packages/sdk/src/swap/SwapService.ts:522`);
  - `getApprovalStrategy` (`:805`);
  - `swapWithApproval` (`:861`), including resume of an unconfirmed batch through `waitForBatchDeposit` (`:997-1021`);
  - `summarizeSwapStatus` / `SwapStatusSummary` (`packages/sdk/src/swap/detailedStatus.ts:31-58`);
  - `ATOMIC_BATCH_UNCONFIRMED` and `ACCOUNT_UPGRADE_DECLINED` (`packages/sdk/src/swap/errors.ts:46,53`);
  - `packages/sdk/src/shared/utils/evmAtomicBatch.ts`.
- **dapp-kit:**
  - `useSwapLifecycle` (`hooks/swap/useSwapLifecycle.ts:85-212`);
  - the state union `idle | checking | needsChainSwitch | needsSetup | ready | submitting | pending | unconfirmed | settled | failed` (`utils/swapLifecycle.ts:38-48`);
  - the pure resolver `resolveSwapLifecycle` (`:143`);
  - `useSwapApprovalStrategy`, `useSwapWithApproval`, and `useDetailedStatus` as the status read, with a not-found budget.

  `utils/swapLifecycle.ts` is not exported from the root (`utils/index.ts:1-4`); only its types are, via `useSwapLifecycle.ts:23`.

### What the user's in-flight work adds

| Item | Adds |
| --- | --- |
| #511 (PR) | shared `packages/sdk/src/shared/utils/approvalBatch.ts` (`resolveApprovalStrategy`, `sendApprovalBatch`, `confirmApprovalBatch`, `runWithApproval`, `approvalBatchWaitMs`); `useSwapsApiBroadcastWithApproval` |
| #512 (PR) | bridge and leverage-yield `getApprovalStrategy` + `*WithApproval`; four dapp-kit hooks; the demo bridge dialog and leverage-yield deposit on one button |
| #509 (PR) | `srcTxHash` on post-broadcast bridge and vault-swap errors |
| #523 (PR) | cancelled-intent status via the backend journal (`detailedStatusRouting.ts`) |
| #529 (issue) | `useSwapsApiSwapLifecycle`, multi-chain; open question: how callers persist state across reloads |
| #531 (issue) | `useBridgeLifecycle` |
| #532 (issue) | `useLeverageYieldLifecycle` |
| #533 (issue) | shared intent-deposit approval between swap and leverage yield |

All four lifecycle items settle on "same state union and `next()`/`reset()` as `useSwapLifecycle`", with the demo or playground as first consumer.

### What remains

These flows have no lifecycle hook:
- money market (supply, borrow, withdraw, repay);
- staking (stake, unstake, instant unstake, claim, cancel);
- migration (ICX ↔ SODA, bnUSD, BALN);
- DEX (deposit, withdraw, supply liquidity, decrease, claim);
- partner fee claim, recovery, the leverage-positions pending flow, and Bitcoin trading-wallet setup.

They all wait for the relay inside the action. `relayTxAndWaitPacket` call counts:

| Feature | Calls |
| --- | --: |
| money market | 4 |
| staking | 5 |
| migration | 4 |
| DEX | 6 (`AssetService` 2 + `ConcentratedLiquidityService` 4) |
| swap | 2 |
| bridge | 1 |
| leverage yield | 2 |

Their relay failures already carry `srcTxHash`:
- `packages/sdk/src/moneyMarket/MoneyMarketService.ts:564`;
- `packages/sdk/src/staking/StakingService.ts:428`;
- `packages/sdk/src/migration/MigrationService.ts:563`;
- `packages/sdk/src/dex/AssetService.ts:503`.

But no public read by `(srcChainKey, srcTxHash)` exists for these flows. The feature-agnostic `resolveDeliveredPacket` is internal (`packages/sdk/src/backendApi/detailedStatusRouting.ts:69-120`). So after a relay timeout, or after a page reload, these flows cannot reach `pending` → `settled`.

### SDK engine?

**No, not now.** Decision 0003 kept progress local to dapp-kit and said to revisit only when the SDK's signed path emits progress. Nothing in v3 needs that.

- The lifecycles derive state from mutation and status reads, and the resolvers are pure functions. If a Vue, Svelte or server consumer appears, they can move to the SDK unchanged.
- The one place an SDK event would add value is finer phases inside `submitting` (signing → broadcast → relaying; `utils/swapLifecycle.ts:29`). Revisit 0003 when a UI actually asks for that.

### Approach

1. **T18.1** — public `sodax.spoke.getRelayStatus({ srcChainKey, srcTxHash })` returning `Result<{ state: 'pending' | 'delivered'; dstTxHash?: Hex }, SodaxError<'LOOKUP_FAILED'>>`. It wraps `resolveDeliveredPacket`; a hub-chain source counts as delivered once mined.
2. **T18.2** — extract `FlowLifecycleState<TReady, TSettled>`, `resolveFlowLifecycle` and `toFlowAttempt` from `utils/swapLifecycle.ts`. Swap becomes one instance. Add a `resumeFrom` input:
   - `{ srcChainKey, srcTxHash }` → start in `pending`;
   - `{ batchId, callCount, variables }` → start in `unconfirmed`.

   This answers #529's persistence question; dapp-kit itself still stores nothing (gh-302 settled #9). Do it inside, or just before, the user's #531, so #531, #532 and the later flows share one core and do not each copy it.
3. **T18.3** — `useRelayStatus`, polling T18.1 with the existing not-found budget (`hooks/shared/notFoundStreak.ts`).
4. **T18.4–T18.7** — per-flow lifecycle hooks, each with a demo page as first consumer ("no API surface for hypothetical callers"). Sequential approval first; one-signature batching plugs in through `ready.approvalStrategy` once T31 lands.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T18.1 | `feat(sdk): public relay delivery status by source tx` | Feature-agnostic read + tests | `packages/sdk/src/shared/services/spoke/SpokeService.ts`, `backendApi/detailedStatusRouting.ts` | 2 | no | expand-2.x | #523 merged | #523 (`detailedStatusRouting.ts`) |
| T18.2 | `refactor(dapp-kit): one lifecycle core for every flow, with resume` | Generic state, resolver and attempt; `resumeFrom`; swap ported; tests unchanged | `utils/swapLifecycle.ts` → `utils/lifecycle.ts`, `hooks/swap/useSwapLifecycle.ts` | 3 | no | expand-2.x | #529 merged; coordinate with #531 (user) | #529, #531, #532 |
| T18.3 | `feat(dapp-kit): useRelayStatus` | Polling read with budget | `hooks/shared/useRelayStatus.ts` (new) | 2 | no | expand-2.x | T18.1 | — |
| T18.4 | `feat(dapp-kit,demo): useMoneyMarketLifecycle` | Supply, borrow, withdraw, repay; demo MM modals move onto it | `hooks/mm/**`, `apps/demo/src/components/mm/lists/*.tsx` | 5 | no | expand-2.x | T18.2, T18.3 | #483 (edits the demo MM modals) |
| T18.5 | `feat(dapp-kit,demo): useStakingLifecycle` | 5 actions; demo staking page | `hooks/staking/**`, `apps/demo/src/components/staking/**` | 5 | no | expand-2.x | T18.2, T18.3 | — |
| T18.6 | `feat(dapp-kit,demo): useMigrationLifecycle` | ICX/bnUSD/BALN + reverse | `hooks/migrate/**`, demo migration UI | 3 | no | expand-2.x | T18.2, T18.3 | #488 |
| T18.7 | `feat(dapp-kit,demo): useDexLifecycle` | Deposit, withdraw, supply, decrease, claim | `hooks/dex/**`, `apps/demo/src/pages/dex/**` | 5 | no | expand-2.x | T18.2, T18.3 | — |

Not planned, for lack of demand: partner, recovery, leverage-positions pending flow, Bitcoin setup. All of T18 is additive and does not gate 3.0.

---

## T19 · One error model; AbortSignal; correlation id (score 6, Should)

### Evidence

- **Error class:** `SodaxError` (`packages/sdk/src/errors/SodaxError.ts:31-46`).
  - 14 codes (`codes.ts:47-61`; runtime list `:200-215`), 11 features (`:218-230`), 12 phases (`:88-100`).
  - The open `context` (`:126-148`) already has `api`, `status`, `retryable`, `retryAfterSeconds`.
  - Repo rule: "attach detail to `error.context` rather than adding new code variants" (`packages/sdk/AGENTS.md:61`).
- **Swaps and bridge APIs are already mapped inside the SDK.** `SwapsApiService.toResult` (`packages/sdk/src/backendApi/SwapsApiService.ts:152-200`) and `BridgeApiService.toResult` (`BridgeApiService.ts:172-215`) turn `SwapsApiError`/`BridgeApiError` into `SodaxError<'EXTERNAL_API_ERROR'>` with `context.code`, `status` and `issues`. dapp-kit's API hooks call `sodax.api.swaps.*`, e.g. `hooks/swapsApi/useSwapsApiQuote.ts:54`.
- **The real gap is the second HTTP stack.** `makeRequest` (`backendApi/api-utils.ts:173-219`) serves BackendApi, LeverageYieldApi and Sponsoring. It throws a plain `Error('REQUEST_TIMEOUT')` (`:206`), which `toExternalApiError` maps with `status` only (`:240-255`). There is no transport category and no retryability.
- **The standalone clients throw by design.** `SwapsApiError` (`packages/swaps-api/src/errors.ts:30-46`) and `BridgeApiError` are identical apart from names.
- **#483** (R0bi7, `feat(sdk)!`, CONFLICTING, idle since 2026-09-23) adds `getSolverErrorRetryability` to `errors/guards.ts`, 7 `SolverIntentErrorCode` members, and an `unwrapResult` message fix.
- **No external `AbortSignal` anywhere.** Only internal timeout controllers exist:
  - `api-utils.ts:184`;
  - `packages/{swaps,bridge}-api/src/http.ts:164`;
  - `swap/SolverApiService.ts:227`;
  - `shared/services/intentRelay/IntentRelayApiService.ts:234`;
  - `leverageYield/LeverageYieldService.ts:351-352`;
  - `shared/services/spoke/SuiGrpcTransport.ts:117`.
- **Fetch sites:**
  - `api-utils.ts:189`;
  - `http.ts:178` (both packages);
  - `SolverApiService.ts:90,154,230`;
  - `IntentRelayApiService.ts:205,239`;
  - `LeverageYieldService.ts:355`;
  - `shared/entities/btc/RadfiProvider.ts:354,475,702`;
  - `BitcoinSpokeService.ts:183,622,636,655,749,770`;
  - `StacksSpokeService.ts:85,113,320`;
  - `CustomSorobanServer.ts:34,61,87,109`;
  - `shared/utils/icon-utils.ts:9`, `shared/utils/stacks-utils.ts:8`.
- **Poll loops:**
  - `waitUntilIntentExecuted` (`IntentRelayApiService.ts:431-477`, loop `:446`);
  - `pollBackendSubmitTx` (`backendApi/pollBackendSubmitTx.ts:83-116`);
  - spoke waits: Bitcoin `:768`, Icon `:285`, Injective `:468`, Stacks `:318`, Solana `:364`, Near `:402`, Stellar `:759`;
  - `SwapService.waitForBatchDeposit` (`:997-1021`; the wallet's `waitForBatch` takes only a timeout);
  - `sleep(ms)` (`shared/utils/shared-utils.ts:283`) takes no signal.
- **Correlation id:** none in the SDK.
  - The backend reads `x-request-id` only into API-usage events (`sodax-backend@985959e9:packages/api-auth-client/src/api-key.guard.ts:115`).
  - `RequestContextMiddleware` does not capture it (`packages/shared-utils/src/utils/request-context.middleware.ts:23-39`).
  - `apps/api` exposes `X-Request-Id` in CORS (`apps/api/src/main.ts:38`).
  - Probe P3: the gateway reflects `x-request-id` for `/v1/swaps`, `/v1/bridge` and `/v1/be`, and the solver `/v1/intent` allows `*`. **The relay `/v1/relay` pins `Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`, so a browser sending `x-request-id` to the relay fails preflight.** This is the backend #1212 class of bug again.

### Approach

1. **T19.1 — one context shape for every `EXTERNAL_API_ERROR`.** Each carries `context.code` (`NETWORK_ERROR | TIMEOUT_ERROR | HTTP_ERROR | PARSE_ERROR | VALIDATION_ERROR`), `status`, `retryable` and `retryAfterSeconds`. `makeRequest` is aligned with the swaps/bridge stack. Solver refusals get `retryable` from #483's classifier. Export an `isRetryableError()` guard. Additive.
2. **T19.2 — signals in the HTTP layers.**
   - **Standalone clients:** `request()` links a caller signal to the timeout controller by hand. That avoids `AbortSignal.any`, whose React Native support is unverified.
   - **Per-call options:** each client method gets an optional trailing `options?: { signal }`.
   - **SDK:** `RequestOverrideConfig.signal` (`api-utils.ts:33-42`) reaches `makeRequest` and `buildClient`'s fetch wrapper (`SwapsApiService.ts:125`). Because the SDK builds one client per call, this needs no change to the standalone API.
   - **Abort result:** standalone clients reject with the signal's reason (standard fetch semantics, so no new `SwapsApiErrorCode`). SDK methods return `SodaxError` with `context.reason: 'aborted'`.
   - **dapp-kit:** pass React Query's `queryFn({ signal })` through, so a 3 s quote poll is cancelled when its key changes.
3. **T19.3 — signals in loops.** `sleep(ms, signal)`; thread the signal through the relay wait, the submit-tx poll, the spoke waits and the batch wait.
4. **T19.4 — `signal?: AbortSignal` on `SpokeExecActionParams`** next to `timeout` (`packages/types/src/common/common.ts:446-451`), and on read methods.
   - **Abort before signing:** a clean cancel, reported with the phase's code and `context.reason: 'aborted'`.
   - **Abort after broadcast:** stop waiting and return the post-broadcast error with `srcTxHash` (the #509 contract). An abort must never hide a broadcast.
   - viem calls are not cancellable; the checks happen between steps.
5. **T19.5 — `x-request-id` per request.**
   - `crypto.randomUUID()`, falling back where it is unavailable: insecure browser contexts, React Native (see T29).
   - Override with `RequestOverrideConfig.requestId`.
   - Sent to backend API hosts and the solver only, **never to the relay**.
   - Recorded as `context.requestId` on `SodaxError` and in logger lines.
   - **Cross-repo:** a sodax-backend sub-issue to capture `x-request-id` in `RequestContextMiddleware`, and an ask to the relay owner to allow the header. Both sit under one sodax-sdks parent issue.
6. **No breaking change is needed.** For standalone-client users, export a `toSodaxError(e)` mapper from the sdk (folded into T28.1). Do not swap error classes: `SwapsApiError.code` (transport) and `SodaxError.code` cannot both live on one instance.

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T19.1 | `feat(sdk): uniform transport context and retryability on API errors` | As above, plus `isRetryableError` | `backendApi/{api-utils,BackendApiService,LeverageYieldApiService,SponsoringApiService}.ts`, `swap/SolverApiService.ts`, `errors/guards.ts` | 3 | no | expand-2.x | #483 (merge first) | #483 (`errors/guards.ts`) |
| T19.2 | `feat(swaps-api,bridge-api,sdk,dapp-kit): AbortSignal on API calls` | Linked signals; per-call options; SDK override; query `signal` pass-through | `packages/{swaps,bridge}-api/src/{http,client}.ts`, `backendApi/*`, `SolverApiService.ts`, `IntentRelayApiService.ts` (post), dapp-kit query hooks | 3 | no | expand-2.x | — (before T28.1, so edit both http.ts copies once) | #512 (`IntentRelayApiService.ts`) |
| T19.3 | `feat(sdk): AbortSignal in relay, status and spoke wait loops` | `sleep(ms, signal)` and loop threading | `IntentRelayApiService.ts`, `backendApi/pollBackendSubmitTx.ts`, 7 `*SpokeService.ts`, `shared/utils/shared-utils.ts` | 3 | no | expand-2.x | before T1/E2.3 moves spoke services into plugins | #512, E2.3 chain moves (cluster B) |
| T19.4 | `feat(types,sdk): signal on action params with post-broadcast-safe semantics` | All feature actions forward the signal; tests for before/after-broadcast aborts | `packages/types/src/common/common.ts`, `packages/sdk/src/{swap,bridge,leverageYield,moneyMarket,staking,migration,dex,partner,recovery}/*Service.ts` | 5 | no | expand-2.x | T19.3; #511, #512, #509, #523 merged | #511, #512, #509, #523 (`SwapService.ts`, `BridgeService.ts`, `LeverageYieldService.ts`) |
| T19.5 | `feat(sdk,swaps-api,bridge-api): x-request-id on backend API calls` | Host allow-list (no relay); `context.requestId` | `api-utils.ts`, both `http.ts`, `SolverApiService.ts`, `errors/codes.ts` | 2 | no | expand-2.x | parent issue in sodax-sdks; sodax-backend sub-issue for log capture; T29 for runtime coverage | — |

---

## T31 · EIP-5792 batching for the remaining features; testing entry (score 3, Later — parts D)

**Approach.**

- **Batching:** reuse #511's `runWithApproval` and `resolveApprovalStrategy` (`packages/sdk/src/shared/utils/approvalBatch.ts`, in PR) for MM supply/repay, staking, migration, DEX deposit and partner approve. Follow #533's pattern: a neutral helper, and each service wraps its own errors. Lifecycle hooks (T18) pick it up through `ready.approvalStrategy`.
- **Testing entry:** `@sodax/sdk/testing` exports typed fakes, e.g. `createFakeEvmWalletProvider(overrides) satisfies IEvmWalletProvider` for each chain type, plus `createMockSwapsApi`. They replace the 44 `as unknown as I*WalletProvider` casts in tests; only one test builds a `satisfies` fake today.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T31.1 | `feat(sdk,dapp-kit): one-signature approve + supply/repay for money market` | `moneyMarket/MoneyMarketService.ts`, `hooks/mm/**` | 3 | no | later | #511, #533 | T18.4 |
| T31.2 | `feat(sdk,dapp-kit): one-signature approve + stake/unstake` | `staking/**`, `hooks/staking/**` | 3 | no | later | #511 | T18.5 |
| T31.3 | `feat(sdk,dapp-kit): one-signature approvals for migration, dex deposit and partner` | `migration/**`, `dex/**`, `partner/**` | 3 | no | later | #511 | T18.6, T18.7 |
| T31.4 | `feat(sdk): testing entry with typed fake wallet providers and API mocks` | `packages/sdk/src/testing/**` (new subpath), tests | 3 | no | later | T23 (cluster C, shrinks fakes), T1 (per-chain fakes live in plugins) | — |

---

## T24 · "API mode" docs (score 5, Should)

### Approach

The API-mode example already exists: `apps/swap-api-example` (README: "All API calls go through `@sodax/swaps-api`"; the wallet only signs). So does the HTTP reference: `docs/developers/http-api/`, 5 pages, 1,101 lines. What is missing is the concept page that chooses between the modes. Add `docs/developers/how-to/integration-modes.md` with:

- **SDK orchestrator** vs **API mode** (server builds, client signs) vs **raw tx** (`raw: true`; `TxReturnType<C, Raw>`, cited by the scope at `types/src/common/common.ts:214`);
- a server-side signing recipe (the server-only private-key signers, T6);
- links to the swap-api-example and the http-api pages;
- a `docs.json` nav entry.

Update it after T28 so it names `@sodax/api`.

### Feasibility

High. Docs only. Pages under `docs/` are live on merge.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T24.1 | `docs: integration modes — SDK, API mode, raw transactions` | `docs/developers/how-to/integration-modes.md` (new), `docs/docs.json`, `docs/developers/http-api/index.mdx` | 2 | no | expand-2.x (now) | — | — |
| T24.2 | `docs: API mode on @sodax/api` | same pages, `apps/swap-api-example/README.md` | 1 | no | with T28.1 | T28.1 | — |

---

## T25 · BITCOIN branch in the swaps-api raw-tx schema (score 4, Now)

- **The gap.** The swaps-api switch (`packages/swaps-api/src/rawTxSchemas.ts:120-139`) has no `BITCOIN` case. Bitcoin falls through to `AnyRawTxSchema` (`:106`), a pass-through `v.custom` that does not transform anything. The bridge-api copy has the branch (`packages/bridge-api/src/rawTxSchemas.ts:80-85,155-156`), and its own header says the copies drift (`:7-9`).
- **The backend does return these.** It builds raw Bitcoin TRADING-mode swap intents (`sodax-backend@985959e9:apps/swaps-api/src/api/swaps/dto/swap-extras.dto.ts:88-155`).
- **Leverage-yield is affected too.** The LY API re-uses this selector (`packages/sdk/src/backendApi/leverageYieldApiSchemas.ts:47`).
- **Probe P2:** on published `@sodax/swaps-api@2.2.0`, `value` stays the string `"150000"` while `BitcoinRawTransaction.value` is typed `bigint` (`packages/types/src/bitcoin/bitcoin.ts:131-134`).
- **Fix:**
  1. Copy the branch.
  2. Add an exhaustiveness check to both switches: unknown key → `undefined` → fallback, then `const _: never = chainType`.
  3. Add a parity test over `ChainTypeArr` (`packages/types/src/chains/chain-keys.ts:4`).
- **Coupling with open chain PRs.** #534 (TRON), #95 (ALEO) and #497 (XRP) each add a `ChainType` and touch neither API package, so today their raw txs silently fall through. If T25 lands first, those PRs must add a branch, or an explicit fallback case with a comment.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T25.1 | `fix(swaps-api): parse Bitcoin raw transactions; exhaustive chain dispatch in both API clients` | `packages/{swaps,bridge}-api/src/rawTxSchemas{,.test}.ts` | 1 | no | expand-2.x (now) | — | no open PR edits these files; forces branches in #534, #95, #497 |

---

## T28 · One `@sodax/api` with re-export shims (score 4, Should)

**Approach.**

- **Merge the two packages.** `packages/{swaps,bridge}-api` have the same layout: `client`, `config`, `errors`, `http`, `rawTxSchemas`, `schemas`, `serialize`. Both `http.ts` files are 242 lines and, after normalising names, differ only in 4 comment lines (`http.ts:22,27,96-97,158`).
- **New `packages/api`:**
  - one shared `http`;
  - an `ApiError` base, keeping `SwapsApiError`/`BridgeApiError` as subclasses so `instanceof` still works;
  - one `rawTxSchemas`, which removes the drift.
- **Shims:** `@sodax/swaps-api` = `export * from '@sodax/api/swaps'`, and the same for bridge.
- **Move the SDK's second stack** onto the shared http core: `makeRequest`, used by `BackendApiService`, `LeverageYieldApiService` and `SponsoringApiService`. The SDK keeps its `Result` adapters.
- **Release tooling:**
  - add `api` before the shims and `sdk` in `scripts/bump-versions.sh:7` and `.github/workflows/sdks-publish.yml:30,72` (publish order matters; `release.mjs` only compares sorted lists);
  - `scripts/release.mjs:229-250` fails if either list misses a publishable package.
- **Impact:** non-breaking. sodax-backend, sodax-frontend and intents-whitelabel use 0 files from either package. In-repo users are demo (`@sodax/swaps-api` dependency) and swap-api-example.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T28.1 | `feat(api): @sodax/api with swaps and bridge modules; old packages become shims` | `packages/api/**` (new), `packages/{swaps,bridge}-api/**`, `scripts/bump-versions.sh`, `.github/workflows/sdks-publish.yml`, `toSodaxError` export | 5 | no | expand-2.x | T2 (tsc build), T10 (types external), T11 (attw/size gates), T19.2, T25.1 | T19.2 (both http.ts files), T25.1 |
| T28.2 | `refactor(sdk): backend, leverage-yield and sponsoring wire calls on @sodax/api` | `packages/sdk/src/backendApi/**` | 3 | no | expand-2.x | T28.1, T19.1 | T19.1 |
| T28.3 | `chore: sdk and dapp-kit depend on @sodax/api; deprecate the shims` | package.json files, docs | 1 | no | contract-3.0 (shims removed in 4.0) | T28.1 | — |

---

## T34 · OpenAPI drift gate (score 3, Later)

**Approach.**

- **Prior art:** `scripts/check-sponsoring-contract.mjs` (167 lines, hand-written expectations, default spec on localhost, not in any workflow).
- **Generalise** it to `check-api-contract`: walk the valibot object schemas and compare required/optional keys with the OpenAPI component schemas.
- **Specs are public** (probe P5):
  - `https://api.sodax.com/v1/swaps/docs-json` (53 KB);
  - `/v1/leverage-yield/docs-json` (52.6 KB);
  - the canary swaps spec.
- **Bridge spec is not routable.** bridge-api mounts Swagger at `/docs` (`sodax-backend@985959e9:apps/bridge-api/src/main.ts:78`), the same mistake swaps-api fixed (`apps/swaps-api/src/main.ts:54-55`). That needs a backend change, or a CI-emitted spec like sponsoring's `test/support/emit-openapi.ts`.
- **Run it** as a scheduled, non-blocking workflow, plus on PRs that touch `packages/api`.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T34.1 | `ci: drift gate between valibot schemas and the live OpenAPI specs` | `scripts/check-api-contract.mjs` (new), `.github/workflows/api-contract.yml` (new) | 3 | no | later | T28.1 | — |
| T34.2 | (sodax-backend) `fix(bridge-api): serve the OpenAPI spec under /bridge/docs` | `apps/bridge-api/src/main.ts` | 1 | no | later | cross-repo parent issue | — |

---

## T16 · Skills content to v3 (score 6, Must)

### Evidence

- **Size:** `packages/skills/skills` holds 5 skills, 250 files, 31.4K lines and 44 `SKILL.md`. `.claude-plugin/plugin.json` registers 4 of them.
- **Old migration content:** `migration-v1-to-v2` trees are 71 files / 576 KB.
- **`check:ai`:** 7 scripts (`packages/skills/package.json` scripts), run by CI on every PR (`.github/workflows/ci.yml:218-219`).
- **Hard-coded mode directory in six places:**
  - `check-ai-snippets.sh:157`;
  - `check-ai-imports.sh:34`;
  - `check-ai-consistency.sh:14`;
  - `check-ai-keys.sh:19`;
  - `check-skills.sh:231,255`.

  The v1→v2 "after" snippets are type-checked against current source, so they will not compile against v3.
- **Snippet type-checking** covers dapp-kit and wallet-sdk-react only (`check-ai-snippets.sh:22`).
- **v3-sensitive content:**
  - 80 integration files mention `walletProvider`;
  - 23 use `SodaxWalletProvider`;
  - 25 use `new Sodax(`;
  - 119 `queryKey` literals;
  - 16 SDK-name imports from the dapp-kit barrel;
  - a hand-maintained `hooks-index.md` (342 lines) and `querykey-conventions.md` (295 lines).

### Approach

1. **Rule for every expand or contract PR:** update the skills it changes in the same PR; CI enforces this. That cost sits inside each item, not here.
2. **At window start:** move `migration-v1-to-v2` out of the published tree (git history plus a docs link). Make the mode directory a parameter in the six scripts. Scaffold `migration-v2-to-v3` with `SKILL.md` mode gates.
3. **After API freeze:**
   - write v2→v3 knowledge for each package, mirroring the codemod table: plugins, ESM-only, peers, core, server signer entry, adapters, wagmi v3, barrel/peer, renames, error style, wallet context;
   - sweep the integration trees to v3 idioms: subpath imports, wallet from context, builders and keys, lifecycle hooks.
4. **Cross-repo:** update www.sodax.com/skill.md (`sodax-frontend:apps/web/content/skill.md`, `version: '2.1.0'` at `:23`).

### Feasibility

High. The gates already exist; the work is content. A generated index (T27.2) removes the main source of drift.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T16.1 | `chore(skills): archive the v1→v2 trees; add the v2→v3 mode` | `packages/skills/skills/*/migration-*`, 6 `check-*` scripts, `SKILL.md` gates, `docs/ai-integration-guide.md` | 3 | no (content) | contract-3.0 (window start) | T27.1 | open chain PRs editing skills (#534, #498, #497, #95) |
| T16.2 | `docs(skills): v2→v3 migration knowledge for every package` | `packages/skills/skills/*/migration-v2-to-v3/**` | 5 | no | contract-3.0 (after API freeze) | all contract items (A/B/C/D), T17.2 table | — |
| T16.3 | `docs(skills): integration knowledge on v3 idioms` | `packages/skills/skills/*/integration/**` | 5 | no | contract-3.0 (after API freeze) | T27.2, T13, T21, T22 | — |
| T16.4 | (sodax-frontend) `docs: www.sodax.com/skill.md for v3` | `apps/web/content/skill.md` | 1 | no | after 3.0.0-rc.1 | cross-repo parent issue; T27.1 | — |

---

## T27 · Generated hook index / query-key table / llms-full.txt; pin channels (score 4, Should)

- **`llms-full.txt` is already served.** Mintlify publishes `https://docs.sodax.com/llms.txt` (38.7 KB) and `/llms-full.txt` (1.65 MB) (probe P4). Drop it from scope.
- **Generator: ts-morph, not TypeDoc.**
  - No TypeDoc or api-extractor is in the repo; api-extractor appears only as an optional peer in the lockfile.
  - ts-morph is already needed for the codemods (T17.1).
  - The script reads dapp-kit exports (name, Query/Mutation/Composite from `useQuery`/`useSafeMutation`, first JSDoc sentence, subpath, interval) and `query/keys.ts`.
  - It regenerates `hooks-index.md` and the table in `querykey-conventions.md`, with a `--check` mode wired into `check:ai`.
- **Pin channels** — this must land before the first contract-phase PR:
  - set Mintlify's production branch to `release`, with `main` as preview (dashboard change; `docs/README.md:3-5`);
  - point the skills CLI install at `https://github.com/icon-project/sodax-sdks/tree/release/packages/skills`. The CLI accepts tree URLs (README example at line 44). Change it in `docs/ai-integration-guide.md:23,39,108`, `docs/builders-mcp.mdx:75` and the `tree/main` links in mirrored READMEs;
  - pin the plugin marketplace ref and the context7 branch;
  - pin `sodax-frontend:apps/web/content/skill.md:49,291` (cross-repo).

  Trade-off: once pinned, docs no longer go live on merge. That is a team process change, so it can wait until the window opens.
- **Not a channel:** `skills-lock.json` pins third-party skills (cloudflare, find-skills, valibot).

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T27.1 | `docs(ai): pin docs and AI channels to the release branch` | `docs/ai-integration-guide.md`, `docs/builders-mcp.mdx`, package READMEs, `.claude-plugin/plugin.json`; Mintlify and context7 settings; sodax-frontend skill.md | 2 | no | expand-2.x (gate before the window) | team decision on docs going live on merge; cross-repo parent issue | — |
| T27.2 | `feat(skills): generate the hook index and query-key table` | `packages/skills/scripts/gen-hooks-index.mjs` (new), the two reference files, `check:ai` | 3 | no | expand-2.x | T21.1, T17.1 (ts-morph setup) | — |

---

## T33 · `@sodax/mcp`; valibot → JSON Schema (score 3, Later)

**Approach.**

- **Two public MCP servers already exist outside this repo:**
  - Builders MCP (`gosodax/builders-sodax-mcp-server`, `builders.sodax.com/mcp`);
  - `icon-project/sodax-mcp-server`.

  sodax-backend#1326 plans a debug MCP. The repo itself only links the Builders MCP (`docs/builders-mcp.mdx`).
- **Do not build a third server.** Export tool definitions, i.e. valibot request schemas converted to JSON Schema with `@valibot/to-json-schema`, from `@sodax/api/tools`. The existing servers consume them for build-unsigned-tx tools, and no keys are ever held.

| ID | Title | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --: | :-: | --- | --- | --- |
| T33.1 | `feat(api): MCP-ready tool schemas from the valibot request schemas` | `packages/api/src/tools/**` | 3 | no | later | T28.1 | — |
| T33.2 | `feat: @sodax/mcp` — only if the Builders MCP cannot host build-tx tools | new package | 5 | no | later | T33.1, owner decision | — |

---

## T17 · Migration: codemods, docs, demo apps, downstream (score 6, Must)

### Evidence

- **No codemod tooling exists:** 0 lockfile hits for ts-morph or jscodeshift. The v1→v2 migration shipped as docs and skills only.
- **Apps importing `@sodax/*`:**

  | App | Files |
  | --- | --: |
  | demo | 87 |
  | playground | 32 |
  | example-next-js-16 | 4 |
  | node-cjs | 1 |
  | stellar-sponsor-example | 23 |
  | swap-api-example | 5 |
  | wallet-modal-example | 12 |

  `apps/node` is dead code.
- **Docs:** 205 pages. Pages using `new Sodax(`: 22 developer pages, plus about 3 per EVM chain section and 3 Solana. 24 pages use `SodaxWalletProvider` and 48 import dapp-kit. Package docs (`packages/sdk/docs/*.md`, READMEs) are mirrored by `docs:sync-pages` (`scripts/docs-pages-map.json`).
- **Downstream, per breaking change:**

  | Change (owner) | sodax-frontend `@6623d817` (`apps/web`, sdks 2.2.0-rc.8) | sodax-backend `@985959e9` | intents-whitelabel `@5e1fbba` (2.0.0-rc.12) |
  | --- | --- | --- | --- |
  | Chain plugins (T1, B) | SodaxProvider config; it uses non-EVM chains → register plugins | 3 `new Sodax(` sites serve all chains (`apps/bridge-api/src/shared/providers/sodax.provider.ts:108`, `apps/swaps-api/src/shared/providers/sodax.provider.ts:120`, `apps/task-executor/src/config/task-executor-config.service.ts:36`) → `@sodax/chains-all` | 1 `new Sodax(` + provider |
  | Wallet adapters (T3, C) | `SodaxWalletProvider` ×1, `useXAccount` 30, `getXChainType` 16, `useWalletProvider` 12, `useEvmSwitchChain` 12 | n/a | `useXAccount` 19, `getXChainType` 13, `useWalletProvider` 9 |
  | ESM-only (T4, A) | Next.js; no action expected | 97 files import `@sodax/sdk`; `require(esm)` on Node ≥ 22.12 (scope probes 1–4) | Vite; no action expected |
  | dapp-kit barrel + sdk peer (T13.3) | 0 SDK names via dapp-kit; already depends on sdk | n/a (no dapp-kit) | 0; already depends on sdk |
  | Renames (T26) | `useSupply`, `useWithdraw`, `useClaim`, `useXBalances` ×9 … | n/a | `useQuote`, `useStatus`, `useSwap`, MM hooks |
  | Result-as-data queries (T22.6) | none of the six used | n/a | `useQuote`, `useStatus` |
  | Literal dapp-kit keys (T21, report-only) | 10 | n/a | 0 |
  | `@sodax/api` (T28) | 0 | 0 files use swaps-api or bridge-api | 0 |

  intents-whitelabel has not been pushed since 2026-08-07 and pins 2.0.0-rc.12, so its v3 work includes catching up from rc.12 to 2.x.

### Approach

1. **A new `@sodax/codemod` package** (bin `sodax-codemod <transform> <paths> [--dry]`), built on ts-morph 28.0.0. That version was published 2026-04-12, so it passes `minimumReleaseAge: 20160` (`pnpm-workspace.yaml:7`). Each transform has fixture tests. It is versioned with the other packages, so add it to both `PACKAGES` lists.
2. **Ship forward-compatible transforms in 2.x** and run them on the in-repo apps and skills there:
   - SDK imports off the dapp-kit barrel (probe P1);
   - hook and param renames (the T26 table);
   - report-only rules for `data?.ok` on the six queries and for literal dapp-kit keys.

   Cluster B and C transforms (plugin registration, wallet config → adapters, deep imports → subpaths) live in the same harness; their sizes belong to T1/T3/T4.
3. **Docs** after API freeze: a v2→v3 migration page, plus the setup, chain and wallet pages (`configure_sdk.md`, `wallet_providers.md`, `quickstart.mdx`, installation, the mirrored dapp-kit README, the Solana chain pages).
4. **Downstream after `3.0.0-rc.1`:** one parent issue in sodax-sdks with native sub-issues in sodax-frontend, sodax-backend and intents-whitelabel. Create them before any coding (the cross-repo rule).

### Sub-issues

| ID | Title | What | Touches | Size | Breaking | Phase | Depends on | Conflicts with |
| --- | --- | --- | --- | --: | :-: | --- | --- | --- |
| T17.1 | `feat(codemod): @sodax/codemod CLI with the dapp-kit SDK-imports transform` | Package, CLI, fixture harness, first transform (from probe P1) | `packages/codemod/**` (new), `scripts/bump-versions.sh`, `.github/workflows/sdks-publish.yml` | 3 | no | expand-2.x | — | T28.1 (same two list files) |
| T17.2 | `feat(codemod): dapp-kit rename transform and report-only rules` | T26 table; `data?.ok` report; literal-key report | `packages/codemod/src/transforms/**` | 2 | no | expand-2.x | T17.1, T26.1 | — |
| T17.4 | `chore(apps): migrate demo, playground and examples with the forward-compatible codemods` | Run T17.1/T17.2: demo 82 files, playground 32, stellar-sponsor-example 17. Add `@sodax/sdk` deps | `apps/{demo,playground,stellar-sponsor-example}/**` | 2 | no | expand-2.x | T17.1, T17.2; #501 and #512 merged | #501 (54 demo files), #512 (demo bridge and LY), #483 (demo SwapCard and MM modals), #511 (playground) |
| T17.5 | `docs: v2→v3 migration guide and v3 setup, chain and wallet pages` | New page + about 25 pages | `docs/developers/**`, `docs/solana/**`, `packages/*/README.md`, `packages/sdk/docs/*.md` | 5 | no (docs) | contract-3.0 (after API freeze) | all contract items, T27.1 | — |
| T17.6a | (sodax-frontend) `chore: migrate to @sodax/* 3.0` | Run codemods; plugins, adapters, renames; replace literal keys with `sodaxKeys` | `apps/web/**` | 5 | — | after rc.1 | parent issue; RC | — |
| T17.6b | (sodax-backend) `chore: migrate to @sodax/sdk 3.0` | chains-all at 3 construction sites; ESM via `require(esm)` or `module: nodenext`; error-context reads | `apps/{bridge-api,swaps-api,task-executor,…}/**` | 3 | — | after rc.1 | parent issue; RC | — |
| T17.6c | (intents-whitelabel) `chore: migrate to @sodax/* 3.0` | Catch up from rc.12 first; then the same as frontend | `src/**` | 3 (+catch-up) | — | after rc.1 | parent issue; RC | — |

T17.3, the cluster B/C transforms, is tracked under T1/T3/T4/T6/T7 and uses T17.1's harness.

---

## D7 · In-flight PRs vs cluster D (files, order)

| PR | Relevant files | Collides with | Order |
| --- | --- | --- | --- |
| #511 (0x0603, MERGEABLE) | `packages/sdk/src/swap/{SwapService,errors}.ts`, `shared/utils/{approvalBatch,evmAtomicBatch}.ts`, `shared/index.ts`; `dapp-kit/src/hooks/swapsApi/{index,useSwapsApiBroadcastWithApproval}.ts`, `_apiKeyWire.test.ts`, `_mutationContract.test.ts`, README; playground `lib/execution.ts`…; skills 10 | T19.4, T22.2, T21.4, T13.2, T31.*, T17.4, T16 | **merge first** |
| #512 (0x0603, base #511) | `bridge/BridgeService.ts`, `leverageYield/LeverageYieldService.ts`, `IntentRelayApiService.ts`, `approvalBatch.ts`, `swap/intentDepositSpender.ts`; 4 new dapp-kit hooks + indexes; demo `BridgeDialog`, `BridgeManager`, `heldBatch`, LY page; skills 18 | T19.2, T19.3, T19.4, T22.2, T21.3, T18.2, T17.4 | **merge first** |
| #509 (0x0603) | `BridgeService.ts`, `LeverageYieldService.ts`, `SwapService.ts` (+tests, docs, skills 8) | T19.4 | first |
| #523 (0x0603) | `backendApi/{detailedStatusRouting,backendApiSchemas}.ts`, `SwapService.ts`, `LeverageYieldService.ts` | T18.1, T19.4 | first |
| #529 / #531 / #532 (issues, 0x0603) | `hooks/{swapsApi,bridge,leverageYield}/use*Lifecycle.ts`, `utils/swapLifecycle.ts`, playground and demo pages | T18.2 (extract the core inside/before #531), T22.2, T22.6, T21.3, T21.4 | before T18.2–T18.7, T22.6 |
| #533 (issue) | `swap/intentDepositSpender.ts` area, `SwapService.ts`, `LeverageYieldService.ts` | T31 (pattern to copy), T19.4 | before T31 |
| #483 (R0bi7, `!`, CONFLICTING, idle since 09-23) | `types/src/common/common.ts`, `sdk/src/errors/guards.ts`, `dapp-kit/src/hooks/shared/unwrapResult.ts`, `leverageYield/positionLegQuote.ts`, demo `SwapCard` + MM modals + `ErrorAlert`; skills 2 | T19.1 (build on `getSolverErrorRetryability`), T22.5 (`unwrapResult`), T18.4 and T17.4 (demo MM modals, SwapCard) | resolve before T19.1 and T22.5; the team must decide whether a `!` change ships in 2.x or waits for the 3.0 window |
| #488 (AntonAndell) | `migration/{IcxMigrationService,MigrationService}.ts`, `dapp-kit/src/hooks/migrate/{index,useIcxReverseMigrationEnabled}.ts`, README, skills 3 | T21.2, T22.3, T26.1, T18.6 | first (trivial) |
| #501 (R0bi7, CONFLICTING) | `apps/demo/src/components/leverage-yield/**` (54 files) | T17.4, #512 demo LY edit, T18 LY consumer | before T17.4 |
| #534 / #498 / #497 / #95 (chains) | sdk, types, skills | T25.1 (exhaustive raw-tx dispatch forces TRON/ALEO/XRP branches), T16 | either order; agree who adds the branches |

**Recommended order for cluster D**

1. **Now, independent of the PRs above:** T25.1, T24.1, T17.1, T21.1, T13.1 (once T2's recipe exists), T19.2, T19.5.
2. **After #483:** T19.1, T22.5.
3. **After #511, #512, #509 and #523 merge:** T19.3, T19.4, T18.1, T22.1–T22.3, T21.2–T21.4, T13.2, T26.1, T26.2, T17.2, then T17.4 (after #501).
4. **After the user's #529/#531/#532** (do T18.2 with #531): T18.3–T18.7.
5. **Window opens** (T27.1 pinned; codemods and app migrations done): T13.3, T22.6, T26.3, T16.1, together with the A/B/C breaking items.
6. **API freeze:** T16.2, T16.3, T17.5.
7. **RC:** T17.6a/b/c, T16.4.

---

## Cross-cluster dependencies

**My sub-issues → other clusters**

| Mine | Needs | Why |
| --- | --- | --- |
| T13.1 | T2 (A) | tsc unbundled build recipe |
| T13.3 | T4 (A) | peer policy; same `packages/dapp-kit/package.json` (viem → peer) |
| T13.4 | T12 (B) | `@sodax/sdk/<feature>` entries + `createSodaxCore` |
| T22.1 / T22.4 | T3 (C) | wallet-sdk-react produces the `WalletProviderSource` contract |
| T22.* | T23 (C) | only if the wallet interfaces change shape (`GetWalletProviderType`) |
| T19.3 | T1 / E2.3 (B) | land before spoke services move into plugins; otherwise 8 plugin packages get edited |
| T19.5 | T29 (A) | `crypto.randomUUID` coverage (React Native, Workers) |
| T28.1 | T2, T10, T11 (A) | build, externalised types, attw and size gates |
| T31.4 | T23 (C), T1 (B) | signer-only fakes; per-chain fakes live in plugins |
| T16.2, T16.3, T17.5 | every contract item (A/B/C) | API freeze |

**Other clusters → my sub-issues**

| Theirs | Needs | Why |
| --- | --- | --- |
| T12 (B) | T26.2 | `SodaxProvider` must accept an instance or core |
| T3 (C) | T22.1 | contract type in `@sodax/types` |
| T1, T3, T4, T5, T6, T7 (A/B/C breaking) | T17.1, T27.1, T16.1 | codemod harness; pinned channels; v2→v3 skills mode |
| T11 (A) | T13.2 | subpath entries to measure |
| E2.3 chain moves (B) | T19.3 | edits the same spoke wait loops |

---

## Corrections to `plan-v3-scope.md` (wrong or stale at cc053fef)

1. **E5.2 "SodaxError already carries 26 codes":** it has **14** codes (`packages/sdk/src/errors/codes.ts:47-61`), 11 features (`:218-230`) and 12 phases (`:88-100`).
2. **E5.2 "Map SwapsApiError/BridgeApiError into SodaxError" (breaking):** already done inside the SDK (`backendApi/SwapsApiService.ts:152-200`, `BridgeApiService.ts:172-215`). The real gap is the `makeRequest` stack: status only, a plain `Error('REQUEST_TIMEOUT')` (`api-utils.ts:206,240-255`), and no retryability. **Not breaking** (T19.1).
3. **E5.1 (13 pts):** lifecycle for every flow is about 25 pts (T18), all additive. It also needs a public relay-status read; `resolveDeliveredPacket` (`detailedStatusRouting.ts:69`) is internal. "Can start any time" → only after the user's #529/#531/#532 and #523.
4. **E5.3 (3 pts):** about 13 pts (T19.2–T19.5). New constraint: the production relay's CORS rejects a correlation header (probe P3).
5. **E7.1 (2 pts):** about 9 pts. It includes the tsc build switch, the 7 `@/` aliases and the entries. Barrel dependence is in-repo only: demo 287 specifiers in 83 files, playground 109/32, stellar-sponsor-example 28/17, skills 16; downstream 0.
6. **E7.2 "126 queries":** 127 `useQuery` + 1 `useQueries` (217 exported hooks, 74 mutations). "✔ (key shapes)" → keep shapes; 10 literal dapp-kit keys in sodax-frontend would break silently. About 13 pts.
7. **E7.3 "27 hook files take walletProvider", breaking:** about **70** hook files. It can be **additive** (optional argument + context).
8. **E7.6 "60 throws, 66 .ok, 19 mutateAsyncSafe":** 96 throws (54 plain-`Error` guards in 52 files), 68 `.ok`, 14 `mutateAsyncSafe`. The breaking part is limited to six Result-as-data queries.
9. **E8.1 "10 lines differ":** `http.ts` differs in 4 comment-only lines after normalising names.
10. **E8.2:** the swaps and LY specs are publicly reachable (probe P5). The bridge spec is not routed (`apps/bridge-api/src/main.ts:78`) and needs a backend fix. Prior art: `scripts/check-sponsoring-contract.mjs`, not in CI.
11. **E8.3:** confirmed on published 2.2.0 (probe P2). It also affects the LY API (`backendApi/leverageYieldApiSchemas.ts:47`). Three open chain PRs add ChainTypes that would also fall through.
12. **E8.4 (3 pts):** 2 + 1. The API-mode example already exists (`apps/swap-api-example`), as do 5 http-api pages.
13. **E9.1 "248 files, 30.8K lines" (8 pts):** 250 files, 31.4K lines. Six check scripts hard-code `migration-v1-to-v2`. About 14 pts including the v2→v3 trees.
14. **E9.2:** `llms-full.txt` is already served by Mintlify (probe P4); drop it. Use ts-morph, shared with the codemods, instead of TypeDoc (none in the repo).
15. **E9.3/E9.4 (13 pts):** two MCP servers already exist. Ship tool schemas (3 pts) and decide on a third server later.
16. **E9.5:** channels are enumerated in T27. They **must be pinned before the breaking window**, because docs.sodax.com builds from `main` (`docs/README.md:3-5`). `skills-lock.json` is not a channel.
17. **E10.1:** no codemod tooling exists. ts-morph is feasible (probe P1). Most transforms are forward-compatible and should ship in 2.x.
18. **E10.3:** demo 87 / playground 32 / examples 45 files import `@sodax/*`.
19. **E10.5:** sodax-backend uses 0 swaps-api/bridge-api/dapp-kit files and 97 `@sodax/sdk` files. intents-whitelabel pins 2.0.0-rc.12 (idle since 08-07), so add catch-up cost.
20. **D2 "Only these items break":** in cluster D, only E7.1 (barrel + peer), E7.6 (six queries) and the removal of E7.4's aliases break. E7.2, E7.3 and E5.2 are additive.
21. **Risks:** add the open `feat(sdk)!` #483 (CONFLICTING) and the CI rule that breaking PRs must migrate apps and skills in the same PR (`ci.yml:214,218-219,223`).

---

## Appendix — probes

| # | Command (short) | Result |
| --- | --- | --- |
| P1 | `cd $S/agent-D/codemod-probe && npm i --ignore-scripts ts-morph@28.0.0`; `node split-dapp-kit-barrel.mjs <tree>/packages/dapp-kit/src $S/agent-D/codemod-data/demo-src` (copy of `apps/demo/src`) | 10 packages, 15 MB. `{"ownExports":467,"filesRewritten":82,"specifiersToSdk":286,"specifiersToSubpath":153,"specifiersToRoot":66}` in 0.85 s; spot-checked `components/swaps/SwapCard.tsx` |
| P2 | `npm i --ignore-scripts @sodax/swaps-api@2.2.0 @sodax/bridge-api@2.2.0 valibot`; `v.parse(rawTxSchemaForChainKey('bitcoin'), {from,to,value:'150000',data})` | swaps-api: `value` stays a **string**. bridge-api 2.2.0 does not export `rawTxSchemaForChainKey` |
| P3 | `curl -X OPTIONS` with `Access-Control-Request-Headers: x-request-id` against `api.sodax.com/v1/{swaps/tokens,bridge/tokens,be/intent/tx/0xabc,intent/quote,relay}` | swaps 204 (reflected); bridge 204 (reflected); be 204 (reflected, origin reflected); intent 200 `*, x-api-key`; **relay 200 `Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`, so `x-request-id` is rejected**. A GET with `x-request-id` → 200, no echo |
| P4 | `curl docs.sodax.com/llms.txt`, `/llms-full.txt`, `www.sodax.com/skill.md` | 200 38.7 KB; 200 1.65 MB; 200 30 KB |
| P5 | `curl api.sodax.com/v1/{swaps,bridge,leverage-yield}/docs-json`, `canary-api…/v1/swaps/docs-json` | 200 53 KB; **404**; 200 52.6 KB; 200 |
| P6 | `npm view ts-morph time` | 28.0.0 published 2026-04-12, which passes the 14-day cooldown |
| P7 | `gh api repos/vercel-labs/skills/readme` | the skills CLI accepts `…/tree/<ref>/<path>` URLs (README line 44) |
