---
type: brief
repo: sodax-backend
github: 1372
status: Active
next: update both PR bodies and the #1372 plan comment (still say divisor 2), then Fidel review
updated: 2026-10-20
---

# GH-1372 Per-org rate limit · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- The user owns this task (GitHub assignee is still paulrouge). PRs open: sodax-backend #1380
  and sodax-unified-api #136. Latest push: divisor removed, sidecar stale-sync status/alert
  (`review.md` P1), docs. PR bodies and the #1372 plan comment still mention divisor 2.
- Direction set by Paul: HAProxy + a sidecar polling `/v1/keyset`; default tier Base; flexible
  tiers/limits; gateway docs update is in scope.
- Implemented: auth-server tier defaults + org overrides, effective limits in the keyset, dashboard
  editors, and the gateway sidecar/HAProxy limiter. Gateway prep still needs socket group + map files.
- HAProxy 2.8 mechanics verified locally (map files must pre-exist on 2.8).
- No divisor: one HAProxy counts a client's prod traffic. The earlier "2x" was IPv4 + IPv6 counted as
  two IPs (`process.md` "Divisor withdrawn"). canary-api is a separate HAProxy.

## Blocked on

Nothing blocks coding. Deploy needs a verifier token from Paul and gateway access.

## Next action

With the user's OK, update both PR bodies and the #1372 plan comment (they still say "divided by 2"),
then Fidel reviews #136. Deployment is outside scope.

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
| Evidence: code findings, probes, spike, Paul's chat | `process.md` | 4.5k |
| Independent review of both PRs, findings and verification | `review.md` | 1.5k |
| Shared-counter designs (not needed: premise withdrawn) | `design-global-quota.md` | 1.5k |
| Result | `outcome.md` | 0k |

## Landmines

- Tier names are lowercase; an unknown tier fails closed to zero scopes — `Base` != `base`.
- Paul's Base UPDATE must run after the backend with `base` is deployed, or minting breaks.
- HAProxy 2.8 has no `opt@`/`virt@` map prefixes — the deploy agent must create map files first.
- Open-source HAProxy `peers` overwrite counters, they do not sum them.
- The edge counts IPv4 and IPv6 as two clients: pin `curl -4` / `curl -6` when probing a cap.
- zsh: `git show $R:path` breaks (`:a` is a modifier) — write `"${R}:path"`.
