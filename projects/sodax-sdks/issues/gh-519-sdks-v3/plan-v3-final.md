---
type: plan
repo: sodax-sdks
github: 519
status: Final draft — pending team decisions D1-D19 (research/f-deep/README.md)
updated: 2026-10-20
tags: [v3, final-plan, roadmap, packages, waves, decisions]
related_issues: [gh-302, gh-456, gh-505, gh-507, gh-529, gh-531, gh-532, gh-533]
---

# GH-519 · SDKs v3 — final plan

This is the single entry point for the v3 plan. The detail lives in these files:

| File | What it holds |
| --- | --- |
| `plan-v3-packages.md` | The package map and its rules |
| `plan-v3-order.md` | Waves, hot files, the verification log, feasibility |
| `plan-v3-subissues.md` | All 162 sub-issues |
| `parent-issues.md` | Paste-ready GitHub drafts |
| `client-usage.md` | Client code before and after, per issue |
| `research/*` | The approach for each item, with `path:line` evidence at cc053fef |

## 0. Update (2026-10-20)

This plan predates the deep dive. Where they differ, these files win:

| File | What it settles |
| --- | --- |
| `drafts/519-bullets.md` | The 38 #519 bullets, reviewed twice. `drafts/519-bullets-explained.md` adds a Why and a How to each |
| `research/f-deep/README.md` | Tiers for the 39 deep-dive IDs, 22 fix-now defects, waves 0–4, team decisions D1–D19 |
| `research/g-chain-auto-tests.md` | Automatic per-chain testing (x-6): layers L0–L5 and phases 0–5 |

Changes to this plan:
- **Decisions.** D1–D19 in the README replace §6. Seven of them block four IDs each:
  - D1: chain placement;
  - D3: where wallet-sdk-core lives;
  - D4: chain clients for apps without the sdk;
  - D6: subpaths in 2.x;
  - D7: the error model;
  - D10: the docs channel;
  - D11: 2.x maintenance.
- **Settled by the user (2026-10-20).** Config and token lists come only from SDK releases (D8's data
  source), because everything goes through the SDK.
  - So **sdk-9 is dropped** from the v3 list. Remote config stays an opt-in 2.x feature inside #543,
    which settles its own version rule and trusted fields.
  - Nothing turns it on by default in 3.0.
- **Order** (see "Proposed order" in the README) [judgement]:
  - sdk-5's 2.x part goes before sdk-1;
  - wsc-1's Injective split moves to W1;
  - api-4 moves to W2, because of the live `/be` drift.
- **Scope:**
  - sk-4 and sdk-9 are dropped;
  - dk-7 is polling presets only;
  - sdk-10 is optional;
  - wsr-5 waits for the team (D17);
  - wsr-1 no longer promises lazy-loaded chain providers;
  - wsc-2 stays neutral on D4;
  - wsc-3 proposes a slim wallet-sdk-core (D3).
- **sdk-4 (T5).** Port from verified MIT-licensed implementations, or write the code from the contract
  specs. Do not vendor from the PancakeSwap dist: its `LICENSE` is GPL-3.0.
- **sdk-7 (T15).**
  - `@sodax/libs` keeps its job. Its browser build maps `crypto` to a shim that throws if called,
    behind a `browser` export condition. The Node build stays as it is.
  - A probe found 9 of 9 Stacks outputs byte-identical between the two builds (`research/f-deep/deps.md`
    § Follow-up).
- **New x-6: automatic per-chain testing.** It was not scored with the rubric.
  - **Into W1:**
    - phase 0: e2e nightly on main, fix Stellar HBAR, replace the Polygon RPC, fix the 4 token reads;
    - phase 1: chain-health checks;
    - phase 2: golden vectors, and a required check on main.
  - **Into W2:** phase 3, per-chain simulation.
  - **Into W3:** phase 4, backend per-chain alerts (cross-repo).
  - **Waits for a team decision:** phase 5, funded canaries.
- **Fix now.** The README's 22 defects, plus the live e2e suite, which has been red behind a green check
  since 2026-08-20.

## 1. Outcome

**Lightweight first.** Today's numbers are measured on published 2.2.0. v3 numbers are measured
what-ifs unless marked as estimates.

| | Today | v3 |
| --- | --- | --- |
| Minimal EVM-only swap dapp (gzip) | 2,994 KB | ~186 KB (582 KB with WalletConnect) |
| `npm i @sodax/sdk` | 777 MB · 35 advisories | ~85 MB · 0 (5 MB if the app already has viem) |
| `npm i @sodax/dapp-kit @sodax/wallet-sdk-react` | 1.8 GB · 81 advisories | 108 MB · 0 |
| Node `import` + `new Sodax()` | 888 ms · 268 MB RSS | ~92 ms · 74 MB |
| Importing one helper | 832 KB | under 1 KB |
| API-only React app install | ≥ 777 MB (through dapp-kit) | 21 MB (measured) |
| All-chain app, first-load wallet JS | 2.6 MB | ≈ 124 KB with lazy adapters (estimate, not prototyped) |

**Beyond weight**
- **DX:**
  - the wallet comes from context;
  - query builders and keys;
  - consistent names;
  - per-feature entries.
- **Robustness:**
  - one error shape;
  - `AbortSignal` throughout;
  - request ids;
  - lifecycle and resume for every flow.
- **Migration:** a codemod ships in 2.x, and in-repo apps are migrated before the breaking window.
- **AI:** skills, docs and context7 are pinned to the released version; MCP-ready tool schemas.

## 2. Packages (v3)

| Package | Role | Status |
| --- | --- | --- |
| `@sodax/types` | Shared vocabulary; light subpaths `./chains`, `./tokens`, `./config` | keep |
| `@sodax/api` | Every HTTP API, viem-free: `./swaps`, `./bridge`, `./leverage-yield`, `./backend`, `./react` (sdk-free hooks), `./tools` | new; merges swaps-api and bridge-api |
| `@sodax/sdk` | Hub + EVM core, features as subpaths, plugin kit, wallet base and EVM signers (`./wallet`, `./wallet/server`), the `Sodax` facade | keep, slimmed |
| `@sodax/chain-<name>` | One non-EVM chain each: `.` plugin, `./wallet`, `./server` | new (~9) |
| `@sodax/chains-all` | Every chain, for backends and all-chain apps | new |
| `@sodax/wallet-sdk-react` | Headless `createSodaxWallets`, hooks, lazy per-chain adapters, `./privy` | keep |
| `@sodax/dapp-kit` | SDK hooks, per-feature and per-chain subpaths; re-exports `@sodax/api/react` | keep |
| `@sodax/skills` | AI skills, versioned with the SDK | keep |
| `@sodax/codemod` | v2 → v3 CLI | new |

- **Shims through 3.x, removed in 4.0:** `@sodax/swaps-api`, `@sodax/bridge-api`,
  `@sodax/wallet-sdk-core`.
- **Retired:** `@sodax/libs`, folded into `chain-stacks` and `chain-injective`.
- **Unchanged:** `@sodax/assets`, which is private.

**Rules**
- Split packages only along install-weight axes (SDK vs API, chain, wallet libraries, React).
  Everything else is a subpath.
- Each heavy dependency belongs to exactly one package.
- Layers point down only: types → api → sdk → chain packages → React.
- One shared version.
- Shims cover one major.

## 3. Delivery model: expand, then contract, on `main`

**2.x (expand).** New structure next to the old, with today's behaviour as the default: registry,
entries, adapters, server signers, `@sodax/api`, codemods. Releases continue as normal.

**Gate G, before the first breaking merge**
- Release tooling:
  - npm `latest` never moves back (A1.1);
  - `release-2.x` mode for `pnpm release` (A1.4);
  - publish lists derived from the workspace (A1.2).
- Docs, skills, the Claude plugin and context7 pinned to `release` (T27.1).
- A v2→v3 skills mode (T16.1).
- In-repo apps migrated with the forward-compatible codemods (T17.4).
- Cut the last 2.x minor and branch `release-2.x` from it.
- Announce the chain-PR cutoff.

