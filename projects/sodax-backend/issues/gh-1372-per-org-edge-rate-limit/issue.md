---
type: issue
repo: sodax-backend
github: 1372
status: Active
tags: [rate-limit, haproxy, api-auth, gateway, api-keys]
updated: 2026-10-22
related_decisions: []
related_issues: [1371]
---

# GH-1372 Per-org tier rate limits at HAProxy, synced from api-auth keyset

- Source: https://github.com/icon-project/sodax-backend/issues/1372
- Author / assignee: paulrouge (written by his PM agent "Archimedes Rouge")
- Opened: 2026-10-04 · Started here: 2026-10-20
- Related PR: none yet

## Problem

Follow-up to #1371 (closed 2026-10-05: per-IP limiting missing on most public endpoints). HAProxy
should enforce each org's tier rate limit on API-key traffic; keyless traffic stays on the general
per-IP limit.

## Design as written in the issue (Paul's comment, 2026-10-04)

- A sidecar on the HAProxy box holds a verifier token, polls `/v1/keyset` every 15s (pull only) and
  fully resyncs two maps via the Runtime API: `keyHash -> orgId`, `orgId -> limit`. It also writes the
  map files so a reload keeps them.
- HAProxy hashes `x-api-key` (`sha2(256),hex,lower`), looks up the org, tracks `http_req_rate(60s)` in
  a stick table keyed on orgId (one budget per org across its keys). Over the limit -> 429.
- No key -> general per-IP limit. Maps and table never hold plaintext keys.
- HAProxy only rate-limits; auth stays in the app. An empty map must never turn into a 401.
- Sidecar dies -> last limits stay; keys minted after that fall back to the IP limit.
- "HAProxy is a single node, so no peers are needed." (Kept: one HAProxy serves all prod; see `plan.md`.)

## Acceptance Criteria (derived, not stated in the issue)

- Valid key of an active org -> counted against that org's budget, 429 when over.
- Missing / unknown / suspended key -> existing per-IP edge limits, unchanged.
- Empty or stale map never produces a 401 and never lets an unknown key escape the IP limit.
- Limits survive sidecar death and HAProxy reload.

## Related

- #1371 (closed) — per-IP gap; fixed at the gateway by sodax-unified-api #128/#129/#132.
- Gateway repo: icon-project/sodax-unified-api (`gateway-configs/haproxy/haproxy.cfg`, owner FidelVe).
