---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, feasibility, idea-capture]
related_issues: [519, 535, 540, 541, 543, 534, 509, 511, 512, 523]
---

# Feasibility of the 39 #519 bullets

The user's full v3 bullet list (pasted 2026-10-19) was checked one bullet at a time, **as worded**. Eight
read-only agents did the checking, one per area. Code was read at sodax-sdks `0181a053`. Consumers were read
at sodax-frontend `1b915ec7`, intents-whitelabel `5e1fbba` and sodax-backend `985959e9`.

The claims that carry weight were spot-checked by hand after the agents finished:
- the PancakeSwap `LICENSE` files;
- the `crypto` external in libs;
- the frontend calling wallet receipt waits;
- `/v2/be/config/all` returning live 200;
- npm rejecting the `v2` dist-tag;
- the `CONFIG_VERSION` encoding.

The probe scripts are in `artifacts/feasibility-probes/`. Their paths point at the `sodax-sdks-t2probe`
worktree.

Verdicts: **F** feasible · **FC** feasible with caveats · **D** needs a decision · **P** premise incorrect,
needs new scope. Count (39 bullets): 5 F, 27 FC, 6 D, 1 P. Nothing is blocked outright.

**How sure each part is.**
- **Verified facts:** the bugs and code facts cited with `path:line`, the hand spot-checks, and the probe
  results within their stated scope.
- **Design judgement:** the verdicts, sizes, "breaking" calls and the revised wording. Use them as planning
  input; they are not proven.
- **Second review, 2026-10-19:** a second review re-ran the ICON probe (2,000 cases, 0 failures) and the
  Solana probe (600 instructions, 0 failures). It also re-checked the config endpoint, the license files,
  the assignees, the receipt-wait callers and the dist-tag rule.
- **Its corrections are applied here:**
  - the count is 39, not 40;
  - sk-4 is reclassified;
  - the lazy-load, license, probe-scope and T2 claims are softened.

## Verdicts

