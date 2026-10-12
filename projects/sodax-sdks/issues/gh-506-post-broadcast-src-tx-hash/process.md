---
type: process
repo: sodax-sdks
github: 506
updated: 2026-10-12
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### Session 1 — 2026-10-09 (implementation)

- Branched `feat/506-post-broadcast-src-tx-hash` from `origin/feat/302-swap-lifecycle` @ `ab1ec388`
  (PR #504 head). Needed from #504: `MapRelayFailureCtx.srcTxHash`, `withErrorContext`,
  `summarizeSwapStatus` — all from commit `7f9e4b95`. `origin/main` @ `93f86c5d` was not ahead of #504.
- Mirrored #504's swap change exactly: a `txCtx` with `srcTxHash` replaces `baseCtx` inside the
  fallback steps; solver error re-issued with `withErrorContext`.
- Bridge verify error now also carries `action: 'bridge'` (it was the only bridge error without it;
  `txCtx` shape matches swap's).
- `summarizeSwapStatus` for leverage yield: documented + one test typed as
  `DetailedLeverageYieldStatus` (in `swap/detailedStatus.test.ts`). No alias — no caller needs one.
- Corrected two of my own earlier chat claims after reading main: leverage-yield backend submit-tx is
  default **ON** (`ConfigService.leverageYieldUseBackendSubmitTx ?? true`), and
  `leverageYield.getDetailedStatus` + `useLeverageYieldDetailedStatus` **exist**. My first answers
  came from a stale checkout (`feat/quote-too-small-refusal`).
- Fixed adjacent stale doc text while there: LEVERAGE_YIELD.md called the client-side path "the
  default"; BRIDGE.md's `RELAY_TIMEOUT` advice said "retry with longer timeout" (a second `bridge()`
  is a second deposit) → now "poll `getDetailedStatus` with `srcTxHash`".
- Gates: 7 new assertions fail with the source change reverted, pass with it; full sdk vitest
  2987/2987; sdk `checkTs` green after `pnpm i` + rebuilding `@sodax/types` (stale types dist from
  the old branch gave fake errors in #504 files); `check:ai` green; `check:doc-links` green;
  `docs:sync-pages` regenerated bridge.md + leverage_yield.md under `docs/`.
- Committed `2ec0db1d` (signed; full pre-commit hook passed after `TURBO_CONCURRENCY=2 pnpm build:packages`),
  pushed `feat/506-post-broadcast-src-tx-hash`, opened PR #509 with base `feat/302-swap-lifecycle`.
- Self-review of PR #509 → request-changes on docs only: BRIDGE.md `TX_SUBMIT_FAILED` still said
  "persist the input params and retry" (contradicts the new "never call `bridge()` again"), and
  "nothing left the wallet" overclaimed (Stellar `sendTransaction` turns a mid-submit transport error
  into `INTENT_CREATION_FAILED`). Both fixed locally + `docs/` copy regenerated; committed as `b33f91f9` and pushed to PR #509 (2026-10-12).
  Left alone: shared `reference/error-codes.md` "re-run with the same payload" for `TX_SUBMIT_FAILED`
  (cross-feature, pre-existing, about re-submitting the relay).
- 2026-10-12: committed the review fixes as a second commit `b33f91f9` (signed, full hook green) and
  pushed. PR now has 2 commits; the body's "one commit" box relies on squash merge.
