---
type: issue
repo: sodax-frontend
github: 1871
status: Active
tags: [sdk-upgrade, dependencies]
updated: 2026-09-18
related_decisions: []
---

# Bump @sodax/* to 2.2.0-rc.6

- Source: icon-project/sodax-frontend#1871 (SDK team: "please upgrade frontend sodax
  sdk to 2.2.0-rc.6 at your earliest convenience")
- Started: 2026-09-18
- Related PR: icon-project/sodax-frontend#1872

## Problem

`apps/web` pinned `@sodax/* 2.2.0-rc.5`; rc.6 was published with one `!` change.

## Context

- rc.5 → rc.6 = 20 commits. Breaking: `SuiSpokeService.assetManagerAddress` removed
  (#467; the fix reads the Sui asset manager package id per call, 10 s bound). The web
  app holds one `Sodax` per session, so it was exposed to the stale-cache bug.
- Other signature changes, no call site: `estimateSwapSpeedTier` (vault-keyed, #454),
  `isMoneyMarketReserveHubAsset` gone. `CONFIG_VERSION` 235 → 2020006 (#445).
- `d.ts` delta: sdk +1112/−46, dapp-kit +277/−3, types +37/−1, wallet-sdk-react ±5
  (comments). Mostly leverage positions (#374) and `@sodax/bridge-api` (#308).
- New token `sUSDS` on Sonic, Arbitrum, Base, Optimism, Ethereum + `Leveraged Soda
  sUSDS` vault on Sonic.

## Acceptance Criteria

Install, lint, checkTs, build green; log + CLAUDE.md updated. (Met.) Smoke matrix on
staging before promotion. (Owed.)

## Related

- Knowledge: none
- Decisions: none
