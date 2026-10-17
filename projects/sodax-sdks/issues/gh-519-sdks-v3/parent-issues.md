---
type: plan
repo: sodax-sdks
github: 519
updated: 2026-10-16
tags: [v3, parent-issues, sub-issues, drafts, github]
related_issues: [gh-505, gh-507, gh-529, gh-531, gh-532, gh-533]
---

# GH-519 · v3 parent issues (drafts, not filed)

Every ranked item with two or more sub-issues gets a parent issue: **30 parents**. The **7
single-PR items** need none; their sub-issue is the issue. Together they cover the 162 sub-issues in
`plan-v3-subissues.md`.

- **Proposed hierarchy:** #519 (R0bi7's idea board) → the 30 parents → the sub-issues, as GitHub
  native sub-issues, which can nest. Whether #519 becomes the top level, or a new "SDKs v3" tracker
  does, is R0bi7's call.
- **Not filed.** Filing is the user's or the team's decision. Two facts make it likely to happen
  anyway:
  - `issue-link.yml` (#525) requires every PR to link an issue or carry a no-issue label;
  - `add-to-project.yml` puts new issues on project 12 with Stream = SDK.
- **How to file, when asked:**
  1. `gh issue create --repo icon-project/sodax-sdks --title … --body-file …` for the parent, then for
     each sub-issue.
  2. Link each pair: `gh api graphql -F parent=<nodeId> -F sub=<nodeId> -f query='mutation($parent:ID!,$sub:ID!){addSubIssue(input:{issueId:$parent,subIssueId:$sub}){subIssue{number}}}'`.
  3. Cross-repo sub-issues are created in their own repo and linked to the sodax-sdks parent:
     - T17.6a: sodax-frontend; T17.6b: sodax-backend; T17.6c: intents-whitelabel;
     - T16.4: sodax-frontend;
     - T19.6 and T34.2: sodax-backend.
- **Benefits.** Every issue, parent or single PR, says who benefits and what changes for them: the
  "What each issue is for" table, and a **Why it matters** line in each body. The 7 single-PR items
  have paste-ready drafts too.
- **The Title and Body blocks are paste-ready** and contain no context-repo paths. The "(context)"
  line above each block is for us only.
- **Waits on** names the first sub-issue pair behind each dependency. Parents span waves, so two
  parents can wait on each other: for example T13.5 needs T1.2, while T1.27 needs T13.5. The order is
  always defined at sub-issue level (`plan-v3-order.md` §3).
- **Regenerate** from `artifacts/v3-probes/`:
  `python3 -I parents.py subissues.psv /dev/null parents.tsv && python3 -I parents_md.py subissues.psv parents.tsv out.md parent_text.py`.

## Summary

| Parent | Title | Subs | Pts | Waves | Breaking | Waits on (parents) | External gates |
| --- | --- | --: | --: | --- | :-: | --- | --- |
| **A1** | `ci(release): v3 release tooling — workspace package list, dist-tag guard, maintenance line` | 4 | 10 | W1, G |  | — | — |
| **T1** | `feat(sdk)!: chain plugins — core is hub + EVM, every other chain is opt-in` | 23 | 70 | W1, W3, W6 | ✔ | A1, T2, T4, T8, T12, T13, T26 | #534 |
| **T2** | `build: unbundled ESM output and no import-time side effects` | 4 | 7 | W1 |  | T10, T11 | — |
| **T3** | `feat(wallet-sdk-react)!: chain adapters and per-provider state` | 12 | 38 | W1, W3, W6, L | ✔ | T1, T2, T4, T6, T9, T22 | #534 |
| **T4** | `build!: ESM-only packages; viem, wagmi and react-query as peers` | 3 | 7 | W6 | ✔ | T2, T7, T9, T10, T11, T12, T13 | — |
| **T5** | `refactor(sdk): replace the PancakeSwap SDKs with vendored CL math` | 4 | 10 | W1, W6 | ✔ | — | — |
| **T6** | `feat(wallet-sdk-core)!: per-chain signers and a server-only entry` | 7 | 30 | W1, W6 | ✔ | T1, T2, T4, T8, T10, T23 | — |
| **T7** | `feat(wallet-sdk-react)!: wagmi v3` | 2 | 5 | W1, W6 | ✔ | — | — |
| **T8** | `refactor(sdk): lighter chain libraries — ICON over JSON-RPC, Stellar /minimal, Solana without Anchor` | 5 | 10 | W1, W6 | ✔ | — | — |
| **T11** | `ci: consumer install, bundle-size and audit gates` | 4 | 8 | W1 |  | — | — |
| **T12** | `feat(sdk): createSodaxCore and per-feature entries` | 2 | 6 | W3 |  | T1, T2 | — |
| **T13** | `feat(dapp-kit)!: per-feature subpaths; the sdk becomes a peer` | 6 | 13 | W1, W2, W3, W6 | ✔ | T1, T2, T4, T12, T17, T26, T27 | — |
| **T14** | `perf(types): split @sodax/types into light entries` | 4 | 7 | W1, W3 |  | — | #534 |
| **T15** | `refactor(sdk): polyfill-free core` | 3 | 3 | W1, W3, W6 |  | T1, T11 | #534 |
| **T16** | `docs(skills): skills for v3` | 4 | 14 | G, W7, W8 |  | T1, T3, T6, T13, T17, T21, T22, T26, T27 | cross-repo parent issue |
| **T17** | `feat: v2 → v3 migration — codemods, docs, apps and downstream repos` | 9 | 28 | W1, W2, W3, G, W6, W7, W8 |  | A1, T1, T3, T6, T7, T13, T22, T26, T27 | #501, #512, cross-repo parent issue |
| **T18** | `feat(dapp-kit): lifecycle hooks for every multi-step flow` | 7 | 25 | W3, W5 |  | — | #523, #529, #531, #534 |
| **T19** | `feat(sdk): uniform API errors, AbortSignal and request ids` | 6 | 17 | W1, W2, W4 |  | — | #483, #509, #511, #512, #523, cross-repo parent issue |
| **T20** | `feat(sdk): remote config v2` | 3 | 7 | W3, W6 | ✔ | T14 | product decision |
| **T21** | `feat(dapp-kit): query key factory and queryOptions builders` | 5 | 13 | W1, W2, W5 |  | T28 | — |
| **T22** | `feat(dapp-kit): wallet provider from context; one error style` | 5 | 14 | W2, W4, W5, W6 | ✔ | T17, T28 | #483, #529, #531, #532 |
| **T23** | `refactor(types,wallet-sdk-core)!: signer-only wallet interfaces; dedupe` | 5 | 9 | W1, W2, W6 | ✔ | — | #509, #512, #523 |
| **T24** | `docs: integration modes and API mode` | 3 | 4 | W1, W3, W5 |  | T28 | — |
| **T26** | `feat(dapp-kit)!: consistent hook names; SodaxProvider accepts an instance` | 3 | 5 | W1, W2, W6 | ✔ | T17 | — |
| **T27** | `docs(ai): pin docs and AI channels to release; generated hook index` | 2 | 5 | W2, G |  | T17, T21 | team decision |
| **T28** | `feat(api): one @sodax/api package` | 8 | 25 | W3, W4, W5, W6 |  | A1, T2, T10, T11, T19, T25 | #511, #529, #532 |
| **T31** | `feat: later — one-signature batching for the remaining features, testing entry, Solana on Kit` | 6 | 28 | L |  | T1, T8, T23 | #511, #533 |
| **T33** | `feat(api): MCP-ready tool schemas` | 2 | 8 | L |  | T28 | owner decision |
| **T34** | `ci: OpenAPI drift gate` | 2 | 4 | L |  | T28 | cross-repo parent issue |
| **T35** | `feat(dapp-kit): polling presets and a transport option` | 2 | 7 | L |  | T21, T22, T28 | — |

**Single-PR items (no parent):** T9 → `fix(wallet-sdk-react): reuse the app's QueryClient in EvmProvider` (1 pt, W1); T10 → `build(sdk,wallet-sdk-core,swaps-api,bridge-api): stop inlining @sodax/types and near-api-js` (1 pt, W1); T25 → `fix(swaps-api): parse Bitcoin raw transactions; exhaustive chain dispatch in both API clients` (1 pt, W1); T29 → `ci: runtime matrix (Bun, Deno, Workers; Node legs via T11.4)` (5 pts, W6); T30 → `feat(wallet-sdk-react): typed per-chain account hooks` (3 pts, L); T32 → `feat(wallet-sdk-core): adapters over EIP-1193 / WalletClient and Wallet Standard` (3 pts, L); T36 → `feat(wallet-sdk-react): embedded / social wallets as adapters` (2 pts, L).

## What each issue is for

| Issue | Kind | Why it matters |
| --- | --- | --- |
| **A1** | parent | The team keeps shipping 2.x fixes after 3.0 work starts, and new packages publish without hand-edited lists. Without it, the first 3.0 tag blocks every 2.x release. |
| **T1** | parent | Apps install and ship only the chains they use. An EVM-only app drops about 83% of the SDK bundle and goes from 777 MB to about 85 MB on install (35 → 0 advisories). Adding a chain touches one plugin instead of files spread across 9 packages (Stacks appears in 67 files today). |
| **T2** | parent | Tree-shaking finally works: importing one helper costs under 1 KB instead of 832 KB gzip. Every later size win builds on it. |
| **T3** | parent | Apps pick wallets per chain (`adapters={[evm(), solana()]}`) and load only those; the wallet layer is 2.6 MB gzip today, the EVM part alone 124 KB. Per-provider state makes SSR, tests and multiple providers safe. |
| **T4** | parent | Apps share one viem, wagmi and react-query copy with the SDK instead of up to 8 viem copies (355 MB), and can pick up security fixes without waiting for a SODAX release (e.g. the `ws` advisory in the pinned viem). |
| **T5** | parent | Every install loses 131 MB, 20 advisories and six nested viem copies, which even apps that never touch the DEX pay today. The math stays identical, checked by property tests. |
| **T6** | parent | Browser bundles stop carrying private-key signing code and its libraries (near-api-js, ecpair, secp256k1, bip322-js), so there is less attack surface in the browser. Backends get one clear server entry. |
| **T7** | parent | The WalletConnect, MetaMask and Coinbase SDKs become optional. The wagmi stack drops from 576 MB / 23 advisories to 102 MB / 0, the deprecated MetaMask SDK goes away, and apps stay on a supported wagmi. |
| **T8** | parent | ICON, Stellar and Solana users get smaller installs and fewer network calls (Solana: 2 RPCs fewer per deposit, 1 per message). It also fixes ICON receipts that are typed `bigint` but are BigNumber at runtime. |
| **T9** | single PR | Fixes a v2 bug. Under `SodaxWalletProvider`, dapp-kit hooks silently use wagmi's private QueryClient, so app settings such as a Sentry `onError` or a cache reset never apply. |
| **T10** | single PR | The token list stops being copied into four packages (a single swap dapp carries five copies today). Bundles shrink, and chain and token data have one source of truth. |
| **T11** | parent | Locks in every gain: a PR that grows the bundle or the install footprint, or adds advisories, fails CI, and every change shows before/after numbers. Without it, v3 savings regress quietly. |
| **T12** | parent | Apps import only the features they use (`@sodax/sdk/swap`). An EVM swap-only app is about 169 KB gzip, against 1.27 MB for `new Sodax()` today, and the familiar `Sodax` class keeps working. |
| **T13** | parent | React apps load only the hook groups they use, and no longer get the whole SDK through dapp-kit's re-export; Next.js apps get correct `'use client'` boundaries. |
| **T14** | parent | Code that only needs chain keys and helpers (backends, light clients, the API packages) stops paying for the token list: `getChainType` goes from 34 KB to 2 KB gzip. Non-breaking. |
| **T15** | parent | The SDK core runs in Cloudflare Workers, React Native, Bun and Deno without any Buffer or crypto polyfill setup. |
| **T16** | parent | AI agents and the skills CLI write correct v3 code, while 2.x users keep getting 2.x guidance instead of a mix. |
| **T17** | parent | Integrators upgrade by running a codemod instead of reading a diff. In-repo apps migrate early, so breaking PRs stay small, and sodax-frontend, sodax-backend and intents-whitelabel each get a tracked upgrade. |
| **T18** | parent | Money market, staking, migration and DEX flows get the same progress states as swap, bridge and leverage-yield, and recover after a page reload or a relay timeout. |
| **T19** | parent | Apps can tell retryable API errors from fatal ones and cancel stale quotes and polls, which saves requests. Support can follow one user action from the SDK into backend logs by request id. |
| **T20** | parent | New tokens and chains go live without an SDK release, and token lists leave the bundle, if product approves the trust model. |
| **T21** | parent | Apps can prefetch, server-render and suspend on SODAX data, and invalidate caches reliably with exported keys. The stale-allowance key bug is fixed along the way. |
| **T22** | parent | Less boilerplate: hooks find the connected wallet themselves instead of every call passing `walletProvider` (55 hook files take it today), and apps handle one error type everywhere. |
| **T23** | parent | Custom wallets (MPC, Safe, embedded) implement a few sign/send methods instead of RPC reads. One ICONEX queue restores the WALLET-L-1 audit fix across modules. |
| **T24** | parent | Partners pick the right integration (SDK, API mode or raw transactions) and install exactly the packages it needs. |
| **T25** | single PR | Bitcoin raw transactions from the swaps and leverage-yield APIs parse correctly. Today `value` stays a string although it is typed `bigint`. |
| **T26** | parent | Predictable hook and parameter names make the API easier to learn and easier for AI agents to use. App and provider share one SDK instance (no second `new Sodax()`). |
| **T27** | parent | Docs and AI tools serve the released version, not `main`, so 2.x users never get v3 instructions during the breaking window. The generated indexes stop drifting. |
| **T28** | parent | One light package for every SODAX HTTP API, with one transport and one error type, usable without the SDK. The duplicated HTTP stacks go away. Proposed: API-only React apps get hooks from `@sodax/api/react` and stop installing the SDK (21 MB instead of ≥ 777 MB). |
| **T29** | single PR | CI proves that the SDK works on Bun, Deno and Workers, so runtime support is a tested promise. |
| **T30** | single PR | Chain-specific account data comes with correct types, so apps need fewer casts. |
| **T31** | parent | One wallet prompt (approve + action) for the remaining features; typed test fakes for integrators; a lighter, maintained Solana stack (web3.js v1 receives critical fixes only). |
| **T32** | single PR | Apps that already use a raw EIP-1193 provider, a viem WalletClient or Wallet Standard plug in without wagmi or SODAX's React layer. |
| **T33** | parent | AI agents build SODAX transactions through the existing MCP servers from one schema source, and never hold keys. |
| **T34** | parent | Backend API changes that would silently break client parsing get caught before users hit them. |
| **T35** | parent | Polling load is tuned in one place, and quote, swap and status hooks can run over the API with the same hook API. |
| **T36** | single PR | Embedded and social logins beyond Privy plug in the same way, each as an optional subpath. |

## Single-PR issue drafts

These need no parent; file them as plain issues.

### T9 — T9.1

(context) score 7/10 · Now · 1 pt · W1 · depends on: – · conflicts: #163 (EvmProvider.tsx)

**Title**
```text
fix(wallet-sdk-react): reuse the app's QueryClient in EvmProvider
```
**Body**
```markdown
**Why it matters.** Fixes a v2 bug. Under `SodaxWalletProvider`, dapp-kit hooks silently use wagmi's private QueryClient, so app settings such as a Sentry `onError` or a cache reset never apply.

_v3 plan item T9 (T9.1) · score 7/10 · Now_
```

### T10 — T10.1

(context) score 7/10 · Now · 1 pt · W1 · depends on: T11.2 (soft) · conflicts: –

**Title**
```text
build(sdk,wallet-sdk-core,swaps-api,bridge-api): stop inlining @sodax/types and near-api-js
```
**Body**
```markdown
**Why it matters.** The token list stops being copied into four packages (a single swap dapp carries five copies today). Bundles shrink, and chain and token data have one source of truth.

**Notes.** both builds: the CJS twin already require()s ESM-only @mysten/sui

**Depends on:** T11.2 (soft).

_v3 plan item T10 (T10.1) · score 7/10 · Now_
```

### T25 — T25.1

(context) score 4/10 · Now · 1 pt · W1 · depends on: – · conflicts: forces raw-tx branches in #534 #95 #497

**Title**
```text
fix(swaps-api): parse Bitcoin raw transactions; exhaustive chain dispatch in both API clients
```
**Body**
```markdown
**Why it matters.** Bitcoin raw transactions from the swaps and leverage-yield APIs parse correctly. Today `value` stays a string although it is typed `bigint`.

_v3 plan item T25 (T25.1) · score 4/10 · Now_
```

### T29 — T29.1

(context) score 4/10 · Should · 5 pts · W6 · depends on: T11.1, T15.2, T4.1, T1.27 · conflicts: T11.x

**Title**
```text
ci: runtime matrix (Bun, Deno, Workers; Node legs via T11.4)
```
**Body**
```markdown
**Why it matters.** CI proves that the SDK works on Bun, Deno and Workers, so runtime support is a tested promise.

**Depends on:** T11.1, T15.2, T4.1, T1.27.

_v3 plan item T29 (T29.1) · score 4/10 · Should_
```

### T30 — T30.1

(context) score 3/10 · Later · 3 pts · L · depends on: T3.3, T26.1 · conflicts: –

**Title**
```text
feat(wallet-sdk-react): typed per-chain account hooks
```
**Body**
```markdown
**Why it matters.** Chain-specific account data comes with correct types, so apps need fewer casts.

**Depends on:** T3.3, T26.1.

_v3 plan item T30 (T30.1) · score 3/10 · Later_
```

### T32 — T32.1

(context) score 3/10 · Later · 3 pts · L · depends on: T23.2, T3.3 · conflicts: –

**Title**
```text
feat(wallet-sdk-core): adapters over EIP-1193 / WalletClient and Wallet Standard
```
**Body**
```markdown
**Why it matters.** Apps that already use a raw EIP-1193 provider, a viem WalletClient or Wallet Standard plug in without wagmi or SODAX's React layer.

**Depends on:** T23.2, T3.3.

_v3 plan item T32 (T32.1) · score 3/10 · Later_
```

### T36 — T36.1

(context) score 2/10 · Later · 2 pts · L · depends on: T3.3, T7.1 · conflicts: –

**Title**
```text
feat(wallet-sdk-react): embedded / social wallets as adapters
```
**Body**
```markdown
**Why it matters.** Embedded and social logins beyond Privy plug in the same way, each as an optional subpath.

**Depends on:** T3.3, T7.1.

_v3 plan item T36 (T36.1) · score 2/10 · Later_
```

## Parent drafts

### A1 — release tooling

(context) score —/10 · Must · 4 sub-issues · 10 pts · waves W1, G · detail: `research/` section for A1, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
ci(release): v3 release tooling — workspace package list, dist-tag guard, maintenance line
```
**Body**
```markdown
**Goal.** Ship 3.0.0-rc.N through today's flow while 2.x patches keep shipping, and let new packages (chain-*, api, codemod) publish without hand-edited lists.

**Why it matters.** The team keeps shipping 2.x fixes after 3.0 work starts, and new packages publish without hand-edited lists. Without it, the first 3.0 tag blocks every 2.x release.

**Plan.** Derive the publish list and order from the workspace; one tag-driven backport workflow; never move npm `latest` backwards; `pnpm release` on `release-2.x` for the maintenance line.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] A1.1 `ci(publish): never move npm latest backwards` — 2 pts · W1
- [ ] A1.2 `build(release): derive publish list and order from the workspace` — 3 pts · W1
- [ ] A1.3 `ci(publish): one tag-driven backport workflow for every package` — 2 pts · W1
- [ ] A1.4 `feat(release): maintenance-line releases from release-<major>.x` — 3 pts · G

