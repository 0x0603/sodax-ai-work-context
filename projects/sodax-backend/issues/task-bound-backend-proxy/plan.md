---
type: plan
repo: sodax-backend
github:
updated: 2026-07-31
---

# Plan

> **Revision 2 (2026-07-31, later).** Rewritten after a 13-agent design workflow (5 parallel
> surveys of both repos, 3 competing architectures, 3 judge lenses, 2 adversarial verifiers).
> Revision 1 was written from a single-pass reading and got three things wrong; they are listed
> under "Corrections to revision 1" at the bottom so the mistakes are not silently rewritten.
>
> Everything below carries `path:line` because most of it was re-verified against source, and
> several claims that *sounded* right did not survive that.

## Goal

SDK consumers complete the whole Bitcoin flow without any of them being domain-whitelisted by
Bound, with ONE implementation of the Bound protocol in the org and NO second code path in the
SDK.

## GATE A — this is not "tested and working" yet, and CI cannot build it

The premise that #831 is done and merely needs extending is **false as committed**:

- `apps/swaps-api/package.json:48` and `pnpm-lock.yaml` pin `@sodax/sdk` **2.0.0-rc.21**.
- The **published** rc.21 has no signer at all: `declare class RadfiProvider { constructor(config: RadfiConfig); }`
  (no options arg), `request()` merges only `Content-Type` + `options.headers`, and
  `SodaxOptionalConfig` has no `radfi` key. `grep -c radfiSigner` over rc.21's `dist/index.d.ts` = **0**.
- It compiles locally only because `node_modules` is dirty-linked to an unpublished tarball:
  `apps/swaps-api/node_modules/@sodax/sdk -> .pnpm/@sodax+sdk@file+.local-sodax+sodax-sdk-2.0.0-rc.17.tgz`.
- `Dockerfile:29` runs `pnpm install --frozen-lockfile`, which installs the real rc.21 — so
  `overrides.radfi = { signRequest }` fails to compile in CI/Docker.
- `apps/swaps-api/test/unit/sodax.provider.spec.ts:98-139` asserts `sodax.config.radfiSigner`,
  a property rc.21 does not have. The green suite is an artifact of the local tarball.

`RadfiSigner` / `RadfiOptions` exist on exactly one ref in sodax-sdks: `feat/radfi-backend-signer`.
`git grep signRequest development -- apps` in sodax-backend returns nothing.

**Therefore the first task is not the package.** It is: merge sodax-sdks #322, publish
`@sodax/sdk` + `@sodax/types`, bump `apps/swaps-api/package.json:48` + `pnpm-workspace.yaml:63-64`,
and delete the `.local-sodax` link so local runs stop reporting a false green. This matches
`gh-831/outcome.md` follow-up #1-2; the workflow just proved it with the published `.d.ts`.

## GATE B — probe Bound before designing around an assumption

Two open questions, both answerable today, both able to shrink the scope:

1. **Is the HMAC pair valid on `/auth/*`?** Today the backend signs exactly two paths —
   `GET /wallets/details` and `POST /sodax/transaction` (`apps/swaps-api/README.md:237`) — and the
   SDK's own comment says Bound "scopes the backend credential to the Sodax endpoints on `apiUrl`"
   (`RadfiProvider.ts:301-304`). This is the question the tech lead already asked in Discord.
