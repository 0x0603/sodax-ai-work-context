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

## Rate limiting — three real gaps, plus one newly-confirmed built-in rule to not duplicate

1. **NestJS IP-level throttle — reuse `HaproxyThrottlerGuard` verbatim.**
   **[verified]** Identical 25-line file in `bridge-api` and `swaps-api`
   (`apps/bridge-api/src/shared/guards/haproxy-throttler.guard.ts`), reads
   `X-Real-IP` (HAProxy-set, sourced from Cloudflare's `CF-Connecting-IP`).
   `sponsoring-api`'s variant instead delegates to a shared
   `resolveClientIp(req)` helper — consider that shape for `auth-api` too, so
   the rate-limit tracker and any future IP-based guard can't disagree about
   who's calling. **[verified]** Registration in all three sibling apps is
   **per-route `@UseGuards(HaproxyThrottlerGuard)` + `@Throttle(...)`, never
   `APP_GUARD`** (zero `APP_GUARD` usage found anywhere in `bridge-api`/
   `swaps-api`/`sponsoring-api`) — `auth-api` must apply it explicitly to
   every sensitive route (registration, OTP-send, login/passkey-ceremony-start,
   settings fetch), not rely on a single global binding. Baseline in every
   sibling app is `{ttl: 60_000, limit: 10}` — tune tighter per route for
   `auth-api`, this baseline is generic-endpoint sizing.

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

   **New finding this session, not in the earlier draft**: Better Auth's core
   rate limiter has a **built-in stricter override for specific paths**
   (`better-auth/dist/api/rate-limiter/index.mjs`, `getDefaultSpecialRules()`):
   paths starting with `/sign-in`, `/sign-up`, `/change-password`,
   `/change-email` automatically get `window: 10, max: 3`, overriding the
   global default — regardless of what `emailAndPassword`/`passkey` plugin
   config says. Don't duplicate this with a second, possibly looser,
   NestJS-level throttle on those exact paths; do make sure the
   `HaproxyThrottlerGuard` layer (item 1) and this built-in layer aren't
   fighting each other with inconsistent windows. (The `email-otp` plugin's
   own per-path rules for `send-verification-otp`/`check-verification-otp`/
   `verify-email`/`sign-in/email-otp`, reported in an earlier pass, were not
   independently re-verified this session — treat as plausible-but-unconfirmed
   until read directly from the plugin's own source or `.d.ts`.)

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
- **CORS — three real sibling patterns exist, pick the one that matches
  `auth-api`'s trust model, not the nearest file.** **[verified, all three]**
  - `bridge-api`/`swaps-api`: `cors: {origin: '*', methods: 'GET,HEAD,POST', ...}`
    passed directly to `NestFactory.create(...)`, explicitly commented as
    safe *because* these APIs are bearer/raw-tx based and set no cookies.
  - `sponsoring-api`: `app.enableCors(buildSponsoringCorsOptions(allowlist))`
    — a real allowlist function, plus `exposedHeaders` for rate-limit
    response headers (`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
    `X-RateLimit-Reset`) — worth copying the exposed-headers idea regardless
    of which CORS shape `auth-api` ends up with, since a public login surface
    benefits from telling well-behaved clients how hard they can retry.
  - `stateful-api`: `app.enableCors(...)` with an origin callback sourced
    from `trustedOrigins` (`configuration.ts:55-63` — localhost origins
    outside prod, plus comma-split `PORTAL_TRUSTED_ORIGINS` env var, deduped).
    **`auth-api` must follow this pattern**, since it is cookie/session-based
    like `stateful-api`, not bearer-token based like `bridge-api`. Copying
    `bridge-api`'s wildcard here would be wildcard-origin + credentialed
    cookies — a real CSRF/session-theft misconfiguration, not a style choice.
    **Caveat**: this session's read of `stateful-api/src/main.ts`'s exact
    CORS block was a paraphrase ("regex-origin callback, non-credentialed"),
    not a verbatim quote — read `main.ts:62-79` directly before finalizing
    `auth-api`'s CORS options object, especially to confirm whether
    `credentials: true` is actually set (it should be, for a cookie-based
    flow, and the "non-credentialed" description is worth double-checking
    rather than trusting as-is).
- **Cookies**: reuse `stateful-api`'s exact `advanced: {cookiePrefix,
  useSecureCookies: isProd, crossSubDomainCookies}` shape (verbatim in
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
- No existing generic security-event-alerting module found (`@repo/incident-manager`
  is confirmed on-chain-intent-quarantine specific, not reusable here) —
  route failed-login/new-device/passkey-added events through the org's actual
  observability tool (`createDatadogLogger`, confirmed used in
  `apps/demo/src/lib/loggers/datadogLogger`). New work, no shortcut.
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

## Two more open decisions (continues the numbering from plan-sdk-integration.md's open questions — items 10 and 11)

10. Bot-check (hCaptcha/Turnstile) on registration/OTP-send. Recommended
    default: add it — per-IP/per-path rate limiting alone still allows
    OTP-bombing a victim across many IPs, and Better Auth's own path-specific
    rule (confirmed above) is still keyed per-IP.
11. CSRF layer for `auth-api`'s cookie-based endpoints. Recommended default:
    verify Better Auth's built-in same-site/CSRF posture first (pending the
    `@better-auth/passkey` verification gap above); don't add a redundant
    second layer without checking what's already there.
12. **New this pass**: confirm `stateful-api`'s CORS `credentials` setting
    directly (see the caveat above) before copying its pattern for
    `auth-api` — a wrong assumption here is the same class of bug as the
    bridge-api-wildcard trap, just in the opposite direction (too strict and
    cookies silently never get sent, rather than too loose).