_v3 plan item A1 · release prerequisite_
```

### T1 — chain plugins

(context) score 10/10 · Must · 23 sub-issues · 70 pts · waves W1, W3, W6 · detail: `research/` section for T1, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(sdk)!: chain plugins — core is hub + EVM, every other chain is opt-in
```
**Body**
```markdown
**Goal.** Non-EVM chain libraries leave the default install and bundle. EVM-only what-if: `new Sodax()` −83% gzip, `npm i @sodax/sdk` 777 MB → ~85 MB, 35 → 0 advisories.

**Why it matters.** Apps install and ship only the chains they use. An EVM-only app drops about 83% of the SDK bundle and goes from 777 MB to about 85 MB on install (35 → 0 advisories). Adding a chain touches one plugin instead of files spread across 9 packages (Stacks appears in 67 files today).

**Plan.** 2.x: plugin contract (settlement modes, codecs, capabilities), `ChainRegistry` with lazy spokes, chains moved under `src/chains/<name>` and still registered by default, `plugins` option and `createSodaxCore()` with no non-EVM chain. 3.0: extract `@sodax/chain-<name>` (`.`, `./wallet`, `./server`), default flips to hub + EVM, `@sodax/chains-all` for apps that want everything.

**Waits on:** A1 release tooling (T1.17 needs A1.2); T2 unbundled ESM (T1.7 needs T2.3 +1); T4 ESM-only + peers (T1.17 needs T4.1); T8 lighter chain libs (T1.8 needs T8.4 +2); T12 core + feature entries (T1.6 needs T12.2); T13 dapp-kit subpaths (T1.27 needs T13.5); T26 naming (T1.27 needs T26.2).
**External gates:** #534.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T1.1 `docs(sdk): ADR for chain plugins, plugin kit, settlement modes and v3 package layout` — 3 pts · W1
- [ ] T1.2 `refactor(sdk): chain plugin contract, ChainRegistry and lazy spoke services` — 5 pts · W3
- [ ] T1.3 `refactor(sdk): route chain capabilities and settlement through plugins` — 3 pts · W3
- [ ] T1.4 `refactor(sdk): address codecs through the chain registry` — 3 pts · W3
- [ ] T1.5 `build(sdk): enforce the chain import boundary; drop shared-barrel imports` — 2 pts · W3
- [ ] T1.6 `feat(sdk): plugins option, defaultPlugins() and experimental chains/* entries` — 2 pts · W3
- [ ] T1.7 `refactor(sdk): Bitcoin as a built-in plugin under src/chains/bitcoin` — 5 pts · W3
- [ ] T1.8 `refactor(sdk): Solana as a built-in plugin` — 2 pts · W3
- [ ] T1.9 `refactor(sdk): Stellar (incl. sponsoring) as a built-in plugin` — 3 pts · W3
- [ ] T1.10 `refactor(sdk): Sui as a built-in plugin` — 2 pts · W3
- [ ] T1.11 `refactor(sdk): ICON as a built-in plugin` — 2 pts · W3
- [ ] T1.12 `refactor(sdk): Injective as a built-in plugin` — 2 pts · W3
- [ ] T1.13 `refactor(sdk): Stacks as a built-in plugin` — 2 pts · W3
- [ ] T1.14 `refactor(sdk): NEAR as a built-in plugin` — 2 pts · W3
- [ ] T1.15 `refactor(sdk): Tron as a built-in plugin` — 1 pt · W3
- [ ] T1.16 `feat(sdk): XRP, Monad and Aleo as opt-in plugins (one PR each, by the PR authors)` — 8 pts · W3
- [ ] T1.17 `build: @sodax/chain-* package scaffold and publish wiring` — 2 pts · W6
- [ ] T1.18-25 `refactor!: extract <chain> spoke into @sodax/chain-<name> (8 chains)` — 10 pts · W6 · ✔
- [ ] T1.26 `refactor!: extract Tron (and XRP, Monad, Aleo if merged) into packages` — 4 pts · W6 · ✔
- [ ] T1.27 `feat(sdk)!: hub and EVM only by default; typed chain access via the plugin registry` — 3 pts · W6 · ✔
- [ ] T1.28 `feat: @sodax/chains-all` — 1 pt · W6
- [ ] T1.29 `chore(sdk)!: remove the transitional chains/* entries and non-EVM dependencies` — 1 pt · W6 · ✔
- [ ] T1.30 `chore: fold @sodax/libs into chain-stacks and chain-injective; stop publishing it` — 2 pts · W6

_v3 plan item T1 · score 10/10 · Must_
```

### T2 — unbundled ESM

(context) score 9/10 · Now · 4 sub-issues · 7 pts · waves W1 · detail: `research/` section for T2, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
build: unbundled ESM output and no import-time side effects
```
**Body**
```markdown
**Goal.** Tree-shaking works: importing one helper drops from 832 KB to under 1 KB gzip (probe: `SodaxError` 0.6 KB).

**Why it matters.** Tree-shaking finally works: importing one helper costs under 1 KB instead of 832 KB gzip. Every later size win builds on it.

**Plan.** `tsc` emits per-file ESM next to tsup's CJS twin (sdk, wallet-sdk-core, swaps-api, bridge-api); the bitcoin ECC setup becomes lazy; pure top-level helpers are annotated.

**Waits on:** T10 T10 (T2.1 needs T10.1); T11 CI gates (T2.1 needs T11.2).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T2.1 `build(sdk): emit unbundled ESM with tsc, keep tsup for CJS` — 3 pts · W1
- [ ] T2.2 `build(wallet-sdk-core,swaps-api,bridge-api): emit unbundled ESM with tsc` — 2 pts · W1
- [ ] T2.3 `fix(sdk,wallet-sdk-core): initialise the bitcoin ECC library lazily` — 1 pt · W1
- [ ] T2.4 `perf(sdk): mark pure top-level initializers` — 1 pt · W1

_v3 plan item T2 · score 9/10 · Now_
```

### T3 — wallet adapters

(context) score 9/10 · Must · 12 sub-issues · 38 pts · waves W1, W3, W6, L · detail: `research/` section for T3, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(wallet-sdk-react)!: chain adapters and per-provider state
```
**Body**
```markdown
**Goal.** `<SodaxWalletProvider adapters={[evm(), solana()]}>`; EVM-only apps load only EVM (today `SodaxWalletProvider` is 2.6 MB gzip, the EVM subpath alone 124 KB).

**Why it matters.** Apps pick wallets per chain (`adapters={[evm(), solana()]}`) and load only those; the wallet layer is 2.6 MB gzip today, the EVM part alone 124 KB. Per-provider state makes SSR, tests and multiple providers safe.

**Plan.** 2.x: per-provider zustand store and services, `adapters` prop (the old `config` keeps working, converted internally), one adapter factory per chain, Injective out of the EVM hooks. 3.0: remove `config`, the static registry, `getInstance()` and the global store; per-chain React wallet libs become optional peers.

**Waits on:** T1 chain plugins (T3.6 needs T1.17); T2 unbundled ESM (T3.10 needs T2.1); T4 ESM-only + peers (T3.6 needs T4.1); T6 server signers (T3.6 needs T6.4); T9 T9 (T3.3 needs T9.1); T22 wallet from context (T3.7 needs T22.1).
**External gates:** #534.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T3.1 `refactor(wallet-sdk-react): scope wallet stores to each SodaxWalletProvider` — 5 pts · W3
- [ ] T3.2 `refactor(wallet-sdk-react): create chain services per provider` — 3 pts · W3
- [ ] T3.3 `feat(wallet-sdk-react): add adapters prop and evm() adapter` — 3 pts · W3
- [ ] T3.4 `feat(wallet-sdk-react): per-chain adapter factories (one PR per chain)` — 3 pts · W3
- [ ] T3.5 `refactor(wallet-sdk-react): remove Injective imports from EVM hooks` — 2 pts · W3
- [ ] T3.6 `feat(wallet-sdk-react)!: drop legacy config, registry and singletons` — 5 pts · W6 · ✔
- [ ] T3.7 `feat(wallet-sdk-react): expose a WalletProviderSource for dapp-kit` — 1 pt · W3
- [ ] T3.10 `build(wallet-sdk-react): emit unbundled ESM with tsc (rewrite the @/ aliases)` — 3 pts · W1
- [ ] T3.8 `feat(wallet-sdk-react): headless createSodaxWallets() with actions; the object is the WalletProviderSource` — 3 pts · W3
- [ ] T3.9 `feat(wallet-sdk-react): lazy chain adapters — on-demand import, preload, reconnect persisted chains` — 5 pts · W3
- [ ] T3.11 `feat(wallet-sdk-react): SSR initial state from cookies for every chain` — 3 pts · L
- [ ] T3.12 `feat(wallet-sdk-react): mock adapters for tests` — 2 pts · L

_v3 plan item T3 · score 9/10 · Must_
```

### T4 — ESM-only + peers

(context) score 8/10 · Must · 3 sub-issues · 7 pts · waves W6 · detail: `research/` section for T4, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
build!: ESM-only packages; viem, wagmi and react-query as peers
```
**Body**
```markdown
**Goal.** One viem copy shared with the app (today 8 copies / 355 MB with the sdk) and no CJS twin.

**Why it matters.** Apps share one viem, wagmi and react-query copy with the SDK instead of up to 8 viem copies (355 MB), and can pick up security fixes without waiting for a SODAX release (e.g. the `ws` advisory in the pinned viem).

**Plan.** Drop the CJS build and `.d.cts`; exports with a `default` condition plus `typesVersions` (keeps `require(esm)` and `moduleResolution: node` consumers working); peers with ranges; CI tests the peer floor and the latest release.

**Waits on:** T2 unbundled ESM (T4.1 needs T2.1 +1); T7 wagmi v3 (T4.2 needs T7.1); T9 T9 (T4.2 needs T9.1); T10 T10 (T4.1 needs T10.1); T11 CI gates (T4.1 needs T11.1 +1); T12 core + feature entries (T4.1 needs T12.2); T13 dapp-kit subpaths (T4.1 needs T13.2).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T4.1 `build!: ship ESM only` — 3 pts · W6 · ✔
- [ ] T4.2 `build!: viem, wagmi and react-query as peer dependencies with ranges` — 2 pts · W6 · ✔
- [ ] T4.3 `ci: test peers at the floor and at the latest cooled-down release` — 2 pts · W6

_v3 plan item T4 · score 8/10 · Must_
```

### T5 — PancakeSwap

(context) score 8/10 · Must · 4 sub-issues · 10 pts · waves W1, W6 · detail: `research/` section for T5, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
refactor(sdk): replace the PancakeSwap SDKs with vendored CL math
```
**Body**
```markdown
**Goal.** Remove 131 MB / 20 advisories and six nested viem copies from installs, without changing behaviour.

**Why it matters.** Every install loses 131 MB, 20 advisories and six nested viem copies, which even apps that never touch the DEX pay today. The math stays identical, checked by property tests.

**Plan.** 2.x: vendor tick/liquidity math, Infinity pool-key codecs, calldata encoders and ABI fragments with property and golden tests; drop `v3-sdk` and `infinity-sdk`. 3.0: `ClPrice` / `ClToken` replace PancakeSwap's `Price` / `Token` types.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T5.1 `refactor(sdk): vendor concentrated-liquidity tick and liquidity math` — 3 pts · W1
- [ ] T5.2 `refactor(sdk): vendor Infinity codecs, encoders and ABI fragments; drop v3-sdk and infinity-sdk` — 3 pts · W1
- [ ] T5.3 `feat(sdk)!: replace PancakeSwap Price and Token with ClPrice and ClToken` — 3 pts · W6 · ✔
- [ ] T5.4 `test(sdk): freeze PancakeSwap equivalence tests into fixtures; drop the devDependencies` — 1 pt · W6

_v3 plan item T5 · score 8/10 · Must_
```

### T6 — server signers

(context) score 8/10 · Must · 7 sub-issues · 30 pts · waves W1, W6 · detail: `research/` section for T6, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(wallet-sdk-core)!: per-chain signers and a server-only entry
```
**Body**
```markdown
**Goal.** Private-key and mnemonic signing, and the libraries only it needs (near-api-js, ecpair, secp256k1, bip322-js), leave the browser path.

**Why it matters.** Browser bundles stop carrying private-key signing code and its libraries (near-api-js, ecpair, secp256k1, bip322-js), so there is less attack surface in the browser. Backends get one clear server entry.

**Plan.** 2.x: per-chain subpaths, `@sodax/wallet-sdk-core/server` with `PrivateKey<Chain>WalletProvider`, ICON browser signer without icon-sdk-js. 3.0: browser-only root classes; signers move next to their chain's spoke (`@sodax/chain-<name>/wallet` and `/server`); proposed: the base and EVM signers fold into `@sodax/sdk/wallet` and wallet-sdk-core becomes a shim.

**Waits on:** T1 chain plugins (T6.5.* needs T1.17 +1); T2 unbundled ESM (T6.3 needs T2.3); T4 ESM-only + peers (T6.4 needs T4.1); T8 lighter chain libs (T6.6 needs T8.1); T10 T10 (T6.4 needs T10.1); T23 signer-only wallets (T6.5.* needs T23.2 +1).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T6.1 `feat(wallet-sdk-core): per-chain subpath entries` — 2 pts · W1
- [ ] T6.2 `feat(wallet-sdk-core): server entry with private-key signers (EVM, Solana, Sui, Stellar, Stacks)` — 3 pts · W1
- [ ] T6.3 `feat(wallet-sdk-core): server signers for Bitcoin, Injective, NEAR, ICON (+Tron)` — 5 pts · W1
- [ ] T6.4 `feat(wallet-sdk-core)!: browser-only root signers` — 3 pts · W6 · ✔
- [ ] T6.5.* `refactor!: move <chain> signers into @sodax/chain-<name> (8 chains)` — 12 pts · W6 · ✔
- [ ] T6.6 `refactor(wallet-sdk-core): ICON browser signer without icon-sdk-js` — 2 pts · W1
- [ ] T6.7 `refactor(sdk,wallet-sdk-core)!: fold the wallet base and EVM signers into @sodax/sdk/wallet; wallet-sdk-core becomes a shim` — 3 pts · W6 · ✔

_v3 plan item T6 · score 8/10 · Must_
```

### T7 — wagmi v3

(context) score 8/10 · Must · 2 sub-issues · 5 pts · waves W1, W6 · detail: `research/` section for T7, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(wallet-sdk-react)!: wagmi v3
```
**Body**
```markdown
**Goal.** Connector SDKs become optional peers: the wagmi stack goes from 576 MB / 23 advisories (v2) to 102 MB / 0.

**Why it matters.** The WalletConnect, MetaMask and Coinbase SDKs become optional. The wagmi stack drops from 576 MB / 23 advisories to 102 MB / 0, the deprecated MetaMask SDK goes away, and apps stay on a supported wagmi.

**Plan.** Toolchain first (TypeScript 5.9, a current viem in the catalog), then wagmi v3 with wagmi, viem (≥ 2.43) and react-query as peers; the Privy connector's `withCapabilities` is the only compile break. First PR of the 3.0 window.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T7.0 `chore(repo): TypeScript 5.9 and a current viem in the catalog` — 2 pts · W1
- [ ] T7.1 `feat(wallet-sdk-react)!: wagmi v3 with wagmi, viem and react-query as peers` — 3 pts · W6 · ✔

_v3 plan item T7 · score 8/10 · Must_
```

### T8 — lighter chain libs

(context) score 7/10 · Now · 5 sub-issues · 10 pts · waves W1, W6 · detail: `research/` section for T8, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
refactor(sdk): lighter chain libraries — ICON over JSON-RPC, Stellar /minimal, Solana without Anchor
```
**Body**
```markdown
**Goal.** Drop icon-sdk-js reads, unused Stellar entry weight and Anchor's runtime IDL fetches (2 RPCs per Solana deposit, 1 per message).

**Why it matters.** ICON, Stellar and Solana users get smaller installs and fewer network calls (Solana: 2 RPCs fewer per deposit, 1 per message). It also fixes ICON receipts that are typed `bigint` but are BigNumber at runtime.

**Plan.** 2.x: a small ICON JSON-RPC client (also fixes receipts typed `bigint` that are BigNumber at runtime), `@stellar/stellar-sdk/minimal` (all 20 imported names verified), hand-written Borsh for the 3 Solana instructions with byte-for-byte tests. 3.0: remove the Anchor helpers and the dependencies.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T8.1 `refactor(sdk): ICON reads and raw-tx building over a JSON-RPC client` — 3 pts · W1
- [ ] T8.2 `refactor(wallet-sdk-core,wallet-sdk-react): ICON reads over JSON-RPC` — 2 pts · W1
- [ ] T8.3 `refactor: import @stellar/stellar-sdk from /minimal` — 1 pt · W1
- [ ] T8.4 `refactor(sdk): build Solana instructions without Anchor` — 3 pts · W1
- [ ] T8.5 `chore(sdk)!: remove the Anchor helpers; drop @coral-xyz/anchor, bn.js and icon-sdk-js` — 1 pt · W6 · ✔

_v3 plan item T8 · score 7/10 · Now_
```

### T11 — CI gates

(context) score 7/10 · Now · 4 sub-issues · 8 pts · waves W1 · detail: `research/` section for T11, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
ci: consumer install, bundle-size and audit gates
```
**Body**
```markdown
**Goal.** Every PR measures what consumers get — install footprint, bundle size per scenario, new advisories — so v3 gains are locked in and regressions fail CI.

**Why it matters.** Locks in every gain: a PR that grows the bundle or the install footprint, or adds advisories, fails CI, and every change shows before/after numbers. Without it, v3 savings regress quietly.

**Plan.** Pack the workspace tarballs, install them with npm into consumer fixtures, check footprint and OSV advisories, esbuild budgets per scenario, publint/attw, a Node engines-floor smoke. Lands first.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T11.1 `ci: consumer install job with footprint and dependency audit` — 3 pts · W1
- [ ] T11.2 `ci: bundle-size budgets per consumer scenario` — 3 pts · W1
- [ ] T11.3 `ci: publint and consistent attw rules` — 1 pt · W1
- [ ] T11.4 `ci: Node engines-floor smoke` — 1 pt · W1

_v3 plan item T11 · score 7/10 · Now_
```

### T12 — core + feature entries

(context) score 7/10 · Must · 2 sub-issues · 6 pts · waves W3 · detail: `research/` section for T12, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(sdk): createSodaxCore and per-feature entries
```
**Body**
```markdown
**Goal.** A swap-only app ships only swap (EVM swap-only what-if: 169 KB gzip), while the `Sodax` facade stays unchanged.

**Why it matters.** Apps import only the features they use (`@sodax/sdk/swap`). An EVM swap-only app is about 169 KB gzip, against 1.27 MB for `new Sodax()` today, and the familiar `Sodax` class keeps working.

**Plan.** `createSodaxCore()` (config, hub, spoke, backend API, registry) and `@sodax/sdk/<feature>` entries with `createX(core)` factories; needs the unbundled ESM build first so root and subpaths share one copy.

**Waits on:** T1 chain plugins (T12.1 needs T1.2); T2 unbundled ESM (T12.2 needs T2.1).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T12.1 `feat(sdk): createSodaxCore; the Sodax facade built on it` — 3 pts · W3
- [ ] T12.2 `feat(sdk): per-feature subpath entries with createX(core) factories` — 3 pts · W3

_v3 plan item T12 · score 7/10 · Must_
```

### T13 — dapp-kit subpaths

(context) score 7/10 · Must · 6 sub-issues · 13 pts · waves W1, W2, W3, W6 · detail: `research/` section for T13, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(dapp-kit)!: per-feature subpaths; the sdk becomes a peer
```
**Body**
```markdown
**Goal.** dapp-kit stops re-exporting the whole sdk and gains per-feature, client-marked entries.

**Why it matters.** React apps load only the hook groups they use, and no longer get the whole SDK through dapp-kit's re-export; Next.js apps get correct `'use client'` boundaries.

**Plan.** 2.x: tsc build, per-feature subpaths with `'use client'`, feature-entry imports, chain hooks via `getSpokeService`. 3.0: drop `export * from '@sodax/sdk'`, sdk as a peer, chain-specific hooks under per-chain subpaths.

**Waits on:** T1 chain plugins (T13.5 needs T1.2 +1); T2 unbundled ESM (T13.1 needs T2.1); T4 ESM-only + peers (T13.3 needs T4.2); T12 core + feature entries (T13.4 needs T12.2); T17 migration (T13.3 needs T17.1 +1); T26 naming (T13.4 needs T26.2); T27 AI channels (T13.3 needs T27.1).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T13.1 `build(dapp-kit): emit unbundled ESM with tsc` — 2 pts · W1
- [ ] T13.2 `feat(dapp-kit): per-feature subpath entries and 'use client' entry modules` — 3 pts · W2
- [ ] T13.3 `feat(dapp-kit)!: stop re-exporting @sodax/sdk; the sdk becomes a peer` — 2 pts · W6 · ✔
- [ ] T13.4 `refactor(dapp-kit): import sdk feature entries; accept a core instance` — 2 pts · W3
- [ ] T13.5 `refactor(dapp-kit): chain-specific hooks through getSpokeService` — 2 pts · W3
- [ ] T13.10 `feat(dapp-kit)!: chain-specific hooks under per-chain subpaths with @sodax/chain-<name> as optional peers` — 2 pts · W6 · ✔

_v3 plan item T13 · score 7/10 · Must_
```

### T14 — types split

(context) score 7/10 · Now · 4 sub-issues · 7 pts · waves W1, W3 · detail: `research/` section for T14, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
perf(types): split @sodax/types into light entries
```
**Body**
```markdown
**Goal.** `getChainType` drops from 34 KB to 2 KB gzip, and chain plugins import light entries instead of the token lists. Non-breaking.

**Why it matters.** Code that only needs chain keys and helpers (backends, light clients, the API packages) stops paying for the token list: `getChainType` goes from 34 KB to 2 KB gzip. Non-breaking.

**Plan.** `sideEffects: false`; split token-free chain info from token-bearing config; `./chains`, `./tokens`, `./config` subpaths; the root stays an aggregator. Lands right after #534 with a short freeze on `types/src/chains/*`.

**External gates:** #534.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T14.1 `perf(types): mark @sodax/types side-effect free` — 1 pt · W1
- [ ] T14.2 `refactor(types): split token-free chain info from token-bearing config` — 3 pts · W3
- [ ] T14.3 `feat(types): light subpath entries` — 2 pts · W3
- [ ] T14.4 `refactor(swaps-api,bridge-api): import chain helpers from @sodax/types/chains` — 1 pt · W3

_v3 plan item T14 · score 7/10 · Now_
```

### T15 — polyfill-free core

(context) score 6/10 · Must · 3 sub-issues · 3 pts · waves W1, W3, W6 · detail: `research/` section for T15, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
refactor(sdk): polyfill-free core
```
**Body**
```markdown
**Goal.** No `Buffer` in the core, so it runs in Workers, React Native, Bun and Deno without polyfill setup.

**Why it matters.** The SDK core runs in Cloudflare Workers, React Native, Bun and Deno without any Buffer or crypto polyfill setup.

**Plan.** Replace the remaining `Buffer` uses with viem byte helpers (part now, the rest after the codecs move into plugins); a lint gate in 3.0.

**Waits on:** T1 chain plugins (T15.3 needs T1.4 +1); T11 CI gates (T15.2 needs T11.1).
**External gates:** #534.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T15.1 `refactor(sdk): replace Buffer in selectSolvedIntentPacket with viem byte helpers` — 1 pt · W1
- [ ] T15.3 `refactor(sdk): replace Buffer in SpokeService and the remaining codec paths` — 1 pt · W3
- [ ] T15.2 `ci(sdk): forbid Buffer in the core` — 1 pt · W6

_v3 plan item T15 · score 6/10 · Must_
```

### T16 — skills v3

(context) score 6/10 · Must · 4 sub-issues · 14 pts · waves G, W7, W8 · detail: `research/` section for T16, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
docs(skills): skills for v3
```
**Body**
```markdown
**Goal.** Agents and the skills CLI give correct v3 instructions, and 2.x users keep getting 2.x ones.

**Why it matters.** AI agents and the skills CLI write correct v3 code, while 2.x users keep getting 2.x guidance instead of a mix.

**Plan.** At window start: archive the v1→v2 trees, parameterise the check scripts, add a v2→v3 mode. After the API freeze: migration knowledge per package and integration content on v3 idioms; then www.sodax.com/skill.md.

**Waits on:** T1 chain plugins (T16.2 needs T1.29); T3 wallet adapters (T16.2 needs T3.6); T6 server signers (T16.2 needs T6.4); T13 dapp-kit subpaths (T16.2 needs T13.3 +1); T17 migration (T16.2 needs T17.2 +2); T21 query builders (T16.3 needs T21.2); T22 wallet from context (T16.2 needs T22.6 +1); T26 naming (T16.2 needs T26.3); T27 AI channels (T16.1 needs T27.1 +2).
**External gates:** cross-repo parent issue.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T16.1 `chore(skills): archive the v1→v2 trees; add the v2→v3 mode` — 3 pts · G
- [ ] T16.2 `docs(skills): v2→v3 migration knowledge for every package` — 5 pts · W7
- [ ] T16.3 `docs(skills): integration knowledge on v3 idioms` — 5 pts · W7
- [ ] T16.4 `(sodax-frontend) docs: www.sodax.com/skill.md for v3` — 1 pt · W8

_v3 plan item T16 · score 6/10 · Must_
```

### T17 — migration

(context) score 6/10 · Must · 9 sub-issues · 28 pts · waves W1, W2, W3, G, W6, W7, W8 · detail: `research/` section for T17, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat: v2 → v3 migration — codemods, docs, apps and downstream repos
```
**Body**
```markdown
**Goal.** Users migrate with a codemod instead of reading a diff; in-repo apps are migrated before the breaking window so breaking PRs stay small.

**Why it matters.** Integrators upgrade by running a codemod instead of reading a diff. In-repo apps migrate early, so breaking PRs stay small, and sodax-frontend, sodax-backend and intents-whitelabel each get a tracked upgrade.

**Plan.** `@sodax/codemod` (ts-morph) ships in 2.x with forward-compatible transforms (dapp-kit SDK imports, renames, plugins, adapters, server signers), then the 3.0-only rewrites; migration guide after the API freeze; sodax-frontend, sodax-backend and intents-whitelabel after rc.1 (sub-issues in those repos).

**Waits on:** A1 release tooling (T17.1 needs A1.2); T1 chain plugins (T17.3 needs T1.6 +2); T3 wallet adapters (T17.3 needs T3.3 +1); T6 server signers (T17.3 needs T6.2 +1); T7 wagmi v3 (T17.7 needs T7.1); T13 dapp-kit subpaths (T17.5 needs T13.3); T22 wallet from context (T17.5 needs T22.6); T26 naming (T17.2 needs T26.1 +1); T27 AI channels (T17.5 needs T27.1).
**External gates:** #501, #512, cross-repo parent issue.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T17.1 `feat(codemod): @sodax/codemod CLI with the dapp-kit SDK-imports transform` — 3 pts · W1
- [ ] T17.2 `feat(codemod): dapp-kit rename transform and report-only rules` — 2 pts · W2
- [ ] T17.3 `feat(codemod): plugins registration, wallet adapters, server signer imports` — 3 pts · W3
- [ ] T17.7 `feat(codemod): 3.0-only rewrites — chain packages, wagmi v3 names, removed APIs` — 2 pts · W6
- [ ] T17.4 `chore(apps): migrate demo, playground and examples with the forward-compatible codemods` — 2 pts · G
- [ ] T17.5 `docs: v2→v3 migration guide and v3 setup, chain and wallet pages` — 5 pts · W7
- [ ] T17.6a `(sodax-frontend) chore: migrate to @sodax/* 3.0` — 5 pts · W8
- [ ] T17.6b `(sodax-backend) chore: migrate to @sodax/sdk 3.0` — 3 pts · W8
- [ ] T17.6c `(intents-whitelabel) chore: migrate to @sodax/* 3.0` — 3 pts · W8

_v3 plan item T17 · score 6/10 · Must_
```

### T18 — lifecycle

(context) score 6/10 · Should · 7 sub-issues · 25 pts · waves W3, W5 · detail: `research/` section for T18, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(dapp-kit): lifecycle hooks for every multi-step flow
```
**Body**
```markdown
**Goal.** Every multi-step flow shows the same idle → submitting → pending → settled states and can resume after a reload.

**Why it matters.** Money market, staking, migration and DEX flows get the same progress states as swap, bridge and leverage-yield, and recover after a page reload or a relay timeout.

**Plan.** A public relay-delivery status by source tx (intent and MPC relay); one lifecycle core with resume extracted from the swap lifecycle (inside the bridge-lifecycle work); `useRelayStatus`; money-market, staking, migration and DEX lifecycles, each with a demo page. No SDK-level engine.

**External gates:** #523, #529, #531, #534.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T18.1 `feat(sdk): public relay delivery status by source tx (intent and MPC relay)` — 2 pts · W3
- [ ] T18.2 `refactor(dapp-kit): one lifecycle core for every flow, with resume` — 3 pts · W5
- [ ] T18.3 `feat(dapp-kit): useRelayStatus` — 2 pts · W5
- [ ] T18.4 `feat(dapp-kit,demo): useMoneyMarketLifecycle` — 5 pts · W5
- [ ] T18.5 `feat(dapp-kit,demo): useStakingLifecycle` — 5 pts · W5
- [ ] T18.6 `feat(dapp-kit,demo): useMigrationLifecycle` — 3 pts · W5
- [ ] T18.7 `feat(dapp-kit,demo): useDexLifecycle` — 5 pts · W5

_v3 plan item T18 · score 6/10 · Should_
```

### T19 — errors + signals

(context) score 6/10 · Should · 6 sub-issues · 17 pts · waves W1, W2, W4 · detail: `research/` section for T19, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(sdk): uniform API errors, AbortSignal and request ids
```
**Body**
```markdown
**Goal.** API failures carry a transport code and a retryable flag; cancelled quotes and waits stop work without hiding a broadcast; support can trace a user action across SDK and backend.

**Why it matters.** Apps can tell retryable API errors from fatal ones and cancel stale quotes and polls, which saves requests. Support can follow one user action from the SDK into backend logs by request id.

**Plan.** Uniform error context and `isRetryableError`; `signal` through the HTTP layers, wait loops and action params (abort after broadcast still returns `srcTxHash`); `x-request-id` to backend and solver hosts, never the relay (its CORS rejects it); backend log capture.

**External gates:** #483, #509, #511, #512, #523, cross-repo parent issue.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T19.1 `feat(sdk): uniform transport context and retryability on API errors` — 3 pts · W4
- [ ] T19.2 `feat(swaps-api,bridge-api,sdk,dapp-kit): AbortSignal on API calls` — 3 pts · W2
- [ ] T19.3 `feat(sdk): AbortSignal in relay, status and spoke wait loops` — 3 pts · W2
- [ ] T19.4 `feat(types,sdk): signal on action params with post-broadcast-safe semantics` — 5 pts · W2
- [ ] T19.5 `feat(sdk,swaps-api,bridge-api): x-request-id on backend API calls (never the relay)` — 2 pts · W1
- [ ] T19.6 `(sodax-backend) feat: capture x-request-id in request logs` — 1 pt · W2

_v3 plan item T19 · score 6/10 · Should_
```

### T20 — remote config

(context) score 5/10 · Should · 3 sub-issues · 7 pts · waves W3, W6 · detail: `research/` section for T20, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(sdk): remote config v2
```
**Body**
```markdown
**Goal.** Token and chain lists can change without an SDK release, and stop living in every bundle.

**Why it matters.** New tokens and chains go live without an SDK release, and token lists leave the bundle, if product approves the trust model.

**Plan.** 2.x: opt-in fetch of `/v2/be/config/all` with version gate, timeout, cache and bundled fallback; background refresh in `SodaxProvider`. 3.0: default-on only if product agrees on the trust boundary (no remote contract addresses or API URLs) and the version policy.

**Waits on:** T14 types split (T20.3 needs T14.3).
**External gates:** product decision.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T20.1 `feat(sdk): fetch config v2 in ConfigService.initialize() with version gate, timeout and fallback` — 3 pts · W3
- [ ] T20.2 `feat(dapp-kit): SodaxProvider refreshes remote config in the background` — 1 pt · W3
- [ ] T20.3 `feat(sdk)!: remote config on by default; bundled token lists become an opt-in fallback` — 3 pts · W6 · ✔

_v3 plan item T20 · score 5/10 · Should_
```

### T21 — query builders

(context) score 5/10 · Should · 5 sub-issues · 13 pts · waves W1, W2, W5 · detail: `research/` section for T21, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(dapp-kit): query key factory and queryOptions builders
```
**Body**
```markdown
**Goal.** Prefetch, SSR hydration and Suspense for every query, with the key drift fixed and today's key shapes kept.

**Why it matters.** Apps can prefetch, server-render and suspend on SODAX data, and invalidate caches reliably with exported keys. The stale-allowance key bug is fixed along the way.

**Plan.** A key factory that reproduces today's shapes (sodax-frontend hand-writes 10 keys); `get*QueryOptions` builders for all 128 queries, split by hook folder; optional `queryKeyScope` on `SodaxProvider`.

**Waits on:** T28 @sodax/api (T21.4 needs T28.5 +1).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T21.1 `feat(dapp-kit): query key factory and server-safe query entry` — 3 pts · W1
- [ ] T21.2 `feat(dapp-kit): queryOptions builders for swap, shared, sponsoring, mm, staking, migration` — 3 pts · W2
- [ ] T21.3 `feat(dapp-kit): queryOptions builders for bridge, dex, leverage yield, partner, recovery, bitcoin` — 3 pts · W5
- [ ] T21.4 `feat(dapp-kit): queryOptions builders for the API-lane hooks` — 3 pts · W5
- [ ] T21.5 `feat(dapp-kit): optional queryKeyScope on SodaxProvider` — 1 pt · W2

_v3 plan item T21 · score 5/10 · Should_
```

### T22 — wallet from context

(context) score 5/10 · Should · 5 sub-issues · 14 pts · waves W2, W4, W5, W6 · detail: `research/` section for T22, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(dapp-kit): wallet provider from context; one error style
```
**Body**
```markdown
**Goal.** Hooks stop taking a `walletProvider` argument everywhere (55 hook files today) and every hook error is a `SodaxError`.

**Why it matters.** Less boilerplate: hooks find the connected wallet themselves instead of every call passing `walletProvider` (55 hook files take it today), and apps handle one error type everywhere.

**Plan.** A `WalletProviderSource` interface in `@sodax/types` (wallet-sdk-react produces it, dapp-kit consumes it, neither imports the other); optional argument plus context in 2.x; guard throws become `VALIDATION_FAILED`; in 3.0 the six Result-as-data queries throw.

**Waits on:** T17 migration (T22.6 needs T17.2); T28 @sodax/api (T22.2 needs T28.5 +1).
**External gates:** #483, #529, #531, #532.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T22.1 `feat(types,dapp-kit): WalletProviderSource contract and SodaxProvider wallets prop` — 2 pts · W2
- [ ] T22.2 `feat(dapp-kit): walletProvider from context in swap, bridge, leverage-yield and API-lane hooks` — 3 pts · W5
- [ ] T22.3 `feat(dapp-kit): walletProvider from context in mm, staking, migration, dex, partner, recovery, bitcoin hooks` — 3 pts · W2
- [ ] T22.5 `feat(dapp-kit): every hook error is a SodaxError; typed errors per hook` — 3 pts · W4
- [ ] T22.6 `feat(dapp-kit)!: status and quote queries throw instead of returning Result` — 3 pts · W6 · ✔

_v3 plan item T22 · score 5/10 · Should_
```

### T23 — signer-only wallets

(context) score 5/10 · Should · 5 sub-issues · 9 pts · waves W1, W2, W6 · detail: `research/` section for T23, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
refactor(types,wallet-sdk-core)!: signer-only wallet interfaces; dedupe
```
**Body**
```markdown
**Goal.** Wallet interfaces only sign and send; reads move to the chain spokes. One ICONEX queue restores WALLET-L-1 across modules.

**Why it matters.** Custom wallets (MPC, Safe, embedded) implement a few sign/send methods instead of RPC reads. One ICONEX queue restores the WALLET-L-1 audit fix across modules.

**Plan.** 2.x: route the 3 remaining wallet reads through the spoke, share the EVM chain definitions, one ICONEX relay queue, `isNativeToken` delegates to `@sodax/types`. 3.0: remove the zero-caller read methods; the EVM receipt wait stays optional.

**External gates:** #509, #512, #523.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T23.1 `refactor(sdk,dapp-kit): wait for receipts through the spoke` — 2 pts · W2
- [ ] T23.2 `feat(types,wallet-sdk-core)!: signer-only wallet interfaces` — 3 pts · W6 · ✔
- [ ] T23.3 `refactor(wallet-sdk-react): use wallet-sdk-core EVM chain definitions` — 1 pt · W1
- [ ] T23.4 `fix(wallet-sdk-core,wallet-sdk-react): one ICONEX relay queue` — 2 pts · W1
- [ ] T23.5 `refactor(wallet-sdk-react): isNativeToken delegates to @sodax/types` — 1 pt · W1

_v3 plan item T23 · score 5/10 · Should_
```

### T24 — integration docs

(context) score 5/10 · Should · 3 sub-issues · 4 pts · waves W1, W3, W5 · detail: `research/` section for T24, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
docs: integration modes and API mode
```
**Body**
```markdown
**Goal.** Integrators can choose between SDK, API mode and raw transactions — and know exactly which packages to install.

**Why it matters.** Partners pick the right integration (SDK, API mode or raw transactions) and install exactly the packages it needs.

**Plan.** An integration-modes page (SDK orchestrator vs API mode vs `raw: true`), updated for `@sodax/api`; proposed: an install matrix per persona.

**Waits on:** T28 @sodax/api (T24.2 needs T28.1 +1).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T24.1 `docs: integration modes — SDK, API mode, raw transactions` — 2 pts · W1
- [ ] T24.2 `docs: API mode on @sodax/api` — 1 pt · W3
- [ ] T24.3 `docs: install matrix — which packages each integration needs` — 1 pt · W5

_v3 plan item T24 · score 5/10 · Should_
```

### T26 — naming

(context) score 4/10 · Should · 3 sub-issues · 5 pts · waves W1, W2, W6 · detail: `research/` section for T26, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(dapp-kit)!: consistent hook names; SodaxProvider accepts an instance
```
**Body**
```markdown
**Goal.** Predictable hook and parameter names (`useSwapQuote`, `chainKey`, `address`), and one SDK instance shared between app and provider.

**Why it matters.** Predictable hook and parameter names make the API easier to learn and easier for AI agents to use. App and provider share one SDK instance (no second `new Sodax()`).

**Plan.** 2.x: new names with deprecated aliases (codemod table) and `SodaxProvider sodax={…}`. 3.0: remove the aliases.

**Waits on:** T17 migration (T26.3 needs T17.2 +1).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T26.1 `feat(dapp-kit): consistent hook and param names with deprecated aliases` — 3 pts · W2
- [ ] T26.2 `feat(dapp-kit): SodaxProvider accepts a sodax instance` — 1 pt · W1
- [ ] T26.3 `feat(dapp-kit)!: remove deprecated hook aliases, param names and positional getBalancesQueryOptions` — 1 pt · W6 · ✔

_v3 plan item T26 · score 4/10 · Should_
```

### T27 — AI channels

(context) score 4/10 · Should · 2 sub-issues · 5 pts · waves W2, G · detail: `research/` section for T27, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
docs(ai): pin docs and AI channels to release; generated hook index
```
**Body**
```markdown
**Goal.** 2.x users stop receiving `main` (v3) instructions from docs.sodax.com, the skills CLI, the Claude plugin and context7; hand-kept indexes stop drifting.

**Why it matters.** Docs and AI tools serve the released version, not `main`, so 2.x users never get v3 instructions during the breaking window. The generated indexes stop drifting.

**Plan.** Pin every channel to the `release` branch before the breaking window (team decision: docs no longer go live on merge); generate the hook index and query-key table with ts-morph, checked in `check:ai`.

**Waits on:** T17 migration (T27.2 needs T17.1); T21 query builders (T27.2 needs T21.1).
**External gates:** team decision.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T27.1 `docs(ai): pin docs and AI channels to the release branch` — 2 pts · G
- [ ] T27.2 `feat(skills): generate the hook index and query-key table` — 3 pts · W2

_v3 plan item T27 · score 4/10 · Should_
```

### T28 — @sodax/api

(context) score 4/10 · Should · 8 sub-issues · 25 pts · waves W3, W4, W5, W6 · detail: `research/` section for T28, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(api): one @sodax/api package
```
**Body**
```markdown
**Goal.** One transport and one error type for the SODAX HTTP APIs, usable without the SDK.

**Why it matters.** One light package for every SODAX HTTP API, with one transport and one error type, usable without the SDK. The duplicated HTTP stacks go away. Proposed: API-only React apps get hooks from `@sodax/api/react` and stop installing the SDK (21 MB instead of ≥ 777 MB).

**Plan.** Merge swaps-api and bridge-api into `@sodax/api` (old packages become re-export shims), move the sdk's backend, leverage-yield and sponsoring calls onto it; proposed: leverage-yield and backend modules as standalone clients, and sdk-free React hooks at `@sodax/api/react` (react and react-query as optional peers).

**Waits on:** A1 release tooling (T28.1 needs A1.2 +1); T2 unbundled ESM (T28.1 needs T2.2); T10 T10 (T28.1 needs T10.1); T11 CI gates (T28.1 needs T11.1 +1); T19 errors + signals (T28.1 needs T19.2 +1); T25 T25 (T28.1 needs T25.1).
**External gates:** #511, #529, #532.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T28.1 `feat(api): @sodax/api with swaps and bridge modules; old packages become shims` — 5 pts · W3
- [ ] T28.2 `refactor(sdk): backend, leverage-yield and sponsoring calls on @sodax/api` — 3 pts · W4
- [ ] T28.3 `chore: sdk and dapp-kit depend on @sodax/api; deprecate the shims` — 1 pt · W6
- [ ] T28.4 `feat(api): leverage-yield and backend modules as standalone clients; the sdk wraps them` — 5 pts · W3
- [ ] T28.5 `feat(api): sdk-free React hooks at @sodax/api/react — provider and swaps hooks` — 3 pts · W5
- [ ] T28.6 `feat(api): bridge and backend hooks in @sodax/api/react` — 3 pts · W5
- [ ] T28.7 `feat(api): leverage-yield hooks in @sodax/api/react` — 3 pts · W5
- [ ] T28.8 `ci: @sodax/api React isolation gate and per-persona consumer install fixtures` — 2 pts · W5

_v3 plan item T28 · score 4/10 · Should_
```

### T31 — later bundle

(context) score 3/10 · Later · 6 sub-issues · 28 pts · waves L · detail: `research/` section for T31, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat: later — one-signature batching for the remaining features, testing entry, Solana on Kit
```
**Body**
```markdown
**Goal.** Three independent 3.x items grouped from the ranked list; split into separate parents when scheduled.

**Why it matters.** One wallet prompt (approve + action) for the remaining features; typed test fakes for integrators; a lighter, maintained Solana stack (web3.js v1 receives critical fixes only).

**Plan.** EIP-5792 approve + action for money market, staking, migration, DEX and partner; `@sodax/sdk/testing` with typed fake wallet providers and API mocks; the Solana plugin on `@solana/kit` + Codama with the wallet on Wallet Standard.

**Waits on:** T1 chain plugins (T31.5 needs T1.18-25 +1); T8 lighter chain libs (T31.5 needs T8.4); T23 signer-only wallets (T31.4 needs T23.2).
**External gates:** #511, #533.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T31.5 `feat(chain-solana): spoke on @solana/kit with Codama clients` — 8 pts · L
- [ ] T31.6 `feat(wallet-sdk-react): Solana on Wallet Standard / @solana/react` — 8 pts · L
- [ ] T31.1 `feat(sdk,dapp-kit): one-signature approve + supply/repay for money market` — 3 pts · L
- [ ] T31.2 `feat(sdk,dapp-kit): one-signature approve + stake/unstake` — 3 pts · L
- [ ] T31.3 `feat(sdk,dapp-kit): one-signature approvals for migration, dex deposit and partner` — 3 pts · L
- [ ] T31.4 `feat(sdk): testing entry with typed fake wallet providers and API mocks` — 3 pts · L

_v3 plan item T31 · score 3/10 · Later_
```

### T33 — MCP schemas

(context) score 3/10 · Later · 2 sub-issues · 8 pts · waves L · detail: `research/` section for T33, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(api): MCP-ready tool schemas
```
**Body**
```markdown
**Goal.** The existing SODAX MCP servers get build-unsigned-tx tools from one source of truth, without a third server.

**Why it matters.** AI agents build SODAX transactions through the existing MCP servers from one schema source, and never hold keys.

**Plan.** valibot request schemas → JSON Schema exported from `@sodax/api/tools`; a dedicated `@sodax/mcp` only if the Builders MCP cannot host the tools.

**Waits on:** T28 @sodax/api (T33.1 needs T28.1).
**External gates:** owner decision.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T33.1 `feat(api): MCP-ready tool schemas from the valibot request schemas` — 3 pts · L
- [ ] T33.2 `feat: @sodax/mcp — only if the Builders MCP cannot host build-tx tools` — 5 pts · L

_v3 plan item T33 · score 3/10 · Later_
```

### T34 — drift gate

(context) score 3/10 · Later · 2 sub-issues · 4 pts · waves L · detail: `research/` section for T34, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
ci: OpenAPI drift gate
```
**Body**
```markdown
**Goal.** Client schemas cannot silently drift from the backend's OpenAPI specs.

**Why it matters.** Backend API changes that would silently break client parsing get caught before users hit them.

**Plan.** Compare valibot schemas with the live swaps and leverage-yield specs on a schedule and on API PRs; sodax-backend serves the bridge spec under a routable path.

**Waits on:** T28 @sodax/api (T34.1 needs T28.1).
**External gates:** cross-repo parent issue.

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T34.1 `ci: drift gate between valibot schemas and the live OpenAPI specs` — 3 pts · L
- [ ] T34.2 `(sodax-backend) fix(bridge-api): serve the OpenAPI spec under /bridge/docs` — 1 pt · L

_v3 plan item T34 · score 3/10 · Later_
```

### T35 — polling + transport

(context) score 2/10 · Later · 2 sub-issues · 7 pts · waves L · detail: `research/` section for T35, order and conflicts: `plan-v3-order.md` §3–§5

**Title**
```text
feat(dapp-kit): polling presets and a transport option
```
**Body**
```markdown
**Goal.** One place to tune polling, and quote/swap/status hooks that can run over the API instead of the SDK.

**Why it matters.** Polling load is tuned in one place, and quote, swap and status hooks can run over the API with the same hook API.

**Plan.** Named polling presets with provider overrides; a `transport: 'sdk' | 'api'` option on the five high-level swap hooks.

**Waits on:** T21 query builders (T35.1 needs T21.2 +3); T22 wallet from context (T35.2 needs T22.6); T28 @sodax/api (T35.2 needs T28.1).

**Sub-issues** (one PR each; ✔ = breaking, lands in the 3.0 window):
- [ ] T35.1 `feat(dapp-kit): named polling presets with provider overrides` — 2 pts · L
- [ ] T35.2 `feat(dapp-kit): transport option on the five high-level swap hooks` — 5 pts · L

_v3 plan item T35 · score 2/10 · Later_
```
