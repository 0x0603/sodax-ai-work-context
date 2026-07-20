---
type: outcome
repo: sodax-frontend
github:
status: In progress
updated: 2026-07-17
---

# Outcome

- PR: none of my own — every confirmed finding already has an issue/PR upstream.
- Commits: (none — no code changed)
- Tests: (none — no code changed)

## Summary

A blind re-audit of `apps/web` (ran without reading the tracker or the Codex
report first). It surfaced **no new critical**: it independently rediscovered
**SEC-01 / #1555** from scratch and hand-verified the full exploit chain.

The one genuinely useful output: **SEC-01 is confirmed still live on
`origin/main`.** Verified directly, not inferred —

```bash
git show origin/main:apps/web/lib/auth.ts | grep -n "input:\|disabledPaths"
# → no matches. role/permissions still carry only { type, required }.
```

That is independent corroboration of the tracker's warning that PR #1568 is
**open but unmerged**, so the "✅ Fixed" ticks mean *PR ready*, not *shipped*.
**Real action stays: get #1568 merged.** My own proposed `input: false` patch is
redundant with #1568 — do not open a competing PR.

Secondary value: two findings that may not be in the Codex report (WEB-H-1
JSON-LD XSS, WEB-H-2 ICON regex) — flagged for #1556 / #1559 owners to confirm
against their scope before anyone writes code.

## Finding → existing issue mapping

| My ID | Sev | File | Finding | Maps to | Action |
| --- | --- | --- | --- | --- | --- |
| WEB-C-1 | **Critical** | `lib/auth.ts:55` | Any Google account → `POST /api/auth/update-user {"role":"admin"}` → CMS admin | **SEC-01 / #1555**, PR #1568 | **None new.** Chase the merge. Chain re-verified by hand below. |
| WEB-H-1 | High | `app/news/[slug]/page.tsx:246` + 8 more | JSON-LD stored XSS — `JSON.stringify` leaves `<` `/` raw inside an inline `<script>` | **#1556** (XSS & CSP, not started) | Hand to #1556's owner; confirm whether Codex covered it. Fix spec below. |
| WEB-H-2 | High | `lib/address-validation.ts:16` | ICON validator checks only the first 2 chars — gates irreversible swap-and-send | **#1559** (financial-flow UX, not started) | Hand to #1559's owner. |
| — | Med | `stake-dialog-footer.tsx:232`, `deposit-dialog-footer.tsx:211` | Double-submit: `disabled` omits `isPending` | **#1559** | One-line each. |
| — | High? | `api/partners/analyze/route.ts:51` | Turnstile fails **open** when `TURNSTILE_SECRET_KEY` unset | **#1557** (endpoint abuse) | Unverified — see `process.md`. |
| — | High? | `api/partners/email-guide/route.ts:148` | Unauthenticated endpoint sends SODAX-branded mail to any recipient | **#1557** | Unverified. |
| — | — | `stake-dialog-footer.tsx:61` | `minReceive = 0` when the ratio read fails (`'0'` is truthy, defeating the `!receivedXSodaAmount` guard) | **#1560 SDK-H-1** ↔ #1448 `#8`/`#17` | Impact already **accepted-risk** (`fillIntent` reverts `InvalidSolver` unless `msg.sender == intent.solver`). **The truthy-`'0'` guard is still a distinct FE defect** — verify before raising. |

## WEB-C-1 — the chain, re-verified by hand against real source

Recorded because independent confirmation is what moves #1568.

```
1. Any Google account → POST /api/auth/sign-in/social         → valid session
2. POST /api/auth/update-user {"role":"admin"}                → CMS ADMIN
3. News article title = `</script><script src=…>`             → stored XSS on sodax.com
4. No CSP script-src / connect-src                            → drainer hooks window.ethereum, exfiltrates
```

| # | File | Evidence |
| --- | --- | --- |
| 1 | `app/api/cms/users/route.ts:76` | *"They must sign in once to activate their account"* — sign-in is open to **any** Google account; the whitelist bites only later, in `requireAuth`. |
| 2 | `lib/auth.ts:55-66` (**origin/main**) | `role` / `permissions` lack `input: false`. |
| 2 | `better-auth@1.4.18/dist/db/schema.mjs:54` | `parseInputData` rejects a field **only** when `input === false`. Unset ⇒ written to the DB. |
| 2 | `better-auth@1.4.18/dist/api/routes/update-user.mjs:15` | `body: z.record(z.string(), z.any())` — any key; `use: [sessionMiddleware]` — session only, no admin check. |
| 2 | `lib/auth-utils.ts:44` | Whitelist + `deleteOne` live in `requireAuth`, which `/api/auth/*` **never calls** ⇒ setting `role` before touching a CMS route means the delete branch never fires. |
| 3 | `app/news/[slug]/page.tsx:246` | `JSON.stringify(...)` → `dangerouslySetInnerHTML` in `<script type="application/ld+json">`; `article.title` is CMS-controlled. |
| 4 | `next.config.js:18` | `cspDirectives` has no `script-src`, no `connect-src` (deliberate, pending #1197). |

Reading `lib/auth.ts` alone could not settle exploitability — that lives in
better-auth's internals. Reading the installed `dist/` is what turned "suspicious
config" into a proven chain.

## WEB-H-1 fix spec (for #1556)

New `lib/json-ld.ts`, applied to all 9 `application/ld+json` sites (CMS-fed first:
`news/[slug]`, `news/page.tsx`, `news/preview/[id]`, `glossary/page.tsx`,
`glossary-detail-page.tsx`, `partner-page-layout.tsx`, `partners/page.tsx`):

```ts
/**
 * Characters that terminate or reopen an HTML parsing context inside an inline
 * <script>. JSON.stringify leaves them raw, so a CMS-controlled string such as a
 * news title can close the JSON-LD block and open its own. U+2028 / U+2029 are
 * legal in JSON strings but are line terminators to some script parsers.
 */
const SCRIPT_BREAKING_CHARS: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, char => SCRIPT_BREAKING_CHARS[char] ?? char);
}
```

Escapes stay valid JSON and parse back identically, so crawlers read the same data
(verify with Google's Rich Results test, don't assume). `< > &` never appear in
JSON *structure*, only inside string values — so a blanket replace is safe.

## WEB-H-2 fix spec (for #1559)

```ts
const ICON_ADDRESS_PATTERN = /^(?:hx|cx)[0-9a-f]{40}$/i;
```

The current `/^h[ cx]/` is both **too loose** (no length, no hex ⇒ `"hx1234"`
passes) and **too strict** (leading `h` required ⇒ `cx…` contract addresses always
fail). Looks like `/^(hx|cx)/` mistyped into a character class — the class even
admits a space. Gates `swap-store-provider.tsx:143` (swap-and-send destination).

## Verified as NOT a problem (don't re-audit)

- **CVE-2025-29927 middleware bypass** — N/A: `middleware.ts` carries no authorization.
- Headers are solid: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS
  preload, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- No secrets behind `NEXT_PUBLIC_` (Turnstile **site** key + public URLs only);
  only `.env.example` tracked.
- `lib/sanitize.ts` — forces `rel="noopener noreferrer"`, `allowedSchemes` blocks
  `javascript:`; `sanitizeHref` rejects protocol-relative `//host`.
- Next.js `15.5.18` is above the 2025 CVE patch floor.

## Follow-ups

- **#1568 merge is the only thing that closes the live P0.** Independent
  main-is-vulnerable evidence above is usable as a nudge on #1555.
- Route WEB-H-1 → #1556, WEB-H-2 + double-submit → #1559, Turnstile/email-guide
  → #1557. Confirm against Codex scope before writing code — don't duplicate.
- Re-run the verify pass over `process.md` → "Unverified", starting with
  `lib/swaps-api-sign.ts:68` (server-supplied blind-signed calldata) — if it holds
  it may outrank everything here.
- #1197 (CSP `script-src`) is not a Lighthouse nit: it is the control that would
  contain WEB-H-1 and step 4 of the chain. Re-prioritise with that framing.
- **Process lesson worth keeping: read `plans/security-audit-tracker.md` BEFORE
  auditing.** Running blind cost a full workflow to rediscover a known P0. The
  blind run did buy independent corroboration — but that was luck, not design.
