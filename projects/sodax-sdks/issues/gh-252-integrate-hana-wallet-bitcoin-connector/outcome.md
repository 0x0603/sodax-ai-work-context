---
type: outcome
repo: sodax-sdks
github: 252
status: In Review
updated: 2026-06-29
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/259
- Branch: `feat/hana-bitcoin-connector` (off `main`)
- Commits: `0519dab0` feat(wallet-sdk-react): add Hana Bitcoin connector
- Tests:
  - `BitcoinHanaXConnector.test.ts` (16 tests) + updated `chainRegistry.test.ts` — green.
  - Full `wallet-sdk-react` suite: 158 passed (12 files).
  - `pnpm checkTs` ✓, `biome lint` ✓ (changed files), `@sodax/skills` `check:ai` ✓.
  - Not yet smoke-tested against a real Hana wallet (dev build).

## Summary

`BitcoinHanaXConnector` implemented as the **4th** Bitcoin connector in
`wallet-sdk-react`, modeled on `XverseXConnector` (both speak `sats-connect`).
The defining difference: **every** `sats-connect` `request(...)` is pinned to
`HANA_PROVIDER_ID = 'hanaWallet.bitcoin'` as the 3rd positional arg, so calls
never fall through to another installed sats-connect wallet (e.g. Xverse).

Driven by the Hana team's integration request
(`~/Downloads/sodax-hana-integration-request.md`): they ship a sats-connect-
compatible provider at `window.hanaWallet.bitcoin` and verified the full flow on
the Solver demo. Their drop-in was adapted to repo conventions (typed global
instead of `as any`, chain-qualified class name + id, existing metadata).

All automated gates pass. The only thing left for sign-off is a manual
deposit/swap against the real Hana dev build.

## What Changed

Code (`sodax-sdks`, `packages/wallet-sdk-react`):

- **NEW** `src/xchains/bitcoin/BitcoinHanaXConnector.ts` —
  `BitcoinHanaWalletProvider` (`IBitcoinWalletProvider`) + `BitcoinHanaXConnector
  extends BitcoinXConnector`.
  Every `request()` (getAccounts / signPsbt / signMessage ECDSA+BIP322 /
  sendTransfer) takes `HANA_PROVIDER_ID` as the 3rd arg. Typed `declare global`
  for `window.hanaWallet.bitcoin` (detection only). Default Taproot (Ordinals),
  persisted under `hana-address-type`.
- **NEW** `src/xchains/bitcoin/BitcoinHanaXConnector.test.ts` — mocks
  `sats-connect`; asserts the pinned provider id on every call,
  connect/disconnect, isInstalled, recreateWalletProvider.
- **EDIT** `src/xchains/bitcoin/index.ts` — export `BitcoinHanaXConnector`.
- **EDIT** `src/chainRegistry.ts` — import + append
  `new BitcoinHanaXConnector(defaults)` to `BITCOIN.defaultConnectors` (now 4).
- **EDIT** `src/chainRegistry.test.ts` — bump length 3 → 4 (×2) + comment/title.

Docs (`packages/skills`, faithfulness per AGENTS.md):

- `api-surface.md` (3 → 4 connectors + `BitcoinHanaXConnector`),
  `sign-message.md` (Hana added to all 4 address-type rows), `connectors.md`,
  `architecture.md` (Bitcoin connector list), `wallet-brands.md` (`'hana'` brand
  now also matches Bitcoin via id `hana-bitcoin`).

## Decisions

- **Class name = `BitcoinHanaXConnector`** (not `HanaXConnector`, not
  `HanaBitcoinXConnector`). Hana is the only wallet with two dedicated connector
  classes (ICON + Bitcoin); the chain-prefixed `<Chain><Wallet>XConnector` form
  mirrors the existing `IconHanaXConnector`, making them a matched pair.
  `HanaBitcoinXConnector` (wallet-then-chain) exists nowhere in the repo. The
  inner provider is `BitcoinHanaWalletProvider` — same stem as the connector,
  matching how every sibling pairs them (`XverseXConnector` ↔
  `XverseWalletProvider`).
- **Connector id = `hana-bitcoin`** (not `hana`). The ICON connector already owns
  `id='hana'`; OKX sets the precedent (`okx-bitcoin`) for a multi-chain wallet.
  Brand matching still resolves `'hana'` via the substring rule in
  `matchConnectorIdentifier.ts` (id `hana-bitcoin` + name `Hana Wallet`).
- **Display name = `Hana Wallet`** — matches the existing `IconHanaXConnector`
  (`name: 'Hana Wallet'`) so the same brand shows the same label on both chains
  (the request's casual `'Hana'` was overridden for internal consistency).
- **Detection = `window.hanaWallet?.bitcoin`** via a typed global augmentation —
  no `as any` (repo rule). Does not conflict with `IconHanaXConnector`, which
  reads `window.hanaWallet` through a cast.
- **Reuse existing `WALLET_METADATA.hana`** (installUrl + icon) — already present
  in `constants.ts` (shared with ICON). No constants change. The request
  suggested a different (cloudinary) icon; kept the existing one to avoid
  touching shared metadata.
- **Modeled on `XverseXConnector`, not Unisat/OKX** — Hana speaks sats-connect
  like Xverse, so the PSBT/message/transfer shapes mirror Xverse exactly.

## Follow-ups

- **Manual smoke test with the Hana dev build** (the last open item): connect
  (SegWit + Taproot), BIP-322 sign-in (Radfi auth), `signPsbt`, deposit / Top Up
  (`sendTransfer` → txid). Hana reports all four verified on their side.
- **`window.unisat` collision → Radfi `duplicatedPubKey` (known caveat, not fixed
  in code).** Hana also injects a `window.unisat` surface, so
  `UnisatXConnector.isAvailable()` is true even when only Hana is installed.
  Connecting the same Hana keys via both the Unisat and Hana buttons binds one
  pubkey to two connectors → `duplicatedPubKey`. The Hana team offered to scope
  their `window.unisat` to UniSat domains. Left out of scope here (changing
  `UnisatXConnector` detection is fragile and unrequested) — flag to reviewer.
- ✅ Committed (`0519dab0`) + PR #259 opened. Reviewer flagged two "blockers"
  (connector-level `useXSignMessage` signing; `signTransaction` finalize) — both
  are behavior **inherited verbatim from `XverseXConnector`** and not Hana-
  specific: the real Radfi auth/swap flow signs via the wallet provider
  (`RadfiProvider.authenticateWithWallet` → `walletProvider.signBip322Message`),
  which Hana implements. Kept consistent with Xverse; any fix belongs cross-
  connector, separately.
- Note: `biome format` would wrap the long `@sodax/types` import; left identical
  to `XverseXConnector` (repo CI enforces `biome lint`, not `format`).
