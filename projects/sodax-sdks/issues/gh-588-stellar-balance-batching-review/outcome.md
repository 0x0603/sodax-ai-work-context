---
type: outcome
repo: sodax-sdks
github: 588
updated: 2026-10-30
status: Reviewed
---

# Review outcome

PR #590 has one confirmed P2 regression at `packages/wallet-sdk-react/src/xchains/stellar/StellarXService.ts:96`.

The missing-trustline shortcut also matches an asset's issuer. Stellar issuers cannot hold a trustline for their own asset, while the SAC's `balance(issuer)` returns `i64::MAX`. For the configured USDC issuer, the old service returns `9223372036854775807n` and the new service returns `0n`, incorrectly blocking issuer swaps through balance checks.

Check the configured `assetIssuer` before returning zero, preserve the SAC issuer semantics, and cover both the issuer and an ordinary account without a trustline in tests. This requires no extra per-token RPC calls.

Existing package tests, type checking, changed-file lint and relevant docs checks pass. The additional issuer regression probe fails on the PR head and passes on the base. The SDK working tree was left unchanged; no review was posted to GitHub.
