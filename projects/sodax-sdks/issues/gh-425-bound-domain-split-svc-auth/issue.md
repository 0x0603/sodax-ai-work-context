---
type: issue
repo: sodax-sdks
github: 425
status: Active
tags: [bitcoin, bound, radfi, config, migration, cross-repo]
updated: 2026-09-08
related_issues: [gh-330-bound-exchange-endpoint-inventory, gh-1024-bound-auth-email-provider]
related_decisions: []
---

# GH-425 Bound Domain Split Svc Auth

- Source: https://github.com/icon-project/sodax-sdks/issues/425 — **parent**, one sub-issue per repo
- Started: 2026-09-04
- Trigger: Bound's Discord announcement to the Sodax team, 2026-09-04
- Sub-issues (GitHub native, cross-repo):

  | Order | Repo | Issue | PR |
  | --- | --- | --- | --- |
  | 1 | sodax-sdks | #426 | — |
  | 2 | sodax-backend | #1215 | — |

## Problem

Bound is splitting `api.bound.exchange` into `svc.bound.exchange` and
`auth.bound.exchange`. Paths, payloads and auth schemes are unchanged.

The full endpoint → host table, the consumer inventory and the five open
questions live in the body of #425 — not duplicated here. See `brief.md` for
state and blockers.

## Acceptance Criteria

Bound completed the mapping on 2026-09-08: **four hosts**, `api.bound.exchange` retired.
`/api/transactions/*` goes to `api.radfi.co`, not svc.

- [x] Q1–Q4 answered. Q1 answered by Bound; Q2–Q4 from DNS, host probing and their source.
- [ ] **Step 0 (blocking)**: `artifacts/probe-bound-hosts.sh` from a whitelisted
      environment — confirms auth, radfi.co and svc each serve their own family.
      Decision table in `plan.md` §Step 0.
- [ ] **CORS verified from a real browser** on canary — `api.radfi.co` is a different
      registrable domain and all three `/transactions/*` calls are browser calls.
      Highest-severity item; the probe script cannot cover it.
- [ ] #426 ships **two** new optional fields (`authUrl`, `transactionsUrl`) + three-way
      prefix routing + the packaged defaults, each gated on its Step 0 row.
- [ ] #1215 ships `RADFI_AUTH_URL` — **only that**; the backend calls 2 endpoints and never
      reaches `/api/transactions/*` or UMS. After the SDK release; coded in parallel
      against a locally-linked SDK with the override reverted before commit.
- [ ] Bound answers: is `api.radfi.co` itself on a sunset path · CORS/origin allowlist on
      it · does the deprecation cover `signet.api.` / `staging.api.`
- [ ] Deprecation date agreed — we asked for their minimum notice rather than committing a
      date, since consumer SDK adoption is the long pole.

**Dropped:** "intents-whitelabel env flipped" — it pins `@sodax/* 2.0.0-rc.12`, two minors
behind. Out of scope, but it is the only live consumer of `useRadfiWithdraw`, so BTC
withdrawal breaks first when the old host dies. Schedule its bump against the deprecation date.

## Related

- Knowledge:
- Decisions:
