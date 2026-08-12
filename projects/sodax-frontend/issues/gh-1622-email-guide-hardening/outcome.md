---
type: outcome
repo: sodax-frontend
github: 1622
status: Implemented locally — not pushed, no PR; one item needs Resend dashboard access
updated: 2026-08-12
---

# Outcome

- PR: none. Branch `fix/1622-email-guide-hardening`, local commit `1b0366c6`.
- Commits: 1 — `fix(web): harden email-guide against phishing relay and rate-limit bypass`
- Tests: no suite exists in this repo. Verified by lint + typecheck + build + a 14-case
  driver run against the real source (see `process.md`).

## Summary

Both findings closed. The endpoint can no longer be used to send SODAX-branded mail carrying
an attacker's wording and link, and the per-recipient cap can no longer be bought around with
plus-tags or Gmail dots.

## What Changed

**`apps/web/lib/server/rate-limit.ts`**
- `canonicalizeRateLimitIdentifier` — lowercase, drop `+tag`, and for `gmail.com` /
  `googlemail.com` also strip dots and fold onto `gmail.com`. Gated on a whole email address,
  so the 15 non-email call sites are untouched. Key only; delivery is unaffected.
- `buildRateLimitId` — one place that derives the window document's `_id`, now used by both
  `checkRateLimit` and `releaseRateLimit`, which previously built it independently.

**`apps/web/app/api/partners/email-guide/route.ts`**
- `protocol_name` derived server-side via `getProtocolName(safeUrl)`; `protocolName` dropped
  from the request shape and from `sendGuideEmail`'s params.
- `url` validated through `normalizeAndValidateScrapeTarget` (wrapped → 400, never a bare
  500) then `detectNonProtocolHost` (→ 400), **after** Turnstile and the three quotas.
- Everything downstream reads the validated URL: guide lookup, cache key, send, Notion capture.

`partnership-inquiry` gets finding 2's fix without being edited, which is what the ticket asked for.

## Follow-ups

- **Blocked on a human with Resend dashboard access:** do the hosted templates render
  `protocol_name` / `protocol_url` escaped or raw? The project's `{{{triple mustache}}}`
  convention is unescaped by design. If raw, finding 1 was worse than Medium and the fix
  should be re-graded accordingly. This cannot be answered from the repo.
- Eyeball one real send before merge — the displayed protocol name changes from
  whatever the client passed to the registered domain. Expected, but user-visible.
- Test the two routes together: they now share the canonical key format, so in-flight counter
  docs written the old way are orphaned (harmless; they expire on their own window).
- Worth raising separately, not fixed here: `checkRateLimit` fails **open** by default, so a
  Mongo outage removes the email-bombing cap entirely. Deliberate per the file's own
  availability policy, but it is the remaining ceiling on how much this control is worth.

## Draft comment for the issue — NOT POSTED

> Both findings are fixed on a local branch.
>
> Finding 2 is fixed inside `checkRateLimit` as suggested, so `partnership-inquiry` is
> covered without touching it. Two things worth flagging: `releaseRateLimit` was rebuilding
> the same document key independently, so both now go through one helper — canonicalising
> only one of them would have made every release miss its row. And the canonicalisation is
> gated on a **whole email address**, not on a bare `@`: of the 17 call sites only 2 pass an
> email, and `brand/download-error` keys on a signature that includes a user-agent, which can
> contain `@`.
>
> Finding 1: `protocol_name` is now `getProtocolName(safeUrl)` and the URL goes through the
> analyze pair, wrapped so a throw is a 400 and not a 500. One deviation — I put the heavy
> validation **after** Turnstile and the quotas rather than at the existing check site, since
> `normalizeAndValidateScrapeTarget` resolves hosts and I would rather an unauthenticated
> caller could not drive that. The cheap scheme check stays where it was.
>
> Still open and not answerable from the repo: whether the Resend template renders those two
> variables escaped or raw. If raw, this was worse than Medium.
