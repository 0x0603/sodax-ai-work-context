---
type: brief
repo: sodax-backend
github: 1372
status: Active
next: Fidel review; configure alerting before rollout
updated: 2026-10-21
---

# GH-1372 Per-org rate limit · brief

**Security follow-up (2026-10-21):** local HAProxy + actual app-guard probes found a key-normalization
mismatch that bypasses the org cap (valid key with NBSP padding). Fix before rollout; Cloudflare
forwarding is untested. `security-assessment.md` also records a conditional verifier-token redirect
leak and the map-file threat boundary. No upstream code was changed.

Fallback probe: a synthetic invalid org limit is skipped and removes its map entries while the sync
still reports healthy; the key falls back to per-IP. Whole-fetch failures retain the current maps.
See `security-assessment.md`; production invalid data was not established.

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- The user owns this task (GitHub assignee is still paulrouge). PRs open: sodax-backend #1380
  (da77c015) and sodax-unified-api #136 (a88f7a7). Re-review found no new P0/P1;
  stale-sync P1 is addressed (`review-followup.md`). #136 body and the #1372 plan comment updated.
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

Fidel reviews #136. The #1372 plan comment and the #136 body match the code (the attached plan file
predates the change and says so). Rollout needs the Discord webhook and an external host/service check if dead-process
alerting is required. No upstream edits, posts or deployment were made in the re-review.

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
