---
type: plan
repo: sodax-backend
github: 1372
related_prs: [sodax-backend#1380, sodax-unified-api#136]
updated: 2026-10-22
---

# Per-org rate limit at HAProxy — plan and result

## Goal

A request with a valid API key is rate-limited per **org** at HAProxy: all of an org's keys and IPs share
one budget, taken from its tier or an org override. Keyless calls, unknown keys, suspended orgs and orgs
with no limit keep the per-IP edge limits. Limits change without a deploy.

## Decisions

1. **HAProxy enforces it.** A sidecar on each gateway polls api-auth `/v1/keyset` every 15s and loads two
   maps (key hash → org, org → limit). api-auth stays off the request path. (Paul)
2. **One HAProxy serves all prod**, so each org has one counter; no peers, no divisor. A reload (every
   gateway deploy) restarts the counter, so around a deploy an org can get up to twice its limit. (Paul)
3. **Tiers `base` and `pro`, same scopes.** Names and scopes in code; limits are data in api-auth
   (`tier_limits`), edited on the dashboard's Tiers tab; an org's own `tenants.limits` wins key by key. (Paul)
4. **Every org starts on `base`.** Migration 0004 moves existing orgs from `pro` (the only tier before);
   it changes no behaviour, since scopes are equal and no tier has a limit at deploy. (user)
5. **Tier limits are set by hand, never seeded.** A limit lifts the app's submit-tx throttle within ~15s,
   so the edge cap must be live first; Paul also wants nothing to change on deploy and a usage check first.
6. **Submit-tx throttle skip.** The in-app 10/60s per-IP throttle on swaps, leverage-yield and bridge
   `submit-tx` is skipped for a key whose org has a limit (`OrgLimitAwareThrottlerGuard`, opt-in on those
   three routes). Not built into `HaproxyThrottlerGuard`: sponsoring-api uses it to guard the sponsor
   account. (Paul)
7. **The edge write cap stays** (120 POSTs per 60s per IP on submit routes), for limited orgs too.
8. **The edge never authenticates** and never returns 401. Auth stays in the apps.
9. **Edge and app read the same key bytes:** the edge hashes the whole value of the only `x-api-key`
   header; the app guard accepts only one bare key (`[A-Za-z0-9_-]+`) and never trims.
10. Per-org overrides stay (special cases). The org cap covers every non-portal route.

## Contracts

| Thing | Value |
|---|---|
| Limit key | `rateLimitPerMinute`, whole number 1..1,000,000 (`isOrgLimit` in `@repo/shared-enums`), requests per rolling 60s per org |
| No limit | key absent → keyless at the edge, throttle kept in the app. 0 is refused; the kill switch is `status: suspended` |
| Keyset `limits` | effective limits: org value if valid, else the tier's |
| Maps | `/etc/haproxy/maps/apikey_org.map` = `<sha256 hex> <orgId>`, `org_limit.map` = `<orgId> <limit>` |
| Edge 429 | `{"ok":false,"error":"org_rate_limited"}`, `Retry-After: 60` |

## What shipped

- **sodax-backend #1380** (`dcf4f0b7`, tests `432d4070`): `base` tier, `tier_limits` + `GET/PATCH /v1/tiers`,
  effective limits in the keyset, dashboard Tiers tab and org override, strict key shape in the guard,
  `OrgLimitAwareThrottlerGuard`, `isOrgLimit` in shared-enums, migration 0004.
- **sodax-unified-api #136** (`cd05f43`): org cap in `fe_edge`, `keyset-sync.py` sidecar + watchdog +
  Discord alerts, deploy agent creates missing map files, ADR-004 and design doc v1.4.0.

What a keyed org on `base` meets after rollout:

| Limit | Scope | Value |
|---|---|---|
| Org cap (edge) | all routes, all its keys and IPs | 3000/min |
| Write cap (edge) | submit routes, per IP | 120/min (today 10/min, from the app throttle) |
| Jail (edge) | per IP | 1500 per 10s |
| Per-IP rate cap 300/10s (edge) | not applied to keyed requests | — |
| App submit-tx throttle | skipped | — |

## Rollout

Run by the owners; full steps in the [rollout comment](https://github.com/icon-project/sodax-backend/issues/1372#issuecomment-6309961777).

1. Deploy api-auth (migration 0004 runs on start), the dashboard, swaps-api and bridge-api.
2. Prepare gateways (sidecar group, map files), promote the cfg `development → canary → master`.
3. Add the gateway verifier token to api-auth; install the sidecar and watchdog with
   `KEYSET_DISCORD_WEBHOOK_URL`; send the test alert.
4. Test with one org override, including 12 `POST /v1/bridge/submit-tx` with `{}` on its `bridge:write` key:
   12 × 400 = the skip works; a 429 on the 11th = bridge-api's `API_KEY_ENFORCEMENT` is `off`.
5. Check each org's busiest minute against 3000 (`api_usage_hourly` ÷ 60 is only an hourly average).
6. Set `base` 3000, `pro` 6000 (Paul's starting values). This also lifts the app throttle for every org
   with a write key at once.

Rollback: clear the tier limits (~15s), or stop the sidecar and empty the maps. Before rolling api-auth
back past `base`: `UPDATE tenants SET tier = 'pro' WHERE tier = 'base';`.

## Open — waiting on Paul (the user posts nothing more on the PRs)

- `API_KEY_ENFORCEMENT` on prod bridge-api. swaps-api reports `monitor`; if bridge is `off`, bridge
  submits keep the 10/min throttle.
- Keep or lift the 120/min write cap for orgs with a limit.
- Rollout inputs: verifier token, gateway access, someone with stateful-Mongo access for the usage check,
  reviewers for both PRs.
- FYI only: the gateway repo's §6, `CLAUDE.md` and `README.md:14` still describe gateway-a/b as prod and
  a 10% prod share on gateway-c.

## Verified (at `432d4070` / `cd05f43`)

- CI green on both PRs; the backend pre-commit gate (full `pnpm test`) passed.
- Real swaps-api and bridge-api AppModules + api-auth + HAProxy with the #136 cfg, 36/36: skip for a tier
  limit and an override; throttle kept for no limit, read-only key, suspended org, unknown key, keyless;
  clearing and restoring a limit flips it; `off` → no skip; `enforce` → 401/403; through the edge the
  write cap holds at 120, the app throttle at 10 per real client IP, an org override of 20 at 20.
- Load, 50 concurrent, ~22,750 requests: no 5xx or connection errors; app throttle exactly 10 and write
  cap exactly 120; org cap 3000 let 3001 through; skip and throttle paths have equal latency
  (p50 8.6 ms).
- Migration 0004 from prod's state: `pro` → `base`, limits and key scopes untouched, a re-run is a no-op.

## Risks and follow-ups

- **Prod load:** limited orgs go from 10 to up to 120 submits/min per IP. Watch the submit queues and
  give-up incidents after setting limits.
- **Shared budget:** a leaked key can spend its org's whole budget. Refusals are not counted, so it
  cannot hold the org below the limit.
- **Sidecar monitoring:** health is in its status file and Discord alerts only while the process lives;
  nothing on the dashboard, and a dead host needs independent monitoring.
- **Canary:** the edge polls prod api-auth, so canary keys get per-IP edge limits while canary apps
  skip the throttle.
- **If exact limits across several HAProxies are ever needed:** a shared limiter (SPOE + one Redis,
  sliding-window log). Open-source peers overwrite rather than sum.
- Not done: `X-RateLimit-*` headers (#740); edge 429 bodies end in a literal `\n`; bridge-api has no
  `/healthz/api-key-verification` although `CLAUDE.md` says it does.
