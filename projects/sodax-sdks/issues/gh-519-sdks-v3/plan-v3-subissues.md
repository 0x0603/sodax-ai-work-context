---
type: plan
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, sub-issues, work-breakdown, dependencies, conflicts, story-points]
related_issues: [gh-302, gh-456, gh-505, gh-507, gh-529, gh-531, gh-532, gh-533]
---

# GH-519 · v3 sub-issues (162), grouped by wave

This is the lookup table for `plan-v3-order.md`, which has the model, the waves, the hot files and
the decisions.

- **IDs.** `T<n>.<k>` means item n of the ranked table (`ideas.md` §1), sub-issue k. `A1.*` is the
  release tooling.
- **Approach and evidence.** Each sub-issue's approach and `path:line` evidence (at cc053fef) are in
  `research/<cluster>.md`. Cluster A: `a-build-packaging.md`; B: `b-sdk-core-chains.md`; C:
  `c-wallet.md`; D: `d-dappkit-api-ai-migration.md`.
- **Lookup.** `rg -n "^\| T1\.7 " plan-v3-subissues.md`.

| Column | Meaning |
| --- | --- |
| Pts | Fibonacci points: 1 ≤ ½ day, 2 ≈ 1 day, 3 ≈ 2 days, 5 = 3–4 days, 8 ≈ 1 week |
| Brk | Breaking; lands only in the 3.0 window (W6) |
| Tier | From the ranked table. **Must\*** = a Should item that a Must item depends on. **In-flight** = ports of open chain PRs, owned by their authors |
| Depends on | `#NNN` is an open PR or issue that must merge first |
| Conflicts | Open PRs or sub-issues editing the same files; the order is in `plan-v3-order.md` §5 |
| lead-added | A gap the cluster reports left out, added during synthesis |

## W1 · Now — no blockers

