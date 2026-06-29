---
type: process
repo: sodax-sdks
github: 252
updated: 2026-06-29
---

# Process

## Log

- 2026-06-29 — Triaged issue, scaffolded folder, mapped the Bitcoin connector
  architecture, confirmed the sats-connect provider-id API, wrote issue.md +
  plan.md. No code yet.

## Findings

- This is the `add-wallet-provider` skill, **Case A** (Bitcoin) —
  `wallet-sdk-react` only; no `wallet-sdk-core` / SDK / types / config change.
  Worked example: `.claude/skills/add-wallet-provider/references/example-bitcoin-connector.md`.
- **sats-connect provider-id pinning is confirmed.** `sats-connect@4.2.1`,
  `@sats-connect/core/dist/index.d.mts:349`:
  `request(method, options, providerId?)` — the **3rd positional arg** pins the
  wallet. So pass `'hanaWallet.bitcoin'` as the 3rd arg on every request.
  `setDefaultProvider(id)` also exists (global) — prefer the per-call arg.
- `XverseXConnector` currently omits the 3rd arg → uses the default provider.
  Hana must always pass the id, on connect + signPsbt + signMessage(ECDSA/BIP322)
  + sendTransfer.
- `WALLET_METADATA.hana` **already exists** in
  `packages/wallet-sdk-react/src/constants.ts` (installUrl + icon, used by the
  ICON connector) — reuse, no constants change.
- Registry: `chainRegistry.ts` `BITCOIN.defaultConnectors` = `[Unisat, Xverse,
  OKX]`; append Hana (→ 4). `chainRegistry.test.ts` asserts length 3 → bump to 4.
- Base `BitcoinXConnector` abstract methods: `connect`, `disconnect`,
  `getWalletProvider`, `recreateWalletProvider` (+ `isInstalled`/`installUrl`/
  `icon` overrides). Inner provider implements `IBitcoinWalletProvider`
  (`@sodax/types`): `signTransaction`, `signEcdsaMessage`, `signBip322Message`,
  `sendBitcoin`, `getAddressType`, etc.
- Message-signing mode (ECDSA vs BIP-322) is selected at runtime in the registry
  `signMessage` action via `hasSignBip322`/`hasSignEcdsa` guards
  (`bitcoinSignGuards.ts`) — a one-mode wallet is handled.

## Open questions (need the Hana dev build)

1. Install-detection surface: sats-connect provider registry entry for
   `hanaWallet.bitcoin` vs a `window.hanaWallet?.bitcoin` namespace.
2. Whether `request(..., 'hanaWallet.bitcoin')` reliably routes to Hana with
   multiple sats-connect wallets installed (else use `setDefaultProvider`).
3. Hana signing surface (ECDSA / BIP-322) + that Ordinals purpose yields P2TR.

## Changes During Work

(none yet — planning only)
