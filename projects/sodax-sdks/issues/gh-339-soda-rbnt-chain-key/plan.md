---
type: plan
repo: sodax-sdks
github: 339
updated: 2026-08-04
---

# Plan

## Goal

File `sodaRBNT` under Sonic and make this class of mismatch impossible to
reintroduce silently.

## Approach

One-line data fix plus an invariant test. No behavioural code touched — the
registry is the source of truth and every consumer reads `chainKey` from it.

## Steps

1. Verify the token's real home chain on-chain (RPC `symbol()` on Sonic,
   `eth_getCode` on Redbelly) instead of arguing from the config alone.
2. `chainKey: ChainKeys.SONIC_MAINNET` in `packages/types/src/chains/tokens.ts`.
3. New `packages/types/src/chains/tokens-chain-key.test.ts`: every token listed
   under a chain declares that chain's key, across `supportedTokensByChain`,
   `swapSupportedTokens`, `stagingSwapSupportedTokens`,
   `moneyMarketSupportedTokens`.
4. Changeset: `@sodax/types` patch (data fix, not a breaking API change).

## Verification

- `packages/types`: `pnpm test`.
- Revert the one-line fix and confirm the new test actually fails (guard proof).
- Workspace `pnpm checkTs` + `pnpm test` (the pre-commit hook runs both).

## Risks

- Low. The address, `hubAsset` and `vault` are unchanged, so Redbelly's `RBNT`
  entry keeps resolving to the same hub vault.
- The invariant test could surface pre-existing violations on other chains —
  checked first, `sodaRBNT` was the only one.
