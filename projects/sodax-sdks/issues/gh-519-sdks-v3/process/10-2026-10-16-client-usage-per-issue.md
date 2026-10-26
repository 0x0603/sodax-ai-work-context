---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-16
updated: 2026-10-16
---

# 2026-10-16 — client usage per issue

- **Request:** the user asked, for every issue, what users get once it lands and how a client uses it.
- **Before examples:** checked against cc053fef — `SodaxProvider({ config })`,
  `SodaxWalletProvider({ config })`, `useQuote({ params: { payload } })`,
  `useSwap()({ params, walletProvider })`, `useWalletProvider({ xChainId })`,
  `getSwapQuoteQueryOptions({ sodax, payload })`, `useSwapLifecycle(...)`,
  `new SwapsApi({ baseUrl, timeout, apiKey })`, `PrivateKeyEvmWalletConfig`, `sodax.initialize()`,
  `ChainKeys.SOLANA_MAINNET`, `privy(options)`.
- **After examples:** the names the research proposes, marked *(proposed)* until the ADRs.
- **Written to** `client-usage.md`: an index (auto / opt-in / 3.0 / internal / later) and one section
  per issue.
