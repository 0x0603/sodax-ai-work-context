---
type: steps
repo: sodax-sdks
github: 265
status: Active
updated: 2026-07-13
---

# GH-265 — micro-steps (follow-along)

> Derived from `plan.md` + `reference/audit-findings.md`. Work top-to-bottom; tick
> `[ ]`→`[x]` only after the fix is verified against the cited `src`. All edits are
> in `sodax-sdks` markdown. Paths are repo-relative to `sodax-sdks/`.

## Phase 0 — unblock (sync mechanism CONFIRMED: edit sodax-sdks → sodax-document sync → GitBook)
- [x] **S0.1** DONE — cloned `sodax-document` (`/Users/leon/Documents/GitHub/sodax/
      sodax-document`), read `sync-sodax-sdks.sh`. Findings in `process.md`: sync
      copies specific named files from the `sodax-sdks` submodule (no glob → a new
      page needs a new `copy_file` line + `SUMMARY.md` entry); `faq.md`, `how-to/`,
      `SUMMARY.md`, `technical-overview/` are **directly editable** (not synced).
      → Testnet how-to + FAQ authored directly in sodax-document.

## Phase 1 — testnet (DavidFBD ask) — DONE (sodax-document PR #20, sodax-sdks PR #278)
- [x] **S1.1** How-to page authored directly in sodax-document:
      `developers/how-to/testnet.md`, answers all four phrasings + next steps; added
      to `SUMMARY.md`. (Directly editable — not synced.)
- [x] **S1.2** FAQ answer added to `developers/faq.md` as Q#2 (directly editable).
      Also fixed Q1 stale hardcoded chain count + added Hedera.
- [x] **S1.3** Fixed `sdk/docs/BITCOIN_INTEGRATION.md` — removed
      `<SodaxProvider testnet={false}>` (sodax-sdks PR #278).

## Phase 2 — High-severity fixes — DONE (sodax-sdks PR #279)
- [x] **S2.1** HOW_TO_MAKE_A_SWAP.md Step 7 → `switch(error.code)` (EXECUTION_FAILED/
      RELAY_TIMEOUT); SOLVER_API_ENDPOINTS.md same; SWAPS.md `SwapCreateIntentError`.
- [x] **S2.2** types/README.md backend row → real V1/V2 names + import-from-sdk note.
- [x] **S2.3** dapp-kit/README.md Leverage Yield section + partner/NEAR/bitcoin hooks
      + nearStorageGate util (no counts).
- [x] **S2.4** docs/index.mdx + ai-integration-guide.md reworded count-free (BOTH the
      opening line AND the install line "four mode-gated skill directories" — the 2nd
      was a fleet miss I caught in review). Files NOT merged.

## Phase 3 — new package pages — DONE (sodax-sdks #279 + sodax-document #21)
- [x] **S3.1** `@sodax/swaps-api` — swaps-api/README expanded to full reference
      (methods/config/error tables, exact_input note, example link → absolute URL).
      Registered in sodax-document sync script → `packages/foundation/swaps-api.md`.
- [x] **S3.2** `@sodax/skills` → **Experience** — skills README (already count-free)
      registered → `packages/experience/skills.md`.
- [x] **S3.3** `@sodax/types` — DECISION: no separate page. The sync script
      `rm -f`s the types page by design; types are re-exported from `@sodax/sdk`.
      Kept types/README accurate + added import-from-sdk note. (Not folded into sdk page.)
- [x] **S3.4** `@sodax/libs` — DECISION: excluded (self-declared internal; no page).

## Phase 4 — remaining minor drift — DONE (sodax-sdks PR #279)
- [x] **S4.1** LEVERAGE_YIELD_APR.md `lsodaJITOSOL` row; LEVERAGE_YIELD.md broadened.
- [x] **S4.2** RELAYER_API_ENDPOINTS.md `RELAY_POLLING_FAILED` + dropped false `HTTP_REQUEST_FAILED`.
- [x] **S4.3** INTENT_RELAY_API.md `OnDemandRelayData` + `pollTxHash?` + `selectPacket?`.
- [x] **S4.4** SOLVER_API_ENDPOINTS.md swap-error example → `error.code`.
- [x] **S4.5** CONFIGURE_SDK.md de-hardcoded chains, added `analytics`+`leverageYield`+slots, `hubProvider` type.
- [x] **S4.6** ESTIMATE_GAS.md `.value.tx`; MONETIZE_SDK.md getQuote prose; SWAPS.md `SwapCreateIntentError`.
- [x] **S4.7** Analytics option documented (new `## Analytics` section in CONFIGURE_SDK.md).
- [x] **S4.8** wallet-sdk-react ARCHITECTURE.md (`userDisconnected`) + EVM_SWITCH_CHAIN.md import;
      remaining `docs/*.md` triaged (verified user-facing, no drift; ARCHITECTURE + ADDING_A_NEW_CHAIN = internal).
- [x] **S4.9** sdk/README.md Node `>=20.12.0` + `dex`/`leverageYield` modules.
- [x] **S4.10** LOGGING.md + installation/nextjs.md + dapp-kit backend README verified current;
      root README + BRIDGE.md + wallet-sdk-react README de-hardcoded chain counts (last 2 caught in review).

## Phase 5 — publish via `sodax-document` — DONE (PRs open, awaiting review)
- [x] **S5.2** sodax-document sync script maps swaps-api (Foundation) + skills
      (Experience) + SUMMARY nav (PR #21). ARCHITECTURE_REFACTOR_SUMMARY.md +
      CHAIN_ID_MIGRATION.md confirmed NOT in the sync script (never synced).
- [x] **S5.3** Final grep sweep on sodax-sdks docs — zero hardcoded counts / stale
      patterns in synced docs (POST_EXECUTION_FAILED only in SWAPS.md migration table
      + non-synced ARCHITECTURE_REFACTOR_SUMMARY).
- [~] **S5.4** PRs opened + signed + Verified; **awaiting human review/merge** →
      then run `bash sync-sodax-sdks.sh` post-merge to publish. (Merge order:
      sodax-sdks #278/#279 first, then re-sync for sodax-document #21's swaps-api page.)

## PRs — ONE per repo (signed + GitHub-Verified; #278 + #20 folded in & closed)
- **sodax-sdks #279** — verify docs vs code + testnet example fix + swaps-api reference
  (all Phase 1 sodax-sdks + 2 + 4 + Phase 3 source). Branch `docs/265-verify-and-new-pages`.
- **sodax-document #21** — testnet how-to + FAQ (+ Q1 count fix) + register swaps-api/skills
  pages (Phase 1 sodax-document + 3 + 5). Branch `docs/265-register-new-pages`.
- Merge order: **#279 first**, then `bash sync-sodax-sdks.sh` so #21's swaps-api page gets full content.
