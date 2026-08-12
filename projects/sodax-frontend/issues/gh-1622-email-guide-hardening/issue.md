---
type: issue
repo: sodax-frontend
github: 1622
status: Active
tags: [security, api-route, phishing, rate-limit, resend, audit-2026-07-28]
updated: 2026-08-12
related_issues: [gh-1623-fence-scraped-content-llm-prompt, gh-1627-pin-github-action-shas]
related_decisions: []
---

# GH-1622 Email Guide Hardening

- Source: https://github.com/icon-project/sodax-frontend/issues/1622
- Started: 2026-08-12
- Related PR: none yet — branch `fix/1622-email-guide-hardening`, local only
- Parent: #1621 (2026-07-28 whole-repo security audit follow-up), ranked **2 of 5**
- Report: https://claude.ai/code/artifact/76aec015-413e-43f1-ad4b-155114a460d2 (findings 1 and 2)

## Problem

Two Medium findings in `apps/web/app/api/partners/email-guide/route.ts`.

**Finding 1 — unauthenticated endpoint mails attacker-chosen text from the verified
sodax.com domain** (`A04:2021 Insecure Design · CWE-20`). The route echoed a client-supplied
display name and a client-supplied URL straight into the Resend template, with no URL
validation beyond a scheme check and no authentication. SODAX's transactional sending domain
becomes a phishing relay: SPF/DKIM-aligned, SODAX-branded mail carrying an attacker's link
and wording, to any recipient, up to the daily cap.

**Finding 2 — the email-bombing cap was keyed on the raw address** (`A04:2021 · CWE-799`),
so `a@x.com`, `a+1@x.com` and `a.b@gmail.com` counted as three different people. One inbox
could be flooded with hundreds of sodax.com-signed emails a day — and recipients marking
those as spam is what damages the shared Resend sending reputation the BD and press flows
depend on.

#1621 ranks this **the only one of the five exploitable right now by anyone**: no auth, no
compromise needed.

## Context

The ticket's own warning: `normalizeAndValidateScrapeTarget` **throws**, it does not return
null, so dropping it in naively turns a bad URL into an unhandled 500 — which `CLAUDE.md:64`
explicitly forbids for API routes.

## Acceptance Criteria

- [x] Derive `protocol_name` server-side via `getProtocolName()` instead of trusting the client.
- [x] Run `url` through `normalizeAndValidateScrapeTarget()` + `detectNonProtocolHost()`.
- [x] Canonicalise before keying the limiter: strip `+tag`, strip dots for gmail/googlemail.
- [x] Use the canonical form for the **rate-limit key only** — deliver to the address as typed.
- [x] Fix `partnership-inquiry` too, inside `checkRateLimit` rather than per route.
- [ ] **Open, needs dashboard access:** confirm whether the Resend hosted template renders
      `protocol_name` / `protocol_url` escaped or raw. If raw, finding 1 is worse than Medium.

## Related

- Knowledge:
- Decisions: D4 (validation ordering) — recorded in `plan.md`
