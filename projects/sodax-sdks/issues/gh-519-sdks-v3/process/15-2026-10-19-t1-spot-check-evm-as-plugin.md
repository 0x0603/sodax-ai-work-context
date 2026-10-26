---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-19
updated: 2026-10-19
---

# 2026-10-19 — T1 spot-check on main 0181a053; EVM as a plugin

- **Still true on main:**
  - `SpokeService` builds 10 spokes eagerly (`SpokeService.ts:132-156`), and its dispatcher methods
    sit at the line numbers `research/b-sdk-core-chains.md` cites;
  - `shared-utils.ts:25-28` imports the Sui, Solana, Stellar and Stacks libraries for the codecs;
  - 21 `spoke.bitcoin.` sites; 14 dapp-kit files use `sodax.spoke.{bitcoin,stellar,near}`
    (research said 13).
- **Not proven:** registry, lazy spokes, chain moves, package extraction and declaration-merging
  types are still code-reading only. Nothing was built or run.
- **EVM as its own package: rejected.**
  - The hub is EVM. Features build hub multicalls with `Erc20Service.encode*` (Bridge, MM, Staking,
    EvmSolver), so viem and the ERC-20 code stay in core either way.
  - EVM-spoke branching in features is about 30 pure-guard sites in 8 files:
    - allowance spender selection;
    - EIP-5792 atomic batch in `SwapService.ts:825`.
  - They are the same class as the Stellar trustline branches and are not a blocker.
  - Recommended instead: EVM and Sonic as built-in plugin objects inside the sdk.
