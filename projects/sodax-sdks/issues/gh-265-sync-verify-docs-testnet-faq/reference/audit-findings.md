---
type: reference
repo: sodax-sdks
github: 265
updated: 2026-07-13
---

# Doc-vs-code audit + live-site recon (grounded evidence for the plan)

> Produced by an 18-agent fan-out on 2026-07-13: mapped live `docs.sodax.com`,
> classified every package's doc gap, and audited each existing doc against the
> current `packages/*/src`. Every row below is code-cited. This is the evidence
> the plan and steps are built on.

## 1. Live `docs.sodax.com/developers` structure (as it exists TODAY)

The live site is a **GitBook**-style site (every page is raw markdown at `<url>.md`).
Its page tree maps almost 1:1 to `packages/sdk/docs/*.md` filenames — i.e. the
in-repo markdown is already the de-facto source of the synced pages.

- **Deployments** — `deployments`, `deployments/mainnet` (⚠ there is NO `testnet`
  page), `relayer_api_endpoints`, `solver_api_endpoints`, `xcall-scanner`,
  `swaps-compatible-assets`
- **Packages** — three layers:
  - **Foundation** → `packages/foundation/sdk`
    - functional-modules: `swaps`, `money_market`, `leverage_yield`,
      `leverage_yield/leverage_yield_apr`, `bridge`, `staking`, `migration`
    - tooling-modules: `backend_api`, `intent_relay_api`
  - **Connection** → `wallet-sdk-core`, `wallet-sdk-react`
  - **Experience** → `dapp-kit`  ← the issue wants `skills` added here
- **Technical Overview** — asset-manager, vault-token, hub-wallet-abstraction,
  intents, generalized-messaging-protocol
- **How to** — `monetize_sdk`, `configure_sdk`, `how_to_make_a_swap`,
  `wallet_providers`, `estimate_gas`, `stellar_trustline`, `bitcoin-integration`
- **AI Integration** — single page (`ai-integration`)
- **FAQ** — single page (`faq`); currently a **TODO stub**, ~20 Q&A in 5 sections

**No `skills`, `swaps-api`, or `types` package page exists anywhere on the site.**

## 2. Sync mechanism — CONFIRMED (R0bi7, 2026-07-13)

- **Source of truth = `sodax-sdks` markdown.** A separate **`sodax-document`** repo
  holds a **sync script that links the two repos** and maps `sodax-sdks` docs → the
  GitBook page tree published at `docs.sodax.com`.
- **Publish flow:** edit + merge docs in `sodax-sdks` main → trigger the sync script
  in `sodax-document` (creates a new branch) → PR to `sodax-document` main with a
  **GitBook preview** → reviewer approves → merge publishes to `docs.sodax.com`.
- **No sync automation in `sodax-sdks` itself** (workflows = ci/claude/lint-pr/
  security + publish only) — the automation lives in `sodax-document`.
- The repo `docs/` folder (Mintlify, **PR #262**: `docs.json` nav = only
  `Getting Started → index`, `index.mdx`) is a **separate effort — NOT the
  docs.sodax.com source.** Only touch it for the "four→five" skill-count fix.
- The live slugs mirror `packages/sdk/docs/*.md` — consistent with the sync script
  mapping those files. **`sodax-document` is not in this workspace** → Phase 0 must
  clone/inspect it to learn the file→page mapping + how to register new pages.

## 3. Template for a per-package page

`packages/sdk/docs/SWAPS.md` is the canonical template (plain markdown, no
frontmatter). Structure: `# Title` + intro → `## Using SDK Config and Constants`
→ `## Available Methods` (grouped catalog) → `## Core Concepts` (chain keys,
raw/signed, `Result<T>`, error-code table) → one `## <Operation>` per method with a
`typescript` example → `## Error Handling Examples`.

## 4. Per-doc triage — existing (already-synced) docs

Severity legend: **H**igh (teaches broken/false code), **M**edium (wrong detail a
user would hit), **L**ow (cosmetic/naming).

