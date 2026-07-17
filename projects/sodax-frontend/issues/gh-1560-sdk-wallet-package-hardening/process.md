---
type: process
repo: sodax-frontend
github: 1560
updated: 2026-07-16
---

# Process

## Log

- 2026-07-16 — Cross-referenced #1560 (Codex, sodax-frontend audit Phase 2)
  against #1448 (SDK security review, sodax-sdks, 17-High, PR sodax-sdks#247).
- Created branch `fix/security-audit-1560` in sodax-sdks off `main` (1c91a223),
  independent of `fix/security-review-1448`.
- Verified each finding against current v2 source; only WALLET-L-1 needed code.

## Findings

- **No code-fix overlap** between #1448's PR #247 (relay timeout, mm-math,
  Stellar trustline, EVM/store persist) and any #1560 file.
- **Finding-level overlap (3):** SDK-H-1 = #1448 `#8`/`#17`; SDK-M-1 = `#2`;
  WALLET-M-1 = `#1`. All three are `accepted-risk` in #1448 with verified basis
  (SDK-H-1 checked against `sodax-contracts`). They must be closed by
  cross-linking, not re-fixed.
- **WALLET-L-1 has two parallel copies**, both public API, both flawed the same
  way (resolve-first-by-type, no request/response correlation):
  - `packages/wallet-sdk-core/src/wallet-providers/icon/IconWalletProvider.ts`
    (audit-cited; `requestJsonRpc` is called by `sendTransaction`).
  - `packages/sdk/src/shared/entities/icon/HanaWalletConnector.ts`
    (public `@sodax/sdk` helper returning `Result<T>`; no internal callers).
- WALLET-M-2: `UnsafeBurnerWalletAdapter` has 0 matches in the repo; the v2
  `SolanaProvider` mounts `emptyWallets` and the SOLANA slot is opt-in → the
  cited flaw no longer exists (line numbers were pre-v2).
- WALLET-L-2: `resolveNetwork()` + `this.network` are used on the private-key,
  read, and balance paths; only `sendTransactionWithAdapter` still passes
  `this.defaults.network ?? 'mainnet'` (a browser extension controls its own
  node anyway, so a custom endpoint can't be forced through it).

## Changes During Work

- WALLET-L-1 fix landed in both copies: serialize ICONEX requests through one
  module queue, match each JSON-RPC response by its `id`, and add a ~5 min
  timeout with guaranteed listener cleanup. Tests added in both packages.
- Consumer docs updated (wallet-sdk-core `icon/SKILL.md` and
  `integration/knowledge/features/icon.md`).
- Note: environment build is partially broken here — `@sodax/swaps-api` DTS does
  not resolve during `@sodax/sdk` build, blocking full `pnpm build` / `check:ai`.
  Pre-existing, unrelated to these edits.
