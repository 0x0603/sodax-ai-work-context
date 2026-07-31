# Draft — issue for `icon-project/sodax-sdks`

Copy the body below. Title:

> **Bitcoin/Bound: inventory of Bound Exchange endpoints the SDK calls**

---

## Context

After sodax-backend#831, `swaps-api` calls Bound Exchange server-to-server with an HMAC
`x-api-signature`. Every other Bound call still goes browser → Bound directly, which
requires Bound to whitelist each consumer's domain. The backend will proxy these
(sodax-backend follow-up). This issue is the SDK-side inventory and the config switch.

Every call lives in one file: `packages/sdk/src/shared/entities/btc/RadfiProvider.ts`.

## `apiUrl` — `https://api.bound.exchange/api`

Config: `chains.bitcoin.radfi.apiUrl` (`@sodax/types` `chains.ts:840`). All go through
`RadfiProvider.request()` (`:639`), which merges the optional `radfi.signRequest` headers.

| Endpoint | SDK method | Line | Called from |
|---|---|---|---|
| `POST /auth/authenticate` | `authenticate` | :208 | browser (`useRadfiAuth`) |
| `POST /auth/refresh-token` | `refreshAccessToken` | :236 | browser (`useRadfiAuth`, `useRadfiSession`) |
| `POST /wallets` | `createTradingWallet` | :253 | public API, no first-party caller |
| `GET /wallets/details/:userAddress` | `getTradingWallet` | :276 | browser + `swaps-api` (raw build) |
| `POST /sodax/transaction` | `createWithdrawTransaction` | :332 | `swaps-api` (raw build) |
| `POST /sodax/transaction/sign` | `requestRadfiSignature` | :376 | browser |
| `POST /transactions` | `buildRenewUtxoTransaction` | :437 | browser (`useRenewUtxos`) |
| `POST /transactions/sign` | `signAndBroadcastRenewUtxo` | :467 | browser (`useRenewUtxos`) |
| `POST /transactions` | `withdrawToUser` | :497 | browser (`useRadfiWithdraw`) |
| `POST /transactions/sign` | `signAndBroadcastWithdraw` | :528 | browser (`useRadfiWithdraw`) |
| `POST /transactions/max-spent` | `getMaxWithdrawable` | :563 | public API, no first-party caller |

`checkIfTradingWalletExists` (`:322`) wraps `getTradingWallet`; `authenticateWithWallet`
(`:148`) and `ensureRadfiAccessToken` (`:182`) are composites over `authenticate` /
`refreshAccessToken`.

## `umsUrl` — `https://api.ums.bound.exchange/api`

Config: `chains.bitcoin.radfi.umsUrl` (`chains.ts:842`). These two `fetch()` directly and
are deliberately **not** signed — UMS accepts no Sodax credential.

| Endpoint | SDK method | Line | Called from |
|---|---|---|---|
| `GET /wallets/balance?address=` | `getBalance` | :294 | browser (`useTradingWalletBalance`) |
| `GET /utxos?address_eq=…&isSpent_eq=false&isExpired_eq=true` | `getExpiredUtxos` | :409 | browser (`useExpiredUtxos`) |

## SDK-side change

None to the request logic. The backend proxy will be **path-compatible**, so switching is
just `chains.bitcoin.radfi.apiUrl`:

1. A dApp can opt in today with no SDK release:
   `new Sodax({ chains: { bitcoin: { radfi: { apiUrl: '<proxy>' } } } })`.
2. Flip the packaged default in `@sodax/types` `chains.ts` once the proxy is live
   (changeset + `CONFIG_VERSION`).

`radfi.signRequest` (#831) stays as the escape hatch for partners running their own Bound
credential.

## Notes

- `/auth/authenticate` cannot move server-side: its payload is BIP-322/ECDSA signed by the
  user's wallet (`authenticateWithWallet`, `:148`). Only the HTTP call gets proxied.
- UMS is read-only and unauthenticated to us — proxy only if Bound whitelists UMS too.
