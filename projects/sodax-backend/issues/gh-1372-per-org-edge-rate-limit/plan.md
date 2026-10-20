---
type: plan
repo: sodax-backend
github: 1372
updated: 2026-10-20
---

# Plan — per-org rate limit at HAProxy

Written so someone who was not in the discussion can implement it. Two PRs in two repos:

- **PR 1 — sodax-backend:** tiers, tier limits, keyset change, dashboard, docs → `plan-backend.md`
- **PR 2 — sodax-unified-api:** HAProxy config, sidecar, deploy agent, docs → `plan-gateway.md`

Evidence behind every decision (code reads, live probes, the HAProxy 2.8 spike, the chat with Paul)
is in `process.md`.

## Goal

A request carrying a valid API key is rate-limited per **org** at HAProxy: every key of that org
shares one budget, taken from the org's tier or an org-level override. Requests without a key, with
an unknown key, or from a suspended org keep today's per-IP edge limits. Tiers and limits can be
changed without a deploy.

## Decided — do not re-open

1. HAProxy enforces it. It learns limits like the backend does: a sidecar on each gateway polls
   api-auth `GET /v1/keyset` every 15s. (Paul)
2. New tier `base` is the default for new orgs. Paul moves existing orgs with his own DB command —
   no backfill migration. (Paul)
3. Tiers and limits must be easy to change. Tier names and scopes stay in code (security-relevant,
   reviewed); limits are data in api-auth, editable from the dashboard. (Paul + design)
4. Updating the gateway docs that say per-key limits stay in the apps is part of this work. (Paul)
5. `base` has the same scopes as `pro`, so moving orgs changes nothing.
6. The in-app submit-tx 10/60s per-IP throttle is NOT changed here (known gap).
7. Prod has two unpeered gateways; open-source HAProxy `peers` overwrite counters rather than sum
   them. Each gateway therefore enforces `ceil(limit / divisor)` with divisor 2 on gateway-a/b.

## Contracts shared by both PRs

| Thing | Value |
|---|---|
| Limit key | `rateLimitPerMinute` — integer 1..1,000,000, requests per rolling 60s per org. The only key allowed (`ORG_LIMIT_KEYS`). |
| Tier names | `base`, `pro` (lowercase). Unknown tier = zero scopes (fail closed) and no tier limits. |
| Effective limits | tier defaults (`tier_limits.limits`) overlaid key by key by the org's `tenants.limits`. |
| Keyset | each entry's `limits` = the **effective** limits, keys sorted. Other fields unchanged. |
| "No org limit" | `rateLimitPerMinute` absent → HAProxy treats the key as keyless (per-IP limits). 0 is rejected at write time; the kill switch is `status: suspended`. |
| Gateway maps | `/etc/haproxy/maps/apikey_org.map` = `<sha256 hex of key> <orgId>`; `/etc/haproxy/maps/org_limit.map` = `<orgId> <per-gateway limit>` |
| Hash | sha256 of the FIRST `x-api-key` header, lowercase hex — same as api-auth and the app guard. |
| Edge 429 | `{"ok":false,"error":"org_rate_limited"}`, `Retry-After: 60` |
| Safety | the edge never returns 401; any failure falls back to today's behaviour. |

## Guardrails for the implementer

- Do not deploy anything, touch a gateway, or touch prod api-auth. Rollout below is run by the owners.
- Follow each repo's own git workflow: sodax-backend branches off `development`, PR to
  `development` (`CLAUDE.md` §Git Workflow); sodax-unified-api feature branch → `development`, then
  promotion PRs (`CLAUDE.md` §Branch flow). Stage files by name; never `git add .`.
- Do not create or push the `design-v1.4.0` tag — the merger does that.
- No AI attribution in commits or PR bodies.
- Start from a fresh `development`. Partial work from planning exists only as uncommitted files on
  one machine — ignore it.

## Rollout (owners, after both PRs merge — every step is reversible and changes nothing alone)

1. **Deploy backend** (api-auth + dashboard). Migration creates `tier_limits` (empty) and sets the
   default tier to `base`. Check: `GET /v1/tiers` lists `base` and `pro` with `{}` limits.
2. **Paul moves orgs:** `UPDATE tenants SET tier = 'base';` — exactly lowercase, only after step 1.
   Check: minting a key on the portal still works.
3. **Pre-create map files on every gateway** (before the cfg reaches it):
   `sudo install -d -m 0755 /etc/haproxy/maps && sudo touch /etc/haproxy/maps/apikey_org.map /etc/haproxy/maps/org_limit.map`
4. **Promote the gateway cfg** development → canary → master. Maps are empty, so nothing changes.
   Check with the edge-404 probe: 400 keyless requests → 300 pass.
5. **Paul issues a verifier token** for the gateways; owners add it to prod api-auth
   `API_AUTH_VERIFIER_TOKENS`.
6. **Install the sidecar** on gateway-c, then gateway-a/b (`scripts/README.md` new section;
   divisor 2 on a/b). Maps stay empty — no tier has a limit yet.
7. **Turn it on:** set `base` (and `pro`) `rateLimitPerMinute` in the dashboard Tiers tab, e.g.
   1800. Probe `canary-api.sodax.com` with a real key.
8. **Turn it off at any time:** clear the tier limit (effective within ~15s), or stop the sidecar
   and empty the maps, or revert the cfg.

## Out of scope / known gaps

- In-app submit-tx 10/60s per-IP throttle still applies to keyed callers.
- `X-RateLimit-*` response headers (asked for in #740) — not added at the edge.
- Canary API keys are not recognised at the edge (canary api-auth is internal-only); they keep the
  per-IP limits on `canary-api.sodax.com`.
- The existing edge 429 bodies end in a literal `\n` (`lf-string` does not interpret it) — mention in
  the gateway PR, do not fix here.
