---
type: plan
repo: sodax-backend
github: 831
updated: 2026-07-01
---

# Plan — Bitcoin RadFi backend auth (HMAC) + user token pass-through

> Cross-repo work: a small **stateless signer hook** in `@sodax/sdk` / `@sodax/types`
> (`sodax-sdks`) + a new release, then the **wiring** in `swaps-api` (`sodax-backend`).
> Every path/line below is grounded in the current source (see `process.md` for the
> verification trail).

## Goal

Make `swaps-api`'s Bitcoin-source `createIntent({ raw: true })` work against RadFi from
our backend, by:

1. **Forwarding the user's Bound access token** per request into the SDK
   (`extras.bound.accessToken`).
2. **Signing outbound RadFi requests** with `x-api-signature` (HMAC-SHA256) using a
   backend-only credential pair.

…while keeping the shared SDK singleton **stateless** w.r.t. secrets and per-user
tokens.

## Scope

- **In:** SDK signer-hook seam + release; swaps-api SDK bump, env/config plumbing,
  provider wiring, request DTO token threading, docs, tests.
- **Out:** RadFi-side changes (settled); how the browser mints/refreshes the short-lived
  Bound token (app-owned, BIP322); the client-side `POST /sodax/transaction/sign`
  co-sign (runs in the browser, not swaps-api).

## Design decision — where the HMAC lives

**Chosen: a stateless signer hook injected by the backend provider.** The SDK exposes a
generic, optional `RadfiSigner` runtime hook; `RadfiProvider.request()` calls it per
request and merges the returned headers. The **backend** builds the closure that holds
the secret and computes the signature. The SDK stores only a function reference — no
secret, no per-user token, no mutable auth state.

Why, vs the alternatives (full rationale in `process.md`):

- **Secret-in-`RadfiConfig` (SDK computes HMAC):** rejected — makes the shared SDK
  singleton hold a per-deployment secret as state; forces isomorphic (browser) crypto in
  the SDK; leaks RadFi-vendor specifics into the SDK.
- **Signing-proxy** (point `radfi.apiUrl` at a backend proxy that adds the header):
  rejected as primary — a whole network service to build/operate + an extra hop on the
  swap critical path, for "add one header". RadFi chose HMAC (not IP), so the proxy buys
  nothing extra here.
- **Monkey-patch `globalThis.fetch`** in the backend: rejected for production — global
  process mutation, fragile to SDK internals, violates the repos' "no escape hatches"
  rule. Acceptable only as a *temporary* dev bridge while ~rc.19 is pending, never
  shipped.

## Cross-repo + version model (verified)

- `sodax-sdks` publishes via changesets on a `release` line; npm `@sodax/sdk@2.0.0-rc.N`
  ↔ git tag `@sdks@2.0.0-rc.N`. Dev branches keep a placeholder `0.0.1-rc.5` — ignore it.
