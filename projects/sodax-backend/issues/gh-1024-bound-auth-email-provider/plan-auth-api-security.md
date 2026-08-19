---
type: plan
repo: sodax-backend
github: 1024
updated: 2026-08-18
parent: plan.md
related: [plan-engineering-standards.md, plan-auth-api-scaffold.md]
tags: [auth, security, rate-limiting, sodax-backend, auth-api]
---

# Security & anti-abuse hardening — `sodax-backend/apps/auth-api`

Answers "rate limiting / not hackable / no data leaks" for the new app.
Greenfield — nothing exists yet. Every item says exactly what to reuse from a
sibling app vs. what's genuinely new work. Facts below marked **[verified
from installed source]** were confirmed this session by reading the actual
shipped code (`better-auth@1.4.18`'s own `dist/*` on disk, and the sibling
apps' real guard/config files) — not paraphrased from an earlier pass. Exact
copy-paste templates live in [[plan-auth-api-scaffold]]; S1–S9 cited below
live in [[plan-engineering-standards]].

## Rate limiting — three real gaps, plus one built-in rule that is weaker than it looks

1. **NestJS IP-level throttle — reuse `HaproxyThrottlerGuard` verbatim.**
   **[verified]** Identical 25-line file in `swaps-api` and `bridge-api`; cite
   the merged copy, `apps/swaps-api/src/shared/guards/haproxy-throttler.guard.ts`
   (on `origin/development` — `apps/bridge-api` exists only on the unmerged
   `origin/feat/bridge-api-bound-auth-usdt-approve`). It reads `X-Real-IP`
   (HAProxy-set, sourced from Cloudflare's `CF-Connecting-IP`).
   `sponsoring-api`'s variant
   (`apps/sponsoring-api/src/shared/guards/haproxy-throttler.guard.ts`, also on
   `development`) instead delegates to a shared `resolveClientIp(req)` helper —
   consider that shape for `auth-api` too, so the rate-limit tracker and any
   future IP-based guard can't disagree about who's calling. **[verified]**
   Registration in all three sibling apps is **per-route
   `@UseGuards(HaproxyThrottlerGuard)`, never `APP_GUARD`** (zero `APP_GUARD`
   usage found anywhere in `bridge-api`/`swaps-api`/`sponsoring-api`) — but only
   two of the three add `@Throttle(...)`. `sponsoring-api` applies the guard
   alone (`api/sponsorship/sponsorship.controller.ts:60,92`
   `@UseGuards(SponsorApiKeyGuard, HaproxyThrottlerGuard)`) and inherits the
   module default from `app.module.ts:20`
   `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 10 }] })`, so
   the `@Throttle` override is optional. `sponsoring-api` is also the closest
   precedent for what `auth-api` actually needs: it layers a durable per-key
   quota underneath, and its guard JSDoc calls the IP throttle "secondary to the
   durable per-key quotas" — the same relationship `auth-api`'s account-keyed
   counter (Gap B) has to this IP layer. `auth-api` must apply the guard
   explicitly to every sensitive route (registration, OTP-send,
   login/passkey-ceremony-start, settings fetch), not rely on a single global
   binding. Baseline in every sibling app is `{ttl: 60_000, limit: 10}` — tune
   tighter per route for `auth-api`, this baseline is generic-endpoint sizing.

2. **Better Auth's own built-in `rateLimit` option — defaults confirmed from
   installed source**, not the plugin docs: `better-auth/dist/context/create-context.mjs:143-148`:
   ```js
   rateLimit: {
     ...options.rateLimit,
     enabled: options.rateLimit?.enabled ?? isProduction,
     window: options.rateLimit?.window || 10,
     max: options.rateLimit?.max || 100,
     storage: options.rateLimit?.storage || (options.secondaryStorage ? "secondary-storage" : "memory")
   }
   ```
   `stateful-api/src/auth/auth.config.ts`'s full `options` object — verified
   line-by-line — has **no `rateLimit` key at all**, so it runs on these
   defaults today (disabled outside `NODE_ENV=production`, 10s/100req window,
   in-memory unless `secondaryStorage` is set). `auth-api` must set this
   explicitly and not inherit silence-by-omission the way `stateful-api` does.

   **The built-in special rule exists, but it is the WEAKEST path-specific
   layer, not an override** — the earlier draft had this backwards.
   `better-auth/dist/api/rate-limiter/index.mjs:163-171`'s
   `getDefaultSpecialRules()` does give paths starting with `/sign-in`,
   `/sign-up`, `/change-password`, `/change-email` a `window: 10, max: 3`. But
   `onRequestRateLimit` (same file, :104-139) resolves the effective limit
   **last-writer-wins**, in this order:

   1. global default (`ctx.rateLimit.window/max`, :104-105)
   2. built-in special rule (:109-113)
   3. **any plugin's own `rateLimit` array** (:114-121) — assigned
      unconditionally, no stricter-wins comparison, `break` on first match
   4. **`rateLimit.customRules`** (:122-139) — and `if (resolved === false)
      return;` (:137) disables limiting for that path outright

   So a plugin rule matching a `/sign-in*` path silently **replaces** 10/3, and
   can loosen it. Proof in-tree: `dist/plugins/magic-link/index.mjs:154-160`
   matches `path.startsWith('/sign-in/magic-link')` and sets
   `window: opts.rateLimit?.window || 60, max: opts.rateLimit?.max || 5` —
   effective max becomes 5, read from the plugin's own config.
   `dist/plugins/email-otp/index.mjs:94-100` does the same for
   `/sign-in/email-otp` (window 60, max 3). That also **confirms** the
   `email-otp` per-path rules the earlier draft flagged as unverified: they are
   real — `/email-otp/send-verification-otp`, `/email-otp/check-verification-otp`,
   `/email-otp/verify-email`, `/sign-in/email-otp`, plus
   `/email-otp/request-password-reset` and `/email-otp/reset-password`, all
   window 60 / max 3, at `dist/plugins/email-otp/index.mjs:72-…`.

   Two scoping notes:
   - The 10/3 rule **does** hold for `emailAndPassword`, but for a different
     reason than the earlier draft gave: `emailAndPassword` is a top-level core
     option, not an entry in `ctx.options.plugins`, so it ships no `rateLimit`
     array and nothing displaces 10/3 on `/sign-in/email` and `/sign-up/email`.
   - The `passkey` half is **UNVERIFIED and must not be assumed**.
     `@better-auth/passkey` is installed nowhere in this workspace, so nobody
     has read whether it exports a `rateLimit` array matching `/sign-in/passkey`.
     If it does, that path gets the plugin's numbers, not 10/3. Read the
     plugin's own source the moment it is installed.

   Planning consequence — the risk is the opposite of what the earlier draft
   warned about. Do **not** treat 10/3 as a guaranteed floor on `auth-api`'s
   login paths; the hazard is a plugin quietly loosening it, not a duplicated
   override. Pin the limits `auth-api` actually wants via `rateLimit.customRules`
   (the last layer, which beats both the special rule and any plugin), and keep
   the `HaproxyThrottlerGuard` window (item 1) consistent with what is set there
   rather than with an assumed 10/3.

3. **Gap A — storage is per-process by default.** `storage: 'memory'` unless
   `secondaryStorage` is set (confirmed above). With multiple `auth-api`
   replicas, an attacker load-balanced across pods gets a fresh bucket every
   request. Must set `secondaryStorage` to the same Redis/`@keyv/redis` store
   `bridge-api`/`swaps-api` already use (exact versions, wiring, and the
   adapter `auth-api` needs to bridge Better Auth's `secondaryStorage`
   interface to it: see [[plan-auth-api-scaffold]] §5).

4. **Gap B — key scope is `IP + path`, not account.** **[verified]**
   `dist/api/rate-limiter/index.mjs:106-108`, `createRateLimitKey(ip, path)`.
   Protects one IP hammering one endpoint; does **not** protect against
   distributed credential stuffing or IP-rotated attacks against one victim
   account. New work, no existing precedent anywhere in this codebase:
   account-keyed failed-attempt counter with backoff/lockout, stored in
   `wauth_login_attempts`.

5. **Gap C — the trusted IP header is spoofable by default, and this feeds
   more than logging.** **[verified]** `better-auth/dist/utils/get-request-ip.mjs`,
   full function:
   ```js
   function getIp(req, options) {
     if (options.advanced?.ipAddress?.disableIpTracking) return null;
     const headers = "headers" in req ? req.headers : req;
     const ipHeaders = options.advanced?.ipAddress?.ipAddressHeaders || ["x-forwarded-for"];
     for (const key of ipHeaders) {
       const value = "get" in headers ? headers.get(key) : headers[key];
       if (typeof value === "string") {
         const ip = value.split(",")[0].trim();
         if (isValidIP(ip)) return normalizeIP(ip, { ipv6Subnet: options.advanced?.ipAddress?.ipv6Subnet });
       }
     }
     if (isTest() || isDevelopment()) return LOCALHOST_IP;
     return null;
   }
   ```
   Default header list is `["x-forwarded-for"]` **only** (not a multi-header
   fallback list — that's just JSDoc examples, not the runtime default), and
   it trusts the **first comma-separated value with zero proxy-chain
   validation**. This function feeds both `onRequestRateLimit` and session/IP
   tracking — so an unconfigured or misconfigured reverse proxy makes IP
   spoofing defeat rate limiting entirely, not just pollute logs. Must set
   `advanced.ipAddress.ipAddressHeaders: ['x-real-ip']` explicitly in
   `buildAuth()` to match this org's actual HAProxy setup (confirmed: HAProxy
   sets `X-Real-IP` from Cloudflare's `CF-Connecting-IP`, per
   `HaproxyThrottlerGuard`'s own doc comment) — left at the library default,
   Better Auth keys on the wrong header entirely, a real and easy-to-miss bug.

6. Open decision (unchanged): bot-check (hCaptcha/Turnstile) on
   registration/OTP-send — per-IP/per-path limiting alone still allows
   OTP-bombing a victim's inbox from many IPs, and Better Auth's own
   `/sign-up`-path special rule (item 2) doesn't cover a distributed attempt
   either, since it's still keyed per-IP.

## Don't-hack-me checklist

- **Account enumeration**: registration/login error responses must not reveal
  "email exists" vs. "wrong credential" — verify whichever Better Auth
  plugins ship (`emailAndPassword`, and `@better-auth/passkey` once it's
  actually installed and its source read) already normalize this before
  assuming it; wrap controller responses if not.
- **CORS — three real sibling patterns exist, and none of them is credentialed.
  Design from `auth-api`'s trust model, don't copy the nearest file.**
  **[verified, all three]**
  - `bridge-api`/`swaps-api`: `cors: {origin: '*', methods: 'GET,HEAD,POST', ...}`
    passed directly to `NestFactory.create(...)`, explicitly commented as
    safe *because* these APIs are bearer/raw-tx based and set no cookies.
  - `sponsoring-api`: `app.enableCors(buildSponsoringCorsOptions(allowlist))`
    — a real allowlist function, plus `exposedHeaders` for rate-limit
    response headers (`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
    `X-RateLimit-Reset`) — worth copying the exposed-headers idea regardless
    of which CORS shape `auth-api` ends up with, since a public login surface
    benefits from telling well-behaved clients how hard they can retry.
  - `stateful-api`: `app.enableCors(...)` with an origin callback that
    **hardcodes three inline regexes** (`main.ts:62-79` —
    `/^https?:\/\/localhost:\d+$/`, `/^https?:\/\/([a-z0-9-]+\.)*sodax\.com$/i`,
    `/^https?:\/\/sodax-[^.]+\.vercel\.app$/`), allows a request with no
    `Origin`, rejects a non-match with `HttpException(FORBIDDEN)`, and sets
    **no `credentials` key at all**. An earlier pass got the origin source
    backwards and needlessly doubted the credentials reading; both, plainly:
    - It is **not** sourced from `trustedOrigins`. That is a separate
      mechanism, consumed at exactly one place in the repo —
      `auth/auth.config.ts:40`, feeding Better Auth's own Origin/CSRF check.
      `configuration.ts:57` says so verbatim: "trustedOrigins feeds Better
      Auth's Origin/CSRF check (NOT CORS — the same-origin portal needs none)".
      Its *content* was described correctly (localhost only outside prod, plus
      comma-split `PORTAL_TRUSTED_ORIGINS`, deduped via `Set`,
      `configuration.ts:62-71`); only the attribution to CORS was false.
    - "Non-credentialed" was **correct** — treat it as verified, not suspect.
      `main.ts:55-56` documents it as deliberate ("no session cookie ever
      crosses this boundary"), and the key has never existed in the file's git
      history. The portal's cookie-bearing traffic is **same-origin** (the Next
      app proxies `/portal/api/*` into the service), so it never triggers CORS;
      the only cross-origin traffic is public, cookieless register/partner
      reads. No sodax-backend service uses credentialed CORS today
      (`apps/api/src/main.ts:31` `credentials: false`;
      `sponsoring-api/src/shared/cors.ts:36` "stays false (it is never set)").

    **So there is no sibling to copy, and `auth-api`'s CORS is an architectural
    decision, not a paste.** Branch it on deployment topology:
    - **Cross-origin login modal** → `credentials: true` **plus an
      exact-string origin allowlist**. Never a wildcard (the browser rejects
      `*` with credentials anyway) and never a reflected or broad regex —
      credentialed CORS over a permissive origin match *is* the CSRF/
      session-theft hazard. `stateful-api`'s three regexes are sized for a
      public cookieless surface; do not port them onto a credentialed one.
    - **Same-origin behind a proxy**, like the portal → stay non-credentialed,
      exactly as `stateful-api` does.

    The one config-driven allowlist precedent in the repo is `sponsoring-api`'s
    `shared/origin-allowlist.ts` (`main.ts:38` builds it via
    `unionOriginAllowlists(...browserOriginAllowlists())`, passed to
    `configureSponsoringApp(app, corsAllowlist)` at `main.ts:53`): every
    pattern compiles to one anchored, case-insensitive RegExp so the CORS layer
    and `SponsorApiKeyGuard` cannot disagree, exposed as
    `toCorsOrigin(): '*' | RegExp[]`, with **empty patterns meaning
    UNRESTRICTED** — a default `auth-api` must not inherit silently.

    Independently of the CORS shape chosen: if `auth-api` uses Better Auth it
    still needs its **own `trustedOrigins`** set for the Origin/CSRF check —
    a distinct knob from CORS, and the thing `stateful-api`'s
    `PORTAL_TRUSTED_ORIGINS` pattern is genuinely a precedent for. Read item 11
    (CSRF) in that light.
- **Cookies**: reuse `stateful-api`'s exact `advanced: {cookiePrefix,
  useSecureCookies: isProd, crossSubDomainCookies}` shape (shown in
  [[plan-auth-api-scaffold]] §1), scoped to `auth-api`'s own domain;
  reconsider the 7-day session `expiresIn` deliberately for a public
  wallet-login surface rather than copying it — `stateful-api` is an
  internal partner portal with a different risk profile.
- **Headers**: reuse `bridge-api`'s `helmet()` call shape but **not** its
  `contentSecurityPolicy: false` — verified that's only there to keep Swagger
  UI usable on a machine-to-machine API; `auth-api` serves a real login UI
  (the SDK's `SodaxAuthModal`) and should keep CSP enabled, tuned to that
  modal's actual origins.
- **CSRF**: verify Better Auth's built-in same-site/CSRF posture (its cookie
  defaults, whatever they turn out to be once `@better-auth/passkey` is
  actually installed and readable) before adding a redundant NestJS-level
  guard — don't build a second layer speculatively.
- **WebAuthn replay**: login-ceremony challenges must be server-issued,
  single-use, short-TTL (standard WebAuthn, presumably handled by
  `@better-auth/passkey` — **unverified this session**, see the callout
  below) — explicitly distinct from, and must never share code with, the
  registration-time *local* re-verification ceremony (Bound-fix B, in
  [[plan-sdk-integration]]), which has the opposite trust model (no server
  challenge at all).

## `@better-auth/passkey` — verification gap, stated plainly

**[verified]** `better-auth@1.4.18` itself is installed
(`sodax-backend/node_modules/.pnpm/better-auth@1.4.18.../node_modules/better-auth`),
confirmed by reading its actual `dist/*` files above. **`@better-auth/passkey`
is not installed anywhere in either `sodax-backend` or `sodax-sdks`** — no
directory, no pnpm store entry, no `package.json` reference. Everything this
plan says about its PRF-extension passthrough API (`signIn.passkey({
extensions: { prf: {...} }, returnWebAuthnResponse: true })`, `result.webauthn.clientExtensionResults`)
traces back to the **original, prior-session** research pass and has not been
independently re-verified against real installed source or the package's own
docs this session (no web-fetch tool was available to the subagent that
looked for it). Before Phase 5/6 implementation starts: either install
`@better-auth/passkey` in a scratch branch and read its actual `.d.ts`, or do
a dedicated docs-verification pass — don't build the registration flow
against an unconfirmed API surface.

## Data-leak surface inside the blind-custodian model (opaque ≠ harmless)

- `wauth_keystore`'s blob + `argon2Params` + `aaguid` are still PII-adjacent —
  a dumped collection can't decrypt funds but can enumerate accounts,
  correlate by device, and inform an offline password-guessing budget. Same
  DB-access least-privilege review as any PII table.
- Define a retention/deletion policy for `wauth_login_attempts` and any IP
  logging up front — don't let it become an unbounded PII log.
- No existing **per-user** security-event stream — but the reason to build one
  is a design tradeoff, not a missing capability. `@repo/incident-manager` is
  **not** quarantine-specific: it is a generic operator-facing incident
  framework (`raise({ flow, code, reason, actor, ... })` over any
  `IncidentFlow`, with an ALERT_ONLY category giving debounced raise, one-time
  boot reconcile and auto-resolve-on-recovery via
  `AlertOnlyRecoveryReconciler`, plus playbooks and a cross-flow
  `IncidentReNotifierTask` re-pager). It is already used well outside on-chain
  intents — S3 backup freshness (`BACKUP_STALE`), oracle feed outage
  (`ORACLE_FEED_STALE`), untracked oracle symbols, swap-submit give-ups
  (`SWAP_SUBMIT_GIVE_UP`), mm-liquidation give-ups (`MM_LIQUIDATION_GIVE_UP`);
  `QuarantineService` is one service inside the package, not its scope. The
  real objection is that it is an **operator incident store whose raises page
  Discord via monitoring-service**, so per-user auth events would page
  operators per event and drown real incidents. Route routine auth telemetry to
  a log/metrics sink instead, and pick that sink from sodax-backend's own
  stack — Winston via `@repo/shared-logger`, plus the Prometheus
  middleware/controller the sibling APIs ship. **Not** `createDatadogLogger`:
  that lives in a different repo's browser demo app
  (`sodax-sdks/apps/demo/src/lib/loggers/datadogLogger.ts`, a plain HTTP-intake
  shim, one JSON POST per log line) and Datadog has **zero** occurrences
  anywhere in sodax-backend. `@repo/incident-manager` remains the right home
  for genuinely operator-actionable auth incidents — a fleet-wide
  credential-stuffing surge, say — which is a deliberate, separate decision
  from per-user event logging.
- Supply chain: `@better-auth/passkey`, the argon2id WASM lib, and any new
  WebAuthn helper are new, security-critical, unproven-in-this-codebase
  dependencies — pin exact versions for these specifically, `pnpm audit`
  before first production use.
- **Unrecoverable-account tradeoff — communicate, don't "fix" later.** Losing
  both unlock methods (passkey device gone AND password forgotten) means no
  support-team recovery path exists, by design (that is what "server can
  never decrypt" means). Must be a named line item in `auth-api`'s launch
  readiness checklist, surfaced to support/product before launch — not
  discovered live on the first real support ticket.

## Open decisions 10–12 (continues the shared sequence; see plan.md for the full index)

10. Bot-check (hCaptcha/Turnstile) on registration/OTP-send. Recommended
    default: add it — per-IP/per-path rate limiting alone still allows
    OTP-bombing a victim across many IPs, and Better Auth's own path-specific
    rule (confirmed above) is still keyed per-IP.
11. CSRF layer for `auth-api`'s cookie-based endpoints. Recommended default:
    verify Better Auth's built-in same-site/CSRF posture first (pending the
    `@better-auth/passkey` verification gap above); don't add a redundant
    second layer without checking what's already there.
12. ~~Confirm `stateful-api`'s CORS `credentials` setting~~ — **SETTLED**.
    `main.ts:62-79` sets no `credentials` key, deliberately (`main.ts:55-56`),
    and its origin allowlist is three hardcoded regexes, not `trustedOrigins`.
    There is nothing to copy: `auth-api`'s CORS now branches on deployment
    topology (cross-origin credentialed login modal → `credentials: true` +
    exact-string allowlist; same-origin proxy → non-credentialed), per the CORS
    bullet in the Don't-hack-me checklist. What **does** remain open is the
    topology itself — whether the SDK login modal is served cross-origin or
    proxied same-origin — and it is the input this CORS branch is waiting on.

    **Corrected 2026-08-19: this is not "a product/deployment decision, not a
    source question", which is how this bullet previously filed it.** It is the
    **key-custody boundary**, and it is the most consequential decision in the
    project. Because the keystore KEK is HKDF over the WebAuthn PRF output, and
    passkeys are RP-ID scoped and browser-enforced, the topology and the RP ID
    are the same decision: `rp.id = sodax.com` means the unlock ceremony can only
    ever execute in a `*.sodax.com` context (a wallet-controlled signer origin),
    while an integrator-domain RP ID means per-dapp wallets. There is no third
    setting, and `plan.md` already lists the RP ID as irreversible — changing it
    invalidates every credential. Decide both together, before the first passkey
    exists. Full analysis and the proposed decision:
    [[0002-key-custody-boundary-for-third-party-dapps]].
