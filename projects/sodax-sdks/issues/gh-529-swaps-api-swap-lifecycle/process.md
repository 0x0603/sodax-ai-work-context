---
type: process
repo: sodax-sdks
github: 529
updated: 2026-10-16
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### 2026-10-16 — issue created

User asked for it after the #511 review discussion. Verified before writing: sodax.com swap uses the API-lane
hooks (`swap-confirm-dialog.tsx`); `useSwapLifecycle` wraps `useSwapWithApproval` only; playground `broadcast`
families; submit-tx needs `intent` + `relayData` (`backendApiV2.ts:614-617`). Issue body in English, no estimate.

Same day: user decided the hook is multi-chain from the start. Issue body edited: requirement in Proposal (sign through
each family's wallet provider, as playground `broadcast` does for EVM/Solana/Sui/Stellar/NEAR/Stacks/Injective incl. the
sender check), "start EVM-only" removed from open questions, Bitcoin/ICON left open, per-family signing tests in Done when.

## Findings

## Changes During Work
