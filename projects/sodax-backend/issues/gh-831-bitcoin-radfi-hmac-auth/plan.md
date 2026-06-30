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

**A1. Add the signer-hook type + seam**
- ⚠️ **Verify the seam first (precondition).** The exact placement below is a *proposed*
  shape, not yet confirmed against how `ConfigService` threads non-serializable runtime
  options. Verified today: `logger`/`analytics`/`fee` are held on `ConfigService`
  **outside** the swappable `SodaxConfig`; a per-feature `radfi` runtime slot is **not**
  confirmed to thread cleanly to `BitcoinSpokeService`. Confirm the real seam (it may end
  up a top-level option, or a different carrier) before writing A1.
- `@sodax/types`: add an optional runtime hook, placed next to `logger`/`analytics`
  runtime options, i.e. **outside** the serializable `SodaxConfig` (proposed:
  `SodaxOptions.radfi.signRequest`). Type:
  ```ts
  export type RadfiSigner = (req: { url: string; method: string })
    => Record<string, string> | Promise<Record<string, string>>;
  ```
  Do **not** add `secretKey`/`secretWord` to `RadfiConfig`.
- `packages/sdk/src/shared/entities/btc/RadfiProvider.ts`: thread the signer to the
  provider and call it in the central `request()` helper (`:628-636`):
  ```ts
  private async request(endpoint, options) {
    const url = `${this.config.apiUrl}${endpoint}`;
    const extra = this.signer ? await this.signer({ url, method: options?.method ?? 'GET' }) : undefined;
    return fetch(url, { ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}), ...extra } });
  }
  ```
- Scope (concluded): `request()` covers the `apiUrl` Sodax endpoints (incl.
  `GET /wallets/details` via `getTradingWallet` and `POST /sodax/transaction`). The two
  `umsUrl` `fetch` calls (`RadfiProvider.ts:291` `getBalance`, `:409` utxos) bypass
  `request()`; confirm the raw-build path (`createIntent({raw:true})`) does **not** touch
  them — if so, leave them unsigned (RadFi scopes HMAC to the Sodax endpoints) and do not
  route them through `request()`.
- Wire `SodaxOptions.radfi.signRequest` → `ConfigService` → `BitcoinSpokeService`
  (`:75-84`, where `new RadfiProvider(...)` is constructed) → `RadfiProvider`.
- **Do not** seed any instance token here.

**A2. Tests** (`RadfiProvider.test.ts`)
- With a signer set: assert the exact header it returns is merged onto all targeted
  endpoints; with no signer: byte-identical to today (browser path unaffected).

**A3. Release**
- Changeset → publish unified **~`@sdks@2.0.0-rc.19`** from main/release. Cut it from a
  base that already contains #237 (`a2395f07`) so the release carries the rc.15+
  `extras.bound.accessToken` plumbing alongside the new signer hook. Update
  `packages/skills` + RadfiProvider docs; run `pnpm check:ai`, `pnpm test/build/checkTs`.
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
- `.env-example`: add the 4 vars with placeholders + a comment that the secret pair is a
  Sodax-scoped HMAC credential, server-only, provisioned as a deployment secret (Coolify).

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
- Decide separately whether the `getQuote` `includeTxData` inline `createIntent`
  (`swaps.service.ts:121-137`) needs the same threading for Bitcoin-source quotes — likely
  defer; note explicitly.

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

## Sequencing

`A1 → A2 → A3 (publish ~rc.19, GATE) → B1 → {B2, B3, B4 in parallel, reviewed together} → B5 → deploy + real BTC raw-build e2e`

## Verification

- SDK: `RadfiProvider.test.ts` — signer header merged on targeted endpoints; no-signer is
  byte-identical to today; **seam test**: a hook passed via the chosen option actually
  reaches `RadfiProvider` (guards the A1 unverified seam). `pnpm test/checkTs/build/check:ai`
  green.
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
- **Signer scope** — if the signer runs on every `request()` call, it also signs the
  unauthenticated `GET /wallets/details` and any auth/refresh calls; confirm RadFi
  tolerates the extra header, or scope the hook to the authenticated Sodax POST(s).

## Open decisions (need a human / RadFi / SDK owner)

1. HMAC wire details with RadFi: ms vs s, hex vs base64 (example implies **ms + hex**).
2. Signer hook shape: return **headers** (recommended) vs inject a whole **`fetch`**.
3. `x-api-signature` scope: Sodax `apiUrl` endpoints only, or `umsUrl` too.
4. SDK release ownership + line + target version (cut ~rc.19 from main/release).
5. Token transport: DTO body `bound.accessToken` (recommended) vs header.
6. `getQuote includeTxData` for Bitcoin-source: thread the token, or declare unsupported.
7. Secret provisioning + rotation procedure (Coolify env vs secret manager).
