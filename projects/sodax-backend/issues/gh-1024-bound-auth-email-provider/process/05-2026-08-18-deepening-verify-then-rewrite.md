---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-18
updated: 2026-08-18
---

# 2026-08-18 (later still) — Deepening pass: verify-then-rewrite against real source

User asked to make the plan "more detailed" and explicitly required: follow
existing logic/architecture/patterns, no `any`/`unknown` casts, reuse over
reinvent. Rather than writing more prose from memory, ran a 5-agent parallel
verification pass reading actual installed/shipped source (not docs, not an
earlier agent's paraphrase) before touching any plan file:

1. `bridge-api`/`swaps-api`/`sponsoring-api` — `HaproxyThrottlerGuard` (all 3
   variants), CORS (3 different real patterns, not 1), `class-validator`
   config/DTO conventions, Redis/`@keyv/redis` exact versions and wiring.
2. `stateful-api/src/auth/*` — full `auth.config.ts`/`auth.constants.ts`/
   `auth.module.ts`, and `main.ts`'s exact bootstrap order.
3. `check-sponsoring-contract.mjs` — read the actual 167-line script, not
   just cited its existence.
4. `wallet-sdk-core` — verbatim config types + interfaces + construction
   lines for all 9 chains, not the earlier session's summarized table.
5. `better-auth@1.4.18`'s own installed `dist/*` — confirmed `rateLimit` and
   `advanced.ipAddress` defaults from real source, not the plugin's docs
   site (no web tool was available to that particular subagent).

## What this corrected or added, not just confirmed

- **New finding, not in the original draft**: Better Auth's core rate
  limiter has a built-in stricter override (`window:10, max:3`) for
  `/sign-in`, `/sign-up`, `/change-password`, `/change-email` paths — easy to
  duplicate badly with a conflicting NestJS-level throttle if not known.
- **Confirmed, with the actual spoofing mechanism now documented**: Better
  Auth's IP extraction trusts the first comma-separated value of
  `x-forwarded-for` (or whatever `ipAddressHeaders` names) with zero
  proxy-chain validation, and this feeds session tracking too, not just rate
  limiting — the earlier draft had the right conclusion but not the exact
  code proving it.
- **Correction of scope, not fact**: `HaproxyThrottlerGuard` is per-route
  `@UseGuards`, never `APP_GUARD`, in all three sibling apps — the earlier
  draft implied a simpler "just reuse the guard" framing that undersold this;
  `auth-api` needs it applied explicitly per sensitive endpoint.
- **New, real alternative found**: `sponsoring-api`'s guard variant sources
  the IP via a shared `resolveClientIp()` helper instead of an inline header
  read — a cleaner option than blindly copying `bridge-api`'s exact file.
- **Important unresolved gap surfaced, not fabricated over**: `@better-auth/passkey`
  is not installed anywhere in either repo. Every claim about its PRF
  extension API in this plan traces back to the *original* (prior-session)
  research, not this session's verification. Flagged explicitly in
  `plan-auth-api-security.md` rather than silently treated as confirmed.
- **9-chain type table replaced with verbatim source** — the earlier
  "8-of-9 accept privateKey" summary is now backed by the actual config type
  definitions, exact discriminator logic, and exact construction call for
  every provider, so `wallet-auth-core`'s dispatcher can be written directly
  against real types instead of a paraphrase.

## New file

`plan-auth-api-scaffold.md` — exact copy-paste templates (Better Auth wiring,
`main.ts` bootstrap order, config/DTO conventions, throttler/Redis reuse),
split out because it's a different concern from the security *analysis* in
`plan-auth-api-security.md` (one says what to build and why it's safe, the
other is the literal code to start from).

## Changes During Work

None to overall scope or direction — this pass corrected precision and added
verified detail to already-decided sections; it did not reverse any earlier
decision.
