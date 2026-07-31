---
type: plan
repo: sodax-backend
github:
updated: 2026-07-31
---

# Plan

## Goal

SDK consumers complete the Bitcoin flow without any of them being domain-whitelisted by
Bound, with **one** implementation of the Bound protocol in the org and **no** second code
path in the SDK.

## Approach

Four decisions, in the order they constrain everything else.

### D1 — One implementation of the Bound protocol: the SDK's `RadfiProvider`

Do **not** write a second Bound HTTP client in the backend.

The backend already has no client of its own: `sodax.provider.ts` injects an HMAC
`signRequest` closure into `new Sodax(...)` and the SDK's `RadfiProvider` makes the calls
(this is what `gh-831` shipped). `RadfiProvider` is 655 lines that already handle things a
fresh client would have to rediscover:

- Bound's error envelope → `RadfiApiError` with `code` / `details`
- **HTML gateway/WAF pages returned instead of JSON** (`parseJsonBody`) — this caused a
  real production bug surfacing as `INTENT_CREATION_FAILED "… is not valid JSON"`
- BIP-322 vs ECDSA message signing chosen by Bitcoin address type
- `resolveAuth` fail-fast on a missing credential

So the new backend package is **thin wiring (~100 lines), not a client**: signer factory,
env/config validation, Nest module, controller. Protocol logic stays owned by the SDK.

This is also the honest answer to R0bi7's "add it as a radfi package so it is reusable":
the reusable piece already exists — it is just sitting in the wrong place
(`apps/swaps-api`), not missing.

### D2 — A path-compatible proxy with a route allowlist

```
browser SDK  ──►  swaps-api  /v1/bitcoin/auth/authenticate  ──►  api.bound.exchange/api/auth/authenticate
   Authorization: Bearer <user token>      + x-api-signature (HMAC)
```

- **Path-compatible**: the proxy mirrors Bound's own paths, so switching the SDK is
  `chains.bitcoin.radfi.apiUrl` and nothing else. No `if (useProxy)` branch in the SDK —
  a second path would need double the tests and the less-used one would rot.
- **Allowlist, not catch-all**: declare each proxied endpoint as a real route calling one
  `RadfiProvider` method. A generic `app.all('/*')` would turn our Bound credential into an
  open relay for every Bound endpoint.
- **Neutral path prefix** (`/v1/bitcoin/*`, not `/v1/swaps/bitcoin/*`): the flows are not
  swap-specific, and `bridge-api` must be able to mount the identical router later without
  clients changing URLs. This resolves the swaps-api-vs-generic tension from the Discord
  thread: the *host app* is swaps-api (per R0bi7), the *route namespace* is not.
- **No new response DTOs.** Return Bound's envelope as-is. The SDK already parses
  `RadfiResponseEnvelope`; a mapping layer would make every Bound field change a 3-repo edit.

### D3 — The proxy must be stateless per user

`RadfiProvider` keeps `accessToken` / `refreshToken` as **instance fields**, and
`resolveAuth()` falls back to `this.accessToken || this.config.apiKey`. In Nest, `SODAX` is
a **singleton shared by every request**. If any handler calls `setRadfiAccessToken` or omits
the per-call token, user A's Bound session leaks into user B's request.

Today this is safe only by coincidence — see `gh-831` `outcome.md` follow-up #5, which
counts five independent coincidences holding it up, four of them in SDK code the backend
does not own. Adding a proxy multiplies the number of call sites, so make it an invariant:

- always pass `accessToken` per call
- never call `setRadfiAccessToken` in backend code
- never set `radfi.accessToken` in backend config
- cover it with a test

If that is hard to hold, instantiate `RadfiProvider` per request instead — it is cheap.

### D4 — Do not try to move what cannot move

`/auth/authenticate` takes a payload signed by the **user's Bitcoin wallet**
(`RadfiProvider.authenticateWithWallet`, BIP-322 or ECDSA by address type). The backend
holds no user key, so signing stays client-side; only the HTTP call is proxied. State this
in the issue so nobody goes looking for a way to "move `signMessage` to the backend".

Note also that `Authorization: Bearer <user token>` and `x-api-signature` (HMAC) are two
**independent** credentials. The proxy forwards the user's `Authorization` untouched and
adds the HMAC itself.

## Steps

1. **Ask Bound the one blocking question** (does the HMAC pair authenticate `/auth/*`
   server-to-server, or only `/sodax/*`?). Everything below is unaffected by the answer
   except the size of P0, so do not wait on it to start.
2. **Extract `packages/bound/`** in sodax-backend — pure move, no behaviour change:
   ```
   packages/bound/src/bound.config.ts   ← apps/swaps-api/src/config/{configuration,config.class}.ts (radfi parts)
   packages/bound/src/bound-signer.ts   ← the createHmac closure in sodax.provider.ts
   packages/bound/src/bound.module.ts   ← provides the configured Sodax
   ```
   `apps/swaps-api` imports `BoundModule`. Name it `bound`, not `radfi` — Bound is the
   current name; `Radfi*` survives in the SDK only for API compatibility.
3. **Add `bound-proxy.controller.ts`** with the P0 routes under `/v1/bitcoin/*`, each
   delegating to a `RadfiProvider` method. Per-user rate limit; no token logging.
4. **Switch a consumer** — `intents-whitelabel` already reads `NEXT_PUBLIC_BOUND_API_URL`
   (`src/lib/rpc.ts:37`), so this is an env change, zero code.
5. **Flip the SDK default** only once the proxy is proven: `@sodax/types` `chains.ts`
   `radfi.apiUrl`, plus a changeset and `CONFIG_VERSION`.

### Endpoint priority

| Priority | Endpoints | Why |
|---|---|---|
| P0 | `/auth/authenticate`, `/auth/refresh-token`, `/wallets`, `/wallets/details/:addr`, `/sodax/transaction`, `/sodax/transaction/sign` | the calls that force domain whitelisting today |
| P1 | `/transactions`, `/transactions/sign`, `/transactions/max-spent` | withdraw / renew-UTXO; nothing is blocked on them today |
| P2 | UMS `wallets/balance`, `utxos` | read-only, takes no Sodax credential — proxy only if Bound whitelists UMS too |

## Verification

- P0 route hit end-to-end from a **non-whitelisted** origin, full Bitcoin flow green.
- Concurrent requests from two different users against one backend instance: neither sees
  the other's trading address or balance (the D3 invariant).
- Logs contain no `Authorization` value, no access/refresh token, no HMAC digest.
- swaps-api behaviour after the step-2 extraction is byte-identical (existing 321 unit
  tests still green).

## Risks

- **Bound may not authenticate `/auth/*` by HMAC.** Then P0 shrinks to `/sodax/*` +
  `/wallets/*` and sign-in still needs domain whitelisting. The architecture is unchanged,
  so this is a scope risk, not a design risk.
- **Rate limiting flips from per-user to per-IP.** After proxying, every user shares the
  backend egress. The backend has already been bitten by a per-IP limiter (#1002). Confirm
  with Bound whether their limit is per API key or per IP, and add our own per-user limit.
- **The SDK cannot be flipped remotely.** `ConfigService.initialize()` is a no-op
  (`TODO(config-v2)`), so the URL comes from packaged defaults or a consumer override.
  Rollout is therefore per-consumer env first, SDK release second.
- **Controller living in a shared package** is slightly unusual for Nest. It is deliberate:
  identical routes across apps. Fallback if the team objects — thin controller in each app,
  service + signer + config in the package.
- **Credential rotation.** The secret pair was pasted in plaintext into Discord (test
  credentials, but the habit is the risk). Rotate before production and keep it in the
  secret manager only.
