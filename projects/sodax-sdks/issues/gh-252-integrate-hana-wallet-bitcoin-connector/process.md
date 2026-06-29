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
- 2026-06-29 — Implemented from the Hana team's integration request
  (`~/Downloads/sodax-hana-integration-request.md`, a drop-in `HanaXConnector`).
  Adapted to repo conventions and verified all automated gates. See `outcome.md`
  for the full file list, decisions, and follow-ups. Not committed.
- 2026-06-29 — Branched `feat/hana-bitcoin-connector` off `main` (the Hana work
  was sitting on the gh-248 branch). Renamed class `HanaXConnector` →
  `BitcoinHanaXConnector` (mirror `IconHanaXConnector`, per user) + display name
  `Hana` → `Hana Wallet` (match ICON). Re-verified all gates green.

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

## Open questions — resolved by the integration request

1. **Detection surface → `window.hanaWallet?.bitcoin`** (confirmed by the Hana
   team). Implemented via a typed `declare global` (no `as any`). Does not clash
   with `IconHanaXConnector`, which reads `window.hanaWallet` through a cast.
2. **Per-call provider-id routing works** — Hana verified the full flow on the
   Solver demo with the 3rd-arg `'hanaWallet.bitcoin'`. No `setDefaultProvider`
   fallback needed.
3. **Signing surface = ECDSA + BIP-322**, default Taproot/Ordinals → P2TR
   (matches Bound Exchange). Both methods implemented; the registry
   `signMessage` dispatch already picks the scheme by address type.

New caveat surfaced by the request (NOT in original plan):

- **`window.unisat` collision → Radfi `duplicatedPubKey`.** Hana also injects a
  `window.unisat` surface, so `UnisatXConnector.isAvailable()` is true with only
  Hana installed; connecting via both buttons binds one pubkey to two connectors.
  Left out of scope (Hana team can scope their `window.unisat`); flagged in
  `outcome.md`.

## Changes During Work

- Connector id chosen as `hana-bitcoin` (not the request's `hana`) to avoid
  collision with the ICON `hana` connector, following the OKX `okx-bitcoin`
  precedent. Brand `'hana'` still matches via the substring rule.
- Kept the existing `WALLET_METADATA.hana` (icon differs from the request's
  cloudinary URL) — shared with ICON, so no constants change.
- Updated `packages/skills` docs (api-surface, sign-message, connectors,
  architecture, wallet-brands) to include the 4th connector.
- Gates: `HanaXConnector.test.ts` (16) + `chainRegistry.test.ts` green; full
  package suite 158 passed; `checkTs` ✓; `biome lint` ✓; `check:ai` ✓.
