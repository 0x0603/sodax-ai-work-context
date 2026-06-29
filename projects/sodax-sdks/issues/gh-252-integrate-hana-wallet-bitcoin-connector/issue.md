---
type: issue
repo: sodax-sdks
github: 252
status: Active
tags: [wallet-sdk-react, bitcoin, connector, hana, sats-connect, enhancement]
updated: 2026-06-29
related_decisions: []
---

# GH-252 Integrate Hana Wallet Bitcoin Connector

- Source: https://github.com/icon-project/sodax-sdks/issues/252
- Work repo: `sodax-sdks`
- Started: 2026-06-29
- Related PR:

## Problem

Add **Hana Wallet** as another Bitcoin connector, alongside Unisat / Xverse /
OKX. Bitcoin is already integrated, so this is just a new connector following the
same shape as `XverseXConnector.ts`. It must work like Xverse: connect /
disconnect, sign PSBT + messages, and run the full deposit/swap flow.

Hana speaks `sats-connect` like Xverse, so we can reuse that path. Pin every
request to Hana's provider id so it never falls through to another sats-connect
wallet:

```ts
const HANA_PROVIDER_ID = 'hanaWallet.bitcoin'; // routes every call to Hana explicitly
```

Still to confirm: Hana's signing surface (ECDSA / BIP-322) and address types —
default to **Taproot** to match Bound Exchange. A Hana dev build is available to
test against a real wallet (Google Drive link in the raw issue).

## Raw Issue

```text
Repo:    icon-project/sodax-sdks
Issue:   #252
Title:   Integrate Hana Wallet (Bitcoin connector)
State:   OPEN
Author:  0x0603
Labels:  enhancement

Body:
-----
Add Hana Wallet as another Bitcoin connector, next to Unisat/Xverse/OKX. Bitcoin
is already integrated, so this is just a new connector — follow the same shape as
XverseXConnector.ts.

It should work the same as Xverse: connect/disconnect, sign PSBT + messages, and
go through the full deposit/swap flow.

Hana speaks sats-connect like Xverse, so we can mostly reuse that path. Pin every
request to Hana's provider id so it doesn't fall through to another sats-connect
wallet:

  const HANA_PROVIDER_ID = 'hanaWallet.bitcoin'; // routes every call to Hana explicitly

Still need to confirm its signing surface (ECDSA / BIP-322) and address types —
default to Taproot to match Bound Exchange.

Install the Hana dev build to test against a real wallet:
https://drive.google.com/file/d/1qiciIubDX09w1u6W5pt1--gQsig8nMNk/view?usp=drive_link
```

## Context

Verified against current source (sodax-sdks, 2026-06-29). This is the
`add-wallet-provider` skill, **Case A** (Bitcoin pattern) — `wallet-sdk-react`
only, **no `wallet-sdk-core` change** (Hana uses sats-connect like Xverse, so the
existing `IBitcoinWalletProvider` shape covers it).

### Bitcoin connector architecture

- Dir: `packages/wallet-sdk-react/src/xchains/bitcoin/`
  - `BitcoinXConnector.ts` — abstract base extending `XConnector`. Abstract
    methods a connector must implement: `connect()`, `disconnect()`,
    `getWalletProvider()`, `recreateWalletProvider(xAccount)`; plus `isInstalled`
    / `installUrl` / `icon` overrides.
  - `XverseXConnector.ts` — the template. Inner `XverseWalletProvider implements
    IBitcoinWalletProvider`; uses `sats-connect` via dynamic `import('sats-connect')`.
  - `UnisatXConnector.ts`, `OKXXConnector.ts` — direct `window.*` APIs (not
    sats-connect); lazy-resolve the injected object. Not the model for Hana.
  - `index.ts` — barrel export.
- Registry: `packages/wallet-sdk-react/src/chainRegistry.ts`, `BITCOIN` entry
  `defaultConnectors` returns
  `[new UnisatXConnector(defaults), new XverseXConnector(defaults), new OKXXConnector(defaults)]`.
  Append Hana here.
- Metadata: `packages/wallet-sdk-react/src/constants.ts` — `WALLET_METADATA.hana`
  **already exists** (installUrl + icon, currently used by the ICON connector).
  Reuse it; no constants change needed.
- Types: `packages/types/src/bitcoin/bitcoin.ts` — `IBitcoinWalletProvider`,
  `BtcAddressType` (`P2PKH|P2SH|P2WPKH|P2TR`), `BtcWalletAddressType`
  (`taproot|segwit`), `detectBitcoinAddressType`, `usesBip322MessageSigning`.

