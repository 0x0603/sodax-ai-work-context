---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-16
updated: 2026-10-16
---

# 2026-10-16 — a better wallet-sdk-react

- **Question:** is there a better approach than plain adapters, e.g. for wallet-sdk-react?
- **Code facts:**
  - `SodaxWalletProvider.tsx:5-10` statically imports the EVM, Solana and Sui providers, and
    `chainRegistry.ts` imports every chain;
  - only EVM, Solana and Sui need React providers;
  - sodax-frontend (54 files) and intents-whitelabel (27) use only SODAX hooks, with 0 direct imports
    of wagmi, `@solana/wallet-adapter-react` or `@mysten/dapp-kit`.
- **Recommendation** (`plan-v3-order.md` §12):
  - lazy chain adapters (T3.9): all-chain apps start near the EVM size (124 KB vs 2.6 MB, an estimate
    from measured entries; not prototyped);
  - a headless `createSodaxWallets()` (T3.8): wagmi-style; the object is the `WalletProviderSource`
    and replaces the singletons and fallback store;
  - later: SSR cookies for every chain (T3.11) and mock adapters (T3.12);
  - not now: bridges from other wallet stacks (no consumer yet), Reown AppKit (weight), a Wallet
    Standard rewrite (stays in T31/T32).
- **Gap found:** wallet-sdk-react's build switch was not covered by any sub-issue; added as T3.10
  (192 `@/` aliases).
- **Totals:** 448 pts / 160 sub-issues; 234 required for 3.0.