| ID | Bullet (short) | V | Breaking | Size | What decides it |
| --- | --- | --- | --- | --- | --- |
| sdk-1 | Chain plugins, `chains-all` | FC | 3.0 | L | Every core leak fits a `ChainRegistry` seam: eager spokes `SpokeService.ts:143-155`, 20 `spoke.bitcoin.*` calls, codecs in `shared-utils.ts:25-28`, Stellar via `SponsoringService`. Separate packages only in 3.0 (2.x would be a sdk↔chain cycle). Merge #534 first. Tron is non-EVM but viem-only: core or plugin? |
| sdk-2 | Unbundled ESM, no side effects | FC | no | M | Only 2 global mutations in all 8 packages (`BitcoinSpokeService.ts:48`, `BTCWalletProvider.ts:19-20`). Partial imports shrink a lot (only `SodaxError`: 825 KB → 0.6 KB). An app that calls `new Sodax()` gains little (1,258 → 1,261 KB) while the facade still references every chain library and PancakeSwap. The current bundle drops `'use client'`. |
| sdk-3 | ESM-only, peers, tested ranges | FC | 3.0 | M | The backend is the only CJS consumer (Nest `commonjs`, Node 22.18). `require(esm)` works for 7 packages; dapp-kit and wallet-sdk-react need a `default` export condition. Catalog pins publish as exact versions today. wagmi 3 needs TS ≥5.9.3 (repo is on 5.5.4). |
| sdk-4 | Vendor PancakeSwap math | FC | partly | M | **License conflict:** `v3-sdk@3.10.0` and `infinity-sdk@1.0.8` say MIT in `package.json` but ship a GPL-3.0 `LICENSE`. Until per-file provenance is settled (a legal call), don't vendor from that dist under MIT. MIT-clean sources exist (Uniswap v3-sdk), and the encoders can be written from the ABI (~650 LOC). Middle path for 2.x: keep `swap-sdk-core` (MIT, no viem), drop the other two, which removes 6 nested viem copies. |
| sdk-5 | ICON JSON-RPC, Stellar `/minimal`, Solana without Anchor | FC | partly | L | Probes match within their scope: ICON raw tx, hash and signature over 2,000 cases; Solana instruction data and account metas over 600 cases against the live mainnet IDLs. Not covered: ICON RPC, receipts and pending/retry; Solana full transaction assembly, execution and invalid input. Stellar `/minimal` covers all 21 names. icon-sdk-js stays installed unless private-key signing in wallet-sdk-core moves to `@noble` too. |
| sdk-6 | Per-feature entries | FC | no | M | Hard prerequisite is sdk-2. In 2.x a CJS backend would load the root as CJS but subpaths via `require(esm)`, giving two module graphs. So ship subpaths with ESM-only 3.0, or gate them for CJS. Swap-only is 1,211 KB alone and 248 KB with sdk-1 and sdk-4. |
| sdk-7 | No Buffer/crypto polyfills | FC | partly | M | Wording undercounts. The first build break is our own `@sodax/libs` externalizing `crypto` (`libs/tsup.config.ts:100-108`). `process` (Stellar), `global` and `stream` (ecpair, bip322-js) are also needed. Fixes are past the cooldown: bitcoinjs-lib 7.0.2, ecpair 3.0.2, bip322-js 4.0.0. Risk: Radfi/Bound PSBT flows. |
| sdk-8 | Error metadata, AbortSignal, request IDs | FC | partly | L | Four different error shapes today. Caller aborts are reported as `REQUEST_TIMEOUT` (`api-utils.ts:204-206`), and swaps-api retries them. The backend never returns `x-request-id`. The relay and solver CORS reject it. The `SolverErrorResponse` return type changes only in 3.0. |
| sdk-9 | Remote token lists / chain metadata | D | partly | — | Mostly restates #543. Only the 3.0 work beyond #543 belongs here: default-on, which fields remote may override, and bundled config as a fallback import. #543 AC1 (remote addresses apply) contradicts any field restriction. |
| sdk-10 | `@sodax/sdk/testing` | FC | no | M | No shared fakes exist today (44 `as unknown as I*WalletProvider` casts). Types are zero-dep, so `satisfies` fakes work. Keep it runner-agnostic: no `vi.fn`, no msw. Needs a `fetch` option. |
| dk-1 | Subpaths, sdk as peer, no `export *` | F | partly | M | Downstream apps import 0 SDK names through dapp-kit. Only in-repo demo, playground and examples do (121/36/15). Four cross-folder imports need untangling. |
| dk-2 | Lifecycle hooks for remaining flows | D | no | L+ | Only swap has one (`swapLifecycle.ts`). MM, staking, migration and DEX **drop `srcTxHash`** on relay errors (e.g. `MoneyMarketService.ts:573-578`), so #509 must be extended first. Also needs a public relay-status read. Which flows matter is a product call. |
| dk-3 | Query keys + `queryOptions` | F | no | L | 214 inline key literals, no factory. Frontend and whitelabel hand-write keys to invalidate, so **key shapes must not change**. The `check:ai` key script must learn the factory. |
| dk-4 | Wallets from context | FC | no | L | Both apps mount `SodaxProvider` outside the wallet provider (whitelabel loads the wallet tree with `ssr:false`), so the source context must nest independently. No current consumer needs "app-provided wallets". |
| dk-5 | Consistent typed errors | FC | partly | M | 2.x: normalize everything to `SodaxError`. 3.0: the 6 hooks returning `Result` as data and the 5 that swallow errors start throwing. Per-code unions only where the SDK types its errors (DEX: 0 of 21). |
| dk-6 | Names, `SodaxProvider` takes an instance | FC | partly | M | Use deprecated aliases until 3.0. The instance prop is reliable only after the dk-1 peer move (private members). Whitelabel's second, fee-free instance is deliberate. |
| dk-7 | Polling presets, SDK/API modes | D | no | S/— | Presets are easy (52 interval literals). "Mode" is undefined: swap, bridge and leverage yield each have three paths (client relay, backend submit-tx, API lane), and they return different shapes. |
| wsc-1 | Private-key signers server-only | FC | partly | L | All 9 classes choose between private key and browser in the constructor, so this is a refactor, not a file move. Injective's browser path references `MsgBroadcasterWithPk`. Where the server entries live depends on wsc-3. |
| wsc-2 | Interfaces only sign and submit | FC | 3.0 | M | **Breaks real apps:** sodax-frontend `swaps-api-sign.ts:173-179` and whitelabel call the wallet receipt waits. Chain clients must work without a `Sodax` instance. Solana `buildV0Txn` hides an RPC read. |
| wsc-3 | Signers into chain packages and `@sodax/sdk/wallet` | FC | partly | M | Feasible with no cycle, but **wallet-sdk-react would then depend on `@sodax/sdk`**. That reverses `AGENTS.md` and c-wallet C1.4. The shim keeps today's install weight. |
| wsc-4 | EIP-1193, viem, Wallet Standard adapters | FC | no | M | The EVM provider **already takes a viem WalletClient**. EIP-1193 needs a rebuild on `chainChanged`. Wallets without 5792 already fall back. Solana is ~30 lines. |
| wsr-1 | Opt-in adapters, lazy, per-provider state | FC | partly | L | **"Lazy-load" can't be promised yet.** In the current design EVM, Solana and Sui wrap the app in providers, so a plain `import()` would suspend the tree and lose wagmi's SSR `initialState`. Connect-time SDKs can load lazily today; lazy chain providers need a redesign and a prototype. Two module-level zustand stores and 9 singletons exist today. |
| wsr-2 | wagmi v3, connector SDKs optional | FC | 3.0 | M | wagmi 3.7.7 is past the cooldown and its connectors are optional peers. It drags in viem ≥2.43 and TS ≥5.9.3 repo-wide. The Privy connector must honour `withCapabilities`. |
| wsr-3 | Reuse app QueryClient | F | no | S | `EvmProvider.tsx:27-30` creates its own. This is a 2.x bug fix; wagmi queries then pick up the app's defaults. |
| wsr-4 | Typed per-chain account hooks | F | no | S | Additive. Keep `useXAccount` as an alias. A hook named `useAccount` would clash with wagmi's. |
| wsr-5 | Embedded/social wallets, Privy | D | no | — | Privy is **already on main** (PR #486, 2026-10-13): email login, EVM only. It is a wallet source inside the EVM adapter, not a chain adapter. Solana Privy needs `@solana/kit`. |
| sk-1 | Version skills with the SDK | FC | no | S/M | npm `@sodax/skills` already versions with the SDK. The skills CLI, `sodax.com/skill.md` and doc links all point at `main`, so pin them to release refs. |
| sk-2 | Docs from released versions | D | no | S | Mintlify publishes `main` on merge (`docs/README.md:3-5`). Team call: docs stop going live on merge, plus a hotfix path. |
| sk-3 | Generated hook index and key table | F | no | M | `hooks-index.md` already misses 14 of 217 hooks. `check-ai-keys.py` has the parser. |
| sk-4 | Align with shared MCP tool schemas | P | no | — | **The premise is wrong: no shared schemas exist yet.** Both MCP servers hand-write zod and import no `@sodax/*`. Creating shared schemas is new scope, after api-1. |
| api-1 | One `@sodax/api`, shims | FC | no | M/L | swaps-api and bridge-api are **already viem-free**. The real work is pulling the leverage-yield, sponsoring and `/be` clients out of the sdk. The raw-tx schemas have drifted (only bridge has `BITCOIN`), so do T25 first. |
| api-2 | `@sodax/api/react` | FC | partly | M | The `./privy` optional-peer pattern already exists. Risk: two hook families with different keys and errors. |
| api-3 | Document API mode | FC | no | S | Server-built txs exist only for swaps, bridge, leverage yield and Stellar sponsoring. MM, staking, DEX and migration have none. The backend pins sdk `2.2.0-rc.8`. |
| api-4 | OpenAPI drift in CI | FC | no | M | 4 of 5 specs are live. `/v1/bridge/docs-json` is 404 because Swagger is mounted at `docs` (backend fix). Tx shapes are a bare `object` in the spec. |
| x-1 | Split `@sodax/types`, stop inlining | FC | partly | M | Only runtime JS is inlined (4 tsup `noExternal`). Split by concern (`chains` without tokens, `tokens`, `config`, `dex`), not by chain. Do it after #534. |
| x-2 | Size, install, audit in CI with budgets | FC | no | M | Today only the sdk tarball is gated. Use esbuild (already locked); size-limit is inside the cooldown. Audit must fail only on new versus base, per `.github/ci.md:5`. |
| x-3 | v2 → v3 codemod + guide | FC | no | M | ts-morph 28.0.0 (passes the cooldown). Import moves and renames are mechanical. Errors, wallets and adapters stay manual. Write each transform after its API freezes. |
| x-4 | Node, Bun, Deno, Workers matrix | D | no | M | Deno runs `new Sodax()` today. Workers needs `nodejs_compat` until sdk-7/sdk-1. wallet-sdk-react fails in plain Node, so it is bundler-only. CI runs only Node 24 while `engines` says ≥22.12. |
| x-5 | `release-2.x` line | FC | no | M | **Bug in today's backport path:** every stable publish passes `--tag latest` (`sdks-publish.yml:38-43`), so a 2.x patch after 3.0 moves `latest` back. npm rejects `v2` and `2.x` as tags (semver ranges); use `v2-latest`. `release.mjs` assumes one line in 8 places. |

## Decisions the team owns

1. **Tron and other viem-only non-EVM chains:** core or plugin (sdk-1).
2. **wallet-sdk-react depending on `@sodax/sdk`** (wsc-3). This reverses the documented dependency direction.
3. **sdk-4 code source:**
   - settle per-file provenance of the PancakeSwap code (a legal call), or avoid the question by porting
     from Uniswap MIT and writing the encoders from the ABI;
   - whether the `Price`/`Token` type change waits for 3.0.
4. **ICON signing:** also move private-key signing to `@noble`, so icon-sdk-js leaves dapp installs (sdk-5).
5. **Subpaths:** in 2.x behind a CJS gate, or only with ESM-only 3.0 (sdk-6).
6. **Toolchain jump:** viem ≥2.43, TypeScript ≥5.9.3 and wagmi peer ranges, all repo-wide (sdk-3, wsr-2).
7. **#543 questions Q1–Q3:**
   - version rule: compare majors, because "≥" rejects the live config on 2.2.0;
   - trusted fields vs AC1.
   - Separately, should remote config be default-on in 3.0 (sdk-9)?
8. **Docs publishing:** live on merge, or on stable release (sk-2).
9. **2.x patch releases at all, and tag names** `v2-latest` / `v2-rc` (x-5, sk-1).
10. **Workers support:** does it mean `nodejs_compat`? (x-4)
11. **dapp-kit flows:** which flows get lifecycle hooks (dk-2), and what "execution mode" means (dk-7).
12. **Chain clients:** usable without a `Sodax` instance, for API-only apps (wsc-2).
13. **Privy:** a cross-chain wallet source? Solana web3.js → `@solana/kit`? (wsr-5)
14. **Codemod:** published package, or repo script plus skill (x-3).

## Real issues today (not v3)

- **#543 "Blocked" is wrong.**
  - It probed `/v1/config/all`, `/config/all` and `/v2/config/all`.
  - `GET https://api.sodax.com/v2/be/config/all` is live: 200, `version: 2020008` (= 2.2.0-rc.8, the backend's pin), 10 sections, 297 KB.
  - The disabled `response.version < CONFIG_VERSION` rule would reject it on stable 2.2.0 (2_020_099).
  - The user is #543's assignee.
- **The backport path moves npm `latest` back** once 3.0 is out (x-5). Fix before 3.0.0-rc.1.
- **MM, staking, migration and DEX drop `srcTxHash` on relay errors.**
  - `MoneyMarketService.ts:574`, `StakingService.ts:437` and `MigrationService.ts:573,671,747,819` call
    `mapRelayFailure` without it.
  - `dex/AssetService.ts:509` returns the raw packet error.
  - #509 covers only the swap, bridge and vault paths.
- **wallet-sdk-react** shadows the app QueryClient and drops `'use client'` from its bundle.
- **`hooks-index.md` misses 14 hooks.**
- **bridge-api Swagger is mounted at the wrong path** (sodax-backend `apps/bridge-api/src/main.ts:78`).
- **CI tests Node 24 only.**
- **`.github/ci.md:19` is stale:** the sponsoring spec is fetchable now.
- **Out of our repos:** the Builders MCP relay points at `xcall-relay.nw.iconblockchain.xyz` (`src/constants.ts:12`).

## Corrections to research A–D

| File | Section | Was | Is |
| --- | --- | --- | --- |
| `a-build-packaging.md` | T15 | Polyfills come from chain libraries; only `Buffer` was counted | The first break is our libs' `crypto` external; `process`, `global` and `stream` are needed too |
| `a-build-packaging.md` | A1.1 | dist-tag `v2` | npm rejects it; use `v2-latest` |
| `b-sdk-core-chains.md` | T5 | Port from the v3-sdk 3.10.0 dist | That dist's `LICENSE` is GPL-3.0 while `package.json` says MIT; provenance unsettled. Encoder actions 14 and 21 are not needed |
| `b-sdk-core-chains.md` | B1 | MPC REST client goes in the plugin kit | `TronSpokeService` implements settlement itself (#534) |
| `c-wallet.md` | T23 | No app calls wallet reads | sodax-frontend and whitelabel do |
| `c-wallet.md` | C1.4 | wallet-sdk-core survives as base + EVM | wsc-3 replaces it with a re-export package |
| `plan-v3-order.md` | §12, T3.9 | Lazy chain adapters let all-chain apps start near EVM size | Unproven. In the current design EVM, Solana and Sui wrap the app in providers; lazy-loading them needs a redesign and a prototype |
| `d-dappkit-api-ai-migration.md` | T18 | — | MM, staking, migration and DEX don't keep `srcTxHash` |
| `d-dappkit-api-ai-migration.md` | — | Whitelabel's second Sodax instance is a bug | It is deliberate |
| `d-dappkit-api-ai-migration.md` | — | `SodaxProvider wallets=` wiring | Fits neither app's tree |
| `d-dappkit-api-ai-migration.md` | T27 | `query/keys.ts` exists | It doesn't |
| `d-dappkit-api-ai-migration.md` | T33 | MCP servers build unsigned txs | They don't |
| `d-dappkit-api-ai-migration.md` | T19 | Solver CORS allows `*` | It no longer does |

## Revised wording

These keep the user's words and fix only what is inaccurate or overclaims. Each one is prefixed for #519.

```markdown
## `@sodax/sdk`
- 0x0603: Keep the Sonic hub and viem-based chains in core. Move chains that need their own libraries into opt-in @sodax/chain-<name> packages, with @sodax/chains-all for full-chain integrations
- 0x0603: Publish unbundled ESM with sideEffects: false and no import-time global mutation, so bundlers can drop unused code
- 0x0603: Publish ESM-only packages that Node 22.12+ can still require(). Make viem, wagmi and @tanstack/react-query peers where imported, with ranges tested in CI
- 0x0603: Replace the PancakeSwap SDKs with our own CL math, codecs and encoders, ported from MIT sources or written from the contract ABIs
- 0x0603: Lighter chain libraries: ICON reads, tx building and signing over JSON-RPC and @noble, Stellar /minimal, and Solana instructions encoded without Anchor or runtime IDL fetching
- 0x0603: Add per-feature entry points like @sodax/sdk/swap alongside the Sodax facade
- 0x0603: Make browser entry points run without Node polyfills or globals (Buffer, process, global, crypto, stream)
- 0x0603: One error context for API failures, AbortSignal for requests and polling, and request IDs where the backend supports them
- 0x0603: Building on #543: decide the 3.0 defaults for remote config (on by default, which fields remote may override, bundled config as fallback)
- 0x0603: Add a @sodax/sdk/testing entry with typed fake wallet providers and API fixtures, with no test-runner dependency

## `@sodax/dapp-kit`
- 0x0603: Add per-feature subpaths, make the SDK a peer, and stop re-exporting the entire SDK
- 0x0603: Lifecycle hooks for the remaining multi-step flows on one shared, resumable core
- 0x0603: Export a query-key factory that keeps today's key shapes, plus queryOptions builders
- 0x0603: Resolve wallets from context by default; an explicit walletProvider always wins
- 0x0603: Every hook error is a SodaxError; quote and status reads throw instead of returning Result
- 0x0603: Standardize hook and parameter names (deprecated aliases until 3.0), and let SodaxProvider accept an existing Sodax instance
- 0x0603: Add polling presets; define SDK vs API execution modes before adding a switch

## `@sodax/wallet-sdk-core`
- 0x0603: Move private-key and mnemonic signers to server-only entries
- 0x0603: Wallet interfaces only sign and submit; receipt waits and balance reads move to chain clients that work without a Sodax instance
- 0x0603: Move non-EVM signers into the chain packages and the base and EVM signers into @sodax/sdk/wallet; wallet-sdk-core becomes a re-export shim
- 0x0603: Add adapters for EIP-1193 providers and Solana Wallet Standard (viem WalletClient already works)

## `@sodax/wallet-sdk-react`
- 0x0603: Opt-in chain adapters (adapters={[evm(), solana()]}) so only chosen chains are bundled; load connect-time wallet SDKs on first connect; scope state to each provider
- 0x0603: Upgrade to wagmi v3 and make connector SDKs optional peers
- 0x0603: Reuse the app's QueryClient instead of creating a nested one
- 0x0603: Add typed per-chain account hooks
- 0x0603: Embedded and social wallets as wallet sources inside chain adapters; extend today's Privy email login (EVM) to social login and Solana

## `@sodax/skills`
- 0x0603: Pin every skills channel (skills CLI, sodax.com/skill.md, doc links) to a release, with a 2.x ref for 2.x users
- 0x0603: Serve docs and AI guidance from the latest stable release; main becomes a preview
- 0x0603: Generate the hook index and query-key reference from source
- 0x0603: Decide whether @sodax/api should publish tool schemas for the MCP servers

## API packages
- 0x0603: Merge swaps-api, bridge-api and the SDK's leverage-yield, sponsoring and backend clients into one @sodax/api with per-API subpaths; old packages become shims
- 0x0603: Add @sodax/api/react hooks that need no Sodax instance, with React and TanStack Query as optional peers
- 0x0603: Document API mode for swaps, bridge and leverage yield: the server builds unsigned transactions, the client signs and submits them
- 0x0603: Check API client schemas against the backend OpenAPI specs in CI

## Cross-cutting
- 0x0603: Mark @sodax/types side-effect-free, split it into chains, tokens and config subpaths, and stop inlining it into other packages
- 0x0603: Track install size, bundle size and consumer audit in CI with budgets, failing only on regressions
- 0x0603: Provide a v2 → v3 codemod and a guide for changes that need manual migration
- 0x0603: Test entry points on Node, Bun, Deno and Workers (nodejs_compat), and publish the runtime matrix
- 0x0603: Support a release-2.x maintenance line with its own dist-tag, so latest never moves back to 2.x
```