38 sub-issues · 79 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| A1.1 | `ci(publish): never move npm latest backwards` | 2 |  | Must | – | – | precondition of the contract gate |
| A1.2 | `build(release): derive publish list and order from the workspace` | 3 |  | Must | – | #163 (adds a package) | land before any new package (codemod, api, chain-*) |
| A1.3 | `ci(publish): one tag-driven backport workflow for every package` | 2 |  | Must | A1.1, A1.2 | – |  |
| T2.1 | `build(sdk): emit unbundled ESM with tsc, keep tsup for CJS` | 3 |  | Now | T10.1; T11.2 (soft) | #95 (package.json, trivial) | hard prerequisite of T12.2 and T1.6 |
| T2.2 | `build(wallet-sdk-core,swaps-api,bridge-api): emit unbundled ESM with tsc` | 2 |  | Now | T2.1 | #497, #95 (package.json, trivial) | becomes the template for every new package |
| T2.3 | `fix(sdk,wallet-sdk-core): initialise the bitcoin ECC library lazily` | 1 |  | Now | – | – | before T1.7 and T6.3 |
| T2.4 | `perf(sdk): mark pure top-level initializers` | 1 |  | Now | T2.1 | call sites: #509 #512 #523 (LeverageYieldService), #534 #498 (EvmSolverService) | helper definitions now; call sites after W2 |
| T7.0 | `chore(repo): TypeScript 5.9 and a current viem in the catalog` | 2 |  | Must | – | lockfile | lead-added; TS 5.9.3 verified on @sodax/types only; clears the viem 2.29.2 ws advisory |
| T10.1 | `build(sdk,wallet-sdk-core,swaps-api,bridge-api): stop inlining @sodax/types and near-api-js` | 1 |  | Now | T11.2 (soft) | – | both builds: the CJS twin already require()s ESM-only @mysten/sui |
| T11.1 | `ci: consumer install job with footprint and dependency audit` | 3 |  | Now | – | – | first PR of the whole plan |
| T11.2 | `ci: bundle-size budgets per consumer scenario` | 3 |  | Now | T11.1 | – |  |
| T11.3 | `ci: publint and consistent attw rules` | 1 |  | Now | – | #95, #497 (script lines, trivial) |  |
| T11.4 | `ci: Node engines-floor smoke` | 1 |  | Now | T11.1 | – |  |
| T14.1 | `perf(types): mark @sodax/types side-effect free` | 1 |  | Now | – | – |  |
| T15.1 | `refactor(sdk): replace Buffer in selectSolvedIntentPacket with viem byte helpers` | 1 |  | Must | – | – | the conflict-free half of E4.6 |
| T1.1 | `docs(sdk): ADR for chain plugins, plugin kit, settlement modes and v3 package layout` | 3 |  | Must | reads #534 | – | its acceptance is the chain-PR cutoff |
| T5.1 | `refactor(sdk): vendor concentrated-liquidity tick and liquidity math` | 3 |  | Must | – | – | property tests against v3-sdk |
| T5.2 | `refactor(sdk): vendor Infinity codecs, encoders and ABI fragments; drop v3-sdk and infinity-sdk` | 3 |  | Must | T5.1 | #534 #498 (EvmSolverService import lines, auto-merge) | removes the 6 nested viem copies from installs |
| T8.1 | `refactor(sdk): ICON reads and raw-tx building over a JSON-RPC client` | 3 |  | Now | – | – | also fixes receipts typed bigint that are BigNumber at runtime |
| T8.2 | `refactor(wallet-sdk-core,wallet-sdk-react): ICON reads over JSON-RPC` | 2 |  | Now | T8.1 | #95 (wallet files) |  |
| T8.3 | `refactor: import @stellar/stellar-sdk from /minimal` | 1 |  | Now | – | – | all 20 imported names verified |
| T8.4 | `refactor(sdk): build Solana instructions without Anchor` | 3 |  | Now | – | – | byte-for-byte tests; drops the fetchIdl RPCs (2 per deposit, 1 per sendMessage) |
| T3.10 | `build(wallet-sdk-react): emit unbundled ESM with tsc (rewrite the @/ aliases)` | 3 |  | Must | T2.1 | – | lead-added gap: no sub-issue covered wallet-sdk-react's build; per-file output keeps 'use client' and makes code-splitting possible |
| T6.1 | `feat(wallet-sdk-core): per-chain subpath entries` | 2 |  | Must | – | #534 #497 #95 (wallet-providers/index.ts, package.json; trivial) |  |
| T6.2 | `feat(wallet-sdk-core): server entry with private-key signers (EVM, Solana, Sui, Stellar, Stacks)` | 3 |  | Must | – | #498 (EvmWalletProvider.ts) |  |
| T6.3 | `feat(wallet-sdk-core): server signers for Bitcoin, Injective, NEAR, ICON (+Tron)` | 5 |  | Must | T6.2, T2.3 | #534 (tron/*), #95 | secp256k1 -> @noble/curves |
| T6.6 | `refactor(wallet-sdk-core): ICON browser signer without icon-sdk-js` | 2 |  | Must | T6.3, T8.1, T23.4 | – |  |
| T9.1 | `fix(wallet-sdk-react): reuse the app's QueryClient in EvmProvider` | 1 |  | Now | – | #163 (EvmProvider.tsx) |  |
| T23.3 | `refactor(wallet-sdk-react): use wallet-sdk-core EVM chain definitions` | 1 |  | Should | – | #498 (same chain lists) |  |
| T23.4 | `fix(wallet-sdk-core,wallet-sdk-react): one ICONEX relay queue` | 2 |  | Should | – | T6.6 (same file) | restores WALLET-L-1 across modules |
| T23.5 | `refactor(wallet-sdk-react): isNativeToken delegates to @sodax/types` | 1 |  | Should | – | – |  |
| T13.1 | `build(dapp-kit): emit unbundled ESM with tsc` | 2 |  | Must | T2.1 | – |  |
| T17.1 | `feat(codemod): @sodax/codemod CLI with the dapp-kit SDK-imports transform` | 3 |  | Must | A1.2 (or hand-edit the lists) | T28.1 (release lists) | ts-morph 28 |
| T19.5 | `feat(sdk,swaps-api,bridge-api): x-request-id on backend API calls (never the relay)` | 2 |  | Should | – | – | relay CORS rejects the header (verified 2026-10-16) |
| T21.1 | `feat(dapp-kit): query key factory and server-safe query entry` | 3 |  | Should | – | – | keeps today's key shapes (sodax-frontend hand-writes 10 keys) |
| T24.1 | `docs: integration modes — SDK, API mode, raw transactions` | 2 |  | Should | – | – |  |
| T25.1 | `fix(swaps-api): parse Bitcoin raw transactions; exhaustive chain dispatch in both API clients` | 1 |  | Now | – | forces raw-tx branches in #534 #95 #497 |  |
| T26.2 | `feat(dapp-kit): SodaxProvider accepts a sodax instance` | 1 |  | Must* | – | SodaxProvider.tsx (T21.5, T22.1) |  |

