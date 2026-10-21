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
