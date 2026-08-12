---
type: process
repo: sodax-frontend
github: 1375
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — Read the live alert set and checked each of the ticket's five categories
  against it. Nothing dismissed.

## Findings

### The numbers moved

Live, 2026-08-12: **116 open** — 2 critical, 51 high, 59 medium, 4 low; 113 unique GHSAs.
**Dismissed: 0. Auto-dismissed: 0** — so none of this ticket has been done. The "~30 alerts"
figure is stale, and so is #1365's own "122 open / 90 unique".

The alerts API reads fine with the current token (`repo` scope). Dismissal is a `PATCH` on
`/dependabot/alerts/{number}` and wants `security_events`; not attempted.

### Category-by-category — two of five would put a false claim on the record

**1. protobufjs — still valid, and the reachability claim checks out.** 11 open + 1
`@protobufjs/utf8`. The critical is alert **#120, GHSA-xq3m-2v4x-88gg**, scope `runtime`,
first patched 7.5.5. Verified from the lockfile: `protobufjs@7.4.0` has exactly two dependents,
both `@trezor/protobuf`, reached only from `@trezor/connect-web@9.6.2`. Nothing else pulls it.
**This is the clean dismiss in the set.**

**2. Next.js "features we don't use" — partly FALSE now.** The ticket lists CSP nonce among
the unused features. Epic #1631's own body records that nonce-based strict
`script-src 'nonce-…' 'strict-dynamic'` **shipped in PR #1588** (tracked as #1580) and that the
CSP now lives in `apps/web/middleware.ts`. Dismissing the nonce advisory as unreachable would
be a false statement. Separately, all 8 `next` alerts are cleared by a version bump — they
carry `first_patched_version: 15.5.21` and Dependabot PR **#1642** is already open — so
dismissal is the wrong instrument for the whole category.

**3. lodash / axios prototype-pollution — alerts still open** (lodash 2: #108
GHSA-r5fr-rjxr-66jc high, #106 GHSA-f23m-r3pf-42rh medium; axios 29). The "no untrusted merge
sites" reasoning was not re-verified here. Note axios is better handled by #1374 — see that
folder; the pin is the blocker.

**4. kysely — nothing left to dismiss.** All three alerts (#90, #93, #134) are already
`fixed`, cleared 2026-08-06 by `de6d8ead` (better-auth 1.4.18 → 1.6.22, #1647). The *reasoning*
is sound and worth keeping as evidence: `apps/web/lib/auth.ts:3` imports `mongodbAdapter` and
`:43` wires it with the Mongo client; kysely is transitive-only via `@better-auth/core` and
`@better-auth/kysely-adapter`, and nothing in `apps/web` imports it. But there is no alert to
act on.

**5. bn.js — the justification needs rewriting.** Alert **#56**, GHSA-378v-28hj-76wf, medium,
runtime, first patched **5.2.3**. The ticket calls it "bn.js v4 polyfill, unused path", but the
advisory is against the **5.x** line; the lockfile carries 4.12.5, 5.2.1, 5.2.2 and 5.2.5. The
category name does not match the alert.

### A second critical the ticket never accounts for

Alert **#201 — `vitest`, GHSA-5xrq-8626-4rwp, severity critical, scope `runtime`**, patched
3.2.6. The ticket's category list assumes one critical (protobufjs). This one needs its own
disposition; `runtime` scope on a test runner is worth a look before anyone waves it through.

### Also worth flagging

**#1376 (Phase 5) was closed as completed on 2026-08-03 with no PR**, while the packages it
names still have open alerts: vite 3, esbuild 1, elliptic 1, bigint-buffer 1. Either the phase
was closed prematurely or its disposition was never recorded anywhere findable.

## Changes During Work

None.