## W2 · After the user's open PRs merge (#509 #511 #512 #523, plus #488)

13 sub-issues · 34 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| T23.1 | `refactor(sdk,dapp-kit): wait for receipts through the spoke` | 2 |  | Should | #509 #512 #523 merged | LeverageYieldService.ts |  |
| T13.2 | `feat(dapp-kit): per-feature subpath entries and 'use client' entry modules` | 3 |  | Must | T13.1 | #511 #512 #488 (hooks/*/index.ts) |  |
| T17.2 | `feat(codemod): dapp-kit rename transform and report-only rules` | 2 |  | Must | T17.1, T26.1 | – |  |
| T19.2 | `feat(swaps-api,bridge-api,sdk,dapp-kit): AbortSignal on API calls` | 3 |  | Should | #512 merged | #512 (IntentRelayApiService.ts) | before T28.1 |
| T19.3 | `feat(sdk): AbortSignal in relay, status and spoke wait loops` | 3 |  | Should | #512 merged | chain moves T1.7–T1.14 (same spoke files) | land before the chain moves when possible |
| T19.4 | `feat(types,sdk): signal on action params with post-broadcast-safe semantics` | 5 |  | Should | T19.3; #509 #511 #512 #523 merged | feature services |  |
| T19.6 | `(sodax-backend) feat: capture x-request-id in request logs` | 1 |  | Should | cross-repo parent issue | – | lead-added from T19.5 |
| T21.2 | `feat(dapp-kit): queryOptions builders for swap, shared, sponsoring, mm, staking, migration` | 3 |  | Should | T21.1 | #488 | fixes the useMMAllowance / useEModes key drift |
| T21.5 | `feat(dapp-kit): optional queryKeyScope on SodaxProvider` | 1 |  | Should | T21.1 | SodaxProvider.tsx (T22.1, T26.2) |  |
| T22.1 | `feat(types,dapp-kit): WalletProviderSource contract and SodaxProvider wallets prop` | 2 |  | Should | – | SodaxProvider.tsx (T21.5, T26.2) | interface includes subscribe() (C's A5) |
| T22.3 | `feat(dapp-kit): walletProvider from context in mm, staking, migration, dex, partner, recovery, bitcoin hooks` | 3 |  | Should | T22.1 | #488 |  |
| T26.1 | `feat(dapp-kit): consistent hook and param names with deprecated aliases` | 3 |  | Should | – | #488 #511 #512 (index files) |  |
| T27.2 | `feat(skills): generate the hook index and query-key table` | 3 |  | Should | T21.1, T17.1 | – |  |

## W3 · After #534 merges (or the ADR cutoff)

38 sub-issues · 106 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| T14.2 | `refactor(types): split token-free chain info from token-bearing config` | 3 |  | Now | T14.1; #534 merged | #534 #497 #498 #95 (types/src/chains/*) | short freeze on types/src/chains/* while it lands; getChainType 34 -> 2 KB |
| T14.3 | `feat(types): light subpath entries` | 2 |  | Now | T14.2 | – | chain plugins import these, never the root |
| T14.4 | `refactor(swaps-api,bridge-api): import chain helpers from @sodax/types/chains` | 1 |  | Now | T14.3 | – |  |
| T15.3 | `refactor(sdk): replace Buffer in SpokeService and the remaining codec paths` | 1 |  | Must | #534 merged, T1.4 | #534 #498 #497 #95 (shared-utils.ts, SpokeService.ts) | after the codecs move into plugins |
| T1.2 | `refactor(sdk): chain plugin contract, ChainRegistry and lazy spoke services` | 5 |  | Must | T1.1; #534 merged or cutoff passed | #534 #497 #498 #95 (SpokeService.ts, spoke/index.ts) | adds CHAIN_NOT_ENABLED and a root-export snapshot test |
| T1.3 | `refactor(sdk): route chain capabilities and settlement through plugins` | 3 |  | Must | T1.2 | #512 (IntentRelayApiService.ts, other hunk), #95 |  |
| T1.4 | `refactor(sdk): address codecs through the chain registry` | 3 |  | Must | T1.2 | chain PRs (shared-utils.ts) |  |
| T1.5 | `build(sdk): enforce the chain import boundary; drop shared-barrel imports` | 2 |  | Must | T1.2 | import lines of open feature PRs |  |
| T1.6 | `feat(sdk): plugins option, defaultPlugins() and experimental chains/* entries` | 2 |  | Must | T1.4, T12.2 | T12.2 (package.json exports) | option is plugins, not chains (chains already means chain config) |
| T1.7 | `refactor(sdk): Bitcoin as a built-in plugin under src/chains/bitcoin` | 5 |  | Must | T1.3, T1.4, T1.5, T2.3; W2 PRs merged | #509 #511 #512 #523 (feature files) | replaces the 20 spoke.bitcoin sites |
| T1.8 | `refactor(sdk): Solana as a built-in plugin` | 2 |  | Must | T1.3, T1.4, T1.5, T8.4 | – | parallel with T1.7–T1.15 |
| T1.9 | `refactor(sdk): Stellar (incl. sponsoring) as a built-in plugin` | 3 |  | Must | T1.3, T1.4, T1.5, T8.3 | – | parallel |
| T1.10 | `refactor(sdk): Sui as a built-in plugin` | 2 |  | Must | T1.3, T1.4, T1.5 | – | parallel |
| T1.11 | `refactor(sdk): ICON as a built-in plugin` | 2 |  | Must | T1.3, T1.4, T1.5, T8.1 | #95 (guards.ts) | parallel |
| T1.12 | `refactor(sdk): Injective as a built-in plugin` | 2 |  | Must | T1.3, T1.4, T1.5 | – | parallel |
| T1.13 | `refactor(sdk): Stacks as a built-in plugin` | 2 |  | Must | T1.3, T1.4, T1.5 | – | parallel |
| T1.14 | `refactor(sdk): NEAR as a built-in plugin` | 2 |  | Must | T1.3, T1.4, T1.5 | – | parallel |
| T1.15 | `refactor(sdk): Tron as a built-in plugin` | 1 |  | Must | #534, T1.3, T1.4, T1.5 | – | parallel |
| T1.16 | `feat(sdk): XRP, Monad and Aleo as opt-in plugins (one PR each, by the PR authors)` | 8 |  | In-flight | T1.3–T1.6 | supersedes #497 #498 #95 | never in defaultPlugins(); Monad claims its chain key |
| T12.1 | `feat(sdk): createSodaxCore; the Sodax facade built on it` | 3 |  | Must | T1.2 (preferred) | – |  |
| T12.2 | `feat(sdk): per-feature subpath entries with createX(core) factories` | 3 |  | Must | T12.1, T2.1 (hard) | T1.6 (package.json exports) |  |
| T20.1 | `feat(sdk): fetch config v2 in ConfigService.initialize() with version gate, timeout and fallback` | 3 |  | Should | product decisions 2–4 | – | opt-in |
| T20.2 | `feat(dapp-kit): SodaxProvider refreshes remote config in the background` | 1 |  | Should | T20.1 | SodaxProvider.tsx (T26.2, T22.1, T21.5) |  |
| T3.1 | `refactor(wallet-sdk-react): scope wallet stores to each SodaxWalletProvider` | 5 |  | Must | #534 merged | #497 #95 (chainRegistry.ts, SodaxWalletProvider.tsx, types/config.ts) |  |
| T3.2 | `refactor(wallet-sdk-react): create chain services per provider` | 3 |  | Must | T3.1 | #497 #95 | getInstance() stays as a deprecated alias |
| T3.3 | `feat(wallet-sdk-react): add adapters prop and evm() adapter` | 3 |  | Must | T3.2, T9.1 | #163 (EvmProvider.tsx, types/config.ts) | old config prop converted internally |
| T3.4 | `feat(wallet-sdk-react): per-chain adapter factories (one PR per chain)` | 3 |  | Must | T3.3 | chain PRs add chains that then need adapters | parallel per chain |
| T3.5 | `refactor(wallet-sdk-react): remove Injective imports from EVM hooks` | 2 |  | Must | T3.3 | – |  |
| T3.7 | `feat(wallet-sdk-react): expose a WalletProviderSource for dapp-kit` | 1 |  | Must | T3.1, T22.1 | – | producer of the T22.1 contract; trivial once T3.8 lands (the wallets object implements it) |
| T3.8 | `feat(wallet-sdk-react): headless createSodaxWallets() with actions; the object is the WalletProviderSource` | 3 |  | Should | T3.2 | T3.3 (SodaxWalletProvider.tsx) | proposed §12: replaces the outside-provider fallback store and getXService(); passed to both SodaxWalletProvider and dapp-kit's SodaxProvider |
| T3.9 | `feat(wallet-sdk-react): lazy chain adapters — on-demand import, preload, reconnect persisted chains` | 5 |  | Should | T3.4, T3.8, T3.10 | – | proposed §12: all-chain apps start at the EVM size; Solana/Sui providers mount lazily as siblings (no downstream app uses their hooks directly) |
| T13.4 | `refactor(dapp-kit): import sdk feature entries; accept a core instance` | 2 |  | Must | T12.2, T26.2 | T22.1 (context file) |  |
| T13.5 | `refactor(dapp-kit): chain-specific hooks through getSpokeService` | 2 |  | Must | T1.2 | – | lead-added: 13 hook files read sodax.spoke.<chain>; needed before T1.27 |
| T17.3 | `feat(codemod): plugins registration, wallet adapters, server signer imports` | 3 |  | Must | T1.6, T3.3, T6.2 | – | lead-added: the B/C transforms no cluster sized; forward-compatible, run in 2.x |
| T18.1 | `feat(sdk): public relay delivery status by source tx (intent and MPC relay)` | 2 |  | Should | #523, #534 merged | #523 (detailedStatusRouting.ts) | after #534 the hook point is spoke.settle |
| T24.2 | `docs: API mode on @sodax/api` | 1 |  | Should | T28.1 | – |  |
| T28.1 | `feat(api): @sodax/api with swaps and bridge modules; old packages become shims` | 5 |  | Should | T2.2, T10.1, T11.1, T19.2, T25.1, A1.2 | T19.2 (http.ts) |  |
| T28.4 | `feat(api): leverage-yield and backend modules as standalone clients; the sdk wraps them` | 5 |  | Should | T28.1 | T28.2 (same sdk backendApi files) | proposed 2026-10-16: an sdk-free API path needs all four API families (LeverageYieldApiService 813 and BackendApiService 857 lines live only in the sdk today) |

## W4 · After #483 is resolved

3 sub-issues · 9 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| T19.1 | `feat(sdk): uniform transport context and retryability on API errors` | 3 |  | Should | #483 resolved | #483 (errors/guards.ts) |  |
| T22.5 | `feat(dapp-kit): every hook error is a SodaxError; typed errors per hook` | 3 |  | Should | #483 resolved | #483 (unwrapResult.ts) |  |
| T28.2 | `refactor(sdk): backend, leverage-yield and sponsoring calls on @sodax/api` | 3 |  | Should | T28.1, T19.1 | – |  |

## W5 · After the user's lifecycle issues (#529 #531 #532)

14 sub-issues · 44 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| T18.2 | `refactor(dapp-kit): one lifecycle core for every flow, with resume` | 3 |  | Should | #529 merged; together with #531 | #529 #531 #532 | do it inside or just before #531 |
| T18.3 | `feat(dapp-kit): useRelayStatus` | 2 |  | Should | T18.1 | – |  |
| T18.4 | `feat(dapp-kit,demo): useMoneyMarketLifecycle` | 5 |  | Should | T18.2, T18.3 | #483 (demo MM modals) |  |
| T18.5 | `feat(dapp-kit,demo): useStakingLifecycle` | 5 |  | Should | T18.2, T18.3 | – |  |
| T18.6 | `feat(dapp-kit,demo): useMigrationLifecycle` | 3 |  | Should | T18.2, T18.3 | #488 |  |
| T18.7 | `feat(dapp-kit,demo): useDexLifecycle` | 5 |  | Should | T18.2, T18.3 | – |  |
| T21.3 | `feat(dapp-kit): queryOptions builders for bridge, dex, leverage yield, partner, recovery, bitcoin` | 3 |  | Should | T21.1 | #512 #532 |  |
| T21.4 | `feat(dapp-kit): queryOptions builders for the API-lane hooks` | 3 |  | Should | T21.1; T28.5–T28.7 if adopted (same files move) | #511 #529 |  |
| T22.2 | `feat(dapp-kit): walletProvider from context in swap, bridge, leverage-yield and API-lane hooks` | 3 |  | Should | T22.1; T28.5–T28.7 if adopted (API-lane files move) | #511 #512 #529 #531 #532 |  |
| T24.3 | `docs: install matrix — which packages each integration needs` | 1 |  | Should | T28.5, T24.1 | – | proposed |
| T28.5 | `feat(api): sdk-free React hooks at @sodax/api/react — provider and swaps hooks` | 3 |  | Should | T28.1, T28.4, A1.2; #511 #529 merged | swapsApi hooks (#511, #529) | proposed (plan-v3-packages.md §4.1, revises the separate-package idea): react and react-query are optional peers; dapp-kit re-exports the hooks; #511's EVM approval/batch helpers move to a viem-only module |
| T28.6 | `feat(api): bridge and backend hooks in @sodax/api/react` | 3 |  | Should | T28.5 | – | proposed; the 3 hooks calling sodax.bridge.* stay in dapp-kit unless an API equivalent exists |
| T28.7 | `feat(api): leverage-yield hooks in @sodax/api/react` | 3 |  | Should | T28.5; #532 merged | #532 | proposed; 35 hook files |
| T28.8 | `ci: @sodax/api React isolation gate and per-persona consumer install fixtures` | 2 |  | Should | T28.5, T11.1 | T11.x | proposed; React imports only under ./react; fails a PR when the API persona install pulls @sodax/sdk or a chain library |

## G · Contract gate — must be done before the first breaking merge

4 sub-issues · 10 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| A1.4 | `feat(release): maintenance-line releases from release-<major>.x` | 3 |  | Must | A1.1 | – | 2.x patches keep shipping after the 3.0 tag |
| T17.4 | `chore(apps): migrate demo, playground and examples with the forward-compatible codemods` | 2 |  | Must | T17.1, T17.2; #501 #512 merged | #501 #512 #483 #511 |  |
| T16.1 | `chore(skills): archive the v1→v2 trees; add the v2→v3 mode` | 3 |  | Must | T27.1 | chain PRs editing skills |  |
| T27.1 | `docs(ai): pin docs and AI channels to the release branch` | 2 |  | Must* | team decision (docs stop going live on merge) | – |  |

## W6 · Contract window (3.0.0-rc.N)

28 sub-issues · 84 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| T4.1 | `build!: ship ESM only` | 3 | ✔ | Must | T2.1, T2.2, T10.1, T11.1, T12.2, T13.2 | every package.json | exports need a default condition plus typesVersions |
| T4.2 | `build!: viem, wagmi and react-query as peer dependencies with ranges` | 2 | ✔ | Must | T7.1, T9.1 | same manifests as T4.1, T7.1, T13.3 | sdk viem ^2.29.2; wallet-sdk-react viem >=2.43 comes with T7.1; dapp-kit's sdk dependency turns peer right after, in T13.3 |
| T4.3 | `ci: test peers at the floor and at the latest cooled-down release` | 2 |  | Must | T11.1, T4.2 | T11.x |  |
| T15.2 | `ci(sdk): forbid Buffer in the core` | 1 |  | Must | T1.27, T15.3, T11.1 | – |  |
| T29.1 | `ci: runtime matrix (Bun, Deno, Workers; Node legs via T11.4)` | 5 |  | Should | T11.1, T15.2, T4.1, T1.27 | T11.x |  |
| T1.17 | `build: @sodax/chain-* package scaffold and publish wiring` | 2 |  | Must | T2.2, T4.1, A1.2 | – | exports ., ./wallet, ./server (no ./react); check the npm token can create packages |
| T1.18-25 | `refactor!: extract <chain> spoke into @sodax/chain-<name> (8 chains)` | 10 | ✔ | Must | T1.17, T1.7–T1.14 | – | same PR and dev as T6.5.<chain>; parallel per chain |
| T1.26 | `refactor!: extract Tron (and XRP, Monad, Aleo if merged) into packages` | 4 | ✔ | Must | T1.17, T1.15 | – |  |
| T1.27 | `feat(sdk)!: hub and EVM only by default; typed chain access via the plugin registry` | 3 | ✔ | Must | T1.18-25, T1.26, T13.5, T26.2 | – |  |
| T1.28 | `feat: @sodax/chains-all` | 1 |  | Must | T1.18-25, T1.26 | – |  |
| T1.29 | `chore(sdk)!: remove the transitional chains/* entries and non-EVM dependencies` | 1 | ✔ | Must | T1.27 | – |  |
| T1.30 | `chore: fold @sodax/libs into chain-stacks and chain-injective; stop publishing it` | 2 |  | Must | T1.18-25, T6.5.* | – | proposed (plan-v3-packages.md §4.3): removes the manual npm-deprecate release step |
| T5.3 | `feat(sdk)!: replace PancakeSwap Price and Token with ClPrice and ClToken` | 3 | ✔ | Must | T5.2 | – | team call: 3.0 (recommended) or 2.x |
| T5.4 | `test(sdk): freeze PancakeSwap equivalence tests into fixtures; drop the devDependencies` | 1 |  | Must | T5.3 | – |  |
| T8.5 | `chore(sdk)!: remove the Anchor helpers; drop @coral-xyz/anchor, bn.js and icon-sdk-js` | 1 | ✔ | Now | T8.1, T8.4 | – | the toml advisory also needs stellar-sdk >=16 or Stellar opt-in |
| T20.3 | `feat(sdk)!: remote config on by default; bundled token lists become an opt-in fallback` | 3 | ✔ | Should | T20.1, T14.3, product decision 1 | – | conditional on product |
| T3.6 | `feat(wallet-sdk-react)!: drop legacy config, registry and singletons` | 5 | ✔ | Must | T3.4, T3.5, T6.4, T6.5.*, T4.1, T1.17 | T7.1 (package.json) | per-chain isolation gate |
| T6.4 | `feat(wallet-sdk-core)!: browser-only root signers` | 3 | ✔ | Must | T6.2, T6.3, T4.1, T10.1 | T23.2 (same classes) |  |
| T6.5.* | `refactor!: move <chain> signers into @sodax/chain-<name> (8 chains)` | 12 | ✔ | Must | T1.17, T6.4, T23.2 | T1.18-25 (same package) | same PR as T1.18-25 per chain |
| T6.7 | `refactor(sdk,wallet-sdk-core)!: fold the wallet base and EVM signers into @sodax/sdk/wallet; wallet-sdk-core becomes a shim` | 3 | ✔ | Must | T6.4, T1.17 | T6.5.* (same moves) | proposed (plan-v3-packages.md §4.2): chain packages then peer on the sdk only; the shim re-exports the base and EVM signers through 3.x |
| T7.1 | `feat(wallet-sdk-react)!: wagmi v3 with wagmi, viem and react-query as peers` | 3 | ✔ | Must | T7.0 | #163; EvmProvider.tsx (T9.1, T3.3); T3.6 (package.json) | first PR of the window; viem >=2.43 |
| T23.2 | `feat(types,wallet-sdk-core)!: signer-only wallet interfaces` | 3 | ✔ | Should | T23.1 | T6.4 (same classes) | before T6.5; the EVM receipt wait stays optional |
| T13.3 | `feat(dapp-kit)!: stop re-exporting @sodax/sdk; the sdk becomes a peer` | 2 | ✔ | Must | T17.1, T17.4, T27.1, T4.2 | T4.2 (same package.json) | downstream impact 0; in-repo apps migrated by T17.4 |
| T13.10 | `feat(dapp-kit)!: chain-specific hooks under per-chain subpaths with @sodax/chain-<name> as optional peers` | 2 | ✔ | Must | T13.5, T1.18-25 | – | proposed; bitcoin (13 files) and Stellar sponsoring (5) hooks |
| T17.7 | `feat(codemod): 3.0-only rewrites — chain packages, wagmi v3 names, removed APIs` | 2 |  | Must | T17.3, T1.17, T7.1 | – | lead-added |
| T22.6 | `feat(dapp-kit)!: status and quote queries throw instead of returning Result` | 3 | ✔ | Should | T22.5, T17.2, #529 #531 #532 merged | – |  |
| T26.3 | `feat(dapp-kit)!: remove deprecated hook aliases, param names and positional getBalancesQueryOptions` | 1 | ✔ | Should | T26.1, T17.2, T17.4 | – |  |
| T28.3 | `chore: sdk and dapp-kit depend on @sodax/api; deprecate the shims` | 1 |  | Should | T28.1 | – |  |

## W7 · API freeze → docs and skills → 3.0.0-rc.1

3 sub-issues · 15 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| T17.5 | `docs: v2→v3 migration guide and v3 setup, chain and wallet pages` | 5 |  | Must | API freeze: T1.29, T3.6, T6.4, T13.3, T22.6, T26.3; T27.1 | – |  |
| T16.2 | `docs(skills): v2→v3 migration knowledge for every package` | 5 |  | Must | API freeze: T1.29, T3.6, T6.4, T13.3, T22.6, T26.3; T17.2, T17.3, T17.7 | – |  |
| T16.3 | `docs(skills): integration knowledge on v3 idioms` | 5 |  | Must | T27.2, T13.2, T21.2, T22.3 | – |  |

## W8 · After 3.0.0-rc.1 — downstream repos

4 sub-issues · 12 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| T17.6a | `(sodax-frontend) chore: migrate to @sodax/* 3.0` | 5 |  | Must | cross-repo parent issue; 3.0.0-rc.1 | – |  |
| T17.6b | `(sodax-backend) chore: migrate to @sodax/sdk 3.0` | 3 |  | Must | cross-repo parent issue; 3.0.0-rc.1 | – | chains-all at 3 construction sites |
| T17.6c | `(intents-whitelabel) chore: migrate to @sodax/* 3.0` | 3 |  | Must | cross-repo parent issue; 3.0.0-rc.1 | – | plus catch-up from 2.0.0-rc.12 |
| T16.4 | `(sodax-frontend) docs: www.sodax.com/skill.md for v3` | 1 |  | Must | cross-repo parent issue; T27.1 | – |  |

## L · Later (3.x)

17 sub-issues · 60 pts

| ID | Title | Pts | Brk | Tier | Depends on | Conflicts / coordinate | Note |
| --- | --- | --: | :-: | --- | --- | --- | --- |
| T31.5 | `feat(chain-solana): spoke on @solana/kit with Codama clients` | 8 |  | Later | T1.18-25 (Solana), T8.4 | – |  |
| T3.11 | `feat(wallet-sdk-react): SSR initial state from cookies for every chain` | 3 |  | Later | T3.8 | – | proposed §12: extends the EVM cookie hydration (tryCookieToInitialState) to all chains |
| T3.12 | `feat(wallet-sdk-react): mock adapters for tests` | 2 |  | Later | T3.8 | – | proposed §12; pairs with T31.4 |
| T30.1 | `feat(wallet-sdk-react): typed per-chain account hooks` | 3 |  | Later | T3.3, T26.1 | – |  |
| T31.6 | `feat(wallet-sdk-react): Solana on Wallet Standard / @solana/react` | 8 |  | Later | T31.5 | – |  |
| T32.1 | `feat(wallet-sdk-core): adapters over EIP-1193 / WalletClient and Wallet Standard` | 3 |  | Later | T23.2, T3.3 | – |  |
| T36.1 | `feat(wallet-sdk-react): embedded / social wallets as adapters` | 2 |  | Later | T3.3, T7.1 | – |  |
| T31.1 | `feat(sdk,dapp-kit): one-signature approve + supply/repay for money market` | 3 |  | Later | #511, #533 | T18.4 |  |
| T31.2 | `feat(sdk,dapp-kit): one-signature approve + stake/unstake` | 3 |  | Later | #511 | T18.5 |  |
| T31.3 | `feat(sdk,dapp-kit): one-signature approvals for migration, dex deposit and partner` | 3 |  | Later | #511 | T18.6, T18.7 |  |
| T31.4 | `feat(sdk): testing entry with typed fake wallet providers and API mocks` | 3 |  | Later | T23.2, T1.27 | – |  |
| T33.1 | `feat(api): MCP-ready tool schemas from the valibot request schemas` | 3 |  | Later | T28.1 | – |  |
| T33.2 | `feat: @sodax/mcp — only if the Builders MCP cannot host build-tx tools` | 5 |  | Later | T33.1, owner decision | – | conditional |
| T34.1 | `ci: drift gate between valibot schemas and the live OpenAPI specs` | 3 |  | Later | T28.1 | – |  |
| T34.2 | `(sodax-backend) fix(bridge-api): serve the OpenAPI spec under /bridge/docs` | 1 |  | Later | cross-repo parent issue | – |  |
| T35.1 | `feat(dapp-kit): named polling presets with provider overrides` | 2 |  | Later | T21.2, T21.3, T21.4 | – |  |
| T35.2 | `feat(dapp-kit): transport option on the five high-level swap hooks` | 5 |  | Later | T28.1, T21.4, T22.6 | – |  |
