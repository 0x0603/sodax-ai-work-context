---
type: plan
repo: sodax-sdks
github: 265
updated: 2026-07-13
---

# Plan — sync + verify SDK docs, new package pages, testnet how-to & FAQ

> Grounded in a full doc-vs-code audit + live-site recon (2026-07-13). Every claim
> traces to `reference/audit-findings.md`. This is a **docs-only** task — all edits
> land in `sodax-sdks` (markdown), none in this context repo.

## Goal

Make `docs.sodax.com/developers` faithful to the shipped code and complete:
1. Fix drift in the docs already synced there.
2. Author single-`.md` pages for the packages that have none (`swaps-api`,
   `skills`→Experience; decide `types`).
3. Ship the testnet how-to page + a condensed FAQ answer, both code-grounded.

## Sync mechanism — CONFIRMED (R0bi7, 2026-07-13)

Source of truth = **`sodax-sdks` markdown**. A separate **`sodax-document`** repo
(the GitBook source) holds a **sync script that links the two repos** and maps
`sodax-sdks` docs → the GitBook page tree that publishes to `docs.sodax.com`.

Publish flow:
1. Edit + merge docs into **`sodax-sdks` main**.
2. Trigger the **sync script in `sodax-document`** → it creates a new
   `sodax-document` branch with the pulled docs.
3. Open a **PR to `sodax-document` main** — the PR carries a **GitBook preview**.
4. A reviewer approves → merge to `sodax-document` main → publishes to
   `docs.sodax.com`.

Implications for this issue:
- All content edits (verify/fix + new pages) land in **`sodax-sdks`** — my earlier
  recommended path. The repo `docs/` Mintlify project (PR #262) is a *separate*
  effort, NOT the docs.sodax.com source; don't route package pages through it.
- **New pages** (swaps-api, skills→Experience, testnet how-to) only appear on the
  site if the **`sodax-document` sync script/config maps them**. Existing pages sync
  because their `sdk/docs/*.md` filenames are already mapped. So Phase 0 = read that
  sync script to learn (a) the file→page mapping + nav structure, and (b) how to
  register a new page/section. **`sodax-document` is NOT in this workspace** — need
  to clone it / get pointed at the sync script.

## Approach

Content is independent of the plumbing, so **do the content in `sodax-sdks` first**
(verify/fix + author), then handle registration + the `sodax-document` PR. Order by
value: testnet (explicit stakeholder ask, smallest) → High-severity fixes → new
package pages → remaining drift → publish via `sodax-document`.

### Scope of "verify ALL existing docs" (Task 1) — explicit in/out list

Task 1 says **ALL** docs, so nothing is dropped silently. The synced set is defined
by the `sodax-document` sync script (Phase 0 confirms it); until then, this is the
working scope:

- **In scope — verify vs code** (synced or code-coupled user docs):
  - all `packages/sdk/docs/*.md` **including `LOGGING.md`** and the
    `packages/sdk/docs/installation/*.md` subfolder (`nextjs.md`);
  - each public package `README.md` (sdk, swaps-api, dapp-kit, wallet-sdk-core,
    wallet-sdk-react, types, skills);
  - `packages/wallet-sdk-react/docs/*.md` — the **user-facing** ones (per Phase 0
    mapping); triage all, not just ARCHITECTURE/EVM_SWITCH_CHAIN;
  - `packages/dapp-kit/src/hooks/backend/README.md` (per-hook API list — drift-prone);
  - repo-root `README.md` (⚠ hardcodes "21 blockchains: EVM (13)/Non-EVM (8)" — the
    exact no-count anti-pattern) and `docs/` Mintlify pages.
- **Out of scope — record why, don't silently skip:**
  - `packages/libs` (internal shim), `packages/assets` (brand logos, private);
  - `packages/*_FEATURE_MIGRATION_SUMMARY.md`, `ARCHITECTURE_REFACTOR_SUMMARY.md`,
    `CHAIN_ID_MIGRATION.md` (internal refactor/migration snapshots — not synced);
  - `CONTRIBUTING.md`, `RELEASE_INSTRUCTIONS.md`, per-package `AGENTS.md`/`CLAUDE.md`
    (contributor/maintainer docs, not product docs) — verify only if Phase 0 shows
    them synced;
  - `apps/*/README.md` (example-app docs).

The `SWAPS.md` template governs every new/【rewritten】page: `# Title` + intro →
`## Using SDK Config and Constants` → `## Available Methods` → `## Core Concepts`
(chain keys, raw/signed, `Result<T>`, error table) → one `## <Operation>` per method
with a `typescript` example → `## Error Handling Examples`.

**Doc-content rule — NEVER hardcode exact counts** (chains, hooks, methods, skills,
vaults). They drift and are painful to maintain. Describe by pattern/prefix or
formula instead: "one skill per `@sodax/*` SDK package (plus the `sodax-build`
front-door skill)", "the `useLeverageYield*` hooks", "every supported chain in
`ChainKeys`". A named/bulleted list of items is fine; a numeral asserting how many
is not. (This is also why CONFIGURE_SDK's "20 chains" is a *fix*, not a bump to 21.)

## Phased plan

### Phase 0 — Read the `sodax-document` sync script (HARD prerequisite for landing)
Clone/inspect `sodax-document`. From its sync script learn:
- the `sodax-sdks`→page mapping + nav/section structure (Foundation/Connection/
  Experience/How-to/FAQ) and how to register a NEW page + section;
- **where the FAQ + How-to source markdown actually lives.** There is **no `FAQ.*`
  and no how-to source file in `sodax-sdks`** (repo-wide search confirms) — so the
  testnet how-to page and the FAQ answer either land as **new files in `sodax-sdks`
  that the sync maps**, or as **direct edits in `sodax-document`**. Phase 1 content
  is drafted, but it has **no home until this is answered** — this is a hard blocker
  for *landing* the two most specific asks, even though the drafts are ready.

Content **edits** to already-synced files (Phases 2, 4) don't wait on this; only the
**new-page/FAQ landing** (Phases 1, 3) does.

### Phase 1 — Testnet how-to + FAQ answer (the DavidFBD ask)
- New how-to page `how-to/testnet` (or `is-sodax-on-testnet`) from the grounded
  draft below. **Source file location = TBD by Phase 0** (likely a new
  `sdk/docs/TESTNET.md` mapped to `how-to/testnet`, by analogy with the other
  how-to pages which map from `sdk/docs/*.md`; or a file in `sodax-document`).
- Add the condensed answer to the **FAQ source markdown** — location TBD by Phase 0
  (the live `developers/faq` is a stub; no FAQ source exists in `sodax-sdks`).
- Ensure the page is findable by all four question phrasings the issue lists ("Is
  SODAX on testnet? / SODAX testnet? / Why is SODAX not available on testnets? / Can
  I integrate SODAX on testnet?") — use them as headings/keywords.
- **Bonus bug fix** (same theme): `sdk/docs/BITCOIN_INTEGRATION.md:42` shows
  `<SodaxProvider testnet={false}>` — no such prop exists. Remove it.

### Phase 2 — High-severity drift fixes (docs teach broken/false code)
- `sdk/docs/HOW_TO_MAKE_A_SWAP.md` — rewrite the "Complete Example" Step 7 error
  block from `if (error instanceof Error) switch(error.message){…'POST_EXECUTION_FAILED'…}`
  to `switch(swapResult.error.code)` (the pattern already correct in Step 9).
- `packages/types/README.md` — fix the Backend API contracts row: replace the
  non-existent `IConfigApi`/`SubmitSwapTx*` names with the real
  `IConfigApiV1/V2`, `SubmitTxRequestV2/ResponseV2/StatusResponseV2`,
  `SubmitIntentRequestV2/ResponseV2`.
- `packages/dapp-kit/README.md` — add the missing **Leverage Yield** section
  covering the `useLeverageYield*` hooks (an entire shipped feature is undocumented).
  Name/list the hooks; do NOT state a count.
- `docs/index.mdx` + `docs/ai-integration-guide.md` — the "four mode-gated skills"
  line both undercounts (omits the `sodax-build` front-door skill) AND hardcodes a
  number. **Reword only** to describe the structure without a numeral, e.g. "a
  `sodax-build` front-door skill plus one mode-gated skill per `@sodax/*` SDK
  package". **Do NOT merge/delete the two files** — that structural refactor isn't
  asked for by #265 and collides with the PR #262 Mintlify effort; flag the
  duplication to that owner as a note, don't act on it here.

### Phase 3 — New package pages (single .md, SWAPS.md template)
- **`@sodax/swaps-api`** → new page. Keep the README intro/errors prose; ADD a
  method/endpoint table (each client method → verb+path, generated from `client.ts`
  — list them, don't count them), a `SwapsApiConfig` options table, a
  `SwapsApiError` code table, the `quoteType:'exact_input'`-only note, and a link to
  `apps/swap-api-example`.
  Placement: a tooling-module page alongside `backend_api`/`intent_relay_api`.
- **`@sodax/skills`** → new page in the **Experience** section (per the issue).
  Compose from `packages/skills/README.md` + `AGENTS.md:1-97`; **exclude** the
  maintainer section `AGENTS.md:99-189`. Use the count-free skills framing
  (`sodax-build` front-door + one skill per `@sodax/*` package).
- **`@sodax/types`** → decide: a short standalone reference page cross-linked from
  the SDK page (recommended) vs folding into the SDK page. Either way state the
  recommended path: `import from '@sodax/sdk'` (types are re-exported); direct
  `@sodax/types` install is the standalone/type-only case.
- **`@sodax/libs`** → **exclude**; it self-declares "Not part of the public Sodax
  API". Document the exclusion decision so it isn't re-raised.

### Phase 4 — Medium/low drift on already-synced pages
Batch the remaining `minor-drift` fixes from the triage (each is one small edit):
- `LEVERAGE_YIELD_APR.md` add `lsodaJITOSOL` vault row; `LEVERAGE_YIELD.md` broaden
  registry description.
- `RELAYER_API_ENDPOINTS.md` add `RELAY_POLLING_FAILED`, drop false
  `HTTP_REQUEST_FAILED` relay code.
- `INTENT_RELAY_API.md` add `OnDemandRelayData` union + `pollTxHash?` + `selectPacket?`.
- `SOLVER_API_ENDPOINTS.md` fix swap-error example to `SodaxError.code`.
- `CONFIGURE_SDK.md` de-hardcode "20 chains", add `analytics` + `leverageYield` +
  option slots + `hubProvider` type.
- `ESTIMATE_GAS.md` Example 2 `→ .value.tx`; `MONETIZE_SDK.md` getQuote payload
  prose; `SWAPS.md` `CreateIntentError → SwapCreateIntentError`.
- **New**: document the `analytics` client-side option (shipped, undocumented).
- `wallet-sdk-react/docs/ARCHITECTURE.md` (`userDisconnected` also persisted) +
  `EVM_SWITCH_CHAIN.md` (bad `./hooks/*` deep-import example), **plus a triage of
  the remaining `wallet-sdk-react/docs/*.md`** (CONNECT_FLOW, CONNECTORS,
  WALLET_MODAL, BATCH_OPERATIONS, SIGN_MESSAGE, CONFIGURE_PROVIDER, WALLETCONNECT,
  CHAIN_DETECTION, WALLET_PROVIDER_BRIDGE, SUB_PATH_EXPORTS, ADDING_A_NEW_CHAIN) —
  verify the user-facing ones, mark the internal/contributor ones out-of-scope.
- `sdk/README.md` Node `v18+ → >=20.12.0`; add `dex` + `leverageYield` modules.
- **`sdk/docs/LOGGING.md`** — verify vs `SodaxLogger` (audited = current, but was
  missing from the triage table; confirm as part of "all docs").
- **`sdk/docs/installation/nextjs.md`** — verify install steps vs current package
  exports (not previously triaged).
- **Repo-root `README.md`** — de-hardcode "21 blockchains / EVM (13) / Non-EVM (8)"
  per the no-count rule; reconcile module list with `sdk/src/index.ts`.
- **`dapp-kit/src/hooks/backend/README.md`** — verify its "Available Hooks" list vs
  `src/hooks/backend/`.

### Phase 5 — Publish via `sodax-document`
- Mechanical pass on everything touched: rewrite hardcoded
  `github.com/.../blob/…` cross-links to site-relative; normalize the "Agent
  Instructions" footer across sibling pages.
- Ensure the `sodax-document` sync script maps the NEW pages (swaps-api,
  skills→Experience, testnet how-to) + excludes the internal ones. Do NOT sync
  `ARCHITECTURE_REFACTOR_SUMMARY.md` (stale internal) or `CHAIN_ID_MIGRATION.md`.
- Merge the `sodax-sdks` docs PR(s) to main → trigger the sync script in a new
  `sodax-document` branch → open the `sodax-document` PR → review the GitBook
  preview → approve/merge to publish. Re-fetch each live page to confirm.

## Testnet deliverable (grounded drafts — ready to paste)

**How-to page (`how-to/testnet`, ~150 words):**

> **Is SODAX available on testnet?** No. The SODAX SDKs are **mainnet-only**. The
> canonical chain list in `@sodax/types` (`chain-keys.ts`, `chains.ts`) defines
> every supported chain as a `_MAINNET` entry flagged `mainnet: true` — there are
> no testnet chain configs, RPC endpoints, or network toggles in the SDK. The
> supported networks are Sonic (the hub) plus mainnets like Ethereum, Base,
> Arbitrum, Optimism, Polygon, BSC, Avalanche, Solana, Sui, Stellar, ICON,
> Injective, NEAR, Bitcoin, Stacks, and more — see `ChainKeys` in `@sodax/types`
> for the current list.
>
> **Why not?** SODAX is a cross-chain intents system: swaps, lending, staking and
> bridging settle through the Sonic hub against real deployed contracts and live
> solver-provided liquidity — primitives that have no meaning without production
> liquidity, so no parallel testnet environment exists.
>
> **Can I integrate on testnet?** No — point the SDK at mainnet. To test safely,
> use **small amounts on mainnet**, drive flows with the private-key wallet
> providers (see `apps/node`), and follow `@sodax/skills` for per-chain guidance.
>
> *(Any `testnet`/`TESTNET` value you see, e.g. in Bitcoin or Sui wallet config, is
> an upstream chain-SDK network parameter — not a SODAX testnet.)*

**Condensed FAQ answer (2–3 sentences):**

> No — SODAX is mainnet-only. Every chain in the canonical `@sodax/types` config is
> a `_MAINNET` entry (`mainnet: true`) with no testnet network or toggle, because
> SODAX's cross-chain intents rely on real deployed contracts and live solver
> liquidity that only exist on mainnet. To test, use small amounts on mainnet with
> the SDK's private-key wallet providers rather than a testnet.

## Verification

- After each doc edit, confirm the referenced symbol/signature against the cited
  `src` file (audit-findings has the citations). For code snippets in docs, ideally
  paste into a scratch `.ts` in the workspace and `checkTs` if practical.
- Re-fetch each live page after publish to confirm it rendered and links resolve.
- Grep the finished set for `POST_EXECUTION_FAILED`, `testnet={`, "four mode-gated",
  "20 supported chains", `IConfigApi`/`SubmitSwapTx` — all should be gone.

## Risks

- **`sodax-document` sync-script mapping** — new pages won't appear unless the
  script maps them; the exact registration mechanism is unknown until Phase 0 reads
  that repo (not in this workspace). Content is safe to author regardless.
- The repo `docs/` Mintlify project (PR #262) is NOT the docs.sodax.com source —
  don't accidentally route package pages through it; only fix the "four→five" skill
  count there.
- Backend/token-driven claims (per-feature supported-token lists) can't be fully
  verified from `src` alone — treat as "unflagged, confirm with backend config".
- Publishing is outward-facing and gated by the `sodax-document` PR + human
  approval — never self-publish; land via that review flow.
