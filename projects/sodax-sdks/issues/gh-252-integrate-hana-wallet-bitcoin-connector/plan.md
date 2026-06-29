---
type: plan
repo: sodax-sdks
github: 252
updated: 2026-06-29
---

# Plan

## Goal

Add a `HanaXConnector` as the 4th Bitcoin connector in `wallet-sdk-react`,
modeled on `XverseXConnector`, with every `sats-connect` call pinned to
`HANA_PROVIDER_ID = 'hanaWallet.bitcoin'`. Connect / disconnect / sign PSBT +
messages / send, default Taproot, and the full deposit/swap flow works in
`apps/demo`. `wallet-sdk-react` only — no core/SDK/types/config changes.

## Approach

Follow the `add-wallet-provider` skill, **Case A** (Bitcoin pattern). Hana is a
near-copy of Xverse; the only structural difference is the pinned provider id.

1. **`src/xchains/bitcoin/HanaXConnector.ts`** — copy `XverseXConnector.ts`,
   renaming the class/provider and threading the provider id:
   - `const HANA_PROVIDER_ID = 'hanaWallet.bitcoin';`
   - Inner `HanaWalletProvider implements IBitcoinWalletProvider` mirroring
     `XverseWalletProvider`, but **every** `request(method, params)` becomes
     `request(method, params, HANA_PROVIDER_ID)` — `signPsbt`, `signMessage`
     (ECDSA + BIP-322), `sendTransfer`. Keep `countPsbtInputs`, finalize→hex
     logic, and `detectBitcoinAddressType` as-is.
   - `class HanaXConnector extends BitcoinXConnector`:
     - `super('Hana Wallet', 'hana', defaults)` — id `'hana'` stable.
     - Address purpose: default Taproot (`AddressPurpose.Ordinals`), persisted
       under a Hana-specific localStorage key; `setAddressPurpose` like Xverse.
     - `connect()` → `request('getAccounts', { purposes:[addressPurpose], message:'Connect to Sodax' }, HANA_PROVIDER_ID)`.
     - `isInstalled` / `static isAvailable()` → detect Hana (see Open Q1; likely
       a sats-connect provider-registry lookup for `hanaWallet.bitcoin`, with a
       `window.hanaWallet?.bitcoin` fallback). Lazy-resolve if Hana injects late
       (mirror Unisat/OKX pattern).
     - `installUrl` → `WALLET_METADATA.hana.installUrl`; `icon` →
       `WALLET_METADATA.hana.icon` (both already exist in `constants.ts`).
     - `getWalletProvider()` / `recreateWalletProvider(xAccount)` → build
       `HanaWalletProvider` (page-reload restore, no popup).
2. **Register** in `src/chainRegistry.ts`: import `HanaXConnector` and append
   `new HanaXConnector(defaults)` to the `BITCOIN` `defaultConnectors` array
   (4th, after OKX).
3. **Export** from `src/xchains/bitcoin/index.ts`.
4. **Tests**:
   - `src/xchains/bitcoin/HanaXConnector.test.ts` — mock `sats-connect`'s
     `request`; assert `connect` returns the right `XAccount`, that the pinned
     `HANA_PROVIDER_ID` is passed as the 3rd arg on every call, `disconnect`
     clears the provider, and `isInstalled` true/false + `installUrl`.
   - `src/chainRegistry.test.ts` — bump the Bitcoin `defaultConnectors` length
     assertion 3 → 4 and assert a Hana connector is present.
5. **Manual verification with the Hana dev build** (resolves the open
   questions): install from the Drive link, then in `apps/demo` solver page run a
   Bitcoin deposit/swap — connect, sign PSBT, sign message, send.

## Steps

1. Read base abstract method set in `BitcoinXConnector.ts` and re-confirm against
   `XverseXConnector.ts` (done — see process.md).
2. Write `HanaXConnector.ts` (+ inner provider) with `HANA_PROVIDER_ID` on every
   `request(...)`.
3. Implement `isAvailable()` once detection surface is confirmed (Open Q1).
4. Register in `chainRegistry.ts`; export from `bitcoin/index.ts`.
5. Add `HanaXConnector.test.ts`; update `chainRegistry.test.ts`.
6. Verify gates + manual dev-build flow; capture findings in process.md.

## Verification

- `cd packages/wallet-sdk-react && pnpm test && pnpm checkTs` green.
- `instanceof` holds across barrel + `@sodax/wallet-sdk-react/xchains/bitcoin`
  deep imports.
- Manual (Hana dev build + `pnpm dev:demo`): Hana shows in the wallet modal under
  Bitcoin; connect returns a Taproot address; a swap signs the PSBT via Hana
  (not Xverse, even with both installed) and settles.

## Risks

- **Provider-id routing reliability** — if the per-call 3rd-arg doesn't route to
  Hana on the real build, fall back to `setDefaultProvider('hanaWallet.bitcoin')`
  around the call and restore after. Must be confirmed empirically (Open Q2).
- **Multiple sats-connect wallets** — the whole point of pinning; a single missed
  call (no provider id) would silently route to Xverse. Pin every call + test
  asserts the 3rd arg.
- **Late injection** — detection false-negative if Hana injects after load;
  lazy-resolve like Unisat/OKX.
- **Signing surface unknown** until dev-build testing — registry guards
  (`hasSignBip322`/`hasSignEcdsa`) absorb a one-mode wallet, but Taproot/BIP-322
  must be confirmed (Open Q3).
- **Can't fully verify without the dev build** — code + unit tests can land, but
  sign-off requires the real wallet (Drive link in the issue).

## Open decisions

- Class/file name: `HanaXConnector` (recommended, matches `XverseXConnector`) vs
  `HanaBitcoinXConnector`.
- Detection surface (Open Q1) — confirm before implementing `isAvailable()`.
