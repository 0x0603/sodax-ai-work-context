---
type: review
repo: sodax-backend
github: 1372
updated: 2026-10-21
tags: [review, security, rate-limit, haproxy]
---

# Review of the uncommitted fixes

Reviewed the local working trees on the PR branches, not just the published PRs. GitHub still has
backend #1380 at `da77c0158af978f51d2834ab94480deae6f52f4e` and gateway #136 at
`a88f7a7b8ed19f091f7dc1dd53a026bf872cc185`. The fixes described by the user are uncommitted.
No application/config sources were edited, no upstream comments were posted and nothing deployed.

## P1: write-cap rejections still consume the organization budget

Location: `sodax-unified-api/gateway-configs/haproxy/haproxy.cfg:309`, before the write-cap return
at line 315. The fix correctly excludes org-cap rejections, but `track-sc3` still runs before the
other applicable edge rejection. A keyed POST already over its per-IP write limit increments the
org's rate before returning 429 `rate_limited`. Repeated writes can use the entire org budget
without one of those writes reaching an origin, then block unrelated reads or other client IPs.

Independent reproduction used HAProxy 2.8.31 in a temporary container. It copied the current
complete rate-limit rule block and all five table definitions verbatim; only the bind, map paths
and final success response were replaced for a localhost-only harness. All credentials were dummy.

1. Map a dummy key to `org_low`, with a limit of 10.
2. Send 120 keyless POSTs to `/v1/swaps/submit-tx` from one simulated client IP; all return 200,
   filling that IP's existing write counter without consuming `org_low`'s budget.
3. Send 10 POSTs to the same route/IP with the mapped org key; all return 429 `rate_limited`.
4. Send one GET with that key from another IP; it returns 429 `org_rate_limited`.

Expected: the 10 edge-refused writes do not consume the admitted-request org budget, so the GET
is allowed. Move organization tracking after every applicable edge rate rejection, including the
write cap, and add a regression for this cross-IP case. Application-level 401/403/429 responses
remain outside this edge-admission accounting; the finding is specifically about a later edge rule.

## Verification performed

- Sidecar self-test: 55/55 passed, including no-redirect, quiet-200 drift repair and watchdog cases.
- Actual guard tests: 21/21 passed.
- Keyset service and tenant/tier DTO tests: 49/49 passed.
- Independent HAProxy checks: 320 keyed GETs passed, followed by a keyless GET on the same IP
  returning 200; a separate keyless stream allowed exactly 300 and rejected the 301st request.
- `git diff --check` passed in both code repositories.
- Unit tests ran on the available Node 22.15.0, which warned about the repo's required 22.18.x.
  Full Postgres integration, the e2e suite, Python 3.8 and boot matrix were reported by the user,
  not independently rerun during this review.
- Temporary containers/files were removed. No real keys or live gateways were used.

## Other reviewed changes

The strict key grammar closes the observed NBSP normalization mismatch and rejects comma-joined
or array-valued repeated keys. The keyset now chooses a valid org override, then a valid tier default,
and emits only known sorted keys. Redirects fail without being followed; config requires HTTPS
except explicit loopback HTTP. Directory fsync, quiet-200 drift checks and the watchdog's separate
heartbeat alert state are present. No additional P0/P1 finding was identified in those changes.

Remaining accepted boundaries: a holder of a shared org key can consume its budget; counters remain
local to each gateway and reset on reload; the local watchdog cannot report a whole host outage;
the two maps are not committed as a single transaction. The claim that every mixed-map state falls
back to per-IP is too broad: an old key map can still resolve against an updated limit for the same
org. The independent app guard remains the authorization boundary.

## Content fingerprints

SHA-256 of the reviewed local files:

| File | SHA-256 |
| --- | --- |
| `packages/api-auth-client/src/api-key.guard.ts` | `4062341e281c8e91145d6f7a67617808262d5a8f8b1aeab408466adbc6dd296f` |
| `apps/api-auth/src/keyset/keyset.service.ts` | `e3a9b41eb7e264389f7c5dd84c7f64be724f306df6f5354e2478c958ae65e687` |
| `gateway-configs/haproxy/haproxy.cfg` | `5a50d1723d24333c6ed3521d335fd38c0c121177a229c9b48e384836d8ee192e` |
| `scripts/keyset-sync.py` | `20a41ad40ccf0580fe5cf513387c57e89a9617e51616da65913df871c089f1ba` |
| `scripts/systemd-units.py` | `a81f76a5e54cb9d07874541710c5d8b55ec5bf0d557a0ee2ad4709c3973027e4` |
| `scripts/sodax_deploy/validate.py` | `343a81d5c6ffd4242e0a26788800f5835212a0ed229e3ebcc51d503ef3b1d2c9` |