**3.0 (contract).** A short window: wagmi v3 first, then ESM-only and peers, chain extraction,
default flips and removals. It ships as `3.0.0-rc.N`, then 3.0.0. After that, 2.x maintenance
comes from `release-2.x` (dist-tag `v2`).

**4.0.** The shims are removed.

## 4. Roadmap

W2–W5 have independent gates and can run in any order.

| Wave | Opens when | What lands | Pts |
| --- | --- | --- | --: |
| **W1** | now | CI consumer gates (T11); release tooling (A1.1–A1.3); unbundled ESM builds (T2, T10, T13.1, T3.10); PancakeSwap vendoring (T5.1–5.2); ICON JSON-RPC, Stellar `/minimal`, Solana without Anchor (T8.1–8.4); server signers (T6.1–6.3, T6.6); bug fixes (T9.1, T23.3–23.5, T25.1); key factory (T21.1); codemod CLI (T17.1); request ids (T19.5); the plugin ADR (T1.1); the TS 5.9 trial (T7.0) | 79 |
| **W2** | the user's #509, #511, #512, #523 (and #488) merge | AbortSignal (T19.2–19.4); dapp-kit subpaths (T13.2); renames (T26.1); query builders (T21.2, T21.5); wallet from context (T22.1, T22.3); receipt routing (T23.1); generated hook index (T27.2) | 34 |
| **W3** | #534 merges, or the T1.1 ADR is accepted | Chain registry and plugin kit (T1.2–1.5); 9 chain moves in parallel (T1.7–1.15); XRP / Monad / Aleo as opt-in plugins (T1.16); `createSodaxCore` and feature entries (T12); types split (T14.2–14.4); wallet adapters, headless config, lazy chains (T3.1–3.9); `@sodax/api` (T28.1, T28.4); public relay status (T18.1); opt-in remote config (T20.1–20.2) | 106 |
| **W4** | #483 is resolved | Uniform API errors (T19.1); hook errors (T22.5); sdk calls on `@sodax/api` (T28.2) | 9 |
| **W5** | the user's #529, #531, #532 land | Shared lifecycle core and MM / staking / migration / DEX lifecycles (T18.2–18.7); `@sodax/api/react` (T28.5–28.8); API-lane builders and wallet context (T21.3, T21.4, T22.2); install-matrix docs (T24.3) | 44 |
| **G** | 2.x prerequisites done | A1.4, T27.1, T16.1, T17.4; cut the last 2.x minor; branch `release-2.x`; announce the cutoff | 10 |
| **W6** | the 3.0 window opens | wagmi v3 (T7.1) → ESM-only and peers (T4) → signer-only interfaces (T23.2) → browser-only signers (T6.4) → chain package scaffold (T1.17) → **one PR per chain, in parallel** (T1.18–25 + T6.5) → wallet-react cleanup (T3.6) → hub + EVM default (T1.27) → chains-all, cleanup (T1.28–1.30); also T5.3–5.4, T6.7, T8.5, T13.3, T13.10, T15.2, T22.6, T26.3, T28.3, T29.1, T17.7, T20.3 (only if product agrees) | 84 |
| **W7** | API freeze | v2→v3 skills and docs (T16.2, T16.3, T17.5) → **3.0.0-rc.1** | 15 |
| **W8** | rc.1 is out | sodax-frontend, sodax-backend and intents-whitelabel migrations, skill.md (T17.6a–c, T16.4) → **3.0.0** | 12 |
| **L** | 3.x | T3.11–3.12, T30–T36 | 60 |

**Tracks that can be staffed in parallel**
- **A** build and release
- **B** core and chains (chain moves fan out to one developer each)
- **C** wallet
- **D1** dapp-kit
- **D2** API, AI, migration

