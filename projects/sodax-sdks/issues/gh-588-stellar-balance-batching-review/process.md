---
type: process
repo: sodax-sdks
github: 588
updated: 2026-10-30
---

# Review evidence

## 2026-10-30

- GitHub connector authentication failed; authenticated `gh` provided PR metadata, issue, comments and CI results.
- Reviewed head `032b3e8e3961ca1d4de326558191aac05f66725d` against base `8efa9155f83d058bd60757b08a45e087068e24c0`.
- `StellarXService.ts:96` returns zero for a configured classic asset with no trustline, including the asset issuer.
- Read-only mainnet probe derived the USDC issuer and contract from `spokeChainConfig`, loaded that issuer through the package's default Horizon endpoint and simulated `balance(issuer)` through the default Soroban endpoint. The account has no trustline for its own USDC; simulation succeeds with `9223372036854775807`.
- The upstream host source explicitly returns `i64::MAX` for the issuer: https://github.com/stellar/rs-soroban-env/blob/main/soroban-env-host/src/builtin_contracts/stellar_asset_contract/balance.rs#L385-L405
- A temporary regression probe expecting that value fails on the head (`0n`) and passes with the base service implementation. Temporary source/test files were removed.
- Existing wallet-react tests: 329 passed across 30 files.
- Wallet-react `checkTs`: passed, including test-program and cast-comment checks.
- Biome lint for all three changed TypeScript files: passed without fixes.
- `check:ai-dev-files`, `check:doc-links`, `check:docs-pages`: passed.
- Remote CI build/test, docs, security and E2E checks succeeded. Advisory Plan check fails because issue #588 lacks `plan-approved`; its plan comment exists now.
- Rejected speculative findings: generic simulation failures already became zero before this PR; this is retained behavior explicitly requested by the issue, not a new regression.

## 2026-10-30 re-review

- Reviewed updated head `63abd21eb08f117971c343a8451fb309eac3d437`, including its incremental diff from the previously reviewed head and the full runtime diff against the unchanged base.
- The config-derived contract-to-issuer map returns `2n ** 63n - 1n` for the issuer and zero for other accounts without a trustline. Existing trustline and custom-token paths remain intact.
- New coverage checks USDC at its issuer alongside an unrelated asset with no trustline, and asserts that neither needs a simulation.
- Wallet-react tests: 330 passed across 30 files; package typecheck passed.
- Read-only changed-file Biome lint, AI dev-file validation, doc links and generated docs checks passed. `git diff --check` passed and the SDK working tree remains clean.
- No additional actionable code findings.
- Remote CI run `41014205903`: Build and Test still running when inspected; E2E, docs and security checks pass. Advisory Plan run `41014205956` reports missing trusted plan/approval metadata plus `Resource not accessible by integration`; the earlier issue plan comment was visible to authenticated gh.
