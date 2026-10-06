---
type: brief
repo: sodax-frontend
github: 1622
status: Closed — PR 1936 merged 2026-10-05
next: None — done; manual checks dropped by the user 2026-10-06
updated: 2026-10-06
---

# Harden /api/partners/email-guide · brief

## State in five lines

PR icon-project/sodax-frontend#1936 **merged 2026-10-05** by 0x0603 after gosiast's approval
(merge commit `6623d817`); #1622 auto-closed. Net
diff is 4 files, +57/−15: `email-guide/route.ts`, `partnership-inquiry/route.ts`,
`lib/validate-email.ts`, and a new `scripts/validate-email.test.mjs`. The 2026-08-12 commit
`1b0366c6` no longer fit main, so the merge (`31051b17`) took main's version of both files and
the fix was rewritten in `0b9439d7`. lint, checkTs, test (54/54) and build are green.

## Next action

None. The PR body listed two manual checks: the Resend template escaping, and one real send. The
user dropped both on 2026-10-06, after the merge. The server now derives the name from a validated
URL, so the escaping question only affects how severe the old bug was.

## Settled — do not re-litigate

- Canonicalisation (`canonicalizeMailbox`) is applied at the **two call sites**, not inside
  `checkRateLimit`. Every other limiter keeps its key unchanged, and `releaseRateLimit` is
  untouched. This deviates from the ticket's suggestion on purpose, and the PR says so.
- URL validation replaces the old `https?://` regex, **before** Turnstile.
  `normalizeAndValidateScrapeTarget` is synchronous parsing with no DNS lookup; the
  2026-08-12 plan's "it resolves DNS" claim was wrong.
- The name is `findLivePartnerByUrl(safeUrl)?.name ?? getProtocolName(safeUrl)`, which is what
  the page sends today (`lead-magnet-hero.tsx:259`).
- No cached-guide requirement: the page lets visitors submit their email from the first
  token (`guide-hero.tsx:83`). The PR names the residual risk (a link to any public domain).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Original findings | `issue.md` | 0.7k |
| Call-site census and history | `process.md` | 1.5k |
| What shipped | `outcome.md` | 1.2k |

## Landmines

- On a merge from `main`, the pre-commit hook lint-stages every merged file and fails on
  existing Biome errors in `main`. The merge commit was made with `--no-verify` only after
  confirming the index matched `origin/main` exactly.