- Backend pins **`@sodax/sdk@2.0.0-rc.14`**.
  - `chains.bitcoin.radfi` config: present since rc.14 → just needs to be supplied.
  - `extras.bound.accessToken`: **absent in rc.14**, shipped in **rc.15** (commit
    a2395f07 / #237), present through rc.18 → arrives with the pin bump.
  - HMAC `x-api-signature` + a signer hook: **exist in no artifact** → net-new SDK source
    + a new release.
- The local SDK checkout is on `feat/bridge-api-v2`, a divergent branch carrying
  unreleased Bridge/Swaps-API backend-client surface — **do not cut the release from it**;
  cut from main/release.

## Approach

```
swaps-api  →  sodax.swaps.createIntent({ params, extras:{ bound:{ accessToken } }, raw:true })
                     │  (user token, per request)
                     ▼
        BitcoinSpokeService → RadfiProvider.request()
                     │  calls the injected RadfiSigner() → { 'x-api-signature': ... }
                     ▼
                  fetch → RadFi   (Authorization: Bearer <user token>  +  x-api-signature)
```

Secret + HMAC computation: only in `swaps-api`'s `sodax.provider.ts`. User token: only
per-request via `extras.bound`. SDK: a thin pass-through hook.

## Steps

### Part A — SDK (`sodax-sdks`), publish ~rc.19 (BLOCKING GATE)

**A1. Add the signer-hook type + seam** (seam VERIFIED — D2)

The signer rides the **runtime channel** (like `logger`/`analytics`/`fee`), **not** the
serializable `chains.bitcoin.radfi` data contract. `BitcoinSpokeService` already receives
the whole `ConfigService` and reads `config.logger`, so it can read a new
`config.radfiSigner` the same way. Six edit sites:

1. `@sodax/types` `packages/types/src/sodax-config/sodax-config.ts`: add the types and a
   `radfi?: RadfiOptions` field on **`SodaxOptionalConfig`** (the runtime, non-serializable
   side — NOT `RadfiConfig`, NOT `chains.bitcoin.radfi`):
   ```ts
   export type RadfiSignContext = { method: string; path: string; body?: unknown };
   export type RadfiSigner = (ctx: RadfiSignContext)
     => Record<string, string> | Promise<Record<string, string>>;
   export type RadfiOptions = { signRequest?: RadfiSigner };
   ```
2. `packages/sdk/src/shared/entities/Sodax.ts` (`:50-71`): resolve
   `const radfiSigner = options?.radfi?.signRequest` next to `fee`, pass into `ConfigService`.
3. `packages/sdk/src/shared/config/ConfigService.ts` (`:78-92,:109-114`): hold
   `public readonly radfiSigner: RadfiSigner | undefined` outside the swappable `sodax`
   (so `initialize()`'s dynamic-config swap never clobbers it).
4. `packages/sdk/src/shared/services/spoke/BitcoinSpokeService.ts` (`:80`):
   `new RadfiProvider(chainConfig.radfi, config.radfiSigner)`.
5. `RadfiProvider` ctor: accept + store the optional signer.
6. `RadfiProvider.request()` (`:628-636`): call it per request, merge its headers:
   ```ts
   private async request(endpoint, options) {
     const url = `${this.config.apiUrl}${endpoint}`;
     const signed = this.signer
       ? await this.signer({ method: options?.method ?? 'GET', path: endpoint }) : undefined;
     return fetch(url, { ...options,
       headers: { 'Content-Type': 'application/json', ...(options?.headers || {}), ...signed } });
   }
   ```
- Do **not** add `secretKey`/`secretWord` to `RadfiConfig`; do **not** seed any instance token.
- Scope (D3 — concluded): `request()` covers the whole raw-build path — both
  `GET /wallets/details` (via `getTradingWallet`) and `POST /sodax/transaction` (via
  `createWithdrawTransaction`) route through it. The two `umsUrl` `fetch` calls
  (`RadfiProvider.ts:291` `getBalance`, `:409` utxos) are **dapp-kit UI-only**, never on the
  server-side raw path → leave them unsigned; do not route them through `request()`.

**A2. Tests** (`RadfiProvider.test.ts`)
- With a signer set: assert the exact header it returns is merged onto all targeted
  endpoints; with no signer: byte-identical to today (browser path unaffected).

**A3. Release** (D4 — procedure verified against the live repo)
- Latest published is **`@sdks@2.0.0-rc.18`**; cut **`@sdks@2.0.0-rc.19`** (unified, all 7
  packages). Merge the signer change to `main`, then cut from the **live release branch
  `release`** (the repo's actual line — `release/sdk` in `RELEASE_INSTRUCTIONS.md` is stale;
  `main` carries the `0.0.1-rc.5` placeholder and must not be tagged; **not**
  `feat/bridge-api-v2`). On `release`: `git pull --no-ff origin main` (brings #237
  `a2395f07` → carries `extras.bound.accessToken`), bump via `scripts/bump-versions.sh`
  (7 pkgs + `CONFIG_VERSION` — the publish workflow validates every `package.json` equals
  the tag), commit/push, draft GitHub Release tag `@sdks@2.0.0-rc.19` as pre-release
  (`.github/workflows/sdks-publish.yml` publishes under the `rc` dist-tag).
- Update `packages/skills` + RadfiProvider docs; run `pnpm check:ai`, `pnpm test/build/checkTs`.
  **Backend work waits on this being on npm.**

### Part B — swaps-api (`sodax-backend`), after ~rc.19 is published

**B1. Bump the SDK pin**
- `apps/swaps-api/package.json`: `@sodax/sdk` `2.0.0-rc.14` → `~rc.19`; update
  `pnpm-lock.yaml` (rc.14 currently at ~`:3809`). `pnpm --filter swaps-api checkTs`.
  (This bump also brings `extras.bound.accessToken`.)

**B2. Env + config plumbing** (mirror the existing `SolverConfigClass` pattern)
- `apps/swaps-api/src/shared/class/config.class.ts`: add `RadfiConfigClass`
  (`secretKey`/`secretWord` non-empty when present; optional `apiUrl`/`umsUrl` `IsUrl`),
  an `IsRadfiConfig` validator, and a `radfiConfig?` field on `ConfigClass` guarded with
  `@ValidateIf((o) => o.radfiConfig !== undefined)` (not `@IsOptional`, matching the
  null-rejecting rpc/solver pattern).
- `apps/swaps-api/src/config/configuration.ts`: read `SODAX_API_SECRET_KEY`,
  `SODAX_API_SECRET_WORD`, and optional `RADFI_API_URL`/`RADFI_UMS_URL`; assemble a
  `radfiConfig` object (omit entirely when the secrets are unset so dev/tests keep SDK
  defaults). **Deliberately flat env vars, not the file's `*_CONFIG` JSON-string pattern**
  (`RPC_CONFIG`/`SOLVER_CONFIG`): these are scalars, and keeping the secret as its own var
  avoids bundling it into a JSON blob that could be logged/handled as one unit.
- `apps/swaps-api/src/config/config.service.ts`: add `get radfiConfig()`, and **extend the
  sensitive-field strip (~`:31`)** (which currently drops mongo configs) to also redact
  `radfiConfig` so secrets never reach the startup warn log.
- `.env-example` + `apps/swaps-api/example.env.dev`: add the 4 vars with REDACTED
  placeholders under the Swaps API section + a comment that the secret pair is a
  Sodax-scoped HMAC credential, server-only, provisioned as a deployment secret (Coolify),
  same class as `MONGO_PASSWORD`/`INTENT_CANCELLER_PRIVATE_KEY`. Store **raw** (not a
  SHA-256 digest — unlike `ADMIN_ACCESS_TOKENS`; the server must replay the raw key to
  compute the HMAC).
- **Fail-fast at boot** when Bitcoin/RadFi swaps are enabled but the secret pair is unset
  (mirror how `RPC_CONFIG`/`SOLVER_CONFIG` validate), so a misconfigured deploy fails
  loudly instead of 401-ing every Bitcoin build at runtime. Rotation = update the Coolify
  env on swaps-api + redeploy (HMAC is per-request from env; no SDK release needed).

**B3. Wire the signer into the provider**
- `apps/swaps-api/src/shared/providers/sodax.provider.ts`: when `configService.radfiConfig`
  is present, build the HMAC closure and pass it as the SDK runtime hook. Server-side, so
  `node:crypto` is fine here (the SDK never sees it):
  ```ts
  import { createHmac } from 'node:crypto';
  const r = configService.radfiConfig;
  const signRequest = r?.secretKey && r?.secretWord
    ? () => {
        const ts  = String(Date.now());                                   // ms (confirm w/ RadFi)
        const sig = createHmac('sha256', r.secretKey)
                      .update(`${r.secretWord}_${ts}`).digest('hex');       // hex
        return { 'x-api-signature': `${sig}_${ts}` };
      }
    : undefined;

  new Sodax({
    chains: { [ChainKeys.BITCOIN_MAINNET]: { radfi: { /* apiUrl/umsUrl override if set */ } } },
    radfi: { signRequest },
    // ...existing rpc + solver overrides (deep-merge; don't clobber chains.bitcoin)
  });
  ```
- `ChainKeys.BITCOIN_MAINNET === 'bitcoin'`. If a bitcoin RPC override already targets
  `chains.bitcoin`, **deep-merge** the radfi block rather than overwrite it.
- Never set an instance-wide `radfi.accessToken` (would cross-contaminate users behind the
  shared singleton). Log only a boolean that HMAC is configured.

**B4. Thread the user token into `createIntent`** (the "new auth if user passes accessToken")
- Transport: **request DTO body** `bound.accessToken` (recommended — matches the SDK's own
  `BitcoinBoundExtrasV2` convention and the frontend `BridgeCard` reference). Not a header;
  swaps-api does **not** parse `<reason>:<token>` (that is RadFi-side only).
- `apps/swaps-api/src/api/swaps/dto/create-intent.dto.ts`: add
  `BitcoinBoundExtrasDto { @IsOptional @IsString accessToken? }` and an optional nested
  field on `CreateIntentParamsDto`:
  ```ts
  @IsOptional()
  @ValidateNested()
  @Type(() => BitcoinBoundExtrasDto)   // REQUIRED: without @Type, nested validation never runs
  bound?: BitcoinBoundExtrasDto;
  ```
  (`@Type` from `class-transformer`.)
  ⚠️ **This DTO field is mandatory, not optional plumbing:** the global pipe runs
  `forbidNonWhitelisted: true` (`validation.pipe.ts:8-11`), so until `bound` is a declared
  property a client sending it is **400'd before the service runs**. No DTO field ⇒ the
  token can never arrive.
- `apps/swaps-api/src/api/swaps/swaps.service.ts` `buildRawIntentAction` (`:430-448`):
  when the source chain is Bitcoin and `dto.bound?.accessToken` is present, attach
  `extras: { bound: { accessToken } }` to the returned action. `createIntent` (`:184`) and
  the allowance/approve helpers inherit it via the shared builder; the SDK type-gates
  `extras.bound` to Bitcoin and ignores it elsewhere.
- **Failure path (required):** for a **Bitcoin-source** `createIntent` with no
  `bound.accessToken`, throw a clear `BadRequestException` (400) instead of letting the
  call reach the SDK — `RadfiProvider.resolveAuth` (`:588-601`) otherwise throws a 401 deep
  in `POST /sodax/transaction` when both the user token and `config.apiKey` are empty.
  Mirror the existing guard pattern at `swaps.service.ts:117-119`
  (`srcAddress/dstAddress required when includeTxData`). Place the check on the
  createIntent path (Bitcoin source ⇒ token mandatory).
**B4b. Fix `getQuote?includeTxData=true` for Bitcoin source** (D6 — broken today; product decision)
- **Current state is broken**, not merely missing: a BTC-source quote-with-txData either
  400s at validation (if a client sends the token — `forbidNonWhitelisted`) or fails with an
  opaque Bound 401 deep in the SDK (if omitted — the inline `createIntent` at
  `swaps.service.ts:121-137` is built with **no `extras`**, so the token defaults to the
  server's empty RadFi token, `chains.ts:826 accessToken:''`). The existing guard
  (`:117-119`) checks only address presence, never the token.
- **Recommended (thread it):** add nested `bound` (and `srcPublicKey`) to `QuoteRequestDto`
  (`quote.dto.ts:28-95`), widen the service `getQuote` input (`swaps.service.ts:83-95`), and
  pass `extras: { bound: input.bound }` on the inline `createIntent` action
  (`swaps.service.ts:121-137`) — same shape as B4. Matches the published `QuoteRequestV2`.
- **Fallback (descope):** if BTC-source `includeTxData` is out of scope for #831, add an
  explicit 400 guard rejecting Bitcoin/Stacks-source quote-with-txData and pointing callers
  to `POST /swaps/intents`. (Contradicts the published `QuoteRequestV2`, so threading is
  preferred.)
- ⛳️ **Product decision required** (see Open decisions) before picking thread vs descope.

**B5. Docs**
- `apps/swaps-api/README.md` + `docs/SWAPS_V2_INTEGRATION.md`: document the Bitcoin-source
  path (client forwards a short-lived Bound token per request; swaps-api forwards it and
  signs server-to-server with the HMAC credential), which RadFi endpoints fire on
  `raw:true`, and the new env vars + secret provisioning.

## HMAC contract (pin in a test before publishing)

```
timestamp = String(Date.now())                       // epoch ms (RadFi example: 1719396000000)
message   = secret_word + "_" + timestamp
signature = HMAC_SHA256(secret_key, message)         // hex digest
header    = `x-api-signature: ${signature}_${timestamp}`
valid window = 60 s
```

Note: the signature binds **only** `secret_word + timestamp` — **not** the request body or
URL. It is a time-boxed proof-of-possession of the credential, not a request-integrity MAC;
do not assume it protects against body tampering. (This matches RadFi's stated scheme.)

**Pinned test vector** (independently verified via `node:crypto` + `openssl`) — assert this
byte-for-byte in the signer unit test, and use it to confirm the format with RadFi:

```
secret_key = "sk_abc123"   secret_word = "sw_xyz789"   timestamp = "1719396000000"
x-api-signature = f1cc08944bf1f22ad840eb10253cbc0b3e0f7a871034e5e1c29ae15565f1553e_1719396000000
```

⚠️ **Open with RadFi:** whether a companion **key-id header** (e.g. `x-api-key`) must also
be sent so the server can select which `secret_key` to validate against. If yes, the signer
closure returns that header too.

## Sequencing

`A1 → A2 → A3 (publish ~rc.19, GATE) → B1 → {B2, B3, B4 in parallel, reviewed together} → B5 → deploy + real BTC raw-build e2e`

## Verification

- SDK: `RadfiProvider.test.ts` — signer header merged on targeted endpoints; no-signer is
  byte-identical to today; **seam test**: a hook passed via `SodaxOptions.radfi.signRequest`
  actually reaches `RadfiProvider.request()`. **HMAC test vector** asserted byte-for-byte
  (see contract). `pnpm test/checkTs/build/check:ai` green.
- swaps-api unit: `radfi-config.spec.ts` (valid subset passes; unknown/null rejected at
  boot; startup log contains no secret); `sodax.provider.spec.ts` (radfi → `signRequest`
  passed; bitcoin rpc override + radfi both survive the merge; no radfiConfig → no hook);
  `swaps.service.spec.ts` (Bitcoin DTO with `bound.accessToken` → `extras.bound.accessToken`
  on the mocked `createIntent`; non-Bitcoin → no extras.bound; **Bitcoin source with no
  token → 400, SDK not called**; token never logged).
- e2e: a real Bitcoin-source `createIntent({raw:true})` from the backend is accepted by
  RadFi (manual/staging, needs the real credential pair).

## Risks

- **Secret/token leakage** — redact `radfiConfig` in the config startup log (today only
  mongo is stripped); never log the user token, the secret pair, or the computed
  `x-api-signature`; keep them out of `SodaxError`/`RadfiApiError` context + the
  error-mapper. (`logging.middleware.ts`/morgan logs only method/url/status — verified safe.)
- **HMAC format mismatch** — wrong timestamp unit (ms vs s) or digest encoding (hex vs
  base64) ⇒ every request 401s. Confirm with RadFi; encode it as the test contract.
- **Replay window / clock skew** — 60 s validity ⇒ the backend host clock must be
  NTP-synced; drift silently breaks all Bitcoin builds.
- **`chains.bitcoin` merge collision** — radfi override and any bitcoin RPC override both
  target `chains.bitcoin`; deep-merge, don't clobber.
- **Cross-repo coupling** — backend is blocked on the ~rc.19 publish; release from
  main/release, not `feat/bridge-api-v2` (which would also ship unreleased surface).
- **Signer scope** — the signer runs on every `apiUrl` `request()` call, so it also signs
  the unauthenticated `GET /wallets/details` (auth/refresh endpoints are short-circuited in
  raw mode, so not on the build path). D3 keeps this deliberate; confirm RadFi tolerates the
  extra header on the public GET (see "still need external confirmation").
- **Key-id header** — if RadFi requires an `x-api-key`/key-id alongside the signature, the
  current signer returns only `x-api-signature` and every request 401s until added. Resolve
  the open RadFi question before the SDK release.

## Decisions — resolved internally (high confidence, code-backed)

- **D2 signer hook** — shape (a) `signRequest(ctx) → headers`, on the runtime
  `SodaxOptionalConfig.radfi` channel (seam verified — 6 edit sites in A1).
- **D3 signature scope** — sign only the `apiUrl` `request()` chokepoint; leave the two
  dapp-kit-only `umsUrl` calls unsigned.
- **D5 token transport** — request body, nested `bound: { accessToken }` (not a header).
- **D7 secret provisioning** — raw env vars on swaps-api only via Coolify, redacted,
  fail-fast at boot; rotation = env change + redeploy (no SDK release).
- **D1 HMAC format** — ms timestamp + lowercase hex; pinned test vector above. (Format is
  high-confidence from RadFi's own example; still byte-confirm with RadFi — see below.)
- **D4 release** — `@sdks@2.0.0-rc.19` from the live `release` branch (procedure in A3).

## Decisions — still need external confirmation

- 🔶 **RadFi team:** (1) byte-match the pinned HMAC test vector (ms + hex, 60 s);
  (2) **whether a key-id header (e.g. `x-api-key`) must accompany the signature** so the
  server can pick the secret — *critical, changes the signer output*; (3) whether the
  `umsUrl` endpoints need signing (we assume not); (4) dual key/word support for
  zero-downtime rotation.
- 🔶 **SDK release owner:** confirm the release branch name (`release`), that `rc.19` is the
  correct next number, and who cuts/publishes it.
- 🔶 **#831 / product owner:** is `GET /swaps/quote?includeTxData=true` a supported entry
  point for Bitcoin source in this issue → **thread** the token (B4b), or ship BTC-source
  via `POST /swaps/intents` only → **descope** with a 400 guard?
