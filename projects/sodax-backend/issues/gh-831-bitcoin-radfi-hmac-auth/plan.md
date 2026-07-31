---
type: plan
repo: sodax-backend
github: 831
updated: 2026-07-31
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
  rule. Acceptable only as a *temporary* dev bridge while the release is pending, never
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

### Part A — SDK (`sodax-sdks`), publish 2.1.0 (BLOCKING GATE)

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
- Latest published is **`@sdks@2.0.0`** (`rc` dist-tag: `2.0.0-rc.21`); cut **`@sdks@2.1.0`**
  (unified, all 8 packages — `types libs swaps-api wallet-sdk-core sdk wallet-sdk-react dapp-kit
  skills`). Merge the signer change to `main`, then cut from the **live release branch
  `release`** (the repo's actual line — `release/sdk` in `RELEASE_INSTRUCTIONS.md` is stale;
  `main` carries the `0.0.1-rc.5` placeholder and must not be tagged; **not**
  `feat/bridge-api-v2`). On `release`: `git pull --no-ff origin main` (brings #237
  `a2395f07` → carries `extras.bound.accessToken`), bump via `scripts/bump-versions.sh`
  (7 pkgs + `CONFIG_VERSION` — the publish workflow validates every `package.json` equals
  the tag), commit/push, draft GitHub Release tag `@sdks@2.1.0`. Note the dist-tag is derived
  from the tag string in `.github/workflows/sdks-publish.yml`: a hyphenless version publishes
  under **`latest`**, only an `-rc.N` tag lands on `rc`. Confirm with the release owner that the
  signer hook should go straight to `latest`.
- Update `packages/skills` + RadfiProvider docs; run `pnpm check:ai`, `pnpm test/build/checkTs`.
  **Backend work waits on this being on npm.**

### Part B — swaps-api (`sodax-backend`), after 2.1.0 is published

**B1. Bump the SDK pin**
- `apps/swaps-api/package.json`: `@sodax/sdk` → `2.1.0` (the pin is `2.0.0-rc.21` today —
  `development` moved it while this branch was open); update `pnpm-lock.yaml`. `pnpm --filter swaps-api checkTs`.
  (This bump also brings `extras.bound.accessToken`.)

**B2. Env + config plumbing** (mirror the existing `SolverConfigClass` pattern)
- `apps/swaps-api/src/shared/class/config.class.ts`: add `RadfiConfigClass`
  (`secretKey`/`secretWord` non-empty when present; optional `apiUrl`/`umsUrl` `IsUrl`),
  an `IsRadfiConfig` validator, and a `radfiConfig?` field on `ConfigClass` guarded with
  `@ValidateIf((o) => o.radfiConfig !== undefined)` (not `@IsOptional`, matching the
  null-rejecting rpc/solver pattern).
- `apps/swaps-api/src/config/configuration.ts`: read `BOUND_API_SECRET_KEY`,
  `BOUND_API_SECRET_WORD` (named `SODAX_API_SECRET_*` until the 2026-07-30 rename), and optional
  `RADFI_API_URL`/`RADFI_UMS_URL`; assemble a
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

The format above is **confirmed by RadFi's response comment** on the issue: hex digest,
`message = secret_word + "_" + timestamp`, `header = signature + "_" + timestamp`, 13-digit
(ms) timestamp, 60 s window. The required headers are exactly **`x-api-signature` +
`Authorization: Bearer <token>`** — RadFi lists **no key-id header** (e.g. `x-api-key`); the
single dedicated Sodax credential is how their server selects the secret, so the signer
returns `x-api-signature` only.

**Pinned test vector** (independently verified via `node:crypto` + `openssl`) — assert this
byte-for-byte in the signer unit test. RadFi's example used a placeholder digest, so this
real vector is also worth a one-line sanity confirm with them:

```
secret_key = "sk_abc123"   secret_word = "sw_xyz789"   timestamp = "1719396000000"
x-api-signature = f1cc08944bf1f22ad840eb10253cbc0b3e0f7a871034e5e1c29ae15565f1553e_1719396000000
```

## Sequencing

