---
type: plan
repo: sodax-frontend
github: 1622
updated: 2026-08-12
---

# Plan

## Goal

Close both findings in one pass, without turning a bad URL into a 500 and without changing
what any of the other 15 rate-limit call sites do.

## Approach

### Finding 2 first — it is the smaller, lower-risk half

`checkRateLimit` built the Mongo `_id` inline, and `releaseRateLimit` **rebuilt the same id
independently**. Both now go through one `buildRateLimitId(scope, identifier, windowStart)`
helper, which canonicalises the identifier. That fixes the drift risk and the bypass in the
same move, and — because the fix lives in the limiter — it closes the identical bug in
`partnership-inquiry` for free, exactly as the ticket asks.

Canonicalisation is **gated on a whole email address** (reusing `isValidEmail`), not on a
bare `'@'`. That gate is the load-bearing detail: 17 call sites exist and only 2 pass an
email. The rest pass IPs, `'global'`, a registered domain, or a `brand/download-error`
signature hash — and that signature is built partly from a user-agent string, which can
contain `@`. An ungated implementation would quietly rewrite those keys.

### Finding 1

Import the same three helpers `/api/partners/analyze` already uses, and thread the
**validated** URL through everything downstream (`getIntegrationGuideByUrl`, `buildCacheKey`,
`sendGuideEmail`, `captureLeadInNotion`) rather than the raw one.

**D4 — the heavy validation goes after Turnstile and the three rate limits**, not at the
existing cheap-scheme-check site. `normalizeAndValidateScrapeTarget` performs a
private/local-host check; running it before Turnstile would hand an unauthenticated caller a
free host-resolution primitive. The cheap `/^https?:\/\//i` + empty check stays where it is.
This is a deliberate deviation from a literal reading of the ticket — call it out in the PR.

`getProtocolName(safeUrl)` replaces the client's `protocolName` in the template. The field is
dropped from the parsed body shape and from `sendGuideEmail`'s params rather than left as a
dead argument.

## Steps

1. `rate-limit.ts`: add `canonicalizeRateLimitIdentifier` + `buildRateLimitId`; use in both
   `checkRateLimit` and `releaseRateLimit`.
2. `email-guide/route.ts`: imports; validate after the quotas, wrapped in try/catch → 400;
   deny-list check → 400; `safeUrl` downstream; server-derived `protocol_name`.
3. Verify, commit on `fix/1622-email-guide-hardening`. **Do not push.**

## Verification

- `pnpm lint && pnpm checkTs` green.
- A scratchpad driver that pulls the real function bodies out of the shipped source (not a
  hand-copy) and asserts the canonicalisation table, including that non-email identifiers
  pass through untouched and that check/release derive the same id.
- `pnpm build` green.
- Re-read the route top to bottom for ordering.

## Risks

- Reject semantics change: a URL that previously reached the Resend send can now be answered
  400. That is the point, but it is user-visible on the `/partners` surface.
- Emails will look different — `protocol_name` becomes the registered domain rather than
  whatever the client passed. The ticket calls this out and asks for one real send to be
  eyeballed.
- Canonicalising in the shared helper changes `partnership-inquiry` too; in-flight counter
  docs keyed the old way are orphaned and expire on their own window. Harmless, but it means
  the two routes should be tested together.
