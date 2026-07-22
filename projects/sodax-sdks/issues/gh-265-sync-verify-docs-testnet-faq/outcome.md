---
type: outcome
repo: sodax-sdks
github: 265
status: In Review
updated: 2026-07-13
---

# Outcome

- PRs — **one per repo** (signed + GitHub-Verified, awaiting review):
  - sodax-sdks **#279** — verify SDK docs vs code + testnet example fix + swaps-api
    reference (22 files). (Absorbed the bitcoin-fix PR #278, now closed.)
  - sodax-document **#21** — testnet how-to + FAQ answer (+ Q1 count fix) + register
    swaps-api/skills pages (sync script + SUMMARY + seeded). (Absorbed testnet PR #20, closed.)
  - Consolidated to one PR/repo per user request (#278 + #20 closed, branches deleted).
- Commits: signed with new key `~/.ssh/id_ed25519_sodax_signing` (see [[sodax-git-signing-key]]).
- Tests: docs-only; no code/tests. Verified each fix against current `src`; final grep sweep clean.

## Summary

Delivered all three issue asks:
1. **Verified all existing SDK docs vs code** and fixed the drift (2 High + ~10 medium/low),
   with an explicit in/out scope so nothing was silently skipped.
2. **New package pages** for `@sodax/swaps-api` (Foundation) and `@sodax/skills`
   (Experience) — single `.md`, registered in the `sodax-document` sync script + nav.
3. **Testnet** how-to page (`/developers/how-to/testnet`) + condensed FAQ answer,
   grounded (mainnet-only), with retention-focused next steps.

## What Changed

- **Testnet (Phase 1):** authored `developers/how-to/testnet.md` + FAQ Q2 directly in
  sodax-document (directly-editable, not synced); removed the non-existent `testnet`
  prop from BITCOIN_INTEGRATION.md; fixed FAQ Q1's stale hardcoded chain count.
- **Verify + fix (Phases 2/4):** swap error examples → `SodaxError.code`; types README
  backend row → real V1/V2 symbols; dapp-kit Leverage Yield + missing hooks; relay/intent
  codes + on-demand types; CONFIGURE_SDK (analytics, leverageYield, de-hardcoded chains);
  ESTIMATE_GAS / MONETIZE_SDK; leverage-yield vault; sdk/README; wallet-sdk-react docs;
  de-hardcoded chain counts in BRIDGE.md, root README, wallet-sdk-react README.
- **New pages (Phase 3):** expanded swaps-api README to a full reference; registered
  swaps-api + skills in `sync-sodax-sdks.sh` + `SUMMARY.md`; seeded both page files.
- **Decisions:** `@sodax/types` — no separate page (re-exported from sdk; sync `rm`s it);
  `@sodax/libs` — excluded (internal). ARCHITECTURE_REFACTOR_SUMMARY.md +
  CHAIN_ID_MIGRATION.md — not synced (internal/stale), left as-is.
- Applied the **no-hardcoded-counts** rule throughout ([[docs-no-hardcoded-counts]]).

## Follow-ups

- **Merge order:** land sodax-sdks #278/#279 first, then run `bash sync-sodax-sdks.sh`
  in sodax-document so #21's swaps-api page picks up the expanded README.
- Human review of the 4 PRs + GitBook previews, then approve/merge to publish.
- Optional later: a public "Architecture" page rewritten from scratch (the internal
  ARCHITECTURE_REFACTOR_SUMMARY is intentionally not synced).