`A1 → A2 → A3 (publish 2.1.0, GATE) → B1 → {B2, B3, B4 in parallel, reviewed together} → B5 → deploy + real BTC raw-build e2e`

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
- **HMAC format mismatch** — low residual risk: RadFi's comment already specifies hex + ms +
  the message structure, so the format is pinned in the test vector. Only a real-digest
  byte-match with RadFi remains as a sanity check; the e2e staging call also catches any
  mismatch.
- **Replay window / clock skew** — 60 s validity ⇒ the backend host clock must be
  NTP-synced; drift silently breaks all Bitcoin builds.
- **`chains.bitcoin` merge collision** — radfi override and any bitcoin RPC override both
  target `chains.bitcoin`; deep-merge, don't clobber.
- **Cross-repo coupling** — backend is blocked on the 2.1.0 publish; release from
  main/release, not `feat/bridge-api-v2` (which would also ship unreleased surface).
- **Signer scope** — the signer runs on every `apiUrl` `request()` call, so it also signs
  `GET /wallets/details`. That endpoint is itself a Sodax `apiUrl` endpoint (the credential is
  "scoped to the Sodax endpoints"), so signing it is consistent; `umsUrl` and the
  raw-skipped auth/refresh calls are unaffected (D3).

## Decisions — resolved internally (high confidence, code-backed)

- **D2 signer hook** — shape (a) `signRequest(ctx) → headers`, on the runtime
  `SodaxOptionalConfig.radfi` channel (seam verified — 6 edit sites in A1).
- **D3 signature scope** — sign only the `apiUrl` `request()` chokepoint; leave the two
  dapp-kit-only `umsUrl` calls unsigned.
- **D5 token transport** — request body, nested `bound: { accessToken }` (not a header).
- **D7 secret provisioning** — raw env vars on swaps-api only via Coolify, redacted,
  fail-fast at boot; rotation = env change + redeploy (no SDK release).
- **D1 HMAC format** — ms timestamp + lowercase hex; **confirmed by RadFi's response
  comment** (hex + message structure + 13-digit ts + 60 s); pinned test vector above.
- **D4 release** — `@sdks@2.1.0` from the live `release` branch (procedure in A3).

### RadFi answered these in their response comment (not open)

- **Headers** — only `x-api-signature` + `Authorization: Bearer`; **no key-id / `x-api-key`**
  (single dedicated Sodax credential). Earlier "critical x-api-key" concern → retracted.
- **Format** — hex digest, `message = secret_word_timestamp`, ms timestamp, 60 s.
- **Scope** — credential "scoped exclusively to the Sodax endpoints" → `umsUrl` not covered.
- **User token** — unchanged; optional `Bearer <reason>:<token>` (server splits on `:`).

## Decisions — still need external confirmation

- 🔶 **RadFi team (low/ops-only):** (1) issue the **real `SECRET_KEY`/`SECRET_WORD` pair**
  (the actual blocker to running it end-to-end); (2) one-line sanity byte-match of the
  pinned test vector (their example used a placeholder digest); (3) **dual key/word support
  for zero-downtime rotation** — ops planning, non-blocking. Everything else in their scheme
  is settled above.
- 🔶 **SDK release owner:** confirm the release branch name (`release`), that `2.1.0` is the
  correct next number, and who cuts/publishes it.
- 🔶 **#831 / product owner:** is `GET /swaps/quote?includeTxData=true` a supported entry
  point for Bitcoin source in this issue → **thread** the token (B4b), or ship BTC-source
  via `POST /swaps/intents` only → **descope** with a 400 guard?
  **(2026-07-30: the shipped code THREADS it — the "descope" wording in `outcome.md` /
  the BE README / commit `4b74b138` is stale. Pick one and make the three agree; see F6.)**

---

## Follow-up — review fixes (2026-07-30)

Both PRs re-reviewed file-by-file **against the source**, not against the PR bodies.
Verdict: **the approach holds, no redesign** — the signer-hook design is still the right
call. What came out: one behaviour regression, two release blockers, the rest docs/ops
polish. Findings trail + an audit of which review points survived scrutiny: `process.md`
(2026-07-30 section).

