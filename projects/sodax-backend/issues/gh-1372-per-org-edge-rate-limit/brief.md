---
type: brief
repo: sodax-backend
github: 1372
status: Active
next: reviewer sign-off and rollout preparation; correct remaining PR-description wording
updated: 2026-10-21
---

# GH-1372 Per-org rate limit · brief

**Latest independent verification:** pushed heads #136 `d1015b1` and #1380 `5c460604` match local
clean working trees. Both previous P1s are resolved; no new P0/P1 found. Sidecar 70/70 on host and
Linux Python 3.8, real HAProxy integration 26/26, and GitHub CI pass. See the final section of
`review-quality-fixes-2026-10-21.md`; a mixed-map fallback sentence in the PR body still needs narrowing.

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

Earlier local reviews are historical; their blocking findings are addressed in the pushed heads above.
File splitting remains deferred. Typed Config, initial-success health, partial-apply tests, flock,
runbook changes and the real-HAProxy CI job are committed.

## State in five lines

- The user owns this task. PRs open: sodax-backend #1380 (`5c460604`) and sodax-unified-api #136
  (`d1015b1`). Independent re-review found no new P0/P1; previous token-error and flaky-CI P1s are fixed.
- Direction set by Paul: HAProxy + a sidecar polling `/v1/keyset`; default tier Base; flexible
  tiers/limits; gateway docs update is in scope.
- Implemented: auth-server tier defaults + org overrides, effective limits in the keyset, dashboard
  editors, and the gateway sidecar/HAProxy limiter. Gateway prep still needs socket group + map files.
- HAProxy 2.8 mechanics verified locally (map files must pre-exist on 2.8).
- No divisor: one HAProxy counts a client's prod traffic. The earlier "2x" was IPv4 + IPv6 counted as
  two IPs (session 1, "Divisor withdrawn"). canary-api is a separate HAProxy.

## Blocked on

Nothing blocks coding. Deploy needs a verifier token from Paul and gateway access.

## Next action

Reviewer sign-off and rollout preparation. Narrow the remaining PR-body mixed-map claim as described in
`review-quality-fixes-2026-10-21.md`. Rollout still needs gateway access and verifier/webhook provisioning.
No upstream edits, posts or deployment were made in this review.

## Settled — do not re-litigate

- HAProxy is the enforcement point (Paul). Each gateway enforces the full limit; no divisor, no Redis.
- Tier names/scopes in code; tier limits as data in api-auth; org override in `tenants.limits`.
- Limit must be a positive integer; 0/missing = no org limit. Never a 401 from the limiter.
- Hash input = the FIRST `x-api-key` header, matching the app guard.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the issue asked | `issue.md` | 0.6k |
| The plan: decisions, contracts, rollout | `plan.md` | 1.6k |
| Implementation spec, sodax-backend PR | `plan-backend.md` | 2.6k |
| Implementation spec, sodax-unified-api PR | `plan-gateway.md` | 3.3k |
| Session index: planning, implementation and reviews | `process.md` | 0.2k |
| Initial review (historical; findings since addressed) | `review.md` | 2k |
| Latest review at a88f7a7 / da77c015 and verification | `review-followup.md` | 1k |
| Review of the uncommitted fixes; remaining write-cap accounting P1 | `review-fixes-2026-10-21.md` | 1.2k |
| Review of the user's seven-step post-merge rollout table | `rollout-plan-review.md` | 1k |
| Sidecar maintainability, overclaims and partial-apply/initial-health probes | `code-quality-review.md` | 1k |
| Latest pushed-head review: both P1s resolved, 70 self-tests and 26 HAProxy checks pass | `review-quality-fixes-2026-10-21.md` | 2k |
| Short mechanism explanation and architecture assessment | `mechanism-overview.md` | 0.9k |
| Security assessment: org-cap bypass reproduction, redirect token handling and map-file boundary | `security-assessment.md` | 1.3k |
| Shared-counter designs (not needed: premise withdrawn) | `design-global-quota.md` | 1.5k |
| Result | `outcome.md` | 0k |

## Landmines

- Tier names are lowercase; an unknown tier fails closed to zero scopes — `Base` != `base`.
- Paul's Base UPDATE must run after the backend with `base` is deployed, or minting breaks.
- HAProxy 2.8 has no `opt@`/`virt@` map prefixes — the deploy agent must create map files first.
- Open-source HAProxy `peers` overwrite counters, they do not sum them.
- The edge counts IPv4 and IPv6 as two clients: pin `curl -4` / `curl -6` when probing a cap.
- zsh: `git show $R:path` breaks (`:a` is a modifier) — write `"${R}:path"`.