2. **Is Bound's server-to-server 403 header-gated or IP-gated?** The repo documents the 403 and
   ships a harness for exactly this test: `sodax-sdks/apps/node/src/bitcoin-raw-intent-check.ts:92-96`
   ("Set `BOUND_ORIGIN` to test whether the 403 is purely header/origin-gated (disappears) vs an
   IP/fingerprint block a server can't fake (persists)"). Run it from a real deployment egress IP.

If it is IP-gated, Bound must allowlist our egress IPs — an external lead-time dependency that no
version of this plan currently accounts for.

Gate B can run in parallel with Gate A. Neither blocks writing the package (step 2), which is a
pure extraction.

## Approach — the decisions

### D1 — One implementation of the Bound protocol: the SDK's `RadfiProvider`

Do not write a second Bound HTTP client in the backend. `RadfiProvider` (666 lines) already
handles the Bound envelope, HTML gateway/WAF pages returned instead of JSON (`parseJsonBody`,
`:625-648` — this caused a real `INTENT_CREATION_FAILED "not valid JSON"` bug), BIP-322 vs ECDSA
by address type, and response polymorphism the proxy would otherwise have to reconstruct
(`data.tradingAddress ?? data.wallet.tradingAddress` at `:243`; `txId: string | {data:string}`
at `:562-564`).

The competing "domain service" design was scored 29-30/60 by all three judges precisely because
~300 of its ~900 LOC knowingly re-implement this, leaving two Bound clients to keep byte-compatible
forever.

The backend package is therefore **thin wiring**: signer, forwarder, controllers, guards, config —
and **zero `@sodax/*` dependencies**. The signer's context type is declared locally as
`{ method: string; path: string }`, structurally identical to `RadfiSigner`'s `RadfiSignContext`
(`packages/types/src/sodax-config/sodax-config.ts:76-80`), so the package never pins an SDK version.

### D2 — Repoint `apiUrl` AND `umsUrl`; the proxy is a path-compatible allowlist

`request()` (`RadfiProvider.ts:650-665`) is a single choke point doing pure `config.apiUrl + endpoint`
concatenation with no host-specific logic, and the only hardcoded Bound hosts in sdk/types/dapp-kit
are the two packaged defaults (`chains.ts:840,842`). So repointing config moves **every** call site,
including the ones no hook can see: `BitcoinSpokeService.getEffectiveWalletAddress -> getTradingWallet`
(`:119`), `deposit -> createWithdrawTransaction` (`:415`), `-> requestRadfiSignature` (`:433`).

Coverage is exhaustive **by construction**, not by enumeration. That is the decisive advantage over
any hook-level or semantic-API rewiring, which necessarily enumerates and therefore misses.

**Both URLs, not just `apiUrl`.** `getBalance` (`:310`) and `getExpiredUtxos` (`:431`) bypass
`request()` entirely and read `config.umsUrl` directly. An `apiUrl`-only repoint leaves the browser
calling `api.ums.bound.exchange` and still needing a Bound whitelist — the goal is not met.

Serve the proxy base **without a trailing slash**: the constructor mutates the config object in
place to strip one (`:147,:151`), and that object is the live packaged chain config.

Not a catch-all `app.all('/*')` — 11 declared routes over 9 distinct `apiUrl` paths plus 2 UMS,
so our Bound credential never becomes an open relay to arbitrary Bound endpoints.

### D3 — Inbound credential ships in the SAME PR as the controllers

Today the HMAC never leaves the backend, so no external client can spend our Bound quota. After the
proxy ships, they can. An Origin allow-list does **not** close that: `curl` sends no `Origin` and
passes, and swaps-api's CORS is `origin: '*'` (`main.ts:36-41`). The two UMS routes are the purest
case — unsigned upstream by design, so the SDK contributes zero protection there.

Ship all three, none is sufficient alone:

- **Partner key** (SHA-256 digest + `timingSafeEqual`, copying `shared/guards/bearer.guard.ts:23-42`;
  store digests, never raw keys) — for attribution, revocation and throttle keying. Be honest in the
  PR: it ships inside a public browser bundle, so it is *not* authentication.
- **Origin allow-list** — the browser threat, which a browser cannot forge.
- **Throttle keyed on partner identity**, not `X-Real-IP` alone — Bound's quota is per-partner, and
  `X-Real-IP` collapses under carrier NAT or is absent (`shared/guards/haproxy-throttler.guard.ts:12-17`).

Header precedence, both directions: in the SDK a signer's headers merge **last** (`:658-664`), so
anything the gateway adds must merge *before* caller headers or it could clobber the per-user
`Authorization`. At the proxy, invert it — our `x-api-signature` is applied last, and a
client-supplied `x-api-signature` is stripped, never forwarded.

Never put a credential in a URL path or query string: `shared/middleware/logging.middleware.ts:9-15`
(morgan) logs full request URLs unredacted into a host bind mount with 14-day retention.

### D4 — Fleet-wide rate limiting gates public exposure; it is not a follow-up

`ThrottlerModule.forRoot({ttl:60_000, limit:10})` is registered at `app.module.ts:49-51` with **no
`storage:` key**, and there is no `APP_GUARD` anywhere in `apps/swaps-api/src` (providers at `:96-104`
are `APP_INTERCEPTOR` only). Limits are per-route and per-process, so the fleet ceiling is
`limit × instance count` while Bound's quota is per-partner. The Redis connection sits eight lines
below at `:52-62`. Redis-backed `ThrottlerStorage` must land before the step that first routes the
proxy publicly.

### D5 — The proxy's own errors must be Bound-shaped

The app-global `AllExceptionsFilter` emits `{statusCode, message, error}`
(`packages/shared-utils/src/utils/all-exceptions.filter.ts:24-28`) — **no `code` field**. Since
`RadfiApiError` reads `body.code` (`RadfiProvider.ts:37-51`), every error the proxy generates itself
(403 origin, 429 throttle, 413 body limit, 502/504 upstream, 500) would arrive with
`code === undefined`, silently breaking `useRadfiAuth.ts:77` (branches on `'4008'`) and
`error-mapper.ts:57-66` (substring-matches `apiSignature` / `auth.`).

So: a proxy-scoped exception filter emitting `{code, message}` in our own documented namespace for
**every** status the proxy can generate — not only the empty-bearer 401.

Two caveats found in verification:

- `error-mapper.ts` never fires on proxy traffic at all: `radfiFailureKind` is gated on
  `e.name === 'RadfiApiError'`, which only exists inside swaps-api's own SDK call path. Only the
  dapp-kit half of that justification stands.
- On the two UMS routes the SDK throws a bare `Error` discarding status **and** body
  (`:315-317`, `:435-437`), so a 429 from our gateway is indistinguishable from Bound being down.
  Either leave those two un-throttled at v1, or document that client-side diagnosis is impossible
  there without an SDK change.

### D6 — Statelessness: the real leak is in `BitcoinSpokeService`, not `resolveAuth`

`RadfiConfig` now declares `accessToken` / `refreshToken` and the constructor seeds them
(`RadfiProvider.ts:143-144`, with an in-source comment saying it exists so a server-side caller can
inject a token). `BitcoinSpokeService.ts:392` and `:509` then default-read
`accessToken = this.radfi.accessToken`. One `Sodax` singleton serves every backend request, so
cross-tenant token bleed is **one config line away**.

Rules: never call `setRadfiAccessToken` in backend code, never set `radfi.accessToken` /
`refreshToken` in backend config, always pass the token per call. Add the comment next to
`sodax.provider.ts:47-48` and assert it in `sodax.provider.spec.ts`.

The 80% fix — deleting the two destructuring defaults at `BitcoinSpokeService.ts:392,:509` — is a
**separate, sequenced PR** (`gh-831` follow-up F16). Do not bundle it here.

### D7 — Do not try to move what cannot move

`/auth/authenticate` carries a payload signed by the user's Bitcoin wallet
(`authenticateWithWallet`, `:148-183`, BIP-322 or ECDSA by address type). The backend holds no user
key. Only the HTTP call is proxied. `Authorization: Bearer <user token>` and `x-api-signature` stay
two independent credentials; the proxy forwards the former untouched and adds the latter.

## Structure

### sodax-backend — `packages/bound-gateway`

Modelled on `packages/block-timestamps` (the newest and cleanest package template, #678).

```
packages/bound-gateway/
├── package.json          # @repo/bound-gateway, main dist/src/index.js, files:["dist"]
│                         # deps: @nestjs/common only. peer: @nestjs/core, @nestjs/throttler
│                         # NO @sodax/sdk, NO @sodax/types, NO mongoose
├── tsconfig.json         # extends ../../tsconfig.json; rootDir "./" (must match the dist/src main)
├── biome.json  vitest.config.ts
├── src/
│   ├── bound-signer.service.ts          # the one HMAC impl, moved from sodax.provider.ts:52-58
│   ├── bound-forwarder.service.ts       # the one fetch(); byte-preserving; AbortSignal.timeout
│   ├── bound-api-proxy.controller.ts    # 9 apiUrl routes
│   ├── bound-ums-proxy.controller.ts    # 2 umsUrl routes
│   ├── bound-partner-key.guard.ts
│   ├── bound-origin.guard.ts
│   ├── bound-throttler.guard.ts         # reuse haproxy-throttler.guard, do not re-derive it
│   ├── bound-exception.filter.ts        # D5: Bound-shaped {code,message} for our own statuses
│   ├── dto/bitcoin-bound-extras.dto.ts  # the ONE duplication that already exists — see below
│   ├── bound.config.ts                  # resolveBoundCredential(env) -> {ok} | {ok:false,missing[]}
│   └── bound-gateway.module.ts          # forRootAsync({ mountProxyRoutes })
└── test/
    ├── unit/…                           # *.test.ts in packages (apps use *.spec.ts / *.e2e-spec.ts)
    └── fixtures/bound-envelopes.ts      # standing contract-drift tripwire, see Verification
```

`mountProxyRoutes` is a **structural** flag, not a runtime one: a `DynamicModule`'s `controllers`
array is built synchronously when `forRootAsync()` is called, so the mount decision cannot come out
of the async factory. swaps-api passes `true`; bridge-api omits it (defaults `false`) and registers
zero controllers, zero guards, and no `ThrottlerModule` precondition.

**Three fixes the verifiers forced into this shape:**

1. **DI scope.** `sodaxProvider` is a provider of **`SwapsModule`** (`swaps.module.ts:32`), not of
   `AppModule`. A non-global `DynamicModule` registered in `AppModule` exports nothing to
   `SwapsModule`, so `@Inject(BoundSignerService)` inside `sodaxProvider` throws at bootstrap.
   Fix: mark the module `@Global()` (matching `IncidentManagerModule` and `BlockTimestampsModule`,
   both `@Global`), **or** export a plain `createBoundHmacSigner(cred)` factory with no DI at all.
   The plain factory is the smaller contract and is preferred unless something else needs injection.
2. **Upstream defaults.** `radfiConfig.apiUrl` / `.umsUrl` are optional and **absent in a normal
   deploy** — `buildRadfiConfig()` only emits them when the env vars are set
   (`configuration.ts:88-95`) and `.env-example:271-274` ships them commented. Typing them as
   required and sourcing them from `radfiConfig` makes the forwarder fetch `undefined/auth/authenticate`.
   The package must default to `https://api.bound.exchange/api` and `https://api.ums.bound.exchange/api`.
3. **No throw inside the package.** `buildRadfiConfig()` throws at **module-eval** time
   (`configuration.ts:82-87`) — which is why `apps/swaps-api/test/vitest.setup.ts` has to seed
   placeholder secrets for unrelated specs. The package returns a result object and leaves the
   fail-fast decision to each app, so bridge-api never inherits a boot dependency on Bound secrets
   for a capability it may never use.

**Precedent break, stated explicitly in the PR.** `rg "@Controller" packages/` returns **zero**
matches — there is no precedent for a controller in a shared package, and only one `fetch()` in all
of `packages/` (`shared-utils/src/utils/rqst.ts:25`). This is the load-bearing decision. The
alternative — each app owning its own controllers, per the actual convention — reproduces exactly
the copy-paste constraint (c) forbids. Cite `IncidentManagerModule` / `RuntimeFlagsModule` /
`BlockTimestampsModule` as the module-shaped-package precedent being followed, and survey
`docs/PATTERNS.md` in the design header (`AGENTS.md:188-191` makes an unjustified re-implementation
a P1 review finding; PR #452 -> #511 discarded ~150 LOC as the cautionary case).

### sodax-sdks — zero changes to `packages/sdk/src/**`

The switch is one config value per consumer:

```ts
new Sodax({ chains: { [ChainKeys.BITCOIN_MAINNET]: { radfi: {
  apiUrl: '<proxy>/api',
  umsUrl: '<proxy>/ums',
}}}})
```

No new SDK config field is needed — `apiUrl` and `umsUrl` are already on `RadfiConfig`
(`sodax-config.ts:41-47`). A `radfi.gateway = { baseUrl, headers? }` seam was proposed and is
well-designed, but its headline justification (that config-v2 could overwrite a gateway origin back
to Bound) is contradicted by the code: `ConfigService.ts:146-148` re-layers `this.userConfig` on top
of the fetched config precisely so "explicit user overrides must still win". Keep the seam as a
**phase-2 option** if a distinct proxy credential is ever wanted; it is not a v1 blocker.

### bridge-api

Reality check: `apps/bridge-api` has **zero tracked files** on `development`, `main`,
`origin/development` and `origin/main` — 76 files exist only on `feat/bridge-api`, pinned to
`@sodax/sdk` **rc.18**. So constraint (c) cannot be *demonstrated* today; the proof is structural
(2-line registration, no `apps/` import, no `@sodax/*` pin, `mountProxyRoutes` defaulting to false).

When it merges, its Bound integration is three edits: the `workspace:*` dep, the module
registration, and injecting the signer into its own `sodax.provider.ts` — which today builds
`overrides.chains` / `overrides.hub` and **never sets a `radfi` slice at all**. Note this is a
**bug fix, not a feature**: without a signer, its Bitcoin path 403s at Bound's gateway. Worth
confirming with the tech lead whether Bitcoin bridging is in bridge-api's scope, because its README
never mentions Bitcoin while its DTO already carries `bound.accessToken`.

**The one duplication that empirically exists** is `BitcoinBoundExtrasDto`, near-identical (class
body and decorators identical, JSDoc differs) in `apps/swaps-api/src/api/swaps/dto/swap-extras.dto.ts:85-94`
and `feat/bridge-api:apps/bridge-api/src/api/bridge/dto/create-bridge-intent.dto.ts:8-17`. That is
what constraint (a) is actually about, so the package ships it and the apps re-export — keeping the
emitted Swagger shape byte-identical, since `AGENTS.md:203-209` makes a DTO shape change breaking.

## Steps

0. **Gate A + Gate B, in parallel.** Gate A: merge sodax-sdks #322, publish, bump the pin, drop
   `.local-sodax`. Gate B: run the two Bound probes above. Neither blocks step 1.
1. **`packages/bound-gateway` with signer + config only, no controllers.** `sodax.provider.ts:52-58`
   drops its inline `createHmac` and uses the package. Pure extraction, behaviour-identical.
   Validates the risky infra assumptions in isolation: that a package with no Mongoose model builds
   under `pnpm --filter "./packages/*" run build` (`Dockerfile:29-30`), and that `main` / `rootDir`
   are paired correctly. **Proof is `sodax.provider.spec.ts:98-139`** (which asserts the signer) —
   *not* `radfi-config.spec.ts`, which only covers config validation and redaction.
2. **Add controllers, guards, exception filter and the DTO — mounted nowhere.** `mountProxyRoutes`
   stays `false` everywhere, so this ships as inert code reviewable as one unit. The partner-key
   guard ships **here**, with the controllers, never after.
3. **Redis-backed `ThrottlerStorage`** on the connection at `app.module.ts:52-62`. Gates step 5.
4. **Wire app config behind `RUN_BOUND_PROXY`, deployed OFF.** Mirror `RadfiConfigClass`
   (`config.class.ts:237-290`) including its `@ValidateIf` convention; add to `docker-compose.yml`
   and `.env-example`. Revert = flip the flag.
5. **Byte-equality gate in staging — three arms, not two.** See Verification.
6. **Fix the dead config in the sodax-sdks example apps first.** `radfiApiUrl` / `radfiUmsUrl`
   (`packages/types/src/common/common.ts:330-331`) are read by **zero runtime code**;
   `apps/demo/src/providers.tsx:36-41`, `apps/wallet-modal-example` and `apps/swap-api-example` all
   pass them. Anyone who "tests the proxy" via `RADFI_API_URL` in the demo gets a false green while
   still hitting Bound. Independently shippable bug fix; must land before any staging verification.
7. **Point `intents-whitelabel` at the proxy.** It already uses the nested shape
   (`src/lib/sodax-config.ts:24-28`), so this is two env vars — but they are `NEXT_PUBLIC_*`,
   inlined at build time, so **rollback is a rebuild+redeploy, not a toggle**. Note it also has a
   server-side `getSodax()` singleton (`src/lib/sodax.ts:23-26`, used at
   `src/app/api/money-market/route.ts:18`) that will reach the proxy from a datacenter with no
   `Origin` header — unmodelled traffic against the throttle bucket.
8. **Do not ask Bound to de-whitelist any dApp origin until the proxy has soaked.** The moment that
   request is made, rollback of step 7 silently stops working.
9. **(Optional, later.) Flip the packaged defaults** at `chains.ts:840,842` — see Risks; this is
   *not* a one-line change.
10. **(When `feat/bridge-api` merges.)** Adopt the package: dep, registration with
    `mountProxyRoutes` omitted, signer injected.

## Verification

- **Byte-equality gate with THREE arms.** The obvious two-arm design (direct-with-HMAC vs
  proxy-with-HMAC) cannot detect the failure it most needs to: the browser calls `/auth/*`
  **unsigned** today, so the real baseline is missing. Arms: (1) unsigned, direct to Bound, from a
  whitelisted browser origin — the true current state; (2) signed, direct, server-to-server;
  (3) through the proxy. Arms 1 vs 3 is the comparison that proves the browser contract is unchanged.
- Assert on **2xx bodies, not only errors**: `authenticate()` reads `body.data?.accessToken ?? ''`
  and only throws on `!res.ok` (`:229-241`), so a re-wrapped 200 makes sign-in "succeed" with empty
  tokens and no error anywhere.
- Pin the four shapes the SDK branches on: 2xx carrying no `data` (guarded at `:280,296,372,407,467,497,529,595`),
  `data.tradingAddress ?? data.wallet.tradingAddress` (`:243`), `txId: string | {data:string}`
  (`:562-564`), and Bound's `code`/`message` verbatim. Commit these as
  `test/fixtures/bound-envelopes.ts` so the one-shot staging gate becomes a permanent regression net.
- **App-level e2e**, not package-only: `apps/swaps-api/test/e2e/bound-proxy.controller.e2e-spec.ts`,
  booting through the app's real global `ValidationPipe` + `AllExceptionsFilter` + CORS. The D5
  error-envelope defect lives in the app's global filter and package tests cannot see it.
- A test asserting `mountProxyRoutes: false` registers zero controllers and zero guards — that is
  the entire bridge-api contract and is otherwise unprovable today.
- Two concurrent users against one instance: neither sees the other's trading address or balance (D6).
- Logs contain no `Authorization`, no access/refresh token, no HMAC digest. Note `sanitizeForLog` is
  **not** a Winston formatter (`packages/shared-logger/src/index.ts:20-48`) — it runs only via
  `getRequestContext()`, which never captures headers. The forwarder must log a fixed field set
  (`{boundPath, method, status, durationMs}`) enforced by a helper, not by convention.
- Measure a real `/sodax/transaction/sign` PSBT against Express's **100KB** JSON default — there is
  no `bodyParser` override anywhere in `apps/swaps-api/src`.

## Risks

- **Gate A is a hard blocker** and was previously invisible because the local tarball made
  everything green. Any plan that starts with "extend #831" is starting one merge and one publish
  too late.
- **Gate B may shrink the scope.** If Bound's HMAC is not valid on `/auth/*`, those routes cannot be
  proxied and domain whitelisting stays for sign-in. The architecture is unchanged either way — this
  is a scope risk, not a design risk. If the 403 is IP-gated rather than header-gated, we need Bound
  to allowlist our egress IPs, with external lead time.
- **Step 9 is not "one line + a patch release".** `CONFIG_VERSION` (`packages/types/src/index.ts:23`)
  must increment by exactly 1, and the changesets `fixed` group versions **8 `@sodax/*` packages in
  lockstep**. It also updates committed host fixtures at `RadfiProvider.test.ts:10,12`. Worse: because
  `RADFI_API_URL` is unset by default (`configuration.ts:89-92`, `docker-compose.yml:223-224`),
  flipping the packaged default makes **swaps-api's own Sodax call the proxy — i.e. itself**, through
  HAProxy. Step 9 must be paired with `RADFI_API_URL` / `RADFI_UMS_URL` pinned to Bound on every
  backend deployment, or dropped.
- **Consumers pin exact SDK versions** (`intents-whitelabel` is on rc.12, swaps-api rc.21,
  bridge-api rc.18), so published builds keep Bound compiled in. The whitelist can never be retired
  by a default flip alone.
- **The public base path is not derivable from these repos.** `main.ts:61` advertises
  `https://api.sodax.com/v1/be`; `api/admin/swaps-admin.controller.ts:18` says HAProxy exposes only
  `/v1/swaps/*`; `@sodax/swaps-api` builds `<baseUrl>/swaps/...`. There is no HAProxy config in any
  repo here. The exact string baked into every dApp must be confirmed with ops before step 7.
  Mounting under `swaps/bound` needs no ops ticket but is semantically wrong (these are chain-level
  auth/signing endpoints used by bridge, money-market and leverage-yield too); record the intended
  move to `/v1/bound` explicitly so the SDK config value is not treated as permanent.
- **CORS preflight.** `origin: '*'` (`main.ts:35-40`) means the cors middleware answers `OPTIONS 204`
  for any origin *before* any guard runs, so a blocked origin gets a green preflight and fails only
  on the real request. Good news: `methods: 'GET,HEAD,POST'` already covers all 11 routes and
  `allowedHeaders` is unset, so no `main.ts` edit is needed. But `maxAge` is unset, so every SDK call
  now pays a preflight RTT **on top of** the new proxy hop — unbudgeted latency on user-blocking auth
  and signing paths.
- **Bound loses its per-user IP signal**, seeing N datacenter IPs instead. Flag this to Bound before
  cutover, not after.
- **Staging/signet Bound hosts are unmodelled**: `sodax-sdks/apps/node/src/bitcoin-radfi.ts:18-23`
  uses `signet.api.bound.exchange` / `staging.api.bound.exchange`. The gateway is single-upstream per
  deployment and its route table is written against production paths only.
- **Observability is thin.** No outbound-dependency metric exists anywhere in the repo, so Bound-side
  latency and 429s are invisible unless the package instruments them. Alerts are noise-gated at 45
  minutes per fingerprint (`monitoring.service.ts:46`), so a sustained Bound outage pages once.
- **Credential rotation.** The secret pair was pasted in plaintext into Discord (test credentials,
  but the habit is the risk). Rotate before production; keep it in the secret manager only.

## Corrections to revision 1

1. **UMS was wrongly deprioritised.** Revision 1 put the two UMS endpoints at P2, "proxy only if
   Bound whitelists UMS too". Wrong: `getBalance` (`:310`) and `getExpiredUtxos` (`:431`) bypass
   `request()` and read `config.umsUrl` directly, so without proxying them the browser still calls
   `api.ums.bound.exchange` and still needs a whitelist. They are required for the goal.
2. **`resolveAuth()` does not fall back to `this.accessToken`.** It falls back to
   `this.config.apiKey` (`:610-611`), and `this.accessToken` is never *read* inside `RadfiProvider`
   at all — only written (`:143,:207,:213`). The multi-tenant leak vector is real but lives in
   `BitcoinSpokeService.ts:392,:509` plus the `RadfiConfig.accessToken` constructor seed
   (`:143-144`). D6 is rewritten accordingly, and it moves where the fix goes.
3. **Endpoint count.** Not "13 apiUrl + 2 UMS": 11 call sites over **9 distinct `apiUrl` paths**,
   plus 2 UMS = 13 HTTP call sites total. The file is 666 lines and `request()` is at `:650`.
4. Revision 1 also suggested the controller could live in the shared package as a mild convention
   deviation. It is stronger than that: there is **zero** precedent, so it must be argued explicitly
   rather than mentioned in passing.
