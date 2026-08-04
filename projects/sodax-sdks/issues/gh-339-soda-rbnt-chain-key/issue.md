---
type: issue
repo: sodax-sdks
github: 339
status: Active
tags: [tokens, chain-config, types]
updated: 2026-08-04
related_decisions: []
---

# GH-339 sodaRBNT declares chainKey redbelly, but the token only exists on Sonic

- Source: https://github.com/icon-project/sodax-sdks/issues/339
- Started: 2026-08-04
- Related PR: https://github.com/icon-project/sodax-sdks/pull/340

## Problem

`SodaTokens.sodaRBNT` in `packages/types/src/chains/tokens.ts` carried
`chainKey: ChainKeys.REDBELLY_MAINNET`. It is a Sonic hub vault token — every
other `SodaTokens` entry declares `SONIC_MAINNET`, and the map is spread into
`sonicSupportedTokens`, `swapSupportedTokens[SONIC]` and
`moneyMarketSupportedTokens[SONIC]`.

Reported by a teammate with a permalink to line 250 of the file at commit
`f5b04e88`.

## Context

On-chain proof gathered before filing:

- Sonic (`eth_chainId` `0x92` / 146): `0x4B207114F9118dEAC56436e1aE3c45648783c7Ac`
  answers `symbol() -> sodaRBNT`, `name() -> SODA RBNT`.
- Redbelly (`0x97` / 151): `eth_getCode` on the same address returns `0x`.

Corroborating signals inside the repo:

- `redbellySupportedTokens.RBNT.vault = SodaTokens.sodaRBNT.address` — vault
  addresses are hub-side (Sonic) addresses.
- `packages/sdk/src/e2e-tests/e2e.test.ts` already keys the token as
  `${ChainKeys.SONIC_MAINNET}|0x4b207114…`.

Consumers route on `token.chainKey`: `getWagmiChainId(xToken.chainKey)` in
`EvmXService.getBalance` and
`config.getSpokeTokenFromOriginalAssetAddress(token.chainKey, token.address)` in
`BridgeService`. Both were pointed at Redbelly for this token.

## Acceptance Criteria

- [x] `sodaRBNT.chainKey` is `SONIC_MAINNET`; address / `hubAsset` / `vault` untouched.
- [x] A registry-wide invariant test blocks any future `chainKey` / chain-list mismatch.
- [x] Changeset present (`@sodax/types` patch).
- [ ] PR #340 reviewed and merged.

## Related

- Knowledge:
- Decisions:
