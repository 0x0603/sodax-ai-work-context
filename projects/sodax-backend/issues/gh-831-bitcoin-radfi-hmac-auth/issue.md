---
type: issue
repo: sodax-backend
github: 831
status: Active
tags: [swaps-api, bitcoin, radfi, bound, hmac, auth, sdk, cross-repo]
updated: 2026-06-30
related_decisions: []
---

# GH-831 Bitcoin swap blocked: RadFi requires backend auth

- Source: https://github.com/icon-project/sodax-backend/issues/831
- Started: 2026-06-30
- Related PR:

## Problem

`swaps-api` builds intents via `@sodax/sdk` `createIntent({ raw: true })`
(`apps/swaps-api/src/api/swaps/swaps.service.ts`). For **Bitcoin**, that raw build does
not hit a chain RPC — it calls the **Bound Exchange (RadFi)** API server-to-server,
authenticated with the **user's** Bound access token (minted in the browser via a
BIP322-signed login, then forwarded by the client to `swaps-api`).

RadFi historically only accepted **IP-allowlisted** callers. Our public entrypoints sit
behind Cloudflare over a rotating pool of anycast IPs — no fixed egress IP to allowlist,
and re-allowlisting every instance is not operable. So the server-to-server RadFi calls
were blocked.

## Context

**RadFi coordination is already resolved (issue comments).** RadFi agreed to drop the
IP requirement and instead authenticate our backend with **HMAC-SHA256 signed
requests**:

- They issue a dedicated credential pair **`SODAX_API_SECRET_KEY` + `SODAX_API_SECRET_WORD`**,
  scoped to the Sodax endpoints.
- Each request carries an **`x-api-signature`** header:
  - `message   = secret_word + "_" + timestamp`
  - `signature = HMAC_SHA256(secret_key, message)` (hex digest)
  - `header    = signature + "_" + timestamp`
  - `timestamp` must be within **60 s** (replay protection); RadFi's example uses
    epoch **milliseconds**.
- The user's `Authorization: Bearer <access-token>` is still required and unchanged
  (per-user identity / data scoping). RadFi also now accepts
  `Authorization: Bearer <reason>:<access_token>` (it splits on `:` and takes the last
  segment as the JWT) — this is a RadFi-side parsing detail, not something swaps-api
  produces.
- RadFi will give our backend a separate server-to-server rate limit.

**The 3 RadFi endpoints the SDK touches for Bitcoin** (all under `RADFI_API_URL`):

| Step | Endpoint | Purpose | Who calls it |
|---|---|---|---|
| 1 | `GET /wallets/details/{userAddress}` | resolve trading/hub wallet | SDK at build (public, unauthenticated) |
| 2 | `POST /sodax/transaction` (`sodax-withdraw`) | build unsigned PSBT | SDK at build (authenticated → needs token) |
| 3 | `POST /sodax/transaction/sign` | co-sign + broadcast after user signs | **client-side** (browser), not swaps-api |

With `raw: true`, swaps-api triggers steps **1–2 only** and returns the unsigned PSBT;
step 3 runs in the browser. Verified: step 2 requires a Bound credential at *build*
time (`createIntent`), not just at sign/submit.

**Internal gap to close (this issue's scope).** Today `swaps-api` constructs `Sodax`
with RPC + solver overrides only (`apps/swaps-api/src/shared/providers/sodax.provider.ts`)
— no RadFi config, and no plumbing to receive/forward the user's Bound token. Even with
the RadFi auth model settled, the Bitcoin `createIntent` needs (a) the user token
threaded through the request into the SDK, and (b) the backend HMAC credential applied
to the outbound RadFi calls.

## Acceptance Criteria

- A Bitcoin-source `createIntent({ raw: true })` from `swaps-api` succeeds against RadFi
  from our backend (no IP allowlist), i.e. RadFi accepts our `x-api-signature` and the
  forwarded user token.
- The user's Bound access token is accepted per request and forwarded to RadFi; it is
  never persisted, cached, logged, or stored as SDK/instance state.
- The HMAC secret pair is configured via env, applied only server-side, never logged,
  and never shipped into the SDK/browser bundle.
- Non-Bitcoin swaps are entirely unaffected (no token, no signature).
- New code covered by unit tests (HMAC signature shape + 60 s window; token threading;
  config redaction).

## Related

- Knowledge:
- Decisions: (design decision recorded in this issue's `plan.md` / `process.md`)
- Cross-repo: SDK change lives in `sodax-sdks` (`@sodax/sdk` + `@sodax/types`);
  see `plan.md` workstreams A1–A3.
