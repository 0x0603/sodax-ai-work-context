---
type: outcome
repo: sodax-sdks
github: 339
status: In review
updated: 2026-08-04
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/340
- Commits: `ce825197c` fix(types): file sodaRBNT under Sonic, not Redbelly
- Tests: `packages/types` 314 passed (84 new); workspace `checkTs` + `test`
  green via the pre-commit hook.

## Summary

`SodaTokens.sodaRBNT` now declares `SONIC_MAINNET`. The token is a Sonic hub
vault token — its address only has code on Sonic — so every consumer routing on
`token.chainKey` (wagmi chain id for balance reads, spoke token lookup in
`BridgeService`) now targets the right chain instead of Redbelly.

## What Changed

- `packages/types/src/chains/tokens.ts` — `chainKey` on the `sodaRBNT` entry.
  Address / `hubAsset` / `vault` untouched, so `redbellySupportedTokens.RBNT`
  keeps pointing at the same hub vault.
- `packages/types/src/chains/tokens-chain-key.test.ts` (new) — every token
  listed under a chain must declare that chain's key, across
  `supportedTokensByChain`, `swapSupportedTokens`, `stagingSwapSupportedTokens`
  and `moneyMarketSupportedTokens`.
- `.changeset/soda-rbnt-chain-key.md` — `@sodax/types` patch.

## Follow-ups

- None planned. `tokens-dedup.test.ts` and the new file now cover duplicates and
  chain-key mismatches; an address-belongs-to-the-declared-chain check would
  need live RPC, so it does not belong in unit tests.
