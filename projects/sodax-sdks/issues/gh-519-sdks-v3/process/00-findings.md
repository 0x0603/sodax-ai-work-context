---
type: process
repo: sodax-sdks
github: 519
session: standing
updated: 2026-10-19
---

# Standing findings (across sessions)

Moved here from the flat `process.md` when it was split on 2026-10-19.

## Findings

- Tree-shaking is effectively broken: one helper import = 832 KB gzip. Causes, all verified:
  import-time `initEccLib`, single flat dist with 142 impure top-level initializers, eager `Sodax`
  constructor, `@sodax/types` without `sideEffects`, `@sodax/types` inlined into 4 packages.
- Non-EVM chain libraries are ~70% of `new Sodax()` gzip (stub what-if).
- `@sodax/libs` injective bundle carries its own viem + ethers + axios.
- wallet-sdk-react `EvmProvider` shadows the app's QueryClient (v2 bug; see `ideas.md` §3).
- The monorepo's `pnpm` overrides do not protect consumers: a fresh consumer install reports 35
  advisories (11 high).
- v3 what-if for an EVM-only app: swap dapp 2,994 → 186 KB gzip (582 KB with WalletConnect);
  `npm i @sodax/sdk` 778 MB / 35 advisories → ~85 MB / 0; dapp install 1.8 GB / 81 → 108 MB / 0; Node
  import + `new Sodax()` 888 ms / 268 MB → ~92 ms / 74 MB.

## Changes During Work

- None in any icon-project repo. Nothing posted on GitHub.
