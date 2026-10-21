---
type: knowledge
repo: sodax-backend
github: 1372
updated: 2026-10-21
tags: [api-auth, haproxy, rate-limit, explanation]
---

# Mechanism overview

Verified directly against the open PR heads on 2026-10-21:

- [Backend PR #1380](https://github.com/icon-project/sodax-backend/pull/1380): `da77c0158af978f51d2834ab94480deae6f52f4e`.
- [Gateway PR #136](https://github.com/icon-project/sodax-unified-api/pull/136): `a88f7a7b8ed19f091f7dc1dd53a026bf872cc185`.

## Policy and synchronization

The backend provides policy; HAProxy enforces it. Operators edit tier defaults or an organization's
override in the dashboard. `KeysetService.build()` overlays `tenants.limits` on `tier_limits.limits`,
so the organization value wins. The new default tier is `base`; tier names and scopes remain in code.

The gateway sidecar polls `/v1/keyset` with a verifier token every 15 seconds. It builds two maps for
active organizations with a positive `rateLimitPerMinute`: key hash to organization, and organization
to limit. It applies map replacements through the runtime socket and persists map files for reloads.
No plaintext API keys are stored in these maps.

## Request processing

For non-portal requests that pass the abuse jail, HAProxy hashes the first `x-api-key` header with
SHA-256, resolves the organization and limit, then tracks `http_req_rate(60s)` in `st_rl_org` keyed on
organization ID. All keys of that organization share this counter, even across client IPs. Exceeding
the configured rate returns HTTP 429 `org_rate_limited` with `Retry-After: 60` before reaching the app.

Missing or unknown keys, suspended organizations and organizations without an effective limit use
the existing per-IP limiter. Portal handling, the per-IP write cap and abuse jail still apply as
configured. Authentication and scope checks remain in the application; passing the edge is not
proof that the application will authorize a request.

## Practical boundaries

- Each HAProxy maintains its own counter; there is no shared Redis quota or gateway divisor.
- A failed synchronization preserves the last maps. Staleness is reported through status and an
  optional Discord webhook; keys absent from the retained maps fall back to per-IP handling.
- This is HAProxy's rolling rate estimate, not an exact allowance of successful requests per minute.
  Tracking precedes the org-rate rejection, so those rejected attempts also contribute to the rate.
- The in-app submit-tx per-IP throttle remains in place.

This session only explained the existing implementation. No upstream code, issue comments,
deployment or review status changed. The GitHub connector failed authentication; `gh` supplied the
live issue, PR metadata and source at the exact heads above.

## Architecture assessment

Follow-up assessment on 2026-10-21 confirmed that both open PR heads remain unchanged. Keep this
architecture for tier-based edge traffic protection: central policy, local enforcement, organization
identity shared across keys, and no per-request dependency on the auth service.

Before rollout, settle the org counter's semantics and the interaction between keyed and keyless
traffic. Counting rejected attempts is a supported abuse-limiting policy, not inherently an HAProxy
bug, but sustained retries can prolong an organization's rejection period. If the product promises
an allowance of admitted requests, count admission separately from abuse attempts. Keyed traffic
also feeds the ordinary per-IP counter, potentially throttling keyless callers sharing that IP;
separate that budget from the all-traffic flood detector if isolation is required.

The 15-second policy delay, retained stale maps and local per-gateway counters are deliberate
tradeoffs. Add independent stale/dead-process monitoring before relying on alerting. A strict global
commercial quota would require a stronger shared-accounting design; it is outside this issue.

References: [HAProxy traffic policing](https://www.haproxy.com/documentation/haproxy-configuration-tutorials/security/traffic-policing/)
and [Runtime API persistence](https://www.haproxy.com/documentation/haproxy-runtime-api/).
Existing local reproduction evidence is in `review-2026-10-21.md`; this follow-up read code and docs
and did not rerun the stack or change upstream sources.

## Tier-only proposal assessment

The user requested an assessment of Claude's proposal to remove org overrides, not implementation.
Prefer tier-only limits for the current issue if no org-specific need exists. Paul's recorded request
asks for flexible tiers and limits; it does not explicitly require or prohibit overrides. The live
issue's tier-based wording supports the narrower scope. The claim that all production
`tenants.limits` values are empty was not independently verified in this conversation.

Tier-only limits still mean one counter per org, with the threshold obtained from its tier, not one
shared counter for the whole tier. Keeping the keyset's `limits` shape permits this change entirely
in the backend without redesigning the gateway. Remove org-specific merge/UI/BFF behavior, update
tests and comments/docs, and preserve the existing tenant column. The tenant PATCH route must stay
for status and tier edits.

Adding a tier is not literally two isolated lines: the dashboard currently mirrors `TIERS` in
`apps/sodax-backend-dashboard/lib/api-scopes.ts`, in addition to shared `TIERS`/`TIER_SCOPES`.
It requires coordinated deployment and validation. Clarifying whether that satisfies "easily add a
new tier" is useful, but overrides do not themselves make tiers dynamically creatable. Removing
overrides eliminates the branches behind review findings 4/9/10, not the independent counter issues.

No change to PR #1380 or #136 was authorized or made in this assessment.

## Map file persistence assessment

Keep disk snapshots alongside runtime maps: requests use RAM, while startup/reload can recover
policy without waiting for api-auth. Normal map writes happen on changes, with periodic forced
resync. `write_atomic` writes a same-directory temporary file, flushes/fsyncs it, then replaces the
destination. This avoids exposing a partially written file; it is not a cross-map transaction.

The current push order is disk then runtime for the limits map, followed by disk then runtime for
the key map. A runtime failure can therefore leave disk ahead of RAM, and a later failure can leave
only the first map updated. Earlier wording about preserving the last maps should not imply an
all-or-nothing rollback of both maps and both storage layers. Retry clears the ETag and reconciles
on subsequent ticks. Reload during a partial update deserves explicit verification; this follow-up
identified the ordering from code and did not reproduce a race or modify the gateway.
