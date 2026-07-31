---
type: issue
repo: sodax-backend
github:
status: Active
tags: [bound, radfi, bitcoin, swaps-api, bridge-api, proxy, sdk, cross-repo, architecture]
updated: 2026-07-31
related_decisions: []
---

# Bound Backend Proxy — move the remaining browser → Bound calls behind our backend

- Source: (no GitHub issue yet) — Discord thread with R0bi7, 2026-07-30. Raw transcript in `process.md`.
- Started: 2026-07-31
- Related PR:
- Follows: [`gh-831-bitcoin-radfi-hmac-auth`](../gh-831-bitcoin-radfi-hmac-auth/issue.md)

## Problem

`gh-831` solved exactly one path: `swaps-api` building a **raw Bitcoin intent**
server-to-server, authenticated to Bound Exchange with an HMAC `x-api-signature`.

Everything else still goes **browser → Bound directly**:

- `POST /auth/authenticate` — mint the Bound session, and with it the trading address
- `POST /auth/refresh-token`
- `POST /sodax/transaction/sign` — co-sign + broadcast after the user signs

Bound authenticates browser callers by **domain whitelisting**. So every consumer of the
SDK (demo app, whitelabel, any partner dApp) has to be whitelisted by the Bound team
before its users can obtain a trading wallet at all. That is a per-consumer manual
dependency on a third party, and it blocks SDK adoption for Bitcoin.

## Context

**Decided with R0bi7 (2026-07-30):** route the remaining Bound calls through our backend
so SDK consumers never need a Bound whitelist.

Three constraints came out of that thread:

1. **A reusable package, not per-feature copies.** Bitcoin/Bound will be needed by every
   feature that supports Bitcoin (swaps, bridge, money market), so the logic belongs in a
   shared backend package, not inside `apps/swaps-api`.
2. **No new backend API app** just for Bound. Mount it on `swaps-api` first.
3. But the flows themselves are **generic, not swap-specific** — `bridge-api` will need
   the identical endpoints. This is the tension the design has to resolve; see `plan.md`.

**Verified in code (2026-07-31, details in `process.md`):**

- The backend has **no Bound HTTP client of its own**. `apps/swaps-api/src/shared/providers/sodax.provider.ts`
  constructs `new Sodax({ radfi: { signRequest } })` and lets the SDK's `RadfiProvider`
  make the calls. The HMAC secret lives only in that closure.
- The SDK's entire Bound surface is **one file**: `packages/sdk/src/shared/entities/btc/RadfiProvider.ts`
  (13 `apiUrl` endpoints + 2 UMS endpoints). Full inventory in `artifacts/sdk-issue-draft.md`.
- `ConfigService.initialize()` is currently a **no-op** (`TODO(config-v2)`), so a Bound URL
  change cannot be pushed from the backend config endpoint yet.

**Open with the Bound team (blocker for part of the scope):** whether the HMAC credential
authenticates `/auth/*` server-to-server, or only the `/sodax/*` endpoints. Per the thread,
Bound "only support the APIs that generate raw data" — if that still holds, `/auth/*`
cannot be proxied and domain whitelisting stays for sign-in.

## Acceptance Criteria

- A dApp using `@sodax/sdk` can complete the full Bitcoin flow **without its domain being
  whitelisted by Bound** — or, if Bound refuses to authenticate `/auth/*` by HMAC, the
  exact remaining browser→Bound surface is documented and agreed.
- Bound wiring (HMAC signer, env/config, routes) lives in a shared backend package that
  `bridge-api` can mount without copying code.
- The proxy is **path-compatible** with Bound, so the SDK switch is a config change only —
  no second code path in the SDK.
- No user Bound access token is persisted, cached, or logged by the backend; tokens are
  forwarded per request.
- One `Sodax` singleton serving all requests cannot leak one user's Bound session to
  another (see `gh-831` `outcome.md` follow-up #5).

## Related

- Knowledge:
- Decisions: recorded in this folder's `plan.md`
- Cross-repo: SDK-side inventory + config switch → `artifacts/sdk-issue-draft.md`
  (to be filed in `icon-project/sodax-sdks`)
