---
type: process
repo: sodax-sdks
github: 265
updated: 2026-07-22
---

# Process

## Log

### 2026-07-13 — Investigation + planning (no code changes yet)

- Read issue #265 (author R0bi7, assignee me). Confirmed no prior plan existed.
- Ran an 18-agent fan-out: mapped live `docs.sodax.com`, classified every
  package's doc gap, audited each existing doc vs current `src`, gathered testnet
  facts. Full evidence saved to `reference/audit-findings.md`.
- Wrote `issue.md`, `plan.md`, `steps.md`. No `sodax-sdks` files touched.

### 2026-07-13 — Plan re-checked vs issue intent (adversarial critic)

- Ran an independent critic (plan vs issue #265). Verdict: Adequate→Strong on intent.
  Closed the gaps it + I found: (1) "ALL docs" now truly all — added LOGGING.md,
  installation/nextjs.md, root README (hardcodes chain counts), full
  wallet-sdk-react/docs, dapp-kit backend README to the verify pass, with explicit
  out-of-scope list (no silent drops). (2) FAQ + how-to source files don't exist in
  sodax-sdks → made locating them (in sodax-document) a HARD prerequisite for
  *landing* Phase 1. (3) Downscoped S2.4: reword the skill-count line only, do NOT
  merge the two Mintlify files (PR #262 territory). (4) Removed the "five skills"
  wording (no-count rule).

### 2026-07-13 — Phase 0 (sync recon) + Phase 1 (testnet) DONE, PRs opened

- Cloned `sodax-document` and read `sync-sodax-sdks.sh`. Concrete mechanism:
  - `sodax-sdks` is a git **submodule** at `linked-repositories/sodax-sdks`.
  - The sync script **copies specific named files** (no glob) from the submodule →
    `developers/`, injecting GitBook frontmatter. E.g. `sdk/docs/SWAPS.md` →
    `packages/foundation/sdk/functional-modules/swaps.md`; how-to files stay under
    `developers/packages/sdk/docs/`; `BITCOIN_INTEGRATION.md` → `how-to/bitcoin-integration.md`.
  - **Directly editable in sodax-document** (NOT synced/overwritten): `SUMMARY.md`,
    `developers/faq.md`, `developers/how-to/README.md`, `technical-overview/`,
    README. So FAQ + a new how-to page are authored directly here.
  - `developers/faq.md` already has 20 curated Q&As (not the live stub).
- **Phase 1 shipped as 2 PRs:**
  - `sodax-document` PR #20 (branch `docs/testnet-how-to-and-faq`): new
    `developers/how-to/testnet.md`, FAQ testnet Q#2, `SUMMARY.md` nav; also fixed
    FAQ Q1 stale hardcoded count (dropped 20/12/8, added Hedera).
  - `sodax-sdks` PR #278 (branch `docs/fix-bitcoin-testnet-example`): removed the
    non-existent `<SodaxProvider testnet={false}>` prop from BITCOIN_INTEGRATION.md.
- Commits **signed + GitHub-Verified**. The user's old signing key passphrase was
  lost → generated a new no-pass key `~/.ssh/id_ed25519_sodax_signing`, registered
  via `gh ssh-key add --type signing`, configured locally in both repos. See memory
  [[sodax-git-signing-key]].

## Findings

- **Sync mechanism (confirmed by R0bi7, 2026-07-13):** source of truth = `sodax-sdks`
  markdown; a separate **`sodax-document`** repo runs a sync script that maps
  sodax-sdks docs → GitBook, via PR-with-preview → approve → publish. Repo `docs/`
  (Mintlify, PR #262) is NOT the docs.sodax.com source. `sodax-document` is not in
  this workspace → S0.1 = clone/inspect its sync script for the file→page mapping +
  new-page registration.
- Most already-synced docs are accurate. Real fixes needed:
  - **High**: `HOW_TO_MAKE_A_SWAP.md` Step-7 error example (`error.message`/
    `POST_EXECUTION_FAILED`); `types/README.md` backend row (`IConfigApi`/
    `SubmitSwapTx*` don't exist); `dapp-kit/README.md` missing Leverage Yield;
    `docs/index.mdx`+`ai-integration-guide.md` "four"→"five" skills.
  - **Medium**: leverage-yield APR vault table, relay error codes, intent-relay
    on-demand types, solver swap-error example, CONFIGURE_SDK chain count/analytics,
    ESTIMATE_GAS example, MONETIZE_SDK getQuote prose, wallet-sdk-react ARCHITECTURE.
- **New pages needed**: `@sodax/swaps-api`, `@sodax/skills` (→Experience). `types`
  = decide. `@sodax/libs` = **exclude** (self-declared internal).
- **Testnet**: verified mainnet-only (21 `_MAINNET`, `mainnet:true`, 0 testnet).
  Drafts for how-to page + FAQ answer are in `plan.md`. Found stale
  `<SodaxProvider testnet={false}>` example bug (no such prop).

## Changes During Work

(none yet — planning only)

### 2026-07-22 — Testnet stance confirmed; PRs still awaiting review

- Cross-checked the delivered testnet page/FAQ (sodax-document PR #21) against the
  originating Discord thread (David, 30/6): all 4 question variants, the
  "why not" explanation, and the retention next-steps are covered; placement
  (how-to page + FAQ answer) matches David's suggestion.
- Open nuance resolved: Fez's "some chains do have testnets running with relays
  connected" will NOT be added — user confirmed SODAX is mainnet-only, no testnet.
  The page's flat "No — mainnet-only" answer stands as-is; no doc change needed.
- PR status check (2026-07-22): sodax-sdks #279 and sodax-document #21 both still
  OPEN, no review yet (9 days).

### 2026-07-22 — Re-verified PR #279 against current origin/main (d78cff77)

- Main gained 3 commits since the PR (hana→stacks connector, token logos,
  wallet-sdk-react security fix). PR is MERGEABLE (no conflicts), state BLOCKED
  (awaiting review) only.
- Spot-verified every factual claim in the #279 diff against origin/main — all
  hold: SwapErrorCode union (10 codes incl. EXECUTION_FAILED/RELAY_TIMEOUT),
  SwapCreateIntentError rename, RELAY_POLLING_FAILED in RelayCode,
  OnDemandRelayData/pollTxHash/selectPacket, IConfigApiV1/V2 + SubmitTx*V2 types,
  analytics types, sodax.leverageYield + hubProvider: HubProvider (Sodax.ts:38,41),
  lsodaJITOSOL + exact DefiLlama poolId, all 9 leverageYield hooks + new
  bitcoin/partner/NEAR-storage hooks + resolveNearStorageGate exist,
  valibot = regular dep, no testnet prop, useEthereumChainId not exported,
  engines node >=20.12.0, ChainKeys = 21 mainnet / 0 testnet,
  IntentTxResult.tx (ESTIMATE_GAS fix), GetQuoteParams.partnerFee payload field,
  swaps-api README method table = ISwapsApiV2 1:1 (21 methods).
- Two optional follow-ups (post-PR main changes, nothing in #279 is wrong):
  token-logo support in @sodax/types is undocumented; wallet-sdk-react
  ARCHITECTURE.md hydration section doesn't mention the new sanitize-on-hydrate
  merge from the security fix.
