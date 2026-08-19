---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-19
updated: 2026-08-19
---

# 2026-08-19 — Threat model: "is the backend safe, can it be hacked, leaked, or lose keys?"

User's question, answered by a six-lens source-verified pass, each finding then
sent to an independent reviewer instructed to **refute it by default**. 15
critical/high findings went through that gate; 14 stood, 1 was knocked down, and
most that stood were re-scoped or downgraded. The gate earned its keep — see
"What the adversarial pass changed" below.

## New plan file

**[[plan-auth-api-durability]]** — the durability half, which had no home
anywhere in the plan. `plan-auth-api-security` answers *can it be stolen?*; this
answers *can it be lost?*. The two are opposite failure modes with opposite
fixes, and for a blind custodian the second is unrecoverable by construction.

The finding that justified a whole file: **`sodax-backend` has exactly one backup
pipeline and it covers only the shared stateful DB.** The main `sodax-mongo` —
where all nine apps write — has no backup at all. So the placement of `wauth_*`
silently decides whether user funds are recoverable. And placing it in the
stateful DB is not sufficient either: the restore runbook enumerates a *closed
set* of five `stateful_*` collections, so an operator working that runbook during
an incident would skip an unlisted `wauth_keystore`.

Three more in the same direction: the backup watcher classifies on S3 object
**metadata** and never opens the archive (its size guard defaults to off), so a
dump that silently omits the keystore reports healthy indefinitely; `--replSet
rs0` reads as redundancy but is a single-member set on a bind mount; and
`mongorestore --drop` runs in *every* restore mode, so restoring an hour-old
archive over live keystore data destroys every registration since the dump.

## What the adversarial pass changed — the gate was not ceremonial

- **"Better Auth's raw-Express mount means no Nest guard can throttle auth
  routes" — knocked down.** The architectural observation is true, but Better
  Auth throttles *inside its own handler*, so the mount is neither the cause of
  nor an obstacle to rate limiting. The refuter then found the real cause, which
  is live today: Better Auth defaults `rateLimit.enabled` to `NODE_ENV ===
  "production"`, and this repo's convention is `dev|test|prod`, so the limiter is
  silently off in production. `auth.config.ts:24-26` already documents that exact
  mismatch for the cookie `Secure` flag and fixes that half — the rate-limit half
  was never noticed. Second instance of one root cause.
- **`X-Real-IP` trust — downgraded critical → medium, on an unverified
  precondition.** Everything depends on whether the origin ports actually answer
  from the internet, which cannot be settled from the repo. The refuter also
  pointed out that *if* they do, the critical item is not the header at all but
  `docker-compose.yml:62-63, :96-97` publishing MongoDB and Redis on `0.0.0.0`.
  Ten-minute external port scan decides this.
- **Google OAuth tokens in cleartext — downgraded high → low.** The provider
  requests no `access_type=offline`, so no refresh token is ever issued; the
  exposure is a ~1h identity-only token whose claims duplicate `auth_user` in the
  same dump.
- **Session tokens — the reviewer found something worse than reported.** With
  `cookieCache` enabled, `BETTER_AUTH_SECRET` **alone** suffices: `session.mjs:76-81`
  authenticates the `session_data` cookie purely by HMAC and returns the embedded
  user with no DB read, and the `session_token` value is never checked. The
  secret, not the session table, is the crown jewel — and its config DTO has no
  length or entropy floor.

## Findings that are NOT about #1024 — they belong to whoever owns sodax-backend

Six findings are about code running in production **today** and have nothing to
do with the auth-api build. Recording them here because that is where they were
found, but they should not be buried in a #1024 folder:

1. **`POST /get-access-token` is publicly mounted.** The catch-all
   `expressApp.all('.../*splat')` exposes Better Auth's whole default route
   table; that route takes only a session cookie and returns a live Google OAuth
   access token — no fresh-session requirement, no re-auth. `/list-accounts` and
   `/account-info` leak linked-provider metadata; `/ok` and `/error` are
   unauthenticated and fingerprint the stack.
2. **Any Google account can self-provision a partner organization.**
   `allowUserToCreateOrganization` is unset (defaults to permitted) and the Google
   provider has no `hd` restriction or post-sign-in allowlist. Sign in → become
   org owner → issue invitations and org API keys.
3. **Better Auth's rate limiter is off in production** (the `NODE_ENV` mismatch
   above).
4. **`cookieCache` honours a revoked session for up to 5 minutes** — `SessionGuard`
   calls `getSession` without `disableCookieCache`, so the whole portal API
   accepts the stale cookie, including a stale `activeOrganizationId` and role.
5. **The main Mongo has no backup** (§1 of the durability plan) — this is a
   standing risk for every app, not only a future auth-api.
6. **`apps/api`'s `IPGuard` is an unconditional `return true`** with a `// TODO:
   this bypass for now` comment, on the `/admin/*` controller. The route reads as
   two factors (network position AND token); only the token is real.

**Suggest raising 1, 2 and 6 as their own issues.** None is a #1024 deliverable,
and leaving them in a research folder is how they get lost.

## Method note — a workflow failure worth not repeating

The first attempt at the three heaviest lenses burned ~4 hours across 17 agents
that were all interrupted mid-run and retried from scratch, never converging.
Cause: prompts that asked for exhaustive module reads at `xhigh` effort, so each
agent ran long enough to be cut. Compounding it, the script put the doc-fix phase
*behind* the lens phase with `await`, so 18 queued documentation fixes were
blocked behind work that never finished, despite having no dependency on it.

Re-run with the lenses split into five narrow, explicitly budgeted assignments
("locate with rg first, Read only what you need, aim for a handful of
well-evidenced findings, not completeness") at `high` effort, and with doc-fixes
and lenses as two concurrent tracks: **9/9 agents, zero errors, five minutes.**

Lesson for future passes in this repo: scope per agent, and never put an
independent track behind a barrier.