Do them in this order — F1 is the only one that changes behaviour, F2–F3 gate the release.

| # | Repo | Fix | Why here | Anchor |
|---|---|---|---|---|
| F1 | BE | Move the "Bitcoin needs `bound.accessToken`" rule off the DTO and into `createIntent` + `createLimitOrderIntent`, sharing one helper with the existing `getQuote` guard | **Only item that breaks working behaviour** — the DTO validator also fires on `/swaps/allowance/check` and `/swaps/approve`, which never call Bound | `create-intent.dto.ts:32`, `swaps.service.ts:117` |
| F2 | SDK | Delete `body?: unknown` from `RadfiSignContext` (never populated — `request()` passes `{method, path}` only) | Public type: once published, removing a field is breaking. Must land **before** the release | `sodax-config.ts:79`, `RadfiProvider.ts:637` |
| F3 | SDK | Add the changeset + document `radfi` in `CONFIGURE_SDK.md` (with a "server-side only, never ship a credential to a browser bundle" note) | No changeset ⇒ no version bump ⇒ BE can never leave draft. Mechanical blocker | `.changeset/` (only `config.json`+`README.md`), `packages/sdk/docs/CONFIGURE_SDK.md` |
| F4 | BE | Exactly one of the two secrets set → **throw at boot** (unambiguous misconfig, and it is what D7 says); both unset → `logger.warn` naming the vars. Today both cases are silent | Reconciles D7's "fail-fast" with not turning a Bitcoin-only gap into a full-service outage | `configuration.ts:82`, `sodax.provider.ts` |
| F5 | SDK | Classify a Bound auth failure (401/403 / `apiSignatureMismatch`) as `EXTERNAL_API_ERROR` instead of `INTENT_CREATION_FAILED` | Today our own credential failure returns **422** to the client (`error-mapper.ts:9`), i.e. dressed as the user's fault. One fix in the SDK covers every BE consumer | `RadfiProvider.ts:38` (`RadfiApiError.code`), BE `error-mapper.ts:9` |
| F6 | BE | Make README + commit message match the code: Bitcoin `quote?includeTxData` **is** supported, it just requires the token | Public README currently tells integrators the opposite of what ships | `apps/swaps-api/README.md` |
| F7 | BE | Log a masked RadFi summary (`{apiUrl, umsUrl, secretKey:'[set]', secretWord:'[set]'}`) instead of dropping the whole block; fix the PR body, which already claims this | PR body describes a log line the code does not emit (leftover from #1027); ops cannot see which Bound host is configured | `config.service.ts:33` |
| F8 | SDK | Fix the PR-body claim "kept … rather than inside `this.sodax`" | `deepMerge` iterates `Object.keys(source)`, so `radfi` **does** land on `instanceConfig`. Harmless (closure holds the secret; `JSON.stringify` drops functions) but the sentence is wrong | `deepMerge.ts:13` |
| F9 | SDK | One comment on `RadfiProvider` stating the signer covers `apiUrl` only and why (credential scoped to the Sodax endpoints — D3) | `RadfiProvider` **is** public API (`entities/index.ts` → `btc/index.ts`), so third parties can wire a signer and be surprised by the two `umsUrl` calls | `RadfiProvider.ts:296`, `:414` |
| F10 | SDK | Optional: `new RadfiProvider(config, { signer })` instead of a positional 2nd arg | Public class; parameters will keep accreting. Pure ergonomics | `RadfiProvider.ts:120` |

> **F1 done 2026-07-30** — `ad5be1bc` on `feat/swaps-api-radfi-hmac` (pushed, in PR #1028).
> Validator deleted
> from `create-intent.dto.ts` (replaced by a NOTE explaining why the rule cannot live there);
> the rule is now `SwapsService.assertBoundAccessTokenForBitcoin(srcChainKey, bound, condition)`,
> called from `createIntent`, `createLimitOrderIntent` and `getQuote` (`includeTxData` branch
> only) — the `condition` string keeps both 400 messages byte-identical to before. Verified:
> swaps-api unit **327/327**, `tsc --noEmit` clean, biome clean on the 4 changed files.
> Test split worth knowing: the actual regression pin is in `swap-extras.dto.spec.ts` (a Bitcoin
> body with no token must now **resolve** through the pipe — that test failed before the fix);
> the new `isAllowanceValid`/`approve` service tests would have passed before too, so they are
> forward guards against the rule creeping back onto a shared path (a DTO validator again, or
> `buildRawIntentAction`, which both of those methods call).

> **F2 + F3 done 2026-07-30** — `45226506f` + `06da1749b` on `feat/radfi-backend-signer` (pushed,
> in PR #322). `body` dropped from `RadfiSignContext`; changeset `.changeset/radfi-signer-hook.md`
> at **minor** for `@sodax/types` + `@sodax/sdk` (new optional field + new exported types = minor
> per `.claude/skills/release-governance/references/semver-and-changelog-policy.md`; the three
> existing changesets are all `patch` because they are bug fixes, not a precedent for this).
> Docs: a section in `CONFIGURE_SDK.md` **plus** — beyond the original F3 scope — the Bitcoin
> `chain-specifics.md` in `packages/skills`, which the repo's own definition of done requires when
> public behavior changes, and which is where a backend integrator actually looks (it sits next to
> the per-user Bound token paragraph the signer is easily confused with).
> Verified: `@sodax/sdk` 1738/1738, `checkTs` clean on both packages, biome clean,
> `pnpm --filter @sodax/skills check:ai` green (all 6 sub-checks). `changeset status` not runnable
> — the CLI is not installed locally; CI's `changeset-check.yml` is the gate.

> **F4 + F5 + F6 applied 2026-07-30** on `feat/swaps-api-radfi-hmac`, **uncommitted**.
> F4 landed **stronger than planned, at the user's call**: the credential is now **required in every
> environment** — `buildRadfiConfig()` throws unless both secrets are set, naming the missing one(s).
> The plan had proposed warn-on-both-unset / throw-on-half-set to avoid taking a 10-chain service
> down over a Bitcoin gap; the user chose hard-required. Consequence worth knowing: `configuration.ts`
> calls `buildRadfiConfig()` at **module scope**, so merely importing it throws — `radfi-config.spec.ts`
> needs a `vi.hoisted()` block seeding the env before the import. F6 folded in on the same README bullet.
>
> **Verified against the live service** (swaps-api run natively on :3009 against the Dockerised
> Mongo/Redis, local SDK build, placeholder secrets):
> - `POST /swaps/allowance/check` Bitcoin, no token → **200 `{"valid":true}`** (was 400 — F1 fixed,
>   and it confirms the SDK really does short-circuit Bitcoin allowance without calling Bound)
> - `POST /swaps/intents` Bitcoin, no token → **400** naming the field
> - `POST /swaps/intents` Bitcoin + token → **502 `upstream authentication error`** (was 422) — a real
>   round trip to Bound, which parsed the `x-api-signature` and rejected only the digest. F5 confirmed
>   end to end against the live API.
> - Logs: `radfiAuthFailure: true` at error level, Bound's `apiSignatureMismatch` present in the log
>   but absent from the response; zero occurrences of either placeholder secret; `radfiConfig` fully
>   redacted from the startup config log.
> - Boot with the env unset → `Missing required RadFi/Bound backend credential: SODAX_API_SECRET_KEY,
>   SODAX_API_SECRET_WORD`, process exits.
>
> **F5 moved from the SDK to the BE — the SDK route would have cost a major bump.**
> `EXTERNAL_API_ERROR` is not in `CreateIntentErrorCode`
> (`USER_REJECTED | VALIDATION_FAILED | INTENT_CREATION_FAILED | UNKNOWN`, `errors/codes.ts:145`),
> which is shared by every feature's `create*Intent` (32 references). Widening it changes a public
> `Result` union → **major** per the SemVer policy, and breaks any consumer with an exhaustive
> switch — wildly out of proportion. Instead `error-mapper.ts` gains `isRadfiAuthFailure`, which
> walks the SodaxError cause chain (depth-capped 4, shape-matched on `name === 'RadfiApiError'` like
> the existing solver check) and answers **502 + `logger.error({radfiAuthFailure:true})`** before the
> 422 mapping. No SDK change, so F5 no longer waits on the release.
> Signals matched: Bound's own `sodax.apiSignatureMismatch` (the one observed in the PR's live run)
> plus status 401/403 (plausible, unverified — Bound has not returned one to us yet).
> Verified: swaps-api unit **336/336**, `tsc --noEmit` clean, biome clean.

> ### 2026-07-30 — the production credential WORKS. The last gate is cleared.
>
> Ran swaps-api natively (:3009) with the **real** Bound pair (from `.env.dev`, 64-char key /
> 32-char word). Bound's error on a Bitcoin `createIntent` changed from
> `sodax.apiSignatureMismatch` → **`auth.invalidToken`**, i.e. it **accepted our `x-api-signature`**
> and failed only on the deliberately-dummy user token. The HMAC scheme, the ms timestamp, the hex
> digest and the header format are all confirmed correct against the live API. Nothing about the
> signing path is unverified any more.
>
> **That run also exposed a real bug in F5, now fixed.** Bound answers **401 for BOTH** a bad
> service signature and a bad user token, so the original `isRadfiAuthFailure` (which matched any
> 401/403) classified an expired *user* token as *our* credential failing → 502 + `logger.error`.
> A Bound token lives **~10 minutes**, so that would have paged on every routine expiry and told
> the user nothing. Replaced by `radfiFailureKind()`, which reads Bound's error identifier instead
> of the status:
> - `sodax.apiSignatureMismatch` → `service-credential` → **502** + `logger.error({radfiAuthFailure})`
> - `auth.*` → `user-token` → **401** + `logger.warn({radfiUserTokenRejected})` + "mint a fresh one"
>
> Both verified live. **Lesson: an upstream's HTTP status may not distinguish whose fault it is —
> classify on its error identifier.** The bug was undetectable with placeholder secrets, because
> every call failed at the signature before ever reaching token validation.
>
> **Env vars renamed** `SODAX_API_SECRET_*` → **`BOUND_API_SECRET_*`** across 6 files. Bound issues
> the pair under the `SODAX_` name (their name for the Sodax *account*), but inside this repo that
> reads as "the Sodax API's key" — the opposite of what it is. The user hit exactly that trap: set
> `BOUND_API_SECRET_*` in `.env.dev` by instinct and the code silently saw nothing. Renamed while
> nothing in prod had been provisioned yet, so the change was free. A comment in
> `configuration.ts` records Bound's original name for traceability when debugging with them.

**Remaining to close #831:** a full happy-path run needs a live browser-minted Bound token
(BIP322), which the demo can now do against `http://localhost:3009` — the signing side is done.

### Raised in review, then dropped (do not re-raise)

- **"Sign the `umsUrl` calls too."** Contradicts **D3**, already settled 07-01: the Bound
  credential is scoped to the Sodax endpoints, so signing UMS is unverified and possibly
  meaningless. Only F9 (a comment) survives.
- **"Rename `RadfiSigner` → `OutboundRequestSigner` for reuse."** Premature abstraction for
  a second consumer that does not exist.
- **"Expose only `radfiSigner` from `CustomConfigService`, keep the secrets private."**
  ~No real boundary — the values come from `process.env`, readable in-process regardless.
- **"Use `BITCOIN_CHAIN_KEYS_SET.has(...)`."** One Bitcoin key exists, and the BE already
  uses `=== ChainKeys.BITCOIN_MAINNET` in four places; changing it would break local idiom.
- **"Stop the signer overriding `Authorization`."** Real footgun, zero exploit path (our
  signer returns one header), and the author documented + pinned it deliberately. Author's
  call, not a blocker.

## Follow-up — round 2 (2026-07-31)

Re-checked both branches after F1–F6 landed. F1–F6 are in and correct; what follows is what
F4's stronger-than-planned landing broke, plus the leftovers of round 1 (F7–F10) and one item
promoted out of `outcome.md`'s "Still open". Evidence for every claim: `process.md`
(2026-07-31 section) — the CI item was reproduced by running the suites, not reasoned about.

| # | Repo | Fix | Why | Anchor |
|---|---|---|---|---|
| **F11** | BE | Stop `buildRadfiConfig()` from throwing at **module eval** — seed placeholders in `test/vitest.setup.ts` (same shape as the existing `buildMongoConfig` stub) and/or move the throw to Nest bootstrap / provider construction | **CI-breaking, new.** `configuration.ts:132` calls it at module scope, so importing anything that reaches it dies without the env. Reproduced: swaps-api e2e = **5 failed / 4 passed**, every failure `Missing required RadFi/Bound backend credential`. `pnpm test` = unit **+ e2e**, and `ci.yml` sets only `MONGOMS_VERSION` ⇒ PR #1028 goes red on merge-readiness for a reason unrelated to the SDK pin | `configuration.ts:80-93`, `:132`; `apps/swaps-api/test/vitest.setup.ts`; `.github/workflows/ci.yml:52` |
| **F12** | both | Re-do the release/pin story: the hook ships as **2.1.0** (changeset is `minor` × 2), *not* `rc.19` | npm today: `latest` **2.0.0**, `rc` **2.0.0-rc.21**. The rc.19 pin bump (`61d4ba8b`) was undone by the merge with `development` — `apps/swaps-api/package.json` says `2.0.0-rc.21`. Every "rc.19" in this folder + both PR bodies is stale. Also: installed `node_modules/@sodax/sdk` is a **local tarball `2.0.0-rc.17`** from `.local-sodax/`, so local `checkTs`/tests do not validate what CI installs | `apps/swaps-api/package.json:48`; `.changeset/radfi-signer-hook.md` |
| **F13** | BE | Fix PR #1028's body, or apply F7 for real | Body still names `SODAX_API_SECRET_KEY/_WORD` (renamed to `BOUND_API_SECRET_*` in `0307564f`) and still claims a `boundConfig: {secretKey:"[set]"…}` startup log. Shipped code strips `radfiConfig` **entirely** from the config log and the provider logs only `Applying RadFi backend signer (HMAC) configuration` — so ops cannot see **which Bound host** (`RADFI_API_URL`) is live | `config.service.ts:32`, `sodax.provider.ts` (log line), PR #1028 body |
| F14 | SDK | F9 leftover: one line at the two `umsUrl` call sites saying they are intentionally unsigned (D3) | The class-level comment says "per outbound `apiUrl` request", but the surprise lives at the call sites. `RadfiProvider` is public API | `RadfiProvider.ts:291` (`getBalance`), `:407` (`getExpiredUtxos`) |
| F15 | SDK | F10 leftover: `new RadfiProvider(config, { signer })` instead of the positional 2nd arg | Cheapest **before** the signer arg is in a published class | `RadfiProvider.ts:124` |
| F16 | SDK | Promoted from `outcome.md` "Still open" #5 — drop the `= this.radfi.accessToken` defaults and require the token per call | Confirmed still present on the branch: `accessToken` is a public mutable field, `setRadfiAccessToken` is public, and both Bitcoin build paths silently default to it. One `Sodax` singleton serves every user in swaps-api. Separate PR (breaks browser callers) | `RadfiProvider.ts:121`, `:201`; `BitcoinSpokeService.ts:392`, `:509` |
| F17 | BE/ops | A runbook page for `radfiAuthFailure: true` | The signature is `Date.now()`-based inside Bound's 60 s window, so **host clock drift alone** turns every Bitcoin build into a 502 + page. Runbook should name the three causes — wrong/rotated secret, clock drift, Bound-side change — and that rotation is env + redeploy | `docs/runbooks/` |
| F18 | SDK | F8 leftover: the PR #322 sentence "…rather than inside `this.sodax`" | `deepMerge` iterates `Object.keys(source)`, so `radfi` **does** land on `instanceConfig` as well. Harmless, wrong as written | PR #322 body |

**Verified correct, do not re-audit:** `RadfiApiError` sets `this.name` to a string **literal**
(`RadfiProvider.ts:46`) and `tsup` does not minify, so `error-mapper`'s shape match survives
bundling; the swaps-api **unit** suite passes with the credential env unset (**337/337**); Bound
step 3 (`/sodax/transaction/sign`) is browser-side, so `submitTx` needs no Bound token on the BE.

### Execution order — cheapest and lowest-risk first

The table above is in discovery order. This is the order to actually work in: everything in
tiers 1–2 can land today without touching runtime code, and nothing in them can regress a
shipped path. F12 splits (doc half is free, the pin bump is blocked); F13 splits (PR body is
free, the log line is code).

| Order | Item | Cost | Risk | Notes |
|---|---|---|---|---|
| 1 | ✅ **F13a** — fix PR #1028 body | ~5 min | **none** (GitHub text) | **Done 2026-07-31.** Rewrote beyond the env rename: the "unset is valid" bullet (F4 made it required), the DTO-validator description (F1 moved it to `assertBoundAccessTokenForBitcoin`), the `boundConfig` log claim, and the stale "production credential not yet verified"; added the 502/401 error-mapping table |
| 2 | ✅ **F18** — fix the wrong sentence in PR #322's body | ~2 min | **none** (GitHub text) | **Done 2026-07-31.** Also refreshed: changeset now exists (the "no changeset yet" line was stale), test counts (1738 / 18), the changed-files table (docs, changeset, demo), signer scope, and the 2.1.0 release note |
| 3 | ✅ **F12a** — `rc.19` → `2.1.0` in this folder + both PR bodies | ~5 min | **none** (notes only) | **Done 2026-07-31.** Forward-looking mentions only; the historical trail in `process.md` / `outcome.md` keeps `rc.19` on purpose. Stale `SODAX_API_SECRET_*` mentions fixed the same way. Also corrected: the release cuts **8** packages, and `sdks-publish.yml` derives the dist-tag from the tag string — a hyphenless `@sdks@2.1.0` publishes to **`latest`**, not `rc` |
| 4 | ✅ **F11** — placeholder `BOUND_API_SECRET_*` in `test/vitest.setup.ts` | ~15 min | **very low** — test-only file, `??=` never overrides a real env | **Done 2026-07-31, uncommitted.** With the env explicitly unset: unit **337/337**, e2e **9 files / 256 tests all passing** (was 5 files failing at import). `biome check` + `tsc --noEmit` clean |
| 5 | ✅ **F14** — comments at the two `umsUrl` call sites | ~5 min | **none** (comments) | **Done 2026-07-31, uncommitted.** `@sodax/sdk` 1738/1738, `RadfiProvider.test.ts` 18/18, `checkTs` clean (needs `pnpm --filter @sodax/types build` first after a branch switch — a stale `types/dist` reports the signer types as missing), `biome lint` clean |
| 6 | **F13b** — masked RadFi summary in the startup log (`apiUrl`/`umsUrl` resolved, secrets as `[set]`) | ~20 min | **low** — one log line + a test asserting no secret material appears | Only after F13a, so body and code agree |
| 7 | **F17** — `docs/runbooks/radfi-auth-failure.md` | ~40 min | **none** technically, just writing time | Wants the three causes (wrong/rotated secret, host clock drift past the 60 s window, Bound-side change) |
| 8 | **F15** — `RadfiProvider` options bag | ~20 min | **low**, but **deadline-bound**: must land before 2.1.0 publishes, else changing it later is breaking | Keep `new RadfiProvider(config)` working; only the 2nd arg changes shape |
| 9 | **F12b** — bump the pin to the published 2.1.0, drop the `.local-sodax` link, refresh `pnpm-lock.yaml`, run the real suites | ~1 h | **medium** — first run against a real published artifact instead of a local tarball | **Blocked** on #322 merging + publishing |
| 10 | **F16** — require the Bound token per call (drop the `= this.radfi.accessToken` defaults) | ~half day | **highest** — changes public SDK behavior, breaks browser callers (dapp-kit / demo / frontend), needs a cross-repo call-site sweep and its own version decision | Separate PR, after everything above. Safe to defer: swaps-api is protected today by the 400 guard + `raw: true` |
