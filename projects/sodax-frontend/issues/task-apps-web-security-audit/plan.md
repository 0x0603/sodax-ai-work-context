---
type: plan
repo: sodax-frontend
github:
updated: 2026-07-17
---

# Plan

## Goal

Feed this re-audit's evidence into the **existing** epic #700 workstream. No new
issues, no competing PRs. The audit's job is done; what remains is routing.

## Approach

The blind run rediscovered SEC-01 rather than finding anything new above it. So the
plan is **not** "fix what I found" — it is:

1. Use the independent *main-is-still-vulnerable* evidence to push #1568 to merge.
2. Hand the two possibly-uncovered findings to the owners of the phases they belong
   to (#1556, #1559), for them to confirm against Codex scope first.
3. Verify the unverified backlog before anyone acts on it.

Deliberately **not** doing: opening my own `input: false` PR. #1568 already carries
that fix plus `disabledPaths:["/update-user"]` and the Google-domain lock — a
competing PR would fork the fix and slow the merge that actually matters.

## Steps

- [ ] Comment the hand-verified chain + the `git show origin/main` check on **#1555**
      as independent corroboration that the P0 is live. Push for #1568's merge.
- [ ] **Forensics** (raise with the owner — the hole has been open on main): query
      the `user` collection for docs whose `role` was set outside the
      `POST /api/cms/users` flow. Assume it may have been used; don't assume not.
- [ ] Hand **WEB-H-1** (JSON-LD XSS + fix spec) to #1556's owner. Ask first whether
      Codex already covered it before any code is written.
- [ ] Hand **WEB-H-2** (ICON regex) + the double-submit pair to #1559's owner.
- [ ] Hand the Turnstile fail-open + `email-guide` findings to #1557 — **after**
      verifying them.
- [ ] Re-run a verify pass over `process.md` → "Unverified", `swaps-api-sign.ts:68`
      first.
- [ ] Re-frame #1197 as WEB-H-1's containment control, not a Lighthouse nit.
- [ ] Add a row for this task to `plans/security-audit-tracker.md`.

## Verification

- SEC-01 live-on-main claim: re-run
  `git show origin/main:apps/web/lib/auth.ts | grep -n "input:\|disabledPaths"`
  before quoting it — it goes stale the moment #1568 merges.
- WEB-H-1: article title `</script><script>alert(1)</script>` must render escaped
  inside the JSON-LD block and not execute; Google Rich Results must still parse it.
- WEB-H-2: `hx1234` rejected · real 40-hex `hx…` accepted · `cx…` accepted ·
  `hx` + 40 non-hex rejected.

## Risks

- **Duplicating #1568.** The single biggest risk. My fix and gosia's overlap; two
  PRs on one P0 is worse than one merged PR.
- **Stale claim.** "P0 live on main" is true as of 2026-07-17 and expires on merge.
  Always re-check before repeating it.
- **False confidence from an incomplete audit.** The verify phase died; 13 of ~145
  findings got a real adversarial pass. Fixing the known chain must not read as
  "apps/web is clean" — `outcome.md` says so explicitly.
- **Unverified backlog may outrank everything here** (`swaps-api-sign.ts:68`).
  Verify before prioritising.
- Some claims belong to **sodax-sdks** (e.g. missing `chainId` on EVM txs) — route
  to #1560's surface, don't patch around them in `apps/web`.
- Research agents returned **unverified 2026 incidents** (`@injectivelabs`
  2026-07-08, axios 2026-03-31, CVE-2026-44578…). This repo integrates Injective,
  so that one matters — but verify it independently before acting.