| Source doc | Live page | Verdict | Fixes (severity) |
|---|---|---|---|
| `sdk/docs/SWAPS.md` | packages/…/swaps | minor-drift | Rename `CreateIntentError` → `SwapCreateIntentError` (table L188, prose L1005) — **L** |
| `sdk/docs/SWAPS_API.md` | (companion) | current | — |
| `sdk/docs/DEX.md` | (functional) | current | — |
| `sdk/docs/HOW_TO_MAKE_A_SWAP.md` | how-to/how_to_make_a_swap | minor-drift | **H**: "Complete Example" Step 7 uses obsolete `if (error instanceof Error) switch(error.message){case 'POST_EXECUTION_FAILED'…}` — rewrite to `switch(swapResult.error.code)` (pattern already correct in this file's Step 9). `POST_EXECUTION_FAILED` no longer emitted. |
| `sdk/docs/MONEY_MARKET.md` | functional/money_market | current | — |
| `sdk/docs/LEVERAGE_YIELD.md` | functional/leverage_yield | minor-drift | Registry reads weETH/wstETH-only; a JitoSOL/SOL vault now exists. Ref array `leverageYieldVaults` not just `leverageYieldConfig` — **L** |
| `sdk/docs/LEVERAGE_YIELD_APR.md` | …/leverage_yield_apr | minor-drift | **M**: vault→poolId table (L86-89) missing 3rd registered vault `lsodaJITOSOL` (Jito/JitoSOL, poolId `0e7d0722-9054-4907-8593-567b353c0900`, fallback 5.5%) — `types/src/leverageYield/leverageYield.ts:111-122` |
| `sdk/docs/BRIDGE.md` | functional/bridge | current | — |
| `sdk/docs/INTENT_RELAY_API.md` | tooling/intent_relay_api | minor-drift | **M**: `data` typed `RelayExtraData` only; code is `RelayExtraData \| OnDemandRelayData` (Bitcoin on-demand #250). Missing `pollTxHash?` and `selectPacket?` — `shared/types/relay-types.ts:11,37-48,55` |
| `sdk/docs/RELAYER_API_ENDPOINTS.md` | deployments/relayer_api_endpoints | minor-drift | **M×2**: add `RELAY_POLLING_FAILED` (3rd relay code, `IntentRelayApiService.ts:42-57,345-351`); remove false `HTTP_REQUEST_FAILED` relay code (that's a backend transport code, not relay) |
| `sdk/docs/SOLVER_API_ENDPOINTS.md` | deployments/solver_api_endpoints | minor-drift | **M**: swap-flow example (L221-226) uses retired `error.message` `POST_EXECUTION_FAILED`/`RELAY_TIMEOUT`; must discriminate `SodaxError.code` |
| `sdk/docs/BACKEND_API.md` | tooling/backend_api | current | — |
| `sdk/docs/STAKING.md` | functional/staking | current | link-rewrite only |
| `sdk/docs/BITCOIN_INTEGRATION.md` | how-to/bitcoin-integration | current* | *`<SodaxProvider testnet={false}>` example (L42) is WRONG — `SodaxProviderProps` has no `testnet` prop (`dapp-kit/src/providers/SodaxProvider.tsx`). Fix while doing testnet work. |
| `sdk/docs/STELLAR_TRUSTLINE.md` | how-to/stellar_trustline | current | link-rewrite only |
| `sdk/docs/CONFIGURE_SDK.md` | how-to/configure_sdk | minor-drift | **M**: "all 20 supported chains" (L305) → 21 incl. HEDERA (#162)/don't hardcode. Add `analytics` + per-feature option slots to SodaxOptions overview (L19). **L**: add `leverageYield` service row (L278-292); `hubProvider` type is `HubProvider` not `EvmHubProvider`. |
| `sdk/docs/ESTIMATE_GAS.md` | how-to/estimate_gas | minor-drift | **M**: Example 2 passes `tx: supplyResult.value` — must be `.value.tx` (would not type-check) |
| `sdk/docs/MONETIZE_SDK.md` | how-to/monetize_sdk | minor-drift | **M**: prose (L65) "optional `partnerFee` second argument" — `getQuote` takes ONE payload object with `partnerFee` as a field |
| `sdk/docs/WALLET_PROVIDERS.md` | how-to/wallet_providers | current | — |
| `sdk/docs/LOGGING.md` | (how-to, if synced) | current | Reviewed in the config-misc audit unit (matches `SodaxLogger`, #187). Was missing from this table originally — added for completeness. |
| `sdk/docs/MIGRATION.md` | functional/migration | current | keep as migration note |
| `sdk/docs/ARCHITECTURE_REFACTOR_SUMMARY.md` | (not synced) | **stale/internal** | **Do NOT sync.** Concept 5/6 error model (`switch(error.message)`, `new Error('PHASE_FAILED')`, "module error types deleted") contradicts live `SodaxError.code`. Concept 3 `SwapActionParams.fee?` no longer exists (now `extras?`). If a public Architecture page is wanted, rewrite from scratch dropping v1-refactor framing. |
| `sdk/CHAIN_ID_MIGRATION.md` | (not synced) | internal | one-time v1→v2 rename table; appendix only, not a standing reference |

**Cross-cutting gap:** the `analytics` client-side option (opt-in user-action
tracking, `ConfigService.analytics`) is **shipped but undocumented anywhere** — add
coverage (CONFIGURE_SDK or a LOGGING sibling).

**Not yet triaged (fold into the verify pass — see plan Phase 4 / S4.10):** the
0-agent audit did NOT triage `sdk/docs/installation/nextjs.md`, repo-root
`README.md` (⚠ hardcodes "21 blockchains / EVM (13) / Non-EVM (8)" — no-count
violation), `dapp-kit/src/hooks/backend/README.md`, and ~6 of the 13
`wallet-sdk-react/docs/*.md` (only 7 were reviewed). Listed here so "ALL docs" is
honest about what remains.

**Mechanical (all synced pages):** cross-doc links are hardcoded
`github.com/icon-project/sodax-sdks/blob/…` URLs — rewrite to site-relative at
publish. `BITCOIN_INTEGRATION.md` carries an "Agent Instructions" footer that
STAKING/STELLAR lack — normalize.

## 5. Per-package doc-gap classification

| Package | Live page today | State | Action |
|---|---|---|---|
| `@sodax/sdk` | foundation/sdk (+ feature modules) | synced, some drift | Fix drift rows above |
| `@sodax/swaps-api` | **none** | README-only, NEW (#254) | **New page.** README accurate but documents only ~3/24 client methods — add method/endpoint table, `SwapsApiConfig` options table, `SwapsApiError` code table, note only `quoteType:'exact_input'`, link `apps/swap-api-example` |
| `@sodax/skills` | **none** | README+AGENTS, NEW | **New page → Experience section** (per issue). Compose `README.md` + `AGENTS.md:1-97`; EXCLUDE maintainer section `AGENTS.md:99-189`. Fix skill count (see below). |
| `@sodax/types` | **none** | README-only | Decide: short standalone page cross-linked from sdk, OR fold into sdk. **Must fix**: Backend API contracts row lists `IConfigApi`/`SubmitSwapTx*` that DON'T EXIST — real names `IConfigApiV1/V2`, `SubmitTxRequestV2/ResponseV2/StatusResponseV2`, `SubmitIntentRequestV2/ResponseV2` (**H**). State recommended path = import from `@sodax/sdk`. |
| `@sodax/dapp-kit` | experience/dapp-kit | synced, drift | **H**: README omits entire **Leverage Yield** feature (9 `useLeverageYield*` hooks). **M**: +4 partner hooks, +3 NEAR-storage shared hooks. **L**: +2 bitcoin hooks, nearStorageGate utils. |
| `@sodax/wallet-sdk-core` | connection/wallet-sdk-core | current | Verify live page matches README; link-rewrite. README `network:'TESTNET'` ref is accurate (Bitcoin provider param). |
| `@sodax/wallet-sdk-react` | connection/wallet-sdk-react | drift | **M**: `ARCHITECTURE.md` says only `xConnections` persisted — also persists `userDisconnected`. **M**: `EVM_SWITCH_CHAIN.md` deep-imports `@sodax/wallet-sdk-react/hooks/useEthereumChainId` (no `./hooks/*` export). Split user-facing (README, WALLET_PROVIDER_BRIDGE, EVM_SWITCH_CHAIN, WALLETCONNECT, CHAIN_DETECTION) from internal (ARCHITECTURE, SUB_PATH_EXPORTS, ADDING_A_NEW_CHAIN). |
| `@sodax/libs` | none | internal shim | **EXCLUDE** from public docs. README self-declares "Not part of the public Sodax API"; a page would invite the direct-import it forbids. |

## 6. Repo `docs/` (Mintlify) issues

- `docs/index.mdx` **and** `docs/ai-integration-guide.md` both say **"four
  mode-gated skills"** — the installable set is **FIVE**: front-door `sodax-build`
  + four per-package (`sodax-sdk`, `sodax-wallet-sdk-core`, `sodax-wallet-sdk-react`,
  `sodax-dapp-kit`). `npx skills add` installs all five. **H** — fix to "five".
- The two files are near-duplicate content → collapse to one canonical page.
- `docs.json` nav only lists `index`; `ai-integration-guide.md` is orphaned.

## 7. Testnet facts (grounded) — for the how-to page + FAQ answer

- **Mainnet-only, verified**: `chain-keys.ts` = 21 keys, ALL `_MAINNET`
  (`_TESTNET` count = 0). `chains.ts` = every config `mainnet: true`; no
  `mainnet: false` anywhere in `types/src` or `sdk/src`. Canonical list =
  `@sodax/types` (`ChainKeys`, `chains.ts`, `RelayChainIdMap`).
- 21 supported networks: Sonic (hub) + Ethereum, Base, Arbitrum, Optimism,
  Polygon, BSC, Avalanche, Solana, Sui, Stellar, ICON, Injective, NEAR, Bitcoin,
  Stacks, Hedera, Kaia, HyperEVM, LightLink, Redbelly.
- The `testnet`/`TESTNET` strings that exist are **upstream chain-SDK params**
  (Bitcoin `network:'TESTNET'`, Stacks/Sui network unions), NOT a SODAX testnet.
- "Why no testnet" (inferred from architecture, not a written policy in code):
  cross-chain intents settle through the Sonic hub against real deployed contracts
  and live solver liquidity — no meaning without production liquidity/deployments.
- Draft page + FAQ answer text: see `plan.md` §Testnet deliverable.