### sats-connect provider-id pinning — CONFIRMED

`sats-connect@4.2.1`. The core `request` signature
(`@sats-connect/core/dist/index.d.mts:349`) is:

```ts
request: <Method extends keyof Requests>(
  method: Method,
  options: Params<Method>,
  providerId?: string,            // <-- 3rd positional arg pins the wallet
) => Promise<RpcResponse<Method>>;
```

So pinning Hana = pass `HANA_PROVIDER_ID` as the **3rd argument** to every
`request(...)` call (`getAccounts`, `signPsbt`, `signMessage`, `sendTransfer`).
`setDefaultProvider(id)` also exists but is global state — prefer the per-call
arg to avoid leaking the selection across connectors.

`XverseXConnector` currently calls `request('getAccounts', {...})` etc. **without**
the 3rd arg → it hits whatever provider is default. Hana must always pass the id.

### Xverse template behavior to mirror

- `connect()` → `request('getAccounts', { purposes: [addressPurpose], message })`,
  picks the account matching the purpose, builds the wallet provider, returns
  `XAccount { address, publicKey, xChainType: 'BITCOIN' }`.
- `XverseWalletProvider`: `signTransaction` (PSBT base64, counts inputs, optional
  finalize→hex), `signEcdsaMessage` / `signBip322Message`
  (`MessageSigningProtocols.ECDSA|BIP322`), `sendBitcoin` (`sendTransfer`).
- Address purpose: Taproot (`AddressPurpose.Ordinals`) by default, persisted to
  localStorage; SegWit = `AddressPurpose.Payment`.

### Not needed (per the worked example)

- No `wallet-sdk-core` change (`BitcoinWalletProvider` covers it).
- No `chainRegistry` shape change, no `types/config.ts` change (no new chain).
- No new `XService` (`BitcoinXService` is shared).
- No SDK change — the RadFi/Bound trading-wallet model is separate from a wallet
  connector.

## Acceptance Criteria

- `HanaXConnector` extends `BitcoinXConnector`; inner `HanaWalletProvider`
  implements `IBitcoinWalletProvider`.
- Every sats-connect `request(...)` is pinned to `HANA_PROVIDER_ID =
  'hanaWallet.bitcoin'` (connect + signPsbt + signMessage + sendTransfer).
- Connector `id` is stable (`'hana'`); install metadata from
  `WALLET_METADATA.hana`.
- Address purpose defaults to **Taproot** (matches Bound Exchange / Xverse).
- Registered in `chainRegistry.ts` `BITCOIN.defaultConnectors` (now 4) and
  exported from `xchains/bitcoin/index.ts`.
- `connect / disconnect / signPsbt / signEcdsaMessage / signBip322Message /
  sendBitcoin` work against the Hana dev build; full deposit/swap flow verified
  in `apps/demo`.
- Tests: `HanaXConnector.test.ts` (connect/disconnect/isInstalled/installUrl,
  mocking sats-connect); `chainRegistry.test.ts` updated 3→4 connectors.
- `instanceof` survives barrel/deep imports (import base from the registry's
  path).
- Gates: `cd packages/wallet-sdk-react && pnpm test && pnpm checkTs`.

## Open questions (confirm against the Hana dev build)

1. **Install detection.** What surface signals Hana presence — a sats-connect
   provider entry for `hanaWallet.bitcoin` (provider registry / `window.btc_providers`)
   or a `window.hanaWallet?.bitcoin` namespace? Drives `isAvailable()`.
2. **Provider-id routing.** Does `request(method, params, 'hanaWallet.bitcoin')`
   reliably hit Hana when multiple sats-connect wallets are installed? If not,
   wrap calls in `setDefaultProvider('hanaWallet.bitcoin')` and restore.
3. **Signing surface.** ECDSA vs BIP-322 — the registry `signMessage` action
   branches at runtime via `hasSignBip322` / `hasSignEcdsa` guards, so one-mode
   wallets are handled; confirm Hana's Taproot/BIP-322 path.
4. **Address types.** Default Taproot; confirm Hana returns a P2TR address under
   `AddressPurpose.Ordinals`.

## Related

- Skill: `.claude/skills/add-wallet-provider/` (Case A, Bitcoin) +
  `references/example-bitcoin-connector.md`.
- Sibling issue: gh-248-demo-solver-status-panel-and-remember-last-token.
- Knowledge:
- Decisions:
