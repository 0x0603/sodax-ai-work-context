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

- [x] Q1–Q4 answered — from DNS, host probing and Bound's own source, not from Discord.
      See `plan.md` §"What recon settled" and `plan-evidence.md`.
- [ ] #426 ships `authUrl` + per-prefix routing, and moves the packaged `apiUrl` to
      `svc.bound.exchange`. `authUrl` stays unset in the default — deliberately.
- [ ] #1215 ships `RADFI_AUTH_URL` in swaps-api and bridge-api, after the SDK release.
- [ ] Phase 2: `auth.bound.exchange` verified on canary via `RADFI_AUTH_URL`, then
      `authUrl` added to the packaged default in a later release.
- [ ] Migration timeline given to Bound and a deprecation date agreed.

**Dropped:** "intents-whitelabel env flipped" — it pins `@sodax/* 2.0.0-rc.12`, two
minors behind the release carrying `authUrl`, so it is an SDK upgrade rather than an env
change. Out of scope; tracked as a correction in `plan.md` §Corrections.

## Related

- Knowledge:
- Decisions:
