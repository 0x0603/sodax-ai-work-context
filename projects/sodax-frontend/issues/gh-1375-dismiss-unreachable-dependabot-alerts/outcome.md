---
type: outcome
repo: sodax-frontend
github: 1375
status: Blocked — deliberately not executed; needs a human at the GitHub UI
updated: 2026-08-12
---

# Outcome

- PR: none (no code change by design)
- Commits: none
- Tests: n/a

## Summary

Nothing dismissed. Dismissing ~30 alerts is an outward-facing write to a shared repo's
security record and is not a call to make unattended — and independently, two of the ticket's
five categories would put a **false** justification on the record if followed as written.

What exists instead is a verified worksheet in `process.md`: which categories still hold,
which are already fixed, which are cleared by a bump rather than a dismissal, and one critical
the ticket never accounted for.

## What Changed

Nothing.

## Follow-ups

- **protobufjs is the clean dismiss** — reachability verified from the lockfile (only
  `@trezor/protobuf` → `@trezor/connect-web` pulls it).
- **Do not dismiss the Next.js CSP-nonce advisory as unreachable** — the nonce CSP shipped in
  PR #1588. And treat all 8 `next` alerts as a bump (#1642 is open), not a dismissal.
- **kysely has nothing left to dismiss** — already fixed by #1647.
- **Rewrite the bn.js justification** — the alert is against 5.x, not the v4 polyfill.
- **Disposition alert #201 (`vitest`, critical, runtime)** — absent from the ticket entirely.
- Check whether **#1376** was closed prematurely; its named packages still have open alerts.

## Draft comment for the issue — NOT POSTED

> Worked through the category list against the live alert set before dismissing anything, and
> two of the five don't hold as written:
>
> **Next.js / CSP nonce is no longer "a feature we don't use."** #1631 records that the
> nonce-based strict `script-src` shipped in PR #1588 and the CSP now lives in
> `apps/web/middleware.ts`, so dismissing that advisory as unreachable would be false. All 8
> `next` alerts are also cleared by a version bump (#1642 is open) — dismissal is the wrong
> instrument for the whole category.
>
> **kysely has nothing to dismiss** — all three alerts were fixed 2026-08-06 by the better-auth
> 1.4.18→1.6.22 bump (#1647). The reasoning was right (we use `mongodbAdapter`; kysely is
> transitive-only through better-auth and imported nowhere), it's just moot now.
>
> **protobufjs holds up** and is the clean one: the lockfile shows `protobufjs@7.4.0` with
> exactly two dependents, both `@trezor/protobuf`, reached only from `@trezor/connect-web`.
>
> **bn.js needs its justification rewritten** — alert #56 is against the 5.x line (patched
> 5.2.3), not the v4 polyfill the ticket names.
>
> Two more for the record: there's a **second critical** nobody has accounted for — #201,
> `vitest`, GHSA-5xrq-8626-4rwp, `runtime` scope — and the current shape is **116 open (2
> critical, 51 high, 59 medium, 4 low), 0 dismissed**, not the ~30 the ticket assumes.
