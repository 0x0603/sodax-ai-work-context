---
type: process
repo: sodax-backend
github: 831
updated: 2026-06-30
---

# Process

## Log

- **2026-06-30** — Read issue #831 + both comments. Ran a background research workflow
  (6 parallel readers over `sodax-sdks` + `sodax-backend` + `sodax-frontend`, a synthesis
  agent, and 3 adversarial verifiers). Wrote `issue.md` / `plan.md` / `README.md`.
- Design discussed with matterhorn: rejected "secret-in-SDK-config" in favour of a
  **stateless signer hook injected by the backend provider** (SDK must stay stateless).

## Findings (verified against source / published artifacts)

- **Version model.** `sodax-sdks` releases via changesets on a `release` line; npm
  `@sodax/sdk@2.0.0-rc.N` ↔ git tag `@sdks@2.0.0-rc.N`; dev branches keep a placeholder
  `0.0.1-rc.5`. Backend pins **rc.14**.
- **rc.14 lacks `extras.bound.accessToken`.** Verified by downloading the published
  `@sodax/sdk@2.0.0-rc.14` tarball (sha512 matched `pnpm-lock.yaml` integrity): its
  `SwapExtras = { partnerFee? } & SrcPublicKeySlot<K>` — no `bound` slot. The token
  plumbing shipped in **rc.15** (commit `a2395f07` / #237), present through rc.18.
- **HMAC exists nowhere.** No `x-api-signature` / `secretKey` / `secretWord` in rc.14,
  rc.18, or local `feat/bridge-api-v2`. Net-new SDK source + a new release required.
- **`chains.bitcoin.radfi` config exists since rc.14** (`RadfiConfig` =
  `{ apiUrl, apiKey, umsUrl, accessToken, refreshToken }` + `walletMode?`); default
  `apiUrl = https://api.bound.exchange/api`, `umsUrl = https://api.ums.bound.exchange/api`.
  swaps-api simply isn't supplying it.
- **Build-time RadFi calls confirmed.** `createIntent({raw:true})` for a Bitcoin source in
  TRADING mode (the default, and the only mode where raw BTC is allowed) calls, at build:
  `GET /wallets/details/{addr}` (unauthenticated public GET) and `POST /sodax/transaction`
  (authenticated — `resolveAuth` throws 401 if neither a user token nor `config.apiKey`
  is present). `POST /sodax/transaction/sign` runs **client-side** in the browser. So the
  user token is required *during* swaps-api `createIntent`, not only at sign/submit.
  Evidence: `SwapService.ts:864-877,927-947`; `BitcoinSpokeService.ts:403-425,447-451`;
  `RadfiProvider.ts:271,324-358,588-601`.
- **Token transport contract.** The SDK's own backend convention (`BitcoinBoundExtrasV2`,
  `packages/types/src/backend/backendApiV2.ts:63-69`) carries the token as nested
  `bound: { accessToken }` in the request **body** — explicitly *not* a header, *not* a
  flat field. Frontend reference: `apps/demo/.../BridgeCard.tsx` does
  `if (accessToken) body.bound = { accessToken }`. swaps-api should mirror this.
- **`RadfiProvider.request()` (`:628-636`) is the chokepoint** for `apiUrl` calls; two
  `umsUrl` `fetch` calls (`:291`, `:409`) bypass it. `request()` only sets `Content-Type`
  + passed headers today — the natural place for a signer to merge `x-api-signature`.
- **swaps-api surface.** Public swaps routes (`swaps.controller.ts` getQuote `:161`,
  approve `:212`, createIntent `:230`) have **no** Authorization-consuming guard
  (only `submitTx` has `HaproxyThrottlerGuard`, keyed on X-Real-IP). Config uses
  `RPC_CONFIG`/`SOLVER_CONFIG` JSON-string env (`configuration.ts:42-50`);
  `config.service.ts:~31` strips mongo configs from the startup log (extend for radfi).

## Verification corrections (adversarial pass)

- ❌ Draft assumed rc.14 already had `extras.bound.accessToken` ("free with no bump").
  **Wrong** — rc.14 has neither token plumbing nor HMAC; both arrive only on the bump to
  ~rc.19. Corrected in `plan.md`.
- ❌ Draft suggested swaps-api might extract the token by splitting `Bearer <reason>:<token>`
  on `:`. **Wrong** — that split is a RadFi-side parsing detail for the header *it*
  receives; the SDK consumes `accessToken` as an opaque token (`Bearer ${accessToken}`,
  no split). swaps-api should take the token from the DTO body, not parse `:`.
- ✅ Confirmed: raw BTC build hits the RadFi endpoints at build time (see Findings).

## Design decision — HMAC injection (4 options weighed)

1. **Secret in `RadfiConfig`, SDK computes HMAC** — rejected: SDK holds a per-deployment
   secret as state; forces isomorphic crypto; leaks vendor specifics into the SDK.
2. **Signing-proxy** (`radfi.apiUrl` → backend proxy that adds the header) — rejected as
   primary: a whole network service + an extra hop for "add one header"; RadFi chose HMAC
   (not IP), so the proxy buys nothing extra here.
3. **Monkey-patch `globalThis.fetch`** in the backend — rejected for prod: global process
   mutation, fragile to SDK internals, "no escape hatches" rule. OK only as a temporary
   dev bridge while ~rc.19 is pending.
4. **✅ Stateless signer hook injected by the provider** — CHOSEN. SDK exposes a generic
   `RadfiSigner` runtime hook; the backend supplies the closure that holds the secret and
   computes the signature. SDK stores only a function reference (no secret, no per-user
   token state), stays isomorphic, and the HMAC detail stays testable in the backend with
   `node:crypto`.

## Changes During Work

- **2026-07-01** — Self-reviewed `plan.md` against the PR-review rubric. Verdict was
  `request-changes` (3 should-fix, no blocker; core approach sound). Folded the fixes in:
  1. Added the required failure path "Bitcoin-source createIntent without `bound.accessToken`
     → 400" (else a deep 401 from `resolveAuth`), mirroring the `includeTxData` guard.
  2. Lowered the altitude of the A1 `signRequest` hook to "proposed seam — verify against
     how `ConfigService` threads runtime options first"; added a seam test.
  3. Added the missing `@Type(() => BitcoinBoundExtrasDto)` for the nested `bound` DTO.
  Plus nits: concluded the umsUrl signing scope; justified flat env vars vs `*_CONFIG`;
  noted the rc.19 base must contain #237; added the HMAC body-independence security note.
- Implementation still not started; awaiting plan review + the open decisions in `plan.md`.