**Critical path**
- By points: T11.1 → T11.2 → T10.1 → T2.1 → T13.1 → T13.2 → T4.1 → T1.17 → T1.18–25 → T1.27 →
  T1.29 → T17.5. That is 39 pts serial, about 31 with the per-chain fan-out.
- By calendar: the chain track, which waits on #534 and on the ADR being accepted.

**Hot files** (serialize):
- `SpokeService.ts` and `shared-utils.ts`: #534, then T1.2, then T1.3 / T1.4.
- `types/src/chains/*`: #534, then T14.2, with a short freeze.
- Feature services: the user's PRs first.
- `EvmProvider.tsx`: T9.1 → T3.3 → T7.1.
- `SodaxProvider.tsx`: T26.2 → T22.1 → T21.5 → T20.2.

The full list is in `plan-v3-order.md` §5.

## 5. Issues

There are 30 parent issues and 7 single-PR issues, covering 162 sub-issues in all. Titles are ready
for GitHub; the bodies are in `parent-issues.md`.

| Issue | Title | Kind | Subs | Pts | Waves | Outcome |
| --- | --- | --- | --: | --: | --- | --- |
| **A1** | `ci(release): v3 release tooling — workspace package list, dist-tag guard, maintenance line` | parent | 4 | 10 | W1, G | The team keeps shipping 2.x fixes after 3.0 work starts, and new packages publish without hand-edited lists. |
| **T1** | `feat(sdk)!: chain plugins — core is hub + EVM, every other chain is opt-in` | parent · breaking | 23 | 70 | W1, W3, W6 | Apps install and ship only the chains they use. |
| **T2** | `build: unbundled ESM output and no import-time side effects` | parent | 4 | 7 | W1 | Tree-shaking finally works: importing one helper costs under 1 KB instead of 832 KB gzip. |
| **T3** | `feat(wallet-sdk-react)!: chain adapters and per-provider state` | parent · breaking | 12 | 38 | W1, W3, W6, L | Apps pick wallets per chain (`adapters={[evm(), solana()]}`) and load only those; the wallet layer is 2.6 MB gzip today, the EVM part alone 124 KB. |
| **T4** | `build!: ESM-only packages; viem, wagmi and react-query as peers` | parent · breaking | 3 | 7 | W6 | Apps share one viem, wagmi and react-query copy with the SDK instead of up to 8 viem copies (355 MB), and can pick up security fixes without waiting for a SODAX release (e.g. |
| **T5** | `refactor(sdk): replace the PancakeSwap SDKs with vendored CL math` | parent · breaking | 4 | 10 | W1, W6 | Every install loses 131 MB, 20 advisories and six nested viem copies, which even apps that never touch the DEX pay today. |
| **T6** | `feat(wallet-sdk-core)!: per-chain signers and a server-only entry` | parent · breaking | 7 | 30 | W1, W6 | Browser bundles stop carrying private-key signing code and its libraries (near-api-js, ecpair, secp256k1, bip322-js), so there is less attack surface in the browser. |
| **T7** | `feat(wallet-sdk-react)!: wagmi v3` | parent · breaking | 2 | 5 | W1, W6 | The WalletConnect, MetaMask and Coinbase SDKs become optional. |
| **T8** | `refactor(sdk): lighter chain libraries — ICON over JSON-RPC, Stellar /minimal, Solana without Anchor` | parent · breaking | 5 | 10 | W1, W6 | ICON, Stellar and Solana users get smaller installs and fewer network calls (Solana: 2 RPCs fewer per deposit, 1 per message). |
| **T9** | `fix(wallet-sdk-react): reuse the app's QueryClient in EvmProvider` | single PR | 1 | 1 | W1 | Fixes a v2 bug. |
| **T10** | `build(sdk,wallet-sdk-core,swaps-api,bridge-api): stop inlining @sodax/types and near-api-js` | single PR | 1 | 1 | W1 | The token list stops being copied into four packages (a single swap dapp carries five copies today). |
| **T11** | `ci: consumer install, bundle-size and audit gates` | parent | 4 | 8 | W1 | Locks in every gain: a PR that grows the bundle or the install footprint, or adds advisories, fails CI, and every change shows before/after numbers. |
| **T12** | `feat(sdk): createSodaxCore and per-feature entries` | parent | 2 | 6 | W3 | Apps import only the features they use (`@sodax/sdk/swap`). |
| **T13** | `feat(dapp-kit)!: per-feature subpaths; the sdk becomes a peer` | parent · breaking | 6 | 13 | W1, W2, W3, W6 | React apps load only the hook groups they use, and no longer get the whole SDK through dapp-kit's re-export; Next.js apps get correct `'use client'` boundaries. |
| **T14** | `perf(types): split @sodax/types into light entries` | parent | 4 | 7 | W1, W3 | Code that only needs chain keys and helpers (backends, light clients, the API packages) stops paying for the token list: `getChainType` goes from 34 KB to 2 KB gzip. |
| **T15** | `refactor(sdk): polyfill-free core` | parent | 3 | 3 | W1, W3, W6 | The SDK core runs in Cloudflare Workers, React Native, Bun and Deno without any Buffer or crypto polyfill setup. |
| **T16** | `docs(skills): skills for v3` | parent | 4 | 14 | G, W7, W8 | AI agents and the skills CLI write correct v3 code, while 2.x users keep getting 2.x guidance instead of a mix. |
| **T17** | `feat: v2 → v3 migration — codemods, docs, apps and downstream repos` | parent | 9 | 28 | W1, W2, W3, G, W6, W7, W8 | Integrators upgrade by running a codemod instead of reading a diff. |
| **T18** | `feat(dapp-kit): lifecycle hooks for every multi-step flow` | parent | 7 | 25 | W3, W5 | Money market, staking, migration and DEX flows get the same progress states as swap, bridge and leverage-yield, and recover after a page reload or a relay timeout. |
| **T19** | `feat(sdk): uniform API errors, AbortSignal and request ids` | parent | 6 | 17 | W1, W2, W4 | Apps can tell retryable API errors from fatal ones and cancel stale quotes and polls, which saves requests. |
| **T20** | `feat(sdk): remote config v2` | parent · breaking | 3 | 7 | W3, W6 | New tokens and chains go live without an SDK release, and token lists leave the bundle, if product approves the trust model. |
| **T21** | `feat(dapp-kit): query key factory and queryOptions builders` | parent | 5 | 13 | W1, W2, W5 | Apps can prefetch, server-render and suspend on SODAX data, and invalidate caches reliably with exported keys. |
| **T22** | `feat(dapp-kit): wallet provider from context; one error style` | parent · breaking | 5 | 14 | W2, W4, W5, W6 | Less boilerplate: hooks find the connected wallet themselves instead of every call passing `walletProvider` (55 hook files take it today), and apps handle one error type everywhere. |
| **T23** | `refactor(types,wallet-sdk-core)!: signer-only wallet interfaces; dedupe` | parent · breaking | 5 | 9 | W1, W2, W6 | Custom wallets (MPC, Safe, embedded) implement a few sign/send methods instead of RPC reads. |
| **T24** | `docs: integration modes and API mode` | parent | 3 | 4 | W1, W3, W5 | Partners pick the right integration (SDK, API mode or raw transactions) and install exactly the packages it needs. |
| **T25** | `fix(swaps-api): parse Bitcoin raw transactions; exhaustive chain dispatch in both API clients` | single PR | 1 | 1 | W1 | Bitcoin raw transactions from the swaps and leverage-yield APIs parse correctly. |
| **T26** | `feat(dapp-kit)!: consistent hook names; SodaxProvider accepts an instance` | parent · breaking | 3 | 5 | W1, W2, W6 | Predictable hook and parameter names make the API easier to learn and easier for AI agents to use. |
| **T27** | `docs(ai): pin docs and AI channels to release; generated hook index` | parent | 2 | 5 | W2, G | Docs and AI tools serve the released version, not `main`, so 2.x users never get v3 instructions during the breaking window. |
| **T28** | `feat(api): one @sodax/api package` | parent | 8 | 25 | W3, W4, W5, W6 | One light package for every SODAX HTTP API, with one transport and one error type, usable without the SDK. |
| **T29** | `ci: runtime matrix (Bun, Deno, Workers; Node legs via T11.4)` | single PR | 1 | 5 | W6 | CI proves that the SDK works on Bun, Deno and Workers, so runtime support is a tested promise. |
| **T30** | `feat(wallet-sdk-react): typed per-chain account hooks` | single PR | 1 | 3 | L | Chain-specific account data comes with correct types, so apps need fewer casts. |
| **T31** | `feat: later — one-signature batching for the remaining features, testing entry, Solana on Kit` | parent | 6 | 28 | L | One wallet prompt (approve + action) for the remaining features; typed test fakes for integrators; a lighter, maintained Solana stack (web3.js v1 receives critical fixes only). |
| **T32** | `feat(wallet-sdk-core): adapters over EIP-1193 / WalletClient and Wallet Standard` | single PR | 1 | 3 | L | Apps that already use a raw EIP-1193 provider, a viem WalletClient or Wallet Standard plug in without wagmi or SODAX's React layer. |
| **T33** | `feat(api): MCP-ready tool schemas` | parent | 2 | 8 | L | AI agents build SODAX transactions through the existing MCP servers from one schema source, and never hold keys. |
| **T34** | `ci: OpenAPI drift gate` | parent | 2 | 4 | L | Backend API changes that would silently break client parsing get caught before users hit them. |
| **T35** | `feat(dapp-kit): polling presets and a transport option` | parent | 2 | 7 | L | Polling load is tuned in one place, and quote, swap and status hooks can run over the API with the same hook API. |
| **T36** | `feat(wallet-sdk-react): embedded / social wallets as adapters` | single PR | 1 | 2 | L | Embedded and social logins beyond Privy plug in the same way, each as an optional subpath. |

## 6. Decisions needed

Each item carries my recommendation.

1. **Delivery model.** Expand, then contract, on `main`, with `release-2.x` for maintenance.
   *Team / release owner.*
2. **Chain-PR cutoff.** The cutoff is acceptance of the T1.1 ADR. #534 (Tron + MPC settle) merges
   before it; XRP, Monad, Aleo, and the ton and zcash branches return as opt-in plugins.
   *gcranju, Prabinbaral77.*
3. **Package map ADR** (`plan-v3-packages.md`). It covers:
   - `@sodax/api` plus `@sodax/api/react`;
   - one package per chain plus `chains-all`;
   - wallet-sdk-core folded into `@sodax/sdk/wallet`;
   - `@sodax/libs` retired.

   *Team.*
4. **wallet-sdk-react design.** Headless `createSodaxWallets`, lazy chain adapters, no `./react` in
   chain packages. *Team.*
5. **#483 (`!`, solver error codes).** Ship it in 2.x or hold it for the window. 2.x is possible;
   earlier `!` commits shipped in 2.x minors. *R0bi7.*
6. **Remote config.**
   - Opt-in in 2.x.
   - In 3.0, default-on only for token lists and display metadata, never contract addresses or API
     URLs.
   - Accept configs of the same major; drop unknown chains.

   *Product.*
7. **Docs stop going live on merge** (pinned to `release`) before the window. *Team / docs owners.*
8. **npm token.** Confirm `SODAX_SDKS_NPM_PUBLISH_TOKEN` can create `@sodax/*` packages. *Ops.*
9. **Relay CORS.** Allow `x-request-id`; the SDK never sends it to the relay until then.
   *Relay owner.*
10. **PancakeSwap `Price` / `Token` swap (T5.3):** in 3.0.
11. **Cross-repo trackers.** One parent issue in sodax-sdks with native sub-issues in frontend,
    backend and whitelabel before T17.6, T16.4, T19.6 and T34.2. *The user files them.*

## 7. Coordination asks for in-flight PRs

These are for the user to raise; agents do not post on other people's PRs.

| PR | Ask |
| --- | --- |
| #509, #511, #512, #523 (0x0603) | Merge first: they share feature services and hooks with W2 |
| #529, #531, #532 (0x0603) | Fold the shared lifecycle core (T18.2) into #531 |
| #534 Tron + MPC settle (gcranju) | Merge before the registry (T1.2) |
| #497 XRP, #498 Monad, ton and zcash branches (gcranju) | Rebuild as opt-in plugins after T1.3–T1.6 |
| #95 Aleo (Prabinbaral77) | Opt-in plugin only; it pulls in about 55 MB of WASM |
| #483 (R0bi7) | Decide 2.x vs window; it blocks T19.1 and T22.5 |
| #501 (R0bi7) | Merge before the app migration (T17.4) |
| #163 wallet-hw (0xmilktea) | Not ours; it collides with `EvmProvider.tsx` and fails the release gates |

## 8. Totals and capacity

| Tier | Pts |
| --- | --: |
| Now (2.x quick wins) | 35 |
| Must (3.0 core), plus the Should items it needs | 216 |
| Should (recommended, never gating) | 134 |
| In-flight ports (chain PR authors) | 8 |
| Later (3.x) | 60 |
| **Total** | **453**: 162 sub-issues; 19 breaking (67 pts); cross-repo 14 pts |

- **Required for 3.0.0:** **239 pts**, excluding downstream migrations. That is roughly 31 dev-weeks
  at 0.65 day/pt, an uncalibrated rate; the team has no velocity data.
- **Capacity.** `main` took 135 squash commits in the last 90 days, almost all from three people. With
  feature work continuing, 3.0.0 is a **5–8 month** effort unless people are dedicated to it.
  Re-estimate after T1.2 and T1.7.

## 9. Feasibility and risks

**Proven by a probe**
- tsc output and tree-shaking; the types split; the viem floors; the wagmi v3 typecheck.
- Adapter and store types; Stellar `/minimal`; Solana discriminators.
- The turbo cycle rule; the ts-morph codemod.
- Relay CORS; remote config being live.
- Downstream repos construct `SpokeService` 0 times.

**Code reading only, not prototyped**
- The registry and chain moves; the wallet refactor; the chain-package extraction; ESM-only; lazy
  adapters.

**Unverified or external**
- TS 5.9 across the repo; the npm token's create permission.
- On-chain behaviour of Anchor-free Solana and the vendored PancakeSwap calldata: run a testnet smoke
  before gate G.
- wagmi v3 in a real browser; the relay's CORS; the remote config policy.

**Main risks**
- Capacity.
- Coordination with chain-PR authors: without a cutoff, each new v2-shape chain adds port cost.
- About 18 packages per lockstep release.
- React code inside `@sodax/api`, behind an isolation gate.

## 10. Next steps

1. **Share the plan.** The user posts `drafts/519-bullets.md` on #519 and brings D1, D3, D4, D6, D7, D10
   and D11 (README) to the team.
2. **Start W1 now.** These are conflict-free, or trivially so:
   - T11.1 → T11.2 (the measurement gates come first);
   - A1.2, T9.1, T25.1, T23.4, T14.1, T2.3, T8.3, T5.1, T21.1, T26.2, T24.1;
   - draft T1.1 (the ADR);
   - trial `tsc` for T7.0.
3. **Merge the user's #509, #511, #512 and #523.** That opens W2.
4. **Ask gcranju about #534's timing and the cutoff.** That opens W3.
5. **File the issues when the team agrees.** #525 already requires every PR to link an issue.
   Since 2026-10-18 (#537, #542) issues follow `.github/issue-workflow.md`:
   - parents become epics (Goal / Non-goals / Exit criteria, native sub-issues, no checklist);
   - sub-issues become outcome-only specs with acceptance criteria;
   - the mechanism goes in a `<!-- sodax:plan -->` comment, and a human applies `plan-approved`.

   The `parent-issues.md` bodies predate this. Convert them before filing. File the epics and the
   W1 specs first, and later-wave specs as their gate opens.
